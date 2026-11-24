const { expect } = require("chai");
const { ethers } = require("hardhat");

const E18 = 10n ** 18n;
const M = 1_000_000n * E18; // one million coins
const FAR = 2n ** 64n; // far-future deadline
const MAXU = ethers.MaxUint256;

// chai 4 does not compare BigInt values with gt/gte, so compare directly
function gte(a, b) { if (!(a >= b)) throw new Error(`expected ${a} >= ${b}`); }
function gt(a, b) { if (!(a > b)) throw new Error(`expected ${a} > ${b}`); }

async function reverts(promise, name) {
  try {
    await promise;
  } catch (e) {
    expect(String(e.message)).to.include(name);
    return;
  }
  throw new Error("expected revert: " + name);
}

/// `capTokens` is what the whole supply is worth at the sale price, in whole reserve tokens:
/// 100,000 for a dollar stablecoin, or for example 400 for a stock token worth about $250.
/// `unit` is then one hundred-thousandth of that: "one dollar's worth" of the reserve token.
async function setup(decimals, capTokens = 100000n, opts = {}) {
  const signers = await ethers.getSigners();
  const [owner, platform, creator, ...users] = signers;
  const cap = capTokens * 10n ** BigInt(decimals);
  const unit = cap / 100000n;
  const stable = await (await ethers.getContractFactory(opts.odd ? "MockOddStable" : "MockStable")).deploy(opts.symbol || "Mock USD", opts.symbol || "mUSD", decimals);
  const weth = ethers.Wallet.createRandom().address;
  const router = await (await ethers.getContractFactory("MockRouter")).deploy(weth, stable.target, 3200n * unit);
  await ethers.provider.send("hardhat_setBalance", [router.target, "0x" + (100000n * E18).toString(16)]);
  const factory = await (await ethers.getContractFactory("LaunchpadFactory")).deploy(
    stable.target, opts.noRouter ? ethers.ZeroAddress : router.target, platform.address, owner.address, cap
  );
  const tx = await factory.connect(creator).createCoin("Camel Cash", "HUMP", "ipfs://meta");
  const rc = await tx.wait();
  const ev = rc.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((x) => x && x.name === "CoinCreated");
  const coin = await ethers.getContractAt("Coin", ev.args.coin);
  const market = await ethers.getContractAt("CoinMarket", ev.args.market);
  for (const u of users) {
    await stable.mint(u.address, 10_000_000n * unit);
    await stable.connect(u).approve(market.target, MAXU);
    await coin.connect(u).approve(market.target, MAXU);
  }
  return { owner, platform, creator, users, stable, router, factory, coin, market, unit, cap, decimals };
}

/// Every wallet buys 20M coins until the 800M sale is sold out.
async function sellOut(ctx) {
  for (let i = 0; i < 40; i++) await ctx.market.connect(ctx.users[i]).buy(20n * M, MAXU, FAR);
}

