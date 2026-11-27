/* The Landing Pad guide: a small robot drawn in SVG that follows the cursor with its head and eyes,
   breathes, blinks and waves, and says one verified line about the part of the page in view.
   It never invents numbers: every line is fixed text in index.html (translated with the page).
   It can be made small or closed, and the choice is remembered. Still frame for reduced motion. */
(function () {
  const box = document.getElementById("bot");
  if (!box) return;
  const KEY = "jisr.bot";
  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let mode = "open";
  try { mode = localStorage.getItem(KEY) || "open"; } catch (_) {}
  const save = (m) => { mode = m; try { localStorage.setItem(KEY, m); } catch (_) {} box.dataset.mode = m; };
  if (mode === "closed") { box.remove(); return; }
  box.dataset.mode = mode;
  box.hidden = false;

  const NS = "http://www.w3.org/2000/svg";
  const fig = box.querySelector(".bot-fig");
  fig.innerHTML =
    '<svg viewBox="0 0 120 150" aria-hidden="true">' +
    '<defs><linearGradient id="bG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6E3A1"/><stop offset=".55" stop-color="#D4AF37"/><stop offset="1" stop-color="#7A5E16"/></linearGradient>' +
    '<linearGradient id="bT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A3446"/><stop offset=".5" stop-color="#121923"/><stop offset="1" stop-color="#05070A"/></linearGradient>' +
    '<radialGradient id="bC"><stop offset="0" stop-color="#C8FFF0"/><stop offset=".4" stop-color="#00E1B3"/><stop offset="1" stop-color="#00E1B3" stop-opacity="0"/></radialGradient></defs>' +
    '<ellipse cx="60" cy="144" rx="34" ry="4" fill="#00E1B3" opacity=".18"/>' +
    '<g class="b-body">' +
      '<g class="b-armL"><rect x="14" y="78" width="12" height="38" rx="6" fill="url(#bT)" stroke="#D4AF37" stroke-width="1.2"/><circle cx="20" cy="118" r="6" fill="url(#bG)"/></g>' +
      '<g class="b-armR"><rect x="94" y="78" width="12" height="38" rx="6" fill="url(#bT)" stroke="#D4AF37" stroke-width="1.2"/><circle cx="100" cy="118" r="6" fill="url(#bG)"/></g>' +
      '<path d="M30 76 Q60 66 90 76 L86 126 Q60 134 34 126 Z" fill="url(#bT)" stroke="url(#bG)" stroke-width="1.6"/>' +
      '<path d="M38 82 Q60 76 82 82" fill="none" stroke="#E4E8ED" stroke-opacity=".25"/>' +
      '<circle class="b-core" cx="60" cy="100" r="11" fill="url(#bC)"/>' +
      '<circle cx="60" cy="100" r="7.5" fill="none" stroke="url(#bG)" stroke-width="2"/>' +
      '<rect x="52" y="64" width="16" height="8" rx="3" fill="#0B1018" stroke="#D4AF37" stroke-width="1"/>' +
      '<g class="b-head">' +
        '<rect x="28" y="20" width="64" height="46" rx="18" fill="url(#bT)" stroke="url(#bG)" stroke-width="2"/>' +
        '<rect x="36" y="31" width="48" height="20" rx="10" fill="#05080C" stroke="#E4E8ED" stroke-opacity=".2"/>' +
        '<g class="b-eyes"><rect class="b-eye" x="44" y="37" width="10" height="7" rx="3.5" fill="#00E1B3"/><rect class="b-eye" x="66" y="37" width="10" height="7" rx="3.5" fill="#00E1B3"/></g>' +
        '<line x1="60" y1="20" x2="60" y2="10" stroke="#D4AF37" stroke-width="2"/><circle class="b-ant" cx="60" cy="8" r="3.5" fill="#00E1B3"/>' +
        '<rect x="22" y="34" width="6" height="14" rx="3" fill="url(#bG)"/><rect x="92" y="34" width="6" height="14" rx="3" fill="url(#bG)"/>' +
      "</g>" +
    "</g></svg>";
  const svg = fig.querySelector("svg"), head = svg.querySelector(".b-head"), eyes = svg.querySelector(".b-eyes"), body = svg.querySelector(".b-body");
  const armR = svg.querySelector(".b-armR"), core = svg.querySelector(".b-core"), ant = svg.querySelector(".b-ant");
  const eyeEls = svg.querySelectorAll(".b-eye");

  let px = 0.5, py = 0.5, hx = 0, hy = 0, wave = still ? 0 : 1.6, blinkAt = performance.now() + 2500;
  window.addEventListener("pointermove", (e) => { px = e.clientX / innerWidth; py = e.clientY / innerHeight; }, { passive: true });

  function frame(now) {
    const r = svg.getBoundingClientRect(), cx = (r.left + r.width / 2) / innerWidth, cy = (r.top + r.height * 0.3) / innerHeight;
    const tx = Math.max(-1, Math.min(1, (px - cx) * 2.2)), ty = Math.max(-1, Math.min(1, (py - cy) * 2.2));
    hx += (tx - hx) * 0.08; hy += (ty - hy) * 0.08;
    const t = now / 1000, breath = Math.sin(t * 1.6);
    head.setAttribute("transform", "translate(" + (hx * 3).toFixed(2) + " " + (hy * 2 + breath * 0.6).toFixed(2) + ") rotate(" + (hx * 7).toFixed(2) + " 60 43)");
    eyes.setAttribute("transform", "translate(" + (hx * 4).toFixed(2) + " " + (hy * 2.5).toFixed(2) + ")");
    body.setAttribute("transform", "translate(0 " + (breath * 0.8).toFixed(2) + ")");
    if (wave > 0) { wave -= 0.016; armR.setAttribute("transform", "rotate(" + (-70 * Math.min(1, wave) + Math.sin(t * 9) * 14 * Math.min(1, wave)).toFixed(1) + " 100 80)"); }
    else armR.removeAttribute("transform");
    core.setAttribute("r", (10 + Math.sin(t * 2.4) * 1.6).toFixed(2));
    ant.setAttribute("opacity", (0.6 + Math.sin(t * 3) * 0.4).toFixed(2));
    const blink = now > blinkAt && now < blinkAt + 140;
    eyeEls.forEach((e) => e.setAttribute("height", blink ? "1.5" : "7"));
    if (now > blinkAt + 140) blinkAt = now + 2500 + Math.random() * 3000;
    if (running) requestAnimationFrame(frame);
  }

  // one line for the part of the page in view
  const lines = [...box.querySelectorAll(".bot-say [data-for]")];
  const show = (key) => { let hit = false; lines.forEach((l) => { const on = l.dataset.for === key; l.hidden = !on; hit = hit || on; }); if (hit && !still) wave = Math.max(wave, 0.9); };
  show("hero");
  if ("IntersectionObserver" in window) {
    const watch = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) show(e.target.dataset.botKey); });
    }, { rootMargin: "-45% 0px -45% 0px" });
    [["hero", ".open"], ["model", "#machine"], ["road", "#road"], ["stress", "#stress"], ["proof", "#proof"]].forEach(([k, sel]) => {
      const el = document.querySelector(sel); if (el) { el.dataset.botKey = k; watch.observe(el); }
    });
  }

  box.querySelector(".bot-min").addEventListener("click", () => save(mode === "small" ? "open" : "small"));
  box.querySelector(".bot-x").addEventListener("click", () => { save("closed"); box.remove(); running = false; });
  fig.addEventListener("click", () => { if (mode === "small") save("open"); else if (!still) wave = 1.6; });

  let running = !still;
  if (still) frame(performance.now()); else requestAnimationFrame(frame);
  document.addEventListener("visibilitychange", () => { if (still) return; if (document.hidden) running = false; else if (!running && box.isConnected) { running = true; requestAnimationFrame(frame); } });
})();
