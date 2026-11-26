/* Landing Pad hero: a runway seen from the approach, drawn on a canvas behind the opening section.
   Purely decorative (aria-hidden). Lights stream toward the viewer, coins land on the runway and
   turn into the amber floor line. Pauses off-screen and when the tab is hidden; still frame for
   prefers-reduced-motion. */
(function () {
  const cv = document.getElementById("runway");
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext("2d");
  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const BLUE = [76, 125, 255], AMBER = [245, 165, 36];
  let W = 0, H = 0, DPR = 1, vpX = 0, vpY = 0, t0 = performance.now(), running = false, visible = true;
  let mx = 0, my = 0, tx = 0, ty = 0; // pointer parallax, eased
  const coins = [];
  const rgba = (c, a) => "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")";

  function size() {
    const r = cv.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  // world -> screen. x in runway half-widths, z depth (1 near .. 60 far)
  function P(x, z) {
    const s = 1 / z;
    return [vpX + x * W * 0.42 * s, vpY + (H * 1.02 - vpY) * s];
  }
  function spawn(now) {
    coins.push({ x: (Math.random() * 2 - 1) * 0.9, z: 6 + Math.random() * 30, h: 1, v: 0.35 + Math.random() * 0.4, born: now, landed: 0 });
  }

  function frame(now) {
    const t = (now - t0) / 1000;
    tx += (mx - tx) * 0.04; ty += (my - ty) * 0.04;
    vpX = W * 0.5 + tx * 26;
    vpY = H * 0.3 + ty * 14;
    ctx.clearRect(0, 0, W, H);

    // sky glow at the horizon
    const g = ctx.createRadialGradient(vpX, vpY, 0, vpX, vpY, Math.max(W, H) * 0.7);
    g.addColorStop(0, rgba(BLUE, 0.22)); g.addColorStop(0.35, rgba(BLUE, 0.06)); g.addColorStop(1, rgba(BLUE, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = rgba([200, 215, 255], 0.18); ctx.fillRect(0, vpY - 0.5, W, 1);

    // receding ground grid
    const speed = still ? 0 : 0.9;
    ctx.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      const z = 1 + ((i * 2.3 - t * speed * 2.3) % 60 + 60) % 60;
      const a = Math.max(0, 0.16 * (1 - z / 60));
      const [, y] = P(0, z);
      ctx.strokeStyle = rgba([140, 160, 220], a);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    for (let k = -8; k <= 8; k++) {
      const [x1, y1] = P(k * 0.5, 1), [x2, y2] = P(k * 0.5, 60);
      ctx.strokeStyle = rgba([140, 160, 220], k === 0 ? 0 : 0.07);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    // runway surface and edges
    const n1 = P(-1, 1), n2 = P(1, 1), f = P(0, 60);
    const surf = ctx.createLinearGradient(0, f[1], 0, H);
    surf.addColorStop(0, rgba([20, 26, 40], 0)); surf.addColorStop(1, rgba([20, 26, 40], 0.75));
    ctx.fillStyle = surf; ctx.beginPath(); ctx.moveTo(n1[0], n1[1]); ctx.lineTo(f[0], f[1]); ctx.lineTo(n2[0], n2[1]); ctx.closePath(); ctx.fill();

    // edge lights and centre dashes streaming toward the viewer
    for (let i = 0; i < 40; i++) {
      const z = 1 + ((i * 1.5 - t * speed * 3) % 60 + 60) % 60;
      const near = 1 - z / 60, r = Math.max(0.6, 3.2 / Math.sqrt(z));
      for (const side of [-1, 1]) {
        const [x, y] = P(side, z);
        ctx.fillStyle = rgba(BLUE, 0.25 + 0.75 * near);
        ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
      if (i % 2 === 0) {
        const [xa, ya] = P(0, z), [xb, yb] = P(0, z + 0.7);
        ctx.strokeStyle = rgba([230, 236, 250], 0.05 + 0.12 * near); ctx.lineWidth = Math.max(1, 3 / Math.sqrt(z));
        ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
      }
    }

    // the floor: an amber line across the runway threshold that slowly rises with "fees"
    const lift = still ? 0.5 : (Math.sin(t * 0.35) * 0.5 + 0.5);
    const fz = 2.6 - lift * 0.7, [fl, fy] = P(-1.15, fz), [fr] = P(1.15, fz);
    const fg = ctx.createLinearGradient(fl, 0, fr, 0);
    fg.addColorStop(0, rgba(AMBER, 0)); fg.addColorStop(0.15, rgba(AMBER, 0.95)); fg.addColorStop(0.85, rgba(AMBER, 0.95)); fg.addColorStop(1, rgba(AMBER, 0));
    ctx.shadowColor = rgba(AMBER, 0.8); ctx.shadowBlur = 18;
    ctx.strokeStyle = fg; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(fl, fy); ctx.lineTo(fr, fy); ctx.stroke();
    ctx.shadowBlur = 0;

    // coins dropping onto the runway; each one that lands flashes amber
    if (!still && coins.length < 26 && Math.random() < 0.08) spawn(now);
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      if (!c.landed) { c.h -= c.v * 0.016; if (c.h <= 0) { c.h = 0; c.landed = now; } }
      const [gx, gy] = P(c.x, c.z);
      const y = gy - c.h * (H * 0.5) / Math.sqrt(c.z);
      const r = Math.max(1, 4 / Math.sqrt(c.z));
      if (c.landed) {
        const age = (now - c.landed) / 900;
        if (age > 1) { coins.splice(i, 1); continue; }
        ctx.strokeStyle = rgba(AMBER, 0.9 * (1 - age)); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(gx, gy, r * (1 + age * 5), r * (1 + age * 5) * 0.35, 0, 0, 7); ctx.stroke();
      } else {
        ctx.fillStyle = rgba([200, 214, 255], 0.9);
        ctx.beginPath(); ctx.arc(gx, y, r, 0, 7); ctx.fill();
        ctx.strokeStyle = rgba(BLUE, 0.35); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(gx, y - r * 6); ctx.lineTo(gx, y - r); ctx.stroke();
      }
    }

    if (running) requestAnimationFrame(frame);
  }

  function start() { if (running || still || !visible || document.hidden) return; running = true; requestAnimationFrame(frame); }
  function stop() { running = false; }
  size();
  if (still) { for (let i = 0; i < 10; i++) coins.push({ x: (Math.random() * 2 - 1) * 0.8, z: 5 + i * 3, h: 0.3 + Math.random() * 0.5, v: 0, landed: 0 }); frame(performance.now()); }
  else start();
  window.addEventListener("resize", () => { size(); if (still) frame(performance.now()); });
  window.addEventListener("pointermove", (e) => { mx = (e.clientX / innerWidth) * 2 - 1; my = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  if ("IntersectionObserver" in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; visible ? start() : stop(); }).observe(cv);
})();