const RESERVES = [
  { label: "a 6-decimal stablecoin", decimals: 6, capTokens: 100000n },
  { label: "an 18-decimal stablecoin", decimals: 18, capTokens: 100000n },
  { label: "a stock token (18 decimals, supply priced at 400 tokens)", decimals: 18, capTokens: 400n, opts: { symbol: "mTSLA" } },
];
for (const R of RESERVES) {
  const decimals = R.decimals;
  const setupR = () => setup(R.decimals, R.capTokens, R.opts);
  describe(`CoinMarket with ${R.label}`, function () {
    it("launches with the whole supply in the market and no coins for the creator", async function () {
      const { coin, market, creator, factory, unit } = await setupR();
      expect(await coin.balanceOf(market.target)).to.equal(1000n * M);
      expect(await coin.balanceOf(creator.address)).to.equal(0n);
      expect(await market.creator()).to.equal(creator.address);
      // sale price is $0.0001 a coin: one million coins cost $100 before fees
      expect((M * (await factory.salePrice())) / 10n ** 36n).to.equal(100n * unit);
      expect(await market.outstanding()).to.equal(0n);
    });

    it("sells at one fixed price and buys back at that price: $1,000 in, $902.50 out", async function () {
      const { market, stable, coin, users, unit } = await setupR();
      const [a, b] = users;
      const coins = (95n * M) / 10n; // 9.5M coins = $950 at the sale price
      const before = await stable.balanceOf(a.address);
      await market.connect(a).buy(coins, 1000n * unit, FAR);
      expect(before - (await stable.balanceOf(a.address))).to.equal(1000n * unit);
      expect(await coin.balanceOf(a.address)).to.equal(coins);
      expect(await market.floorReserve()).to.equal(970n * unit); // $950 + 2% community fee
      // the trade paid the two fees out as its last step: nothing waits in the market
      expect(await market.creatorFees()).to.equal(0n);
      expect(await market.platformFees()).to.equal(0n);
      expect(await stable.balanceOf(market.target)).to.equal(970n * unit);

      // a later buyer pays exactly the same price
      await market.connect(b).buy(coins, 1000n * unit, FAR);
      expect(await market.floorPrice()).to.equal(await market.salePrice());

      const mid = await stable.balanceOf(a.address);
      await market.connect(a).sell(coins, 0n, a.address, FAR);
      expect((await stable.balanceOf(a.address)) - mid).to.equal((9025n * unit) / 10n);
    });

    it("enforces the 2.5% wallet limit on buys and on transfers", async function () {
      const { market, coin, users } = await setupR();
      const [a, b] = users;
      await reverts(market.connect(a).buy(25n * M + 1n, MAXU, FAR), "WalletLimit");
      await market.connect(a).buy(25n * M, MAXU, FAR);
      await market.connect(b).buy(20n * M, MAXU, FAR);
      await reverts(coin.connect(b).transfer(a.address, 1n), "WalletLimit");
      await coin.connect(a).transfer(b.address, 5n * M); // b now holds exactly 25M
      await reverts(coin.connect(a).transfer(b.address, 1n), "WalletLimit");
    });

    it("respects the buyer's price limit and deadline", async function () {
      const { market, users, unit } = await setupR();
      await reverts(market.connect(users[0]).buy(10n * M, 1000n * unit, FAR), "Slippage");
      await reverts(market.connect(users[0]).buy(10n * M, MAXU, 1n), "Expired");
      await reverts(market.connect(users[0]).buy(0n, MAXU, FAR), "ZeroAmount");
      await market.connect(users[0]).buy(10n * M, MAXU, FAR);
      await reverts(market.connect(users[0]).sell(10n * M, 1000n * unit, users[0].address, FAR), "Slippage");
    });

    it("graduates when the sale sells out, lifts the floor, then prices new coins above it", async function () {
      const ctx = await setupR();
      const { market, users, unit } = ctx;
      await sellOut(ctx);
      expect(await market.graduated()).to.equal(true);
      expect(await market.floorOut()).to.equal(800n * M);
      const sale = await market.salePrice();
      const floor = await market.floorPrice();
      // the 2% community fee collected during the sale lifts the floor by about 2.1%
      expect(floor * 10000n / sale).to.equal(10210n);
      gte(await market.floorReserve(), await market.floorLiability());

      // 20M coins off the curve: floor price each, plus a premium of salePrice * s^2 / (200M - s) = $222.22
      const q = await market.quoteBuy(20n * M);
      expect(q.fromCurve).to.equal(20n * M);
      expect(q.premiumPart / (unit / 100n)).to.be.oneOf([22222n, 22223n]);
      await market.connect(users[40]).buy(20n * M, MAXU, FAR);
      gt(await market.currentPrice(), await market.floorPrice());

      // selling them straight back returns to the floor and never below it
      await market.connect(users[40]).sell(20n * M, 0n, users[40].address, FAR);
      expect(await market.curveOut()).to.equal(0n);
      expect(await market.currentPrice()).to.equal(await market.floorPrice());
      gte(await market.floorPrice(), floor);
    });

    it("takes ETH or BNB in and pays ETH or BNB out through the swap router", async function () {
      const { market, coin, users, unit } = await setupR();
      const a = users[0];
      const coins = (95n * M) / 10n; // costs $1,000 = 0.3125 native at the mock rate of $3,200
      const bal0 = await ethers.provider.getBalance(a.address);
      const tx = await market.connect(a).buyWithNative(coins, FAR, { value: E18 });
      const rc = await tx.wait();
      const spent = bal0 - (await ethers.provider.getBalance(a.address)) - rc.gasUsed * rc.gasPrice;
      expect(spent).to.equal(3125n * 10n ** 14n); // the unused 0.6875 came back
      expect(await coin.balanceOf(a.address)).to.equal(coins);
      expect(await market.floorReserve()).to.equal(970n * unit);
      expect(await ethers.provider.getBalance(market.target)).to.equal(0n);

      const bal1 = await ethers.provider.getBalance(a.address);
      const tx2 = await market.connect(a).sellForNative(coins, 0n, a.address, FAR);
      const rc2 = await tx2.wait();
      const got = (await ethers.provider.getBalance(a.address)) - bal1 + rc2.gasUsed * rc2.gasPrice;
      expect(got).to.equal(((9025n * unit) / 10n) * E18 / (3200n * unit)); // $902.50 of native
      await reverts(market.connect(a).buyWithNative(coins, FAR, { value: E18 / 10n }), "EXCESSIVE_INPUT_AMOUNT");
      await reverts(a.sendTransaction({ to: market.target, value: 1n }), "OnlyRouter");
    });

    it("pays the fees out with every trade, only to the creator and to the platform wallet", async function () {
      const { market, stable, factory, owner, platform, creator, users, unit } = await setupR();
      const coins = (95n * M) / 10n;
      // a $1,000 buy: $10 to the creator and $20 to the launchpad, in the same transaction
      const rc = await (await market.connect(users[0]).buy(coins, MAXU, FAR)).wait();
      const names = rc.logs.map((l) => { try { return market.interface.parseLog(l).name; } catch { return null; } }).filter(Boolean);
      expect(names).to.deep.equal(["Bought", "CreatorFeesClaimed", "PlatformFeesSwept"]);
      expect(await stable.balanceOf(creator.address)).to.equal(10n * unit);
      expect(await stable.balanceOf(platform.address)).to.equal(20n * unit);
      expect([await market.creatorFees(), await market.platformFees()]).to.deep.equal([0n, 0n]);
      // selling pays them too: 1% and 2% of the $950 the coins are worth
      await market.connect(users[0]).sell(coins, 0n, users[0].address, FAR);
      expect(await stable.balanceOf(creator.address)).to.equal((195n * unit) / 10n);
      expect(await stable.balanceOf(platform.address)).to.equal(39n * unit);
      // so does a trade in the native currency
      await market.connect(users[2]).buyWithNative(coins, FAR, { value: E18 });
      expect(await stable.balanceOf(creator.address)).to.equal((295n * unit) / 10n);
      await market.connect(users[2]).sellForNative(coins, 0n, users[2].address, FAR);
      expect(await stable.balanceOf(creator.address)).to.equal(39n * unit);
      expect(await stable.balanceOf(platform.address)).to.equal(78n * unit);
      // with nothing waiting, the manual payouts move nothing; a bystander who calls them gains nothing
      await market.connect(users[5]).claimCreatorFees();
      await market.connect(users[5]).sweepPlatformFees();
      expect(await stable.balanceOf(creator.address)).to.equal(39n * unit);
      expect(await stable.balanceOf(users[5].address)).to.equal(10_000_000n * unit);

      // only the factory owner can move the platform wallet, and that is all the owner can do
      await reverts(factory.connect(users[0]).setPlatformWallet(users[0].address), "OwnableUnauthorizedAccount");
      await factory.connect(owner).setPlatformWallet(users[9].address);
      await market.connect(users[1]).buy(coins, MAXU, FAR);
      expect(await stable.balanceOf(users[9].address)).to.equal(10_000_000n * unit + 20n * unit);
      expect(await stable.balanceOf(platform.address)).to.equal(78n * unit);
    });

    it("never lets a fee wallet that cannot receive stop a trade", async function () {
      const { market, stable, coin, platform, creator, users, unit } = await setup(R.decimals, R.capTokens, Object.assign({}, R.opts, { odd: true }));
      const [a, b] = users;
      const coins = (95n * M) / 10n;
      const fees = async () => [await market.creatorFees(), await market.platformFees()].map(String);
      const held = async () => [await stable.balanceOf(creator.address), await stable.balanceOf(platform.address)].map(String);

      // 1. The stablecoin refuses transfers to the creator, as an issuer's block list would.
      await stable.setQuirk(creator.address, 1);
      await market.connect(a).buy(coins, MAXU, FAR);
      expect(await coin.balanceOf(a.address)).to.equal(coins);
      expect(await fees()).to.deep.equal([String(10n * unit), "0"]); // the creator's $10 waits; the launchpad was paid
      expect(await held()).to.deep.equal(["0", String(20n * unit)]);
      await reverts(market.claimCreatorFees(), "ReceiverBlocked"); // the manual payout cannot go through either
      // every later trade still works, and the amount that waits grows
      await market.connect(a).sell(coins, 0n, a.address, FAR);
      expect(await fees()).to.deep.equal([String((195n * unit) / 10n), "0"]);
      // once the block is lifted, the next trade pays everything that waited
      await stable.setQuirk(creator.address, 0);
      await market.connect(b).buy(coins, MAXU, FAR);
      expect(await fees()).to.deep.equal(["0", "0"]);
      expect(await held()).to.deep.equal([String((295n * unit) / 10n), String(59n * unit)]);

      // 2. The stablecoin answers "false" for transfers to the launchpad's wallet and moves nothing.
      await stable.setQuirk(platform.address, 2);
      await market.connect(b).sell(coins, 0n, b.address, FAR);
      expect(await fees()).to.deep.equal(["0", String(19n * unit)]);
      expect(await held()).to.deep.equal([String(39n * unit), String(59n * unit)]);

      // 3. A transfer to the launchpad's wallet burns all the gas it is given. The payout is given a fixed
      //    amount of gas, so the trade still completes and stays affordable.
      await stable.setQuirk(platform.address, 3);
      const rc = await (await market.connect(a).buy(coins, MAXU, FAR)).wait();
      gt(rc.gasUsed, 200_000n);
      gt(600_000n, rc.gasUsed);
      expect(await fees()).to.deep.equal(["0", String(39n * unit)]);
      // the money that waits is still set aside: the market holds its reserve plus exactly those fees
      expect(await stable.balanceOf(market.target)).to.equal((await market.floorReserve()) + 39n * unit);
      await stable.setQuirk(platform.address, 0);
      await market.connect(users[7]).sweepPlatformFees(); // anyone may send the payout that waited
      expect(await held()).to.deep.equal([String(49n * unit), String(98n * unit)]);

      // 4. A stablecoin whose transfer returns no data at all (as USDT does) is paid out normally.
      await stable.setSilent(true);
      await market.connect(a).sell(coins, 0n, a.address, FAR);
      expect(await fees()).to.deep.equal(["0", "0"]);
      expect(await held()).to.deep.equal([String((585n * unit) / 10n), String(117n * unit)]);
      expect(await market.outstanding()).to.equal(0n);
      expect(await stable.balanceOf(market.target)).to.equal(await market.floorReserve());
    });

    it("turns stray stablecoins into extra floor reserve", async function () {
      const ctx = await setupR();
      const { market, stable, users, unit } = ctx;
      await sellOut(ctx);
      const floor = await market.floorPrice();
      await stable.connect(users[45]).transfer(market.target, 8000n * unit);
      await market.reinforce();
      gt(await market.floorPrice(), floor);
      gte(await market.floorReserve(), await market.floorLiability());
    });

    it("stays fully covered through random trading, and lets every holder exit at the end", async function () {
      const ctx = await setupR();
      const { market, coin, stable, users, creator, unit } = ctx;
      let seed = 20261122 + decimals;
      const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const pick = () => users[Math.floor(rnd() * users.length)];
      const CAP = 25n * M;
      let lastFloor = await market.floorPrice();
      let buys = 0, sells = 0, moves = 0;

      const check = async () => {
        const [bal, fr, pr, cf, pf, liab, floor, out, price] = await Promise.all([
          stable.balanceOf(market.target), market.floorReserve(), market.premiumReserve(), market.creatorFees(),
          market.platformFees(), market.floorLiability(), market.floorPrice(), market.outstanding(), market.currentPrice(),
        ]);
        gte(bal, fr + pr + cf + pf); // the contract holds everything it owes
        gte(fr, liab); // the floor reserve can buy back every coin
        gte(floor, lastFloor); // the floor never falls
        gte(price, floor); // the price never prints under the floor
        expect(out).to.equal(1000n * M - (await coin.balanceOf(market.target)));
        lastFloor = floor;
      };

      for (let i = 0; i < 700; i++) {
        const u = pick();
        const held = await coin.balanceOf(u.address);
        const r = rnd();
        const wantBuy = i < 260 ? r < 0.92 : r < 0.5; // fill the sale first, then trade both ways
        if (wantBuy) {
          const room = CAP - held;
          const left = 990n * M - (await market.outstanding());
          let amt = BigInt(Math.floor(rnd() * 20_000_000) + 1) * E18;
          if (amt > room) amt = room;
          if (amt > left) amt = left;
          if (amt === 0n) continue;
          if (rnd() < 0.3) {
            const q = await market.quoteBuy(amt);
            const value = (q.total * E18) / (3200n * unit) + E18 / 100n;
            await market.connect(u).buyWithNative(amt, FAR, { value });
          } else {
            await market.connect(u).buy(amt, MAXU, FAR);
          }
          buys++;
        } else if (r < 0.9) {
          if (held === 0n) continue;
          const amt = rnd() < 0.4 ? held : (held * BigInt(Math.floor(rnd() * 1000) + 1)) / 1000n;
          if (rnd() < 0.3) await market.connect(u).sellForNative(amt, 0n, u.address, FAR);
          else await market.connect(u).sell(amt, 0n, u.address, FAR);
          sells++;
        } else {
          const v = pick();
          const room = CAP - (await coin.balanceOf(v.address));
          const amt = held < room ? held / 2n : room / 2n;
          if (amt === 0n || v.address === u.address) continue;
          await coin.connect(u).transfer(v.address, amt);
          moves++;
        }
        if (i % 97 === 0) { await market.claimCreatorFees(); await market.sweepPlatformFees(); }
        await check();
      }
      expect(await market.graduated()).to.equal(true);
      gt(lastFloor, await market.salePrice());

      // everyone leaves: every sale must succeed, and the reserve must still cover its debts
      for (const u of users) {
        const held = await coin.balanceOf(u.address);
        if (held > 0n) await market.connect(u).sell(held, 0n, u.address, FAR);
        await check();
      }
      expect(await market.outstanding()).to.equal(0n);
      expect(await coin.balanceOf(market.target)).to.equal(1000n * M);
      await market.claimCreatorFees();
      await market.sweepPlatformFees();
      gt(await stable.balanceOf(creator.address), 0n);
      console.log(`      ${buys} buys, ${sells} sells, ${moves} transfers; floor rose ${(Number((lastFloor * 100000n) / (await market.salePrice())) / 1000 - 100).toFixed(2)}%; ` +
        `left in reserve after everyone exited: $${ethers.formatUnits(await market.floorReserve(), decimals)}`);
    });
  });
}

