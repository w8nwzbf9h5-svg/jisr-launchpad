// Deploys the LaunchpadFactory on one chain.
//
//   STABLE_ADDRESS    the stablecoin every coin on this chain is priced and reserved in (USDC or USDT)
//   ROUTER_ADDRESS    a Uniswap V2 style router with deep native/stable liquidity
//                     (Uniswap V2 Router02 on Ethereum, PancakeSwap V2 router on BNB Chain)
//   PLATFORM_WALLET   receives the launchpad's 2% fee; the only wallet the team controls
//   OWNER_ADDRESS     may change PLATFORM_WALLET and nothing else; use a multisig
//
// Take every address from the project's own official documentation and check it on a block explorer
// before you deploy. These three choices are permanent for this factory.
//
//   npx hardhat run scripts/deploy.js --network sepolia
const { ethers, network } = require("hardhat");

async function main() {
  const need = ["STABLE_ADDRESS", "ROUTER_ADDRESS", "PLATFORM_WALLET", "OWNER_ADDRESS"];
  for (const k of need) {
    if (!ethers.isAddress(process.env[k] || "")) throw new Error(`Set ${k} to a valid address`);
  }
  const { STABLE_ADDRESS, ROUTER_ADDRESS, PLATFORM_WALLET, OWNER_ADDRESS } = process.env;

  const [deployer] = await ethers.getSigners();
  console.log(`Network ${network.name}, deployer ${deployer.address}`);

  const Factory = await ethers.getContractFactory("LaunchpadFactory");
  const factory = await Factory.deploy(STABLE_ADDRESS, ROUTER_ADDRESS, PLATFORM_WALLET, OWNER_ADDRESS);
  await factory.waitForDeployment();

  console.log("LaunchpadFactory:", factory.target);
  console.log("  coin template:   ", await factory.coinTemplate());
  console.log("  market template: ", await factory.marketTemplate());
  console.log("  stablecoin:      ", await factory.stable());
  console.log("  router:          ", await factory.router());
  console.log("  wrapped native:  ", await factory.wrappedNative());
  console.log("  sale price:      ", (await factory.salePrice()).toString());
  console.log("  platform wallet: ", await factory.platformWallet());
  console.log("  owner:           ", await factory.owner());

  // Tell the web app where the factory is on this chain.
  const fs = require("fs"), path = require("path");
  const file = path.join(__dirname, "..", "web", "deployments.js");
  const chainId = (await ethers.provider.getNetwork()).chainId.toString();
  let current = {};
  try { current = JSON.parse(fs.readFileSync(file, "utf8").split("window.JISR_DEPLOYMENTS =")[1].replace(/;\s*$/, "")); } catch (_) { /* start fresh */ }
  current[chainId] = Object.assign({}, current[chainId], { factory: factory.target });
  fs.writeFileSync(file, "// Written by the deploy scripts. Maps a chain id to the LaunchpadFactory deployed there.\nwindow.JISR_DEPLOYMENTS = " + JSON.stringify(current, null, 2) + ";\n");
  console.log("Saved to web/deployments.js. Set this chain's rpcUrl in web/config.js if it is empty.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
