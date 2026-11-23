// Adds a content hash to every script and stylesheet address in the web pages (app.js?v=1a2b3c4d),
// so browsers fetch the new file as soon as it changes instead of showing a cached old one.
// Run after changing anything under web/:  node scripts/stamp-web.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const web = path.join(__dirname, "..", "web");
const assets = ["styles.css", "app.js", "admin.js", "wallet.js", "config.js", "contracts.js", "vendor/ethers.umd.min.js",
  "solana/app.js", "solana/jisr-solana.js", "solana/config.js", "vendor/solana-web3.iife.min.js"];
const hash = (f) => crypto.createHash("sha256").update(fs.readFileSync(path.join(web, f))).digest("hex").slice(0, 8);

for (const page of ["index.html", "admin.html", "whitepaper.html", "solana.html"]) {
  let html = fs.readFileSync(path.join(web, page), "utf8");
  for (const a of assets) {
    const re = new RegExp('"' + a.replace(/[.\/]/g, "\\$&") + '(\\?v=[0-9a-f]*)?"', "g");
    html = html.replace(re, '"' + a + "?v=" + hash(a) + '"');
  }
  fs.writeFileSync(path.join(web, page), html);
  console.log("stamped", page);
}
