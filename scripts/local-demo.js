// Sets up a local test chain for the web app: a test stablecoin, a test swap router, the factory,
// and two example coins with some trading. Writes web/deployments.js so the app finds the factory.
//
//   npx hardhat node                                   (terminal 1)
//   npx hardhat run scripts/local-demo.js --network localhost   (terminal 2)
//   node scripts/serve.js                              (terminal 2, then open http://127.0.0.1:4173)
const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const E18 = 10n ** 18n, M = 1_000_000n * E18, FAR = 2n ** 64n, MAXU = ethers.MaxUint256;

async function main() {
  const signers = await ethers.getSigners();
  const [owner, platform, creator] = signers;
  const unit = 10n ** 6n;

  const stable = await (await ethers.getContractFactory("MockStable")).deploy("Mock USD", "mUSD", 6);
  await stable.waitForDeployment();
  const weth = ethers.Wallet.createRandom().address;
  const router = await (await ethers.getContractFactory("MockRouter")).deploy(weth, stable.target, 3200n * unit);
  await router.waitForDeployment();
  await (await owner.sendTransaction({ to: router.target, value: 50_000n * E18 })).wait();
  const factory = await (await ethers.getContractFactory("LaunchpadFactory")).deploy(stable.target, router.target, platform.address, owner.address, 100000n * unit);
  await factory.waitForDeployment();
  // a second reserve token that stands in for a tokenized stock, for the "priced in a stock" tests
  const stock = await (await ethers.getContractFactory("MockStable")).deploy("Mock Tesla Stock", "mTSLA", 18);
  await stock.waitForDeployment();
  await factory.waitForDeployment();

  async function launch(name, symbol) {
    const rc = await (await factory.connect(creator).createCoin(name, symbol, "")).wait();
    const ev = rc.logs.map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } }).find((x) => x && x.name === "CoinCreated");
    return { coin: await ethers.getContractAt("Coin", ev.args.coin), market: await ethers.getContractAt("CoinMarket", ev.args.market) };
  }
  async function fund(user, market) {
    await (await stable.mint(user.address, 1_000_000n * unit)).wait();
    await (await stable.connect(user).approve(market.target, MAXU)).wait();
  }

  // Coin 1: part-way through its sale.
  const a = await launch("Camel Cash", "HUMP");
  for (let i = 10; i < 23; i++) { await fund(signers[i], a.market); await (await a.market.connect(signers[i]).buy(25n * M, MAXU, FAR)).wait(); }

  // Coin 2: sold out, graduated, trading above the floor.
  const b = await launch("Karak Chai", "KARAK");
  for (let i = 10; i < 42; i++) { await fund(signers[i], b.market); await (await b.market.connect(signers[i]).buy(25n * M, MAXU, FAR)).wait(); }
  for (let i = 42; i < 46; i++) { await fund(signers[i], b.market); await (await b.market.connect(signers[i]).buy(20n * M, MAXU, FAR)).wait(); }

  const chainId = (await ethers.provider.getNetwork()).chainId.toString();
  const out = { [chainId]: { factory: factory.target, faucet: true } };
  const file = path.join(__dirname, "..", "web", "deployments.js");
  fs.writeFileSync(file, "// Written by scripts/local-demo.js. Maps a chain id to the LaunchpadFactory deployed there.\nwindow.JISR_DEPLOYMENTS = " + JSON.stringify(out, null, 2) + ";\n");
  console.log(JSON.stringify({ network: network.name, chainId, factory: factory.target, stable: stable.target, router: router.target, coins: [a.coin.target, b.coin.target], stock: stock.target }));
}

main().catch((e) => { console.error(e); process.exit(1); });
