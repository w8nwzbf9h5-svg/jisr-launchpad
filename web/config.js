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
    1:        { name: "Ethereum",                native: "ETH",  rpcUrl: "", explorer: "https://etherscan.io", cctp: 0, usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    56:       { name: "BNB Chain",               native: "BNB",  rpcUrl: "", explorer: "https://bscscan.com" },
    8453:     { name: "Base",                    native: "ETH",  rpcUrl: "", explorer: "https://basescan.org", cctp: 6, usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    42161:    { name: "Arbitrum One",            native: "ETH",  rpcUrl: "", explorer: "https://arbiscan.io", cctp: 3, usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
    10:       { name: "OP Mainnet",              native: "ETH",  rpcUrl: "", explorer: "https://optimistic.etherscan.io", cctp: 2, usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" },
    137:      { name: "Polygon",                 native: "POL",  rpcUrl: "", explorer: "https://polygonscan.com", cctp: 7, usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
    43114:    { name: "Avalanche",               native: "AVAX", rpcUrl: "", explorer: "https://snowtrace.io", cctp: 1, usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" },
    4663:     { name: "Robinhood Chain",         native: "ETH",  rpcUrl: "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robinhoodchain.blockscout.com" },
    11155111: { name: "Sepolia testnet",         native: "ETH",  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com", explorer: "https://sepolia.etherscan.io", test: true, cctp: 0, usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" },
    97:       { name: "BNB testnet",             native: "BNB",  rpcUrl: "https://data-seed-prebsc-1-s1.bnbchain.org:8545", explorer: "https://testnet.bscscan.com", test: true },
    84532:    { name: "Base Sepolia testnet",    native: "ETH",  rpcUrl: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org", test: true, cctp: 6, usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
    421614:   { name: "Arbitrum Sepolia testnet", native: "ETH", rpcUrl: "https://sepolia-rollup.arbitrum.io/rpc", explorer: "https://sepolia.arbiscan.io", test: true, cctp: 3, usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" },
    46630:    { name: "Robinhood Chain testnet", native: "ETH",  rpcUrl: "https://rpc.testnet.chain.robinhood.com", explorer: "", test: true },
    31337:    { name: "Local test chain",        native: "ETH",  rpcUrl: "http://127.0.0.1:8545", explorer: "", test: true }
  };
  // Selling on one network and receiving on another uses Circle's CCTP (version 2), which moves native USDC.
  // "cctp" above is Circle's number for the network and "usdc" is native USDC there; a network without them
  // (BNB Chain, Robinhood Chain) cannot send or receive this way. Circle uses one set of addresses on its
  // supported main networks and another on test networks.
  const cctp = {
    main: { messenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d", transmitter: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64", api: "https://iris-api.circle.com" },
    test: { messenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA", transmitter: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275", api: "https://iris-api-sandbox.circle.com" }
  };
  const deployed = window.JISR_DEPLOYMENTS || {};
  for (const id of Object.keys(deployed)) {
    chains[id] = Object.assign({ name: "Network " + id, native: "ETH", rpcUrl: "", explorer: "" }, chains[id], deployed[id]);
  }
  return { chains, cctp, slippageBps: 100, deadlineSeconds: 900, boardSize: 60, tradeLookbackBlocks: 5000 };
})();