describe("Attacks", function () {
  // An attacker with many wallets trades against a live market in every pattern a seeded search can find.
  // With nobody else trading, the attacker must never end up with more stablecoin than they started with.
  for (const stage of ["during the sale", "after graduation"]) {
    it(`an attacker with 12 wallets cannot extract value ${stage}`, async function () {
      const ctx = await setup(6);
      const { market, coin, stable, users, unit } = ctx;
      const victims = users.slice(0, 40), gang = users.slice(40, 52);
      if (stage === "after graduation") {
        await sellOut(ctx);
        await market.connect(victims[0]).sell(20n * M, 0n, victims[0].address, FAR); // leave room in the floor zone
      } else {
        for (let i = 0; i < 15; i++) await market.connect(victims[i]).buy(20n * M, MAXU, FAR);
      }
      const worth = async () => {
        let t = 0n;
        for (const g of gang) t += await stable.balanceOf(g.address);
        return t;
      };
      const start = await worth();
      const reserveStart = (await market.floorReserve()) + (await market.premiumReserve());
      let seed = stage.length * 7919;
      const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      for (let i = 0; i < 260; i++) {
        const g = gang[Math.floor(rnd() * gang.length)];
        const held = await coin.balanceOf(g.address);
        const r = rnd();
        if (r < 0.45) {
          const room = 25n * M - held, left = 990n * M - (await market.outstanding());
          let amt = rnd() < 0.2 ? BigInt(Math.floor(rnd() * 1000) + 1) : BigInt(Math.floor(rnd() * 25_000_000) + 1) * E18; // dust or size
          if (amt > room) amt = room;
          if (amt > left) amt = left;
          if (amt > 0n) await market.connect(g).buy(amt, MAXU, FAR);
        } else if (r < 0.85) {
          if (held > 0n) await market.connect(g).sell(rnd() < 0.5 ? held : held / BigInt(Math.floor(rnd() * 9) + 2) + 1n, 0n, g.address, FAR);
        } else if (r < 0.93) {
          await stable.connect(g).transfer(market.target, BigInt(Math.floor(rnd() * 500)) * unit); // try a donation
          await market.connect(g).reinforce();
        } else {
          const h = gang[Math.floor(rnd() * gang.length)];
          const room = 25n * M - (await coin.balanceOf(h.address));
          const amt = held < room ? held : room;
          if (amt > 0n && h.address !== g.address) await coin.connect(g).transfer(h.address, amt);
        }
      }
      for (const g of gang) {
        const held = await coin.balanceOf(g.address);
        if (held > 0n) await market.connect(g).sell(held, 0n, g.address, FAR);
      }
      const end = await worth();
      if (end > start) throw new Error(`attacker profit: ${ethers.formatUnits(end - start, 6)}`);
      gte((await market.floorReserve()) + (await market.premiumReserve()), reserveStart); // the victims' reserve only grew
      gte(await market.floorReserve(), await market.floorLiability());
      // every victim can still leave in full
      for (const v of victims) {
        const held = await coin.balanceOf(v.address);
        if (held > 0n) await market.connect(v).sell(held, 0n, v.address, FAR);
      }
      console.log(`      attacker lost $${ethers.formatUnits(start - end, 6)} over 260 moves`);
    });
  }

  it("coins sent straight to the market are simply lost to the sender", async function () {
    const ctx = await setup(6);
    const { market, coin, users } = ctx;
    await sellOut(ctx);
    await coin.connect(users[0]).transfer(market.target, 20n * M); // not a sale: no payout
    gte(await market.floorReserve(), await market.floorLiability());
    for (let i = 1; i < 40; i++) await market.connect(users[i]).sell(20n * M, 0n, users[i].address, FAR);
    expect(await market.outstanding()).to.equal(20n * M); // the lost coins stay counted, and stay covered
    gte(await market.floorReserve(), await market.floorLiability());
  });
});

