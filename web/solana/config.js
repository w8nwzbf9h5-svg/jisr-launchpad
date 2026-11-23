// Where the Jisr program lives on Solana. "programId" is filled in when the program is deployed.
window.JISR_SOLANA = {
  name: "Solana devnet",
  rpcUrl: "https://api.devnet.solana.com",
  explorer: "https://explorer.solana.com",
  clusterParam: "?cluster=devnet",
  programId: "7cu1YmBA3D1asv1fUijaoZ5FqodZrW9JhbWdPCXGGSkU",
  // Devnet only: the key of the address that paid for the deployment (scripts/devnet-deployer.js).
  // It is public on purpose and holds only free devnet SOL. The page uses what is left there to give
  // a new visitor the little SOL that network fees need. Leave empty to switch that off.
  feeHelperSeed: "064291e20f163c014a27b8e346d730d9d73d4d8c55365839b7b563c6f602c19f"
};
