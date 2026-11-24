// Writes the file a wallet asks for when it wants a Solana coin's picture: web/meta/<market address>.json.
// Run by the site's publishing workflow before the site is uploaded, so the files are published with it.
// The files are made from the chain every time and are not kept in the repository.
//
//   SITE_URL=https://example.com/ node scripts/build-metadata.js
//
// For every Solana network in web/solana/config.js that has a program and a metadata address, it reads
// every coin's market account and writes what metadata-service/worker.mjs would answer for it. A coin's
// name, ticker and details are written once at launch and never change, so a file never needs updating:
// each run only adds the files of coins launched since the last one.
//
// If the network cannot be read, the script fails. The workflow then publishes nothing, and the files
// already on the site stay as they are. A half-read list must never replace a full one.
const fs = require("fs");
const path = require("path");
const web3 = require("@solana/web3.js");
const J = require("../web/solana/jisr-solana.js");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "web", "meta");

/* web/solana/config.js is written for a browser. Read one network's settings from it by giving it what it looks for. */
function settings(net) {
  const src = fs.readFileSync(path.join(root, "web", "solana", "config.js"), "utf8");
  const window = {};
  new Function("window", "location", "URLSearchParams", src)(window, { search: "?net=" + net }, URLSearchParams);
  return window.JISR_SOLANA && window.JISR_SOLANA.key === net ? window.JISR_SOLANA : null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(what, fn) {
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (e) { if (i >= 5) throw new Error(what + ": " + String(e.message || e).split("\n")[0]); await sleep(1500 * i); }
  }
}

(async () => {
  const { details, build } = await import("../metadata-service/worker.mjs");
  const site = String(process.env.SITE_URL || "").replace(/\/+$/, "");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  let total = 0;
  for (const net of ["devnet", "mainnet"]) {
    const c = settings(net);
    if (!c || !c.programId || !c.metadataBase) { console.log(net + ": no program or no metadata address; skipped"); continue; }
    const conn = new web3.Connection(c.rpcUrl, { commitment: "confirmed", disableRetryOnRateLimit: true }), programId = new web3.PublicKey(c.programId);
    const cfg = await retry(net + " settings", () => J.getConfig(conn, programId));
    if (!cfg) { console.log(net + ": the launchpad is not started; no coins"); continue; }
    const count = Number(cfg.coinCount), markets = [];
    for (let upTo = count; upTo > 0; upTo -= 100) {
      const batch = await retry(net + " coins up to " + upTo, () => J.getMarkets(conn, programId, BigInt(upTo), Math.min(100, upTo)));
      markets.push(...batch);
      await sleep(300);
    }
    if (markets.length !== count) throw new Error(net + ": the network returned " + markets.length + " of " + count + " coins");
    const pageUrl = site ? site + "/solana.html" + (net === "devnet" ? "?net=devnet" : "") : "";
    for (const m of markets) {
      const body = build({ coinMint: m.coinMint.toBase58(), name: m.name, symbol: m.symbol, details: details(m.uri) }, pageUrl);
      // the address the coin's own metadata points at; a coin launched before the address was set points nowhere, and gets a file anyway
      fs.writeFileSync(path.join(outDir, m.address.toBase58() + ".json"), JSON.stringify(body));
      total++;
    }
    console.log(net + ": " + markets.length + " coin files written for program " + c.programId);
  }
  console.log("Wrote " + total + " files to web/meta/");
})().catch((e) => { console.error("Could not build the metadata files: " + (e.message || e)); process.exit(1); });