describe("Options", function () {
  it("works without a swap router: reserve-token trading only, native functions switched off", async function () {
    const { market, coin, users, unit, factory } = await setup(6, 100000n, { noRouter: true });
    expect(await factory.wrappedNative()).to.equal(ethers.ZeroAddress);
    const coins = (95n * M) / 10n;
    await market.connect(users[0]).buy(coins, 1000n * unit, FAR);
    await reverts(market.connect(users[0]).buyWithNative(coins, FAR, { value: E18 }), "NativeNotSupported");
    await reverts(market.connect(users[0]).sellForNative(coins, 0n, users[0].address, FAR), "NativeNotSupported");
    await market.connect(users[0]).sell(coins, 0n, users[0].address, FAR);
    expect(await coin.balanceOf(users[0].address)).to.equal(0n);
  });

  it("prices the supply at the market cap it was deployed with", async function () {
    const stock = await setup(18, 400n, { symbol: "mTSLA" });
    expect(await stock.factory.saleMarketCap()).to.equal(400n * E18);
    // all 1B coins at the sale price cost exactly the market cap, before fees
    expect((1000n * M * (await stock.factory.salePrice())) / 10n ** 36n).to.equal(400n * E18);
    const q = await stock.market.quoteBuy(25n * M); // 2.5% of supply = 10 tokens, plus the 5% fee
    expect(q.floorPart).to.equal(10n * E18);
  });

  it("refuses a market cap that is absurdly small or large, a non-token reserve, and oversized coin details", async function () {
    const [owner, platform] = await ethers.getSigners();
    const F = await ethers.getContractFactory("LaunchpadFactory");
    const stable = await (await ethers.getContractFactory("MockStable")).deploy("Mock USD", "mUSD", 6);
    await reverts(F.deploy(stable.target, ethers.ZeroAddress, platform.address, owner.address, 999_999n), "BadMarketCap");
    await reverts(F.deploy(stable.target, ethers.ZeroAddress, platform.address, owner.address, 10n ** 41n), "BadMarketCap");
    let failed = false;
    try { await F.deploy(owner.address, ethers.ZeroAddress, platform.address, owner.address, 10n ** 11n); } catch (_) { failed = true; }
    expect(failed).to.equal(true);
    const f = await F.deploy(stable.target, ethers.ZeroAddress, platform.address, owner.address, 10n ** 11n);
    await reverts(f.createCoin("Big", "BIG", "x".repeat(16385)), "BadName");
    await f.createCoin("Big", "BIG", "x".repeat(16384));
  });
});

