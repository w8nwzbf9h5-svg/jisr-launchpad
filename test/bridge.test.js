const { expect } = require("chai");
const { ethers } = require("hardhat");

const E18 = 10n ** 18n, M = 1_000_000n * E18, U = 10n ** 6n, MAXU = ethers.MaxUint256, FAR = 2n ** 40n;
const FORWARD_HOOK = "0x636374702d666f72776172640000000000000000000000000000000000000000";
const pad = (addr) => ethers.zeroPadValue(addr, 32);

async function reverts(promise, name) {
  try { await promise; } catch (e) { expect(String(e.message)).to.include(name); return; }
  throw new Error("expected revert: " + name);
}
/// Find one event of `contract` by name in a transaction.
async function eventOf(txPromise, contract, name) {
  const rc = await (await txPromise).wait();
  const ev = rc.logs.map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } }).find((x) => x && x.name === name);
  if (!ev) throw new Error("expected event: " + name);
  return ev.args;
}

async function setup() {
  const [owner, platform, creator, ...users] = await ethers.getSigners();
  const usdc = await (await ethers.getContractFactory("MockStable")).deploy("USD Coin", "USDC", 6);
  const factory = await (await ethers.getContractFactory("LaunchpadFactory")).deploy(usdc.target, ethers.ZeroAddress, platform.address, owner.address, 100000n * U);
  const messenger = await (await ethers.getContractFactory("MockMessenger")).deploy();
  const seller = await (await ethers.getContractFactory("BridgeSeller")).deploy(factory.target, messenger.target);
  await (await factory.connect(creator).createCoin("Camel Cash", "HUMP", "{}")).wait();
  const coin = await ethers.getContractAt("Coin", await factory.coins(0));
  const market = await ethers.getContractAt("CoinMarket", await factory.marketOf(coin.target));
  for (const u of users.slice(0, 45)) {
    await usdc.mint(u.address, 10_000_000n * U);
    await usdc.connect(u).approve(market.target, MAXU);
    await coin.connect(u).approve(seller.target, MAXU);
  }
  return { owner, platform, creator, users, usdc, factory, messenger, seller, coin, market };
}

