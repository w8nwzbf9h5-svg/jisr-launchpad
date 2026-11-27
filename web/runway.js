/* Landing Pad hero: a launch platform with a metallic sphere and orbital rings (file name kept for history), drawn on a canvas behind the opening section.
   Purely decorative (aria-hidden). Lights stream toward the viewer, coins land on the runway and
   turn into the amber floor line. Pauses off-screen and when the tab is hidden; still frame for
   prefers-reduced-motion.
   Sound is on by default and starts at the visitor's first touch of the page (browsers allow no sound
   before that); the "Runway sound" button turns it off and the choice is remembered. A low engine hum that opens up as the
   floor line rises and follows the pointer, and a soft chime when a coin lands (louder when it lands near).
   Everything is synthesised with Web Audio, so there are no sound files to download. */
(function () {
  const cv = document.getElementById("runway");
  if (!cv || !cv.getContext) return;
  const ctx = cv.getContext("2d");
  const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, DPR = 1, t0 = performance.now(), running = false, visible = true;
  let mx = 0, my = 0, tx = 0, ty = 0; // pointer parallax, eased
  const sound = makeSound();
  const parts = Array.from({ length: 64 }, () => ({ a: Math.random() * 6.283, r: 0.55 + Math.random() * 1.4, y: (Math.random() - 0.5) * 1.2, s: 0.0006 + Math.random() * 0.0018 }));
  const lastSide = [0, 0, 0];
  const stars = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random() * 0.9, r: Math.random() < 0.15 ? 1.6 : 1, a: 0.25 + Math.random() * 0.6, s: 0.5 + Math.random() * 2, p: Math.random() * 6 }));

  function size() {
    const r = cv.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function ring(x, y, R, tilt, rot, color, width, dash, from, to) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.strokeStyle = color; ctx.lineWidth = width; if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.ellipse(0, 0, R, R * tilt, 0, from || 0, to == null ? Math.PI * 2 : to); ctx.stroke(); ctx.restore();
  }

  function frame(now) {
    const t = now - t0;
    tx += (mx - tx) * 0.05; ty += (my - ty) * 0.05;
    const wide = W > 980, S = Math.min(W, H * 1.25);
    const R = wide ? Math.min(S * 0.12, 150) : Math.min(W * 0.19, 78);
    const X = W * (wide ? 0.73 : 0.5) + tx * 22, Y = (wide ? H * 0.36 : 150 + R * 1.45) + ty * 14;
    ctx.clearRect(0, 0, W, H);

    let g = ctx.createRadialGradient(X, Y, 0, X, Y, S * 0.95);
    g.addColorStop(0, "rgba(212,175,55,.16)"); g.addColorStop(0.4, "rgba(17,27,44,.5)"); g.addColorStop(1, "rgba(8,11,16,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // deep space: fixed stars that twinkle, and the curve of a planet at the bottom
    for (let i = 0; i < stars.length; i++) {
      const st = stars[i], tw = still ? 0.6 : 0.45 + 0.55 * Math.abs(Math.sin(t * 0.0012 * st.s + st.p));
      ctx.fillStyle = "rgba(228,232,237," + (st.a * tw).toFixed(3) + ")"; ctx.fillRect(st.x * W + tx * 6 * st.a, st.y * H + ty * 4 * st.a, st.r, st.r);
    }
    const pr = Math.max(W, H) * 1.6, pg0 = ctx.createRadialGradient(W * 0.5, H + pr * 0.86, pr * 0.9, W * 0.5, H + pr * 0.86, pr);
    pg0.addColorStop(0, "rgba(17,27,44,0)"); pg0.addColorStop(0.9, "rgba(0,225,179,.10)"); pg0.addColorStop(1, "rgba(0,225,179,0)");
    ctx.fillStyle = pg0; ctx.fillRect(0, 0, W, H);

    // launch platform: concentric discs under the sphere, and a light pulse travelling outward
    const PY = Y + R * 1.55;
    for (let i = 4; i >= 0; i--) {
      const rr = R * (1.2 + i * 0.32), yy = PY + i * R * 0.035;
      ctx.save(); ctx.shadowColor = "rgba(255,201,74,.55)"; ctx.shadowBlur = 16 - i * 2;
      ring(X, yy, rr, 0.22, 0, "rgba(255,201,74," + (0.75 - i * 0.12).toFixed(2) + ")", i === 1 ? 5 : 2);
      ctx.restore();
      // lights travelling around each ring: emerald on the inner rings, gold outside
      for (let k = 0; k < 4; k++) {
        const a = (still ? k * 1.6 : t * (0.0004 + i * 0.00012) * (i % 2 ? -1 : 1)) + k * Math.PI / 2 + i;
        const lx = X + Math.cos(a) * rr, ly = yy + Math.sin(a) * rr * 0.22;
        ctx.fillStyle = i < 2 ? "#00E1B3" : "#FFE7A3"; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(lx, ly, Math.sin(a) > 0 ? 2.6 : 1.6, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      }
    }
    const pulse = still ? 0.4 : (t * 0.00025) % 1;
    ring(X, PY, R * (1.05 + pulse * 2.1), 0.2, 0, "rgba(0,225,179," + (0.55 * (1 - pulse)) + ")", 1.5);
    const bg = ctx.createLinearGradient(0, Y, 0, PY);
    bg.addColorStop(0, "rgba(241,214,122,0)"); bg.addColorStop(1, "rgba(241,214,122,.2)");
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(X - R * 0.55, Y); ctx.lineTo(X + R * 0.55, Y); ctx.lineTo(X + R * 1.05, PY); ctx.lineTo(X - R * 1.05, PY); ctx.closePath(); ctx.fill();

    const spin = still ? 0 : t * 0.00018;
    const rings = [{ R: R * 1.75, t: 0.24, rot: -0.32, c: "rgba(0,225,179,.75)", w: 1.6 }, { R: R * 2.25, t: 0.18, rot: 0.18, c: "rgba(212,175,55,.55)", w: 1.2, d: [2, 7] }, { R: R * 1.35, t: 0.62, rot: 1.1, c: "rgba(228,232,237,.22)", w: 1 }];
    rings.forEach((o) => ring(X, Y, o.R, o.t, o.rot, o.c, o.w, o.d, Math.PI, Math.PI * 2));

    // the metallic sphere, with rotating engraving and a specular sweep
    const sg = ctx.createRadialGradient(X - R * 0.38, Y - R * 0.42, R * 0.05, X, Y, R);
    sg.addColorStop(0, "#FFF6D6"); sg.addColorStop(0.18, "#F1D67A"); sg.addColorStop(0.5, "#C9A133"); sg.addColorStop(0.82, "#5E4712"); sg.addColorStop(1, "#1D1606");
    ctx.save(); ctx.shadowColor = "rgba(212,175,55,.55)"; ctx.shadowBlur = R * 0.6; ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(X, Y, R, 0, 7); ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(X, Y, R, 0, 7); ctx.clip();
    ctx.strokeStyle = "rgba(255,240,190,.22)"; ctx.lineWidth = 1;
    for (let k = 0; k < 7; k++) { const w = Math.cos(spin * 3 + k * Math.PI / 7) * R; ctx.beginPath(); ctx.ellipse(X, Y, Math.abs(w), R, 0, 0, 7); ctx.stroke(); }
    for (let k = -2; k <= 2; k++) { const yy = Y + k * R * 0.38, rr = Math.sqrt(Math.max(0, R * R - (k * R * 0.38) ** 2)); ctx.beginPath(); ctx.ellipse(X, yy, rr, rr * 0.16, 0, 0, 7); ctx.stroke(); }
    const sx = X - R + ((spin * 120) % (R * 3)), sw = ctx.createLinearGradient(sx - R * 0.3, 0, sx + R * 0.3, 0);
    sw.addColorStop(0, "rgba(255,255,255,0)"); sw.addColorStop(0.5, "rgba(255,255,255,.10)"); sw.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sw; ctx.fillRect(X - R, Y - R, R * 2, R * 2);
    ctx.restore();

    // front halves of the rings, with a satellite on each; a soft sound as each one passes in front
    rings.forEach((o, i) => {
      ring(X, Y, o.R, o.t, o.rot, o.c, o.w + 0.4, o.d, 0, Math.PI);
      const a = spin * (i === 1 ? -1.6 : 2.2) + i * 2, px = Math.cos(a) * o.R, py = Math.sin(a) * o.R * o.t;
      const rx = X + px * Math.cos(o.rot) - py * Math.sin(o.rot), ry = Y + px * Math.sin(o.rot) + py * Math.cos(o.rot);
      const front = Math.sin(a) > -0.2 ? 1 : 0;
      if (front && !lastSide[i] && !still) sound.land((rx - X) / (R * 2.2), 4 + i * 6);
      lastSide[i] = front;
      if (front) { ctx.fillStyle = i === 0 ? "#00E1B3" : "#F1D67A"; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(rx, ry, i === 2 ? 2 : 3.4, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
    });

    if (!still) {
      const sa = t * 0.00012, sxp = X + Math.cos(sa) * R * 3.1, syp = Y - R * 0.9 + Math.sin(sa) * R * 0.5, dir = -Math.sin(sa) >= 0 ? 1 : -1;
      ctx.save(); ctx.translate(sxp, syp); ctx.scale(dir, 1);
      ctx.fillStyle = "#C9CED6"; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -3.5); ctx.lineTo(-3, 0); ctx.lineTo(-6, 3.5); ctx.closePath(); ctx.fill();
      const fl = ctx.createLinearGradient(-6, 0, -22, 0); fl.addColorStop(0, "rgba(0,225,179,.9)"); fl.addColorStop(1, "rgba(0,225,179,0)");
      ctx.strokeStyle = fl; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-22, 0); ctx.stroke(); ctx.restore();
    }
    parts.forEach((p) => {
      if (!still) { p.a += p.s * 16; p.y -= 0.0009; if (p.y < -1.4) p.y = 0.6; }
      const px = X + Math.cos(p.a) * p.r * R * 1.3, py = PY + p.y * R * 1.6 + Math.sin(p.a) * p.r * R * 0.25;
      const al = Math.max(0, 0.6 - Math.abs(p.y) * 0.35) * (Math.sin(p.a) > 0 ? 1 : 0.45);
      ctx.fillStyle = "rgba(241,214,122," + al + ")"; ctx.fillRect(px, py, 1.6, 1.6);
    });

    sound.tick(pulse, tx);
    if (running) requestAnimationFrame(frame);
  }

  function start() { if (running || still || !visible || document.hidden) return; running = true; sound.resume(); requestAnimationFrame(frame); }
  function stop() { running = false; sound.pause(); }

  /* The runway's sound. Nothing is created until the visitor turns it on (browsers only allow sound after a
     click), and it goes quiet whenever the animation pauses. */
  function makeSound() {
    const btn = document.getElementById("runwaySound");
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const none = { land() {}, tick() {}, pause() {}, resume() {} };
    if (!btn) return none;
    if (!Ctx || still) { btn.hidden = true; return none; }
    btn.hidden = false;
    // On by default. A visitor who turns it off keeps it off on later visits.
    const KEY = "jisr.sound";
    let muted = false;
    try { muted = localStorage.getItem(KEY) === "off"; } catch (_) {}
    let ac = null, master, hum, humLow, lastChime = 0, on = !muted;
    const NOTES = [0, 3, 5, 7, 10, 12]; // a minor pentatonic run, so overlapping chimes never clash

    function build() {
      ac = new Ctx();
      master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
      // the hum: brown noise through a low-pass filter, plus a quiet low tone
      const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
      const noise = ac.createBufferSource(); noise.buffer = buf; noise.loop = true;
      hum = ac.createBiquadFilter(); hum.type = "lowpass"; hum.frequency.value = 220; hum.Q.value = 0.7;
      const humGain = ac.createGain(); humGain.gain.value = 0.55;
      noise.connect(hum); hum.connect(humGain); humGain.connect(master); noise.start();
      humLow = ac.createOscillator(); humLow.type = "sine"; humLow.frequency.value = 55;
      const lowGain = ac.createGain(); lowGain.gain.value = 0.06;
      humLow.connect(lowGain); lowGain.connect(master); humLow.start();
    }
    // Fade the sound in or out to match `on`. Browsers keep the context suspended until the visitor has
    // touched the page, so a call before that does nothing audible and the first touch calls it again.
    function apply() {
      btn.setAttribute("aria-pressed", String(on));
      if (on && !ac) build();
      if (!ac) return;
      if (on && running) ac.resume();
      const now = ac.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(on ? 0.5 : 0, now, 0.25);
      if (!on) setTimeout(() => { if (!on && ac) ac.suspend(); }, 1200);
    }
    btn.addEventListener("click", () => {
      on = !on;
      try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (_) {}
      apply();
    });
    // Start on the first touch, click or key anywhere on the page (the button's own click is left to it).
    const first = (e) => {
      if (btn.contains(e.target)) return;
      ["pointerdown", "keydown", "touchend"].forEach((t) => document.removeEventListener(t, first, true));
      if (on) apply();
    };
    ["pointerdown", "keydown", "touchend"].forEach((t) => document.addEventListener(t, first, true));
    btn.setAttribute("aria-pressed", String(on));
    if (on) apply(); // some browsers allow sound straight away; the rest wait for the first touch
    return {
      land(x, z) {
        if (!on || !ac || ac.state !== "running") return;
        const now = ac.currentTime, near = 1 - Math.min(1, z / 36);
        if (now - lastChime < 0.18 || Math.random() > 0.35 + 0.5 * near) return; // keep it sparse
        lastChime = now;
        const o = ac.createOscillator(), g = ac.createGain(), pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
        o.type = "triangle";
        o.frequency.value = 440 * Math.pow(2, (NOTES[(Math.random() * NOTES.length) | 0] + (near > 0.6 ? -12 : 0)) / 12);
        const peak = 0.05 + 0.12 * near;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(peak, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
        o.connect(g);
        if (pan) { pan.pan.value = Math.max(-1, Math.min(1, x * 0.8)); g.connect(pan); pan.connect(master); } else g.connect(master);
        o.start(now); o.stop(now + 1);
      },
      tick(lift, px) {
        if (!on || !ac) return;
        const now = ac.currentTime;
        hum.frequency.setTargetAtTime(160 + lift * 260 + px * 60, now, 0.3);
        humLow.frequency.setTargetAtTime(52 + lift * 8, now, 0.5);
      },
      pause() { if (ac && ac.state === "running") ac.suspend(); },
      resume() { if (on && ac) ac.resume(); },
    };
  }
  size();
  if (still) frame(performance.now());
  else start();
  window.addEventListener("resize", () => { size(); if (still) frame(performance.now()); });
  window.addEventListener("pointermove", (e) => { mx = (e.clientX / innerWidth) * 2 - 1; my = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  if ("IntersectionObserver" in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; visible ? start() : stop(); }).observe(cv);
})();