describe("No admin powers", function () {
  it("exposes no function that could move or freeze the reserve", async function () {
    const market = await ethers.getContractFactory("CoinMarket");
    const names = market.interface.fragments.filter((f) => f.type === "function" && !["view", "pure"].includes(f.stateMutability)).map((f) => f.name).sort();
    expect(names).to.deep.equal(["buy", "buyWithNative", "claimCreatorFees", "initialize", "reinforce", "sell", "sellForNative", "sweepPlatformFees"]);
    const coin = await ethers.getContractFactory("Coin");
    const coinNames = coin.interface.fragments.filter((f) => f.type === "function" && !["view", "pure"].includes(f.stateMutability)).map((f) => f.name).sort();
    expect(coinNames).to.deep.equal(["approve", "initialize", "transfer", "transferFrom"]);
    const factory = await ethers.getContractFactory("LaunchpadFactory");
    const factoryNames = factory.interface.fragments.filter((f) => f.type === "function" && !["view", "pure"].includes(f.stateMutability)).map((f) => f.name).sort();
    expect(factoryNames).to.deep.equal(["acceptOwnership", "createCoin", "renounceOwnership", "setPlatformWallet", "transferOwnership"]);
  });

  it("cannot be initialized twice, and the templates cannot be initialized at all", async function () {
    const { market, coin, factory, users } = await setup(6);
    const a = users[0].address;
    await reverts(market.initialize(a, a, a, a, a, 1n), "InvalidInitialization");
    await reverts(coin.initialize("x", "y", "z", a), "InvalidInitialization");
    const marketTemplate = await ethers.getContractAt("CoinMarket", await factory.marketTemplate());
    await reverts(marketTemplate.initialize(a, a, a, a, a, 1n), "InvalidInitialization");
    const coinTemplate = await ethers.getContractAt("Coin", await factory.coinTemplate());
    await reverts(coinTemplate.initialize("x", "y", "z", a), "InvalidInitialization");
  });
});
