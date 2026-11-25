// Builds web/whitepaper.html from WHITEPAPER.md (English, the reference) and its translations WHITEPAPER-XX.md.
// Edit the Markdown files, then run:  node scripts/build-whitepaper.js && node scripts/stamp-web.js
const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

const FIG = require("./whitepaper-figures.js");

const root = path.join(__dirname, "..");
const text = (file) => marked.parse(fs.readFileSync(path.join(root, file), "utf8"), { gfm: true })
  .replace(/<table>/g, '<div class="tw"><table>').replace(/<\/table>/g, "</table></div>")
  .replace(/<a href="http/g, '<a rel="noopener" href="http');

// The four figures go at the end of the sections they illustrate. Every language has the same
// section layout, so the places are counted in third-level headings:
//   figure 1 (life of a coin)   before 2.1      figure 3 (rising floor)  before 2.4
//   figure 2 (where $1,000 goes) before 2.3     figure 4 (price line)    before 2.5
const PLACES = [0, 2, 3, 4];
function html(file, lang) {
  const parts = text(file).split(/(?=<h3)/), figs = FIG.figures(lang);
  if (parts.length !== 7) throw new Error(file + ": expected 6 third-level headings, found " + (parts.length - 1));
  PLACES.forEach((at, i) => { parts[at] += "\n" + figs[i] + "\n"; });
  return parts.join("");
}

// English is the reference text. To add a language: add its Markdown file and one line here.
const LANGS = [
  { code: "en", file: "WHITEPAPER.md", name: "English", title: "Landing Pad: White Paper", back: "Open the launchpad" },
  { code: "ar", file: "WHITEPAPER-AR.md", name: "العربية", title: "منصة Landing Pad: الورقة البيضاء", back: "افتح المنصة", rtl: true },
  { code: "zh", file: "WHITEPAPER-ZH.md", name: "中文", title: "Landing Pad：白皮书", back: "打开平台" },
  { code: "es", file: "WHITEPAPER-ES.md", name: "Español", title: "Landing Pad: Libro blanco", back: "Abrir la plataforma" },
  { code: "hi", file: "WHITEPAPER-HI.md", name: "हिन्दी", title: "Landing Pad: श्वेत पत्र", back: "प्लेटफ़ॉर्म खोलें" },
  { code: "fr", file: "WHITEPAPER-FR.md", name: "Français", title: "Landing Pad : livre blanc", back: "Ouvrir la plateforme" },
  { code: "ru", file: "WHITEPAPER-RU.md", name: "Русский", title: "Landing Pad: Белая книга", back: "Открыть площадку" },
  { code: "pt", file: "WHITEPAPER-PT.md", name: "Português", title: "Landing Pad: White Paper", back: "Abrir a plataforma" },
  { code: "tr", file: "WHITEPAPER-TR.md", name: "Türkçe", title: "Landing Pad: Teknik Doküman", back: "Platformu aç" },
  { code: "id", file: "WHITEPAPER-ID.md", name: "Bahasa Indonesia", title: "Landing Pad: Buku Putih", back: "Buka platform" },
];
const articles = LANGS.map((l) => `<article id="paper-${l.code}" lang="${l.code}"${l.rtl ? ' dir="rtl"' : ""}${l.code === "en" ? "" : " hidden"}>\n${html(l.file, l.code)}\n</article>`).join("\n");
const options = LANGS.map((l) => `<option value="${l.code}">${l.name}</option>`).join("");
const meta = JSON.stringify(LANGS.reduce((m, l) => { m[l.code] = { title: l.title, back: l.back }; return m; }, {}));

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-180.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Landing Pad">
<meta property="og:title" content="Landing Pad: coins with a floor that is paid for in advance">
<meta property="og:description" content="One fixed price for everyone, and a reserve nobody can withdraw. Operate the model and read the proof live from the chain. Public test.">
<meta property="og:image" content="https://landingpad.fun/og.png">
<meta name="twitter:card" content="summary_large_image">
<title>Landing Pad: White Paper</title>
<meta name="description" content="How Landing Pad works: a fixed sale price, a floor covered 100% by a reserve nobody can withdraw, and the risks.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
<style>
.paper{max-width:780px;margin:0 auto;padding:26px 16px 64px}
.paper article{overflow-wrap:anywhere}
.paper h1{font-weight:800;font-size:clamp(28px,7vw,42px);line-height:1.12;letter-spacing:-.02em;margin:8px 0 10px}
.paper h1+p{color:var(--muted);font-size:14px;font-weight:600;margin:0 0 18px}
.paper h2{font-weight:800;font-size:22px;line-height:1.25;margin:38px 0 10px;padding-top:18px;border-top:1px solid var(--line)}
.paper h3{font-weight:700;font-size:17px;margin:24px 0 8px}
.paper p,.paper li{font-size:16px;line-height:1.7}
.paper p{margin:0 0 12px}
.paper ul{margin:0 0 12px;padding-inline-start:22px}
.paper li{margin-bottom:6px}
.paper a{color:var(--accent)}
.paper code{font-family:var(--mono);font-size:13px;background:var(--raise);border:1px solid var(--line);border-radius:6px;padding:2px 6px;direction:ltr;unicode-bidi:embed}
.paper blockquote{margin:14px 0;padding:12px 16px;border-inline-start:4px solid var(--floor);background:var(--surface);border-radius:8px}
.paper blockquote p{margin:0;font-weight:600}
.paper .tw{overflow-x:auto;margin:12px 0 16px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
.paper table{width:100%;border-collapse:collapse;font-size:14.5px}
.paper th,.paper td{padding:10px 12px;text-align:start;vertical-align:top;border-bottom:1px solid var(--line)}
.paper th{color:var(--muted);font-size:12.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;background:var(--raise)}
.paper tr:last-child td{border-bottom:0}
.paper article[lang=ar]{font-family:"IBM Plex Sans Arabic",system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
.paper article:not([lang=en]) th{letter-spacing:0;text-transform:none;font-size:13.5px}
.ptop .acts select{max-width:150px}
.ptop{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:12px;padding-bottom:12px}
.ptop a.brand{text-decoration:none}
.ptop .acts{display:flex;gap:8px;align-items:center}
.ptop .acts a,.ptop .acts select{border:1px solid var(--line);background:var(--raise);color:var(--ink);border-radius:10px;padding:8px 12px;font-size:13.5px;font-weight:600;text-decoration:none;cursor:pointer}
${FIG.CSS}@media print{body{background:#fff;color:#000}.top{display:none}.paper .tw,.paper blockquote,.paper code,.paper th{background:#fff;border-color:#999}.paper a{color:#000}}
</style>
</head>
<body>
<header class="top">
  <div class="wrap ptop">
    <a class="brand" href="./" aria-label="Landing Pad, home"><b>LANDING</b><i></i><span>pad</span></a>
    <div class="acts">
      <a href="app.html" id="backLink">Open the launchpad</a>
      <select id="langSel" aria-label="Language">${options}</select>
    </div>
  </div>
</header>
<main class="paper">
${articles}
</main>
<script>
(function () {
  var META = ${meta}, sel = document.getElementById("langSel"), back = document.getElementById("backLink");
  function show(lang) {
    if (!META[lang]) lang = "en";
    for (var code in META) document.getElementById("paper-" + code).hidden = code !== lang;
    sel.value = lang;
    back.textContent = META[lang].back;
    document.documentElement.lang = lang;
    document.title = META[lang].title;
    try { localStorage.setItem("jisr.paperLang", lang); } catch (_) {}
  }
  var q = /[?&]lang=([a-z]{2})/.exec(location.search), saved = null;
  try { saved = localStorage.getItem("jisr.paperLang"); } catch (_) {}
  var nav = String(navigator.language || "").slice(0, 2).toLowerCase();
  show(q && META[q[1]] ? q[1] : META[saved] ? saved : META[nav] ? nav : "en");
  sel.addEventListener("change", function () { show(sel.value); window.scrollTo(0, 0); });
})();
${FIG.JS}</script>
</body>
</html>
`;
fs.writeFileSync(path.join(root, "web", "whitepaper.html"), page);
console.log("Wrote web/whitepaper.html (" + Math.round(page.length / 1024) + " KB)");
