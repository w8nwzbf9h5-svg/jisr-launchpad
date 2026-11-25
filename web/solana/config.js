// The Solana networks the page can talk to.
//
//   devnet   the public test network. Coins and money there have no value.
//   mainnet  the real network. It is switched on by putting the program's address in programId below,
//            after the deployment job (.github/workflows/solana-mainnet.yml) has run.
//
// The page opens the real network once it has a program there, and devnet until then.
// solana.html?net=devnet or ?net=mainnet chooses one by hand.
//
// rpcUrl is the endpoint the page reads from and sends through. The public endpoints are rate-limited;
// for the real network use your own provider's address.
(function () {
  const networks = {
    devnet: {
      name: "Solana devnet", rpcUrl: "https://api.devnet.solana.com", explorer: "https://explorer.solana.com", clusterParam: "?cluster=devnet",
      programId: "5cbX2QdxMq948ySWxF6yHruKFtpp5Kf8WGA1wb3BaKC8", test: true,
      // Where wallets fetch a coin's picture and description: files published with this site, made from the
      // chain each time the site is published (scripts/build-metadata.js). The link is written into a coin for good.
      metadataBase: "https://landingpad.fun/meta",
      // Devnet only: the public deployer key left over from the deployment. The page uses it to hand a
      // little SOL for network fees to a wallet that has none. It guards nothing of value.
      feeHelperSeed: "064291e20f163c014a27b8e346d730d9d73d4d8c55365839b7b563c6f602c19f"
    },
    mainnet: {
      name: "Solana", rpcUrl: "https://api.mainnet-beta.solana.com", explorer: "https://explorer.solana.com", clusterParam: "",
      programId: "", test: false, stableName: "USDC",
      // Where wallets fetch a coin's picture: the address of the metadata service (metadata-service/README.md),
      // or of the files published with this site. It must be an address that will never move.
      // Set it BEFORE coins are launched: the link is written into each coin once and can never be changed.
      metadataBase: "https://landingpad.fun/meta"
    }
  };
  let asked = "";
  try { asked = new URLSearchParams(location.search).get("net") || ""; } catch (_) { asked = ""; }
  const key = networks[asked] ? asked : networks.mainnet.programId ? "mainnet" : "devnet";
  const other = key === "mainnet" ? "devnet" : "mainnet";
  window.JISR_SOLANA = Object.assign({ key, other: networks[other].programId || asked ? { key: other, name: networks[other].name } : null }, networks[key]);
})();
