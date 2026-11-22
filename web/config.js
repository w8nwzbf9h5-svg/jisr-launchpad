// Networks the app can talk to. A network appears in the app once it has a factory address,
// either here or in deployments.js (which the deploy scripts write).
//
// rpcUrl is a read-only endpoint used before a wallet is connected. Use your own provider's URL
// in production; public endpoints are rate-limited.
window.JISR_CONFIG = (function () {
  const chains = {
    1:        { name: "Ethereum",          native: "ETH", rpcUrl: "", explorer: "https://etherscan.io", factory: "" },
    56:       { name: "BNB Chain",         native: "BNB", rpcUrl: "", explorer: "https://bscscan.com", factory: "" },
    11155111: { name: "Sepolia testnet",   native: "ETH", rpcUrl: "", explorer: "https://sepolia.etherscan.io", factory: "", test: true },
    97:       { name: "BNB testnet",       native: "BNB", rpcUrl: "", explorer: "https://testnet.bscscan.com", factory: "", test: true },
    31337:    { name: "Local test chain",  native: "ETH", rpcUrl: "http://127.0.0.1:8545", explorer: "", factory: "", test: true }
  };
  const deployed = window.JISR_DEPLOYMENTS || {};
  for (const id of Object.keys(deployed)) {
    if (chains[id]) Object.assign(chains[id], deployed[id]);
  }
  return { chains, slippageBps: 100, deadlineSeconds: 900, boardSize: 60, tradeLookbackBlocks: 5000 };
})();
