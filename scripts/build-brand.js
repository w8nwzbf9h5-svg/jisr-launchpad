// Draws the brand images that are kept in the repository: the icons and the picture shown when a link
// to the site is shared (og.png). Run it only when the brand changes:
//   npm install --no-save @fontsource/plus-jakarta-sans @fontsource/jetbrains-mono
//   node scripts/build-brand.js
// It needs Chrome (CHROME_PATH, as for the browser tests).
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const root = path.join(__dirname, ".."), web = path.join(root, "web");
const font = (pkg, file) => "file://" + path.join(root, "node_modules", "@fontsource", pkg, "files", file);
const FONTS = [400, 600, 700, 800].map((w) => `@font-face{font-family:"Plus Jakarta Sans";font-weight:${w};src:url("${font("plus-jakarta-sans", "plus-jakarta-sans-latin-" + w + "-normal.woff2")}") format("woff2")}`).join("") +
  [500, 600].map((w) => `@font-face{font-family:"JetBrains Mono";font-weight:${w};src:url("${font("jetbrains-mono", "jetbrains-mono-latin-" + w + "-normal.woff2")}") format("woff2")}`).join("");

/* The mark: a bridge (jisr) standing on the floor. Blue is the launchpad, amber is the floor, as on the site. */
const mark = (size, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">${bg === false ? "" : '<rect width="64" height="64" rx="14" fill="#0A0D14"/>'}<path d="M14.5 43 A17.5 17.5 0 0 1 49.5 43" fill="none" stroke="#4C7DFF" stroke-width="7"/><rect x="9" y="43" width="46" height="7" rx="2" fill="#F5A524"/></svg>`;

/* The price line of a coin, drawn from the model: flat through the sale, then the curve; the floor in amber. */
function line(w, h) {
  const px = (s) => (s / 950) * w, py = (m) => h - 6 - (m / 16) * (h - 12), pts = [[px(0), py(1)]];
  for (let s = 800; s <= 950; s += 2) pts.push([px(s), py(Math.pow(200 / (1000 - s), 2))]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const grid = [4, 8, 12, 16].map((m) => `<line x1="0" x2="${w}" y1="${py(m).toFixed(1)}" y2="${py(m).toFixed(1)}" stroke="#1B2231" stroke-width="1"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${grid}<path d="M${px(800).toFixed(1)} ${py(1).toFixed(1)} L${w} ${py(1).toFixed(1)}" stroke="#F5A524" stroke-width="5" stroke-linecap="round" fill="none"/><path d="${d}" stroke="#4C7DFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
}
const page = (w, h, body, css) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FONTS}*{box-sizing:border-box;margin:0}html,body{width:${w}px;height:${h}px}body{background:#0A0D14;color:#EAEEF6;font-family:"Plus Jakarta Sans",sans-serif;overflow:hidden;position:relative}${css || ""}</style></head><body>${body}</body></html>`;

const og = page(1200, 630, `
<div class="brand">${mark(56, false)}<b>LANDING</b><span>pad</span></div>
<h1>Launch a coin whose floor is paid for in advance.</h1>
<p>One fixed price for everyone. A reserve nobody can withdraw. Sell back at the floor at any time.</p>
<div class="tag">Public test on Solana devnet and Ethereum Sepolia</div>
<div class="art">${line(1200, 250)}</div>`, `
.brand{position:absolute;left:64px;top:52px;display:flex;align-items:center;gap:14px}
.brand b{font-weight:800;font-size:34px;letter-spacing:.06em}
.brand span{font-size:17px;letter-spacing:.14em;text-transform:uppercase;color:#8C95A9;font-weight:600}
h1{position:absolute;left:64px;top:150px;width:900px;font-weight:800;font-size:70px;line-height:1.04;letter-spacing:-.03em}
p{position:absolute;left:64px;top:392px;width:820px;font-size:27px;line-height:1.4;color:#C5CCDB}
.tag{position:absolute;left:64px;bottom:44px;font:600 21px "JetBrains Mono",monospace;color:#F5A524}
.art{position:absolute;left:0;right:0;bottom:0;height:250px;opacity:.5}`);

(async () => {
  fs.writeFileSync(path.join(web, "favicon.svg"), mark(64));
  fs.mkdirSync(path.join(root, "brand"), { recursive: true });
  fs.writeFileSync(path.join(root, "brand", "mark.svg"), mark(512));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-gpu", "--allow-file-access-from-files"] });
  const shot = async (html, w, h, out) => {
    const p = await browser.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    const tmp = path.join(require("os").tmpdir(), "jisr-brand-" + path.basename(out) + ".html");
    fs.writeFileSync(tmp, html);
    await p.goto("file://" + tmp, { waitUntil: "networkidle0" });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: out, omitBackground: false });
    await p.close(); fs.unlinkSync(tmp);
    console.log("wrote", path.relative(root, out), Math.round(fs.statSync(out).size / 1024) + " KB");
  };
  await shot(og, 1200, 630, path.join(web, "og.png"));
  for (const s of [180, 512]) await shot(page(s, s, mark(s), "body{background:#0A0D14}"), s, s, path.join(web, "icon-" + s + ".png"));
  await browser.close();
})();
module.exports = { mark, line };
