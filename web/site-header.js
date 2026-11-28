/* The same top menu as the home page, for pages that live in their own file
   (videos, charts, governance, white paper, learn, press). Styles are scoped to .lp-top
   so they never touch the page's own design. */
(function () {
  if (document.querySelector(".lp-top")) return;
  const me = document.currentScript;
  const base = new URL(".", me ? me.src : location.href).href; // folder that holds index.html
  const here = location.href.split("#")[0];
  const items = [
    ["", "Home"], ["#machine", "The model"], ["videos.html", "Videos"], ["#stress", "Stress test"],
    ["#proof", "Live checks"], ["#try", "Try it"], ["markets.html", "Charts"], ["#econ", "Calendar"],
    ["#vote", "Vote"], ["governance.html", "Governance"], ["#promo", "LPAD coin"], ["#contact", "Contact"],
    ["whitepaper.html", "White paper"], ["learn/", "Learn", true]
  ];
  const url = (h) => (h.startsWith("#") ? base + h : new URL(h, base).href);
  const current = (h) => h && !h.startsWith("#") && here.startsWith(url(h)) && (h !== "learn/" || here.includes("/learn/"));

  const css = `
.lp-top{position:sticky;top:0;z-index:50;background:rgba(10,13,20,.9);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid #1E2A3D;font:500 14px/1.4 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#E4E8ED}
.lp-top *{box-sizing:border-box}
.lp-row{width:min(1240px,calc(100% - 2 * clamp(20px,5vw,80px)));margin:0 auto;display:flex;align-items:center;gap:10px;min-height:60px}
.lp-burger{display:inline-flex;flex-direction:column;justify-content:center;gap:5px;width:42px;height:42px;padding:0 10px;background:transparent;border:1px solid #1E2A3D;border-radius:10px;cursor:pointer;flex:none}
.lp-burger i{display:block;height:2px;background:#E4E8ED;border-radius:2px;transition:transform .2s,opacity .2s}
.lp-burger:hover{border-color:#D4AF37}.lp-burger:focus-visible{outline:2px solid #F1D67A;outline-offset:2px}
.lp-burger.x i:nth-child(1){transform:translateY(7px) rotate(45deg)}.lp-burger.x i:nth-child(2){opacity:0}.lp-burger.x i:nth-child(3){transform:translateY(-7px) rotate(-45deg)}
.lp-brand{display:flex;align-items:center;gap:7px;text-decoration:none;color:#E4E8ED;font-family:"Space Grotesk",Inter,system-ui,sans-serif;direction:ltr}
.lp-brand::before{content:"";width:34px;height:22px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='7 21 50 31'%3E%3Cpath d='M14.5 43 A17.5 17.5 0 0 1 49.5 43' fill='none' stroke='%234C7DFF' stroke-width='7'/%3E%3Crect x='9' y='43' width='46' height='7' rx='2' fill='%23F5A524'/%3E%3C/svg%3E") center/contain no-repeat}
.lp-brand b{font-weight:800;font-size:20px;letter-spacing:.06em}.lp-brand i{width:8px;height:8px;background:#00E1B3;border-radius:2px}
.lp-brand span{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8E98A8;font-weight:600}
.lp-right{margin-inline-start:auto;display:flex;gap:8px}
.lp-btn{display:inline-flex;align-items:center;padding:9px 14px;border-radius:10px;border:1px solid #1E2A3D;background:#152238;color:#E4E8ED;text-decoration:none;font-weight:600;font-size:14px}
.lp-btn.gold{background:#D4AF37;border-color:#D4AF37;color:#1A1405}
.lp-nav{width:min(1240px,calc(100% - 2 * clamp(20px,5vw,80px)));margin:0 auto;display:flex;gap:4px 20px;overflow-x:auto;scrollbar-width:none;padding:2px 0 10px}
.lp-nav::-webkit-scrollbar{display:none}
.lp-nav a{color:#B6BEC9;text-decoration:none;white-space:nowrap;padding:4px 0}.lp-nav a:hover{color:#E4E8ED}.lp-nav a.on{color:#F1D67A}
.lp-nav a.in-drawer{display:none}
@media (min-width:1100px){.lp-nav{justify-content:space-between}}
@media (max-width:640px){.lp-row{min-height:56px}.lp-brand b{font-size:17px}.lp-brand::before{width:28px;height:18px}.lp-btn{padding:8px 10px;font-size:13px}}
@media (max-width:420px){.lp-btn:not(.gold){display:none}}
.lp-shade{position:fixed;inset:0;z-index:48;background:rgba(4,6,10,.55)}
.lp-drawer{position:fixed;bottom:0;inset-inline-start:0;z-index:49;width:min(300px,84vw);background:#0F1826;border-inline-end:1px solid #1E2A3D;padding:14px;overflow-y:auto;box-shadow:0 0 40px rgba(0,0,0,.5);font:500 16px/1.4 Inter,system-ui,sans-serif}
.lp-drawer a{display:block;padding:12px 14px;border-radius:10px;color:#E4E8ED;text-decoration:none}
.lp-drawer a:hover,.lp-drawer a:focus-visible{background:#152238}.lp-drawer a.on{color:#F1D67A;background:#152238}
body.lp-drawer-open{overflow:hidden}
@media (prefers-reduced-motion:reduce){.lp-burger i{transition:none}}`;
  const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);

  const links = items.map(([h, t, drawerOnly]) =>
    `<a href="${url(h)}"${current(h) ? ' class="on" aria-current="page"' : drawerOnly ? ' class="in-drawer"' : ""}>${t}</a>`).join("");
  const header = document.createElement("header");
  header.className = "lp-top";
  header.innerHTML =
    `<div class="lp-row"><button type="button" class="lp-burger" aria-label="Menu" aria-expanded="false"><i></i><i></i><i></i></button>` +
    `<a class="lp-brand" href="${base}" aria-label="Landing Pad, home"><b>LANDING</b><i></i><span>pad</span></a>` +
    `<div class="lp-right"><a class="lp-btn" href="${url("solana.html")}">Solana</a><a class="lp-btn gold" href="${url("app.html")}">Ethereum</a></div></div>` +
    `<nav class="lp-nav" aria-label="Main">${links}</nav>`;
  document.body.insertBefore(header, document.body.firstChild);

  const shade = document.createElement("div"); shade.className = "lp-shade"; shade.hidden = true;
  const drawer = document.createElement("nav"); drawer.className = "lp-drawer"; drawer.hidden = true; drawer.setAttribute("aria-label", "All pages");
  drawer.innerHTML = items.map(([h, t]) => `<a href="${url(h)}"${current(h) ? ' class="on"' : ""}>${t}</a>`).join("");
  document.body.append(shade, drawer);
  const btn = header.querySelector(".lp-burger");
  function set(open) {
    if (open) drawer.style.top = shade.style.top = Math.max(0, Math.round(header.getBoundingClientRect().bottom)) + "px";
    drawer.hidden = shade.hidden = !open; btn.setAttribute("aria-expanded", String(open));
    btn.classList.toggle("x", open); document.body.classList.toggle("lp-drawer-open", open);
    if (open) (drawer.querySelector("a.on") || drawer.querySelector("a")).focus({ preventScroll: true });
  }
  btn.addEventListener("click", () => set(drawer.hidden));
  shade.addEventListener("click", () => set(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden) { set(false); btn.focus(); } });
})();
