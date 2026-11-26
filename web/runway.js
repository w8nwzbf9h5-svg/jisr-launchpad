/* Landing Pad hero: a runway seen from the approach, drawn on a canvas behind the opening section.
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
  const BLUE = [76, 125, 255], AMBER = [245, 165, 36];
  let W = 0, H = 0, DPR = 1, vpX = 0, vpY = 0, t0 = performance.now(), running = false, visible = true;
  let mx = 0, my = 0, tx = 0, ty = 0; // pointer parallax, eased
  const coins = [];
  const sound = makeSound();
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
      if (!c.landed) { c.h -= c.v * 0.016; if (c.h <= 0) { c.h = 0; c.landed = now; sound.land(c.x, c.z); } }
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

    sound.tick(lift, tx);
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
  if (still) { for (let i = 0; i < 10; i++) coins.push({ x: (Math.random() * 2 - 1) * 0.8, z: 5 + i * 3, h: 0.3 + Math.random() * 0.5, v: 0, landed: 0 }); frame(performance.now()); }
  else start();
  window.addEventListener("resize", () => { size(); if (still) frame(performance.now()); });
  window.addEventListener("pointermove", (e) => { mx = (e.clientX / innerWidth) * 2 - 1; my = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  if ("IntersectionObserver" in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; visible ? start() : stop(); }).observe(cv);
})();
