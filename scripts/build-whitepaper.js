// Builds web/whitepaper.html from WHITEPAPER.md (English) and WHITEPAPER-AR.md (Arabic).
// Edit the two Markdown files, then run:  node scripts/build-whitepaper.js && node scripts/stamp-web.js
const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

const root = path.join(__dirname, "..");
const html = (file) => marked.parse(fs.readFileSync(path.join(root, file), "utf8"), { gfm: true })
  .replace(/<table>/g, '<div class="tw"><table>').replace(/<\/table>/g, "</table></div>")
  .replace(/<a href="http/g, '<a rel="noopener" href="http');

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jisr Launchpad: White Paper</title>
<meta name="description" content="How Jisr Launchpad works: a fixed sale price, a floor covered 100% by a reserve nobody can withdraw, and the risks.">
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
.paper article[lang=ar] th{letter-spacing:0;text-transform:none;font-size:13.5px}
.ptop{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:12px;padding-bottom:12px}
.ptop a.brand{text-decoration:none}
.ptop .acts{display:flex;gap:8px;align-items:center}
.ptop .acts a,.ptop .acts button{border:1px solid var(--line);background:var(--raise);color:var(--ink);border-radius:10px;padding:8px 12px;font-size:13.5px;font-weight:600;text-decoration:none;cursor:pointer}
@media print{body{background:#fff;color:#000}.top{display:none}.paper .tw,.paper blockquote,.paper code,.paper th{background:#fff;border-color:#999}.paper a{color:#000}}
</style>
</head>
<body>
<header class="top">
  <div class="wrap ptop">
    <a class="brand" href="./" aria-label="Jisr Launchpad, back to the launchpad"><b>JISR</b><i></i><span>launchpad</span></a>
    <div class="acts">
      <a href="./" id="backLink">Open the launchpad</a>
      <button type="button" id="langBtn" aria-label="Switch language">العربية</button>
    </div>
  </div>
</header>
<main class="paper">
<article id="paper-en" lang="en">
${html("WHITEPAPER.md")}
</article>
<article id="paper-ar" lang="ar" dir="rtl" hidden>
${html("WHITEPAPER-AR.md")}
</article>
</main>
<script>
(function () {
  var en = document.getElementById("paper-en"), ar = document.getElementById("paper-ar"), btn = document.getElementById("langBtn"), back = document.getElementById("backLink");
  function show(lang) {
    var isAr = lang === "ar";
    en.hidden = isAr; ar.hidden = !isAr;
    btn.textContent = isAr ? "English" : "العربية";
    back.textContent = isAr ? "افتح المنصة" : "Open the launchpad";
    document.documentElement.lang = isAr ? "ar" : "en";
    document.title = isAr ? "منصة جسر: الورقة البيضاء" : "Jisr Launchpad: White Paper";
    try { localStorage.setItem("jisr.paperLang", lang); } catch (_) {}
  }
  var q = /[?&]lang=(ar|en)/.exec(location.search), saved = null;
  try { saved = localStorage.getItem("jisr.paperLang"); } catch (_) {}
  show(q ? q[1] : saved === "ar" || saved === "en" ? saved : /^ar/i.test(navigator.language || "") ? "ar" : "en");
  btn.addEventListener("click", function () { show(ar.hidden ? "ar" : "en"); });
})();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(root, "web", "whitepaper.html"), page);
console.log("Wrote web/whitepaper.html (" + Math.round(page.length / 1024) + " KB)");
