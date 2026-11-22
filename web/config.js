// Networks the app can talk to. A network appears in the app once it has a factory address in
// deployments.js, which the deploy page writes for you.
//
// Any EVM network works. The ones below are named in advance; a network that is not listed here is
// described fully in deployments.js instead (name, currency symbol, rpcUrl), again by the deploy page.
//
// rpcUrl is a read-only endpoint used before a visitor connects a wallet. Use your own provider's URL
// in production; public endpoints are rate-limited.
window.JISR_CONFIG = (function () {
  const chains = {
    1:        { name: "Ethereum",                native: "ETH",  rpcUrl: "", explorer: "https://etherscan.io" },
    56:       { name: "BNB Chain",               native: "BNB",  rpcUrl: "", explorer: "https://bscscan.com" },
    8453:     { name: "Base",                    native: "ETH",  rpcUrl: "", explorer: "https://basescan.org" },
    42161:    { name: "Arbitrum One",            native: "ETH",  rpcUrl: "", explorer: "https://arbiscan.io" },
    10:       { name: "OP Mainnet",              native: "ETH",  rpcUrl: "", explorer: "https://optimistic.etherscan.io" },
    137:      { name: "Polygon",                 native: "POL",  rpcUrl: "", explorer: "https://polygonscan.com" },
    43114:    { name: "Avalanche",               native: "AVAX", rpcUrl: "", explorer: "https://snowtrace.io" },
    4663:     { name: "Robinhood Chain",         native: "ETH",  rpcUrl: "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robinhoodchain.blockscout.com" },
    11155111: { name: "Sepolia testnet",         native: "ETH",  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com", explorer: "https://sepolia.etherscan.io", test: true },
    97:       { name: "BNB testnet",             native: "BNB",  rpcUrl: "https://data-seed-prebsc-1-s1.bnbchain.org:8545", explorer: "https://testnet.bscscan.com", test: true },
    84532:    { name: "Base Sepolia testnet",    native: "ETH",  rpcUrl: "", explorer: "https://sepolia.basescan.org", test: true },
    421614:   { name: "Arbitrum Sepolia testnet", native: "ETH", rpcUrl: "", explorer: "https://sepolia.arbiscan.io", test: true },
    46630:    { name: "Robinhood Chain testnet", native: "ETH",  rpcUrl: "https://rpc.testnet.chain.robinhood.com", explorer: "", test: true },
    31337:    { name: "Local test chain",        native: "ETH",  rpcUrl: "http://127.0.0.1:8545", explorer: "", test: true }
  };
  const deployed = window.JISR_DEPLOYMENTS || {};
  for (const id of Object.keys(deployed)) {
    chains[id] = Object.assign({ name: "Network " + id, native: "ETH", rpcUrl: "", explorer: "" }, chains[id], deployed[id]);
  }
  return { chains, slippageBps: 100, deadlineSeconds: 900, boardSize: 60, tradeLookbackBlocks: 5000 };
})();
