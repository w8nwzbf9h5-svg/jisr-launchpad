// The site's translations.
//
//   node scripts/i18n.js extract   lists every English text of the translated pages in i18n/source.tsv
//                                  (needs Chrome, as the end-to-end test does)
//   node scripts/i18n.js build     checks i18n/<language>.tsv against that list and writes web/lang/<language>.js
//
// A line of a .tsv file is a text's short code, a tab, and the text. The code is worked out from the English
// text (see web/i18n.js), so when the English changes its code changes and the old translation is reported.
// Marks such as <1>…</1> and {name} must appear in a translation exactly as often as in the English.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "i18n"), OUT = path.join(ROOT, "web", "lang");
const LANGS = ["ar", "zh", "es", "hi", "fr", "ru", "pt", "id", "tr"];
const PAGES = [{ page: "index.html", scripts: ["home.js"] }];

const norm = (s) => String(s).replace(/\s+/g, " ").trim();
function code(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
const readTsv = (file) => fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => { const i = l.search(/[\t ]/); return [l.slice(0, i), l.slice(i + 1).trim()]; });
const marks = (s) => (s.match(/<\/?\d+\/?>|\{\w+\}/g) || []).sort().join(" ");

async function extract() {
  const puppeteer = require("puppeteer-core");
  const server = spawn("node", [path.join(__dirname, "serve.js")], { env: Object.assign({}, process.env, { PORT: "4188" }), stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
  const seen = new Map();
  try {
    for (const p of PAGES) {
      const page = await browser.newPage();
      await page.setRequestInterception(true);
      page.on("request", (r) => (r.url().startsWith("http://127.0.0.1:4188/") && !/\/(home|app|markets)\.js/.test(r.url()) ? r.continue() : r.abort()));
      await page.goto("http://127.0.0.1:4188/" + p.page + "?lang=en", { waitUntil: "domcontentloaded" });
      await page.evaluate(() => window.JISR_I18N.ready);
      for (const u of await page.evaluate(() => window.JISR_I18N.units)) if (!seen.has(code(u))) seen.set(code(u), u);
      await page.close();
      for (const f of p.scripts) {
        const src = fs.readFileSync(path.join(ROOT, "web", f), "utf8");
        for (const m of src.matchAll(/\btr\(\s*"((?:[^"\\]|\\.)*)"/g)) { const u = norm(JSON.parse('"' + m[1] + '"')); if (!seen.has(code(u))) seen.set(code(u), u); }
      }
    }
  } finally { await browser.close(); server.kill(); }
  const codes = new Set();
  for (const c of seen.keys()) { if (codes.has(c)) throw new Error("two texts share the code " + c); codes.add(c); }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, "source.tsv"), "# code<TAB>English text. Written by: node scripts/i18n.js extract\n" + [...seen].map(([c, u]) => c + "\t" + u).join("\n") + "\n");
  console.log(seen.size + " texts in i18n/source.tsv");
}

function build() {
  const source = new Map(readTsv(path.join(DIR, "source.tsv")));
  let bad = 0;
  fs.mkdirSync(OUT, { recursive: true });
  for (const lang of LANGS) {
    const file = path.join(DIR, lang + ".tsv");
    if (!fs.existsSync(file)) { console.log(lang + ": no translation file yet"); continue; }
    const dict = {}, notes = [];
    for (const [c, text] of readTsv(file)) {
      if (!source.has(c)) { notes.push("unknown code " + c + " (the English text changed or was removed)"); continue; }
      if (c in dict) notes.push("code " + c + " appears twice");
      if (marks(text) !== marks(source.get(c))) { notes.push("marks differ for " + c + ": " + source.get(c) + " => " + text); continue; }
      dict[c] = text.trim();
    }
    for (const [c, u] of source) if (!(c in dict)) notes.push("not translated: " + c + "\t" + u);
    fs.writeFileSync(path.join(OUT, lang + ".js"), "/* Written by: node scripts/i18n.js build. Edit i18n/" + lang + ".tsv instead. */\nwindow.JISR_DICT=" + JSON.stringify(dict) + ";\n");
    console.log(lang + ": " + Object.keys(dict).length + " of " + source.size + " texts" + (notes.length ? "\n  " + notes.join("\n  ") : ""));
    bad += notes.length;
  }
  if (bad) process.exitCode = 1;
}

const what = process.argv[2];
if (what === "extract") extract().catch((e) => { console.error(e); process.exit(1); });
else if (what === "build") build();
else console.log("Use: node scripts/i18n.js extract | build");
