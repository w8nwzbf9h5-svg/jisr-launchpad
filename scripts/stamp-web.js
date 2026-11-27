// Adds a content hash to every script and stylesheet address in the web pages (app.js?v=1a2b3c4d),
// so browsers fetch the new file as soon as it changes instead of showing a cached old one.
// Run after changing anything under web/:  node scripts/stamp-web.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const web = path.join(__dirname, "..", "web");
const assets = ["styles.css", "home.css", "home.js", "app.js", "admin.js", "wallet.js", "config.js", "contracts.js", "vendor/ethers.umd.min.js",
  "solana/app.js", "solana/jisr-solana.js", "solana/config.js", "vendor/solana-web3.iife.min.js",
  "markets.css", "markets.js", "launch.js", "visits.js", "vendor/lightweight-charts.standalone.production.js", "i18n.js", "runway.js", "robot.js", "nav.js", "ticker.js"];
// i18n.js passes its own version on to the language file it loads, so its version covers those files too.
const langs = fs.existsSync(path.join(web, "lang")) ? fs.readdirSync(path.join(web, "lang")).sort().map((f) => "lang/" + f) : [];
const hash = (f) => { const h = crypto.createHash("sha256"); for (const x of f === "i18n.js" ? [f].concat(langs) : [f]) h.update(fs.readFileSync(path.join(web, x))); return h.digest("hex").slice(0, 8); };

for (const page of ["index.html", "app.html", "admin.html", "whitepaper.html", "solana.html", "markets.html", "simulator.html"]) {
  let html = fs.readFileSync(path.join(web, page), "utf8");
  for (const a of assets) {
    const re = new RegExp('"' + a.replace(/[.\/]/g, "\\$&") + '(\\?v=[0-9a-f]*)?"', "g");
    html = html.replace(re, '"' + a + "?v=" + hash(a) + '"');
  }
  fs.writeFileSync(path.join(web, page), html);
  console.log("stamped", page);
}
