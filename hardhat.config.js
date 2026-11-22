require("@nomicfoundation/hardhat-ethers");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

// Compile with the solc 0.8.26 build pinned in package.json, so every build uses the same compiler.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === "0.8.26") {
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: "0.8.26",
      longVersion: "0.8.26+commit.8a97fa7a.Emscripten.clang",
    };
  }
  return runSuper();
});

const accounts = process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [];

module.exports = {
  solidity: {
    version: "0.8.26",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  },
  networks: {
    hardhat: { accounts: { count: 60, accountsBalance: "1000000000000000000000000" } },
    ethereum: { url: process.env.ETH_RPC_URL || "", accounts },
    bsc: { url: process.env.BSC_RPC_URL || "", accounts },
    sepolia: { url: process.env.SEPOLIA_RPC_URL || "", accounts },
    bscTestnet: { url: process.env.BSC_TESTNET_RPC_URL || "", accounts },
  },
  mocha: { timeout: 600000 },
};