describe("BridgeSeller: sell here, receive on another network", function () {
  it("sells the coins and hands exactly the proceeds to the bridge, with Circle delivering", async function () {
    const c = await setup(), u = c.users[0], dest = c.users[1].address;
    await c.market.connect(u).buy(10n * M, MAXU, FAR);
    const quote = await c.market.quoteSell(4n * M);
    const ev = await eventOf(c.seller.connect(u).sellAndBridge(c.coin.target, 4n * M, quote.net, 6, pad(dest), 60000n, 1000, true, FAR), c.seller, "SoldAndBridged");
    expect([ev.coin, ev.seller, ev.coinsIn, ev.stableSent, ev.destinationDomain, ev.mintRecipient, ev.maxFee, ev.forwarded]).to.deep.equal([c.coin.target, u.address, 4n * M, quote.net, 6n, pad(dest), 60000n, true]);
    const b = await c.messenger.burns(0);
    expect(b.from).to.equal(c.seller.target);
    expect(b.amount).to.equal(quote.net);
    expect(b.amount).to.equal(380n * U); // 4M coins x $0.0001 = $400, less the 5% fee
    expect(b.destinationDomain).to.equal(6n);
    expect(b.mintRecipient).to.equal(pad(dest));
    expect(b.burnToken).to.equal(c.usdc.target);
    expect(b.destinationCaller).to.equal(ethers.ZeroHash); // anyone may complete it on the other side
    expect(b.maxFee).to.equal(60000n);
    expect(b.minFinalityThreshold).to.equal(1000n);
    expect(b.withHook).to.equal(true);
    expect(b.hookData).to.equal(FORWARD_HOOK);
    // nothing stays in the helper, and the seller's coins are gone
    expect(await c.coin.balanceOf(c.seller.target)).to.equal(0n);
    expect(await c.usdc.balanceOf(c.seller.target)).to.equal(0n);
    expect(await c.coin.balanceOf(u.address)).to.equal(6n * M);
    expect(await c.usdc.balanceOf(c.messenger.target)).to.equal(quote.net);
    expect(await c.usdc.allowance(c.seller.target, c.messenger.target)).to.equal(0n);
  });

  it("can leave delivery to the receiver (no forwarding request)", async function () {
    const c = await setup(), u = c.users[0];
    await c.market.connect(u).buy(10n * M, MAXU, FAR);
    await c.seller.connect(u).sellAndBridge(c.coin.target, 1n * M, 0, 3, pad(u.address), 0, 2000, false, FAR);
    const b = await c.messenger.burns(0);
    expect(b.withHook).to.equal(false);
    expect(b.hookData).to.equal("0x");
    expect(b.minFinalityThreshold).to.equal(2000n);
    expect(b.destinationDomain).to.equal(3n);
  });

  it("pays the same as a normal sale: the market cannot tell the difference", async function () {
    const c = await setup(), [a, b] = c.users;
    await c.market.connect(a).buy(10n * M, MAXU, FAR);
    await c.market.connect(b).buy(10n * M, MAXU, FAR);
    await c.coin.connect(a).approve(c.market.target, MAXU);
    const before = await c.usdc.balanceOf(a.address);
    await c.market.connect(a).sell(3n * M, 0, a.address, FAR);
    const plain = (await c.usdc.balanceOf(a.address)) - before;
    await c.seller.connect(b).sellAndBridge(c.coin.target, 3n * M, 0, 6, pad(b.address), 0, 2000, false, FAR);
    expect((await c.messenger.burns(0)).amount).to.equal(plain);
  });

  it("keeps the seller's slippage limit and deadline", async function () {
    const c = await setup(), u = c.users[0];
    await c.market.connect(u).buy(10n * M, MAXU, FAR);
    const quote = await c.market.quoteSell(4n * M);
    await reverts(c.seller.connect(u).sellAndBridge(c.coin.target, 4n * M, quote.net + 1n, 6, pad(u.address), 0, 2000, true, FAR), "Slippage");
    await reverts(c.seller.connect(u).sellAndBridge(c.coin.target, 4n * M, 0, 6, pad(u.address), 0, 2000, true, 1), "Expired");
    expect(await c.coin.balanceOf(u.address)).to.equal(10n * M);
  });

  it("refuses a missing recipient, an unknown coin, a zero amount, and a fee as large as the amount", async function () {
    const c = await setup(), u = c.users[0];
    await c.market.connect(u).buy(10n * M, MAXU, FAR);
    await reverts(c.seller.connect(u).sellAndBridge(c.coin.target, 1n * M, 0, 6, ethers.ZeroHash, 0, 2000, true, FAR), "NoRecipient");
    await reverts(c.seller.connect(u).sellAndBridge(c.usdc.target, 1n * M, 0, 6, pad(u.address), 0, 2000, true, FAR), "UnknownCoin");
    await reverts(c.seller.connect(u).sellAndBridge(c.coin.target, 0, 0, 6, pad(u.address), 0, 2000, true, FAR), "ZeroAmount");
    const quote = await c.market.quoteSell(1n * M);
    await reverts(c.seller.connect(u).sellAndBridge(c.coin.target, 1n * M, 0, 6, pad(u.address), quote.net, 2000, true, FAR), "FeeTooHigh");
    expect(await c.coin.balanceOf(u.address)).to.equal(10n * M);
  });

  it("cannot be blocked by coins sent to it: they are sold and the money goes to the floor reserve", async function () {
    const c = await setup(), [griefer, u] = c.users;
    await c.market.connect(griefer).buy(25n * M, MAXU, FAR);
    await c.market.connect(u).buy(25n * M, MAXU, FAR);
    // fill the helper up to the wallet limit, so a plain transfer into it would be refused
    await c.coin.connect(griefer).transfer(c.seller.target, 25n * M);
    const floorBefore = await c.market.floorReserve();
    const outBefore = await c.market.outstanding();
    const fl = await eventOf(c.seller.connect(u).sellAndBridge(c.coin.target, 25n * M, 0, 6, pad(u.address), 0, 2000, true, FAR), c.seller, "Flushed");
    expect(fl.coins).to.equal(25n * M);
    expect(fl.addedToFloor).to.equal(2375n * U); // the stray lot's sale price, kept by the reserve
    expect(await c.coin.balanceOf(c.seller.target)).to.equal(0n);
    expect(await c.usdc.balanceOf(c.seller.target)).to.equal(0n);
    // both lots left circulation; the griefer's money stayed in the reserve instead of being paid out
    expect(await c.market.outstanding()).to.equal(outBefore - 50n * M);
    const floorAfter = await c.market.floorReserve();
    const paidOutForUser = (await c.messenger.burns(0)).amount;
    expect(paidOutForUser).to.equal(2375n * U); // 25M x $0.0001 less 5%
    expect(floorBefore - floorAfter).to.equal(2525n * U); // one lot paid out ($2,450 after the reserve's 2%), plus $75 of creator and platform fees on the stray lot
    // the reserve still covers every coin in circulation
    expect((await c.market.floorReserve()) >= (await c.market.floorLiability())).to.equal(true);
  });

  it("anyone can flush stray coins, and nobody is paid for it", async function () {
    const c = await setup(), [a, b] = c.users;
    await c.market.connect(a).buy(5n * M, MAXU, FAR);
    await c.coin.connect(a).transfer(c.seller.target, 5n * M);
    const balB = await c.usdc.balanceOf(b.address);
    await c.seller.connect(b).flush(c.coin.target);
    expect(await c.usdc.balanceOf(b.address)).to.equal(balB);
    expect(await c.coin.balanceOf(c.seller.target)).to.equal(0n);
    expect((await c.market.floorReserve()) >= (await c.market.floorLiability())).to.equal(true);
    await reverts(c.seller.flush(c.usdc.target), "UnknownCoin");
  });

  it("anyone can move USDC sent to it straight into the coin's floor reserve, and nobody is paid for it", async function () {
    const c = await setup(), [a, b] = c.users;
    await c.market.connect(a).buy(5n * M, MAXU, FAR);
    await c.usdc.connect(a).transfer(c.seller.target, 123n * U); // sent here by mistake
    const reserveBefore = await c.market.floorReserve();
    const balB = await c.usdc.balanceOf(b.address);
    const ev = await eventOf(c.seller.connect(b).flushStable(c.coin.target), c.seller, "StableFlushed");
    expect(ev.amount).to.equal(123n * U);
    expect(ev.addedToFloor).to.equal(123n * U);
    expect(await c.usdc.balanceOf(c.seller.target)).to.equal(0n);
    expect(await c.usdc.balanceOf(b.address)).to.equal(balB);
    expect((await c.market.floorReserve()) - reserveBefore).to.equal(123n * U);
    expect(await c.seller.flushStable.staticCall(c.coin.target)).to.equal(0n); // nothing left: a no-op
    await reverts(c.seller.flushStable(c.usdc.target), "UnknownCoin");
  });

  it("works after graduation and on the curve, where a sale returns premium too", async function () {
    const c = await setup();
    for (let i = 0; i < 40; i++) await c.market.connect(c.users[i]).buy(20n * M, MAXU, FAR);
    expect(await c.market.graduated()).to.equal(true);
    const u = c.users[41];
    await c.market.connect(u).buy(20n * M, MAXU, FAR);
    const quote = await c.market.quoteSell(20n * M);
    expect(quote.net > 1900n * U).to.equal(true); // more than the floor alone: the premium comes back
    await c.seller.connect(u).sellAndBridge(c.coin.target, 20n * M, quote.net, 1, pad(u.address), 100n, 1000, true, FAR);
    expect((await c.messenger.burns(0)).amount).to.equal(quote.net);
    expect((await c.market.floorReserve()) >= (await c.market.floorLiability())).to.equal(true);
  });

  it("has no owner and no way to change or withdraw anything", async function () {
    const f = await ethers.getContractFactory("BridgeSeller");
    const changing = f.interface.fragments.filter((x) => x.type === "function" && x.stateMutability !== "view" && x.stateMutability !== "pure").map((x) => x.name).sort();
    expect(changing).to.deep.equal(["flush", "flushStable", "sellAndBridge"]);
    const views = f.interface.fragments.filter((x) => x.type === "function" && (x.stateMutability === "view" || x.stateMutability === "pure")).map((x) => x.name).sort();
    expect(views).to.deep.equal(["FORWARD_HOOK", "factory", "messenger", "stable"]);
    await reverts(f.deploy(ethers.ZeroAddress, ethers.ZeroAddress), "ZeroAddress");
  });
});
