/* Home page: the model you can operate, and checks read live from the networks.
   No server and no stored data. The arithmetic is the launchpad's own (solana/jisr-solana.js mirrors
   the contracts line for line), so the numbers shown here are the numbers a real trade would produce. */
(function () {
  "use strict";
  const J = window.JisrSolana, web3 = window.solanaWeb3;
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  /* ---------- money and coin formatting ---------- */
  const USD = 1000000n; // one dollar in the reserve currency's smallest unit
  const usd = (units, digits) => { const n = Number(units) / 1e6; return "$" + n.toLocaleString("en-US", { minimumFractionDigits: digits == null ? 2 : digits, maximumFractionDigits: digits == null ? 2 : digits }); };
  const price = (p) => { const n = Number(p) / 1e18; return "$" + (n < 0.01 ? n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") : n.toFixed(4)); };
  const coinsTxt = (c) => { const n = Number(c / J.COIN); return n >= 1e6 ? (n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "M" : n.toLocaleString("en-US"); };

  /* ---------- the model ---------- */
  const SALE_PRICE = J.PRICE_SCALE / 10000n; // $0.0001 a coin
  const fresh = () => ({ salePrice: SALE_PRICE, floorPrice: SALE_PRICE, floorOut: 0n, curveOut: 0n, floorReserve: 0n, premiumReserve: 0n, graduated: false });
  /* After the sale has sold out, the floor is raised to what the reserve can pay for every coin. Never lowered. */
  function raise(m) {
    if (!m.graduated) return m;
    const out = J.outstanding(m), over = out > J.SALE_SUPPLY ? out : J.SALE_SUPPLY, p = m.floorReserve * J.PRICE_SCALE / over;
    if (p > m.floorPrice) m.floorPrice = p;
    return m;
  }
  function applyBuy(m, q) {
    const n = Object.assign({}, m);
    n.floorOut += q.fromFloor; n.curveOut += q.fromCurve; n.floorReserve += q.floorPart + q.communityFee; n.premiumReserve += q.premiumPart;
    if (n.floorOut === J.SALE_SUPPLY) n.graduated = true;
    return raise(n);
  }
  function applySell(m, q) {
    const n = Object.assign({}, m);
    n.curveOut -= q.fromCurve; n.floorOut -= q.fromFloor; n.floorReserve = n.floorReserve - q.floorPart + q.communityFee; n.premiumReserve -= q.premiumPart;
    return raise(n);
  }
  /* A coin with `soldM` million coins in buyers' hands and `volume` dollars traded after the sale sold out. */
  function stateAt(soldM, volume) {
    let m = fresh();
    if (soldM > 0) m = applyBuy(m, J.quoteBuy(m, BigInt(soldM) * 1000000n * J.COIN));
    if (m.graduated && volume > 0) { m.floorReserve += BigInt(volume) * USD * 2n / 100n; raise(m); }
    return m;
  }
  const liability = (m) => { const v = J.outstanding(m) * m.floorPrice; return v / J.PRICE_SCALE + (v % J.PRICE_SCALE ? 1n : 0n); };

  /* ---------- the chart ---------- */
  const W = 640, H = 250, M = { l: 44, r: 22, t: 14, b: 28 }, XMAX = 950, YMAX = 18;
  const px = (x) => M.l + x / XMAX * (W - M.l - M.r), py = (y) => M.t + (1 - y / YMAX) * (H - M.t - M.b);
  const r1 = (n) => Math.round(n * 10) / 10;
  const mult = (s, f) => (s <= 800 ? f : f + Math.pow(200 / (1000 - s), 2) - 1); // price of the next coin, in sale prices
  const S = { sold: 320, volume: 0, budget: "1000" };

  function drawFrame() {
    const g = [];
    [1, 4, 8, 12, 16].forEach((y) => g.push('<line class="grid" x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + r1(py(y)) + '" y2="' + r1(py(y)) + '"/><text class="tick" x="' + (M.l - 8) + '" y="' + (r1(py(y)) + 4) + '" text-anchor="end">' + y + "×</text>"));
    [0, 200, 400, 600, 800, 950].forEach((x) => g.push('<text class="tick" x="' + r1(px(x)) + '" y="' + (H - 8) + '" text-anchor="middle">' + x + "</text>"));
    g.push('<rect class="band" x="' + r1(px(800)) + '" y="' + M.t + '" width="' + r1(px(950) - px(800)) + '" height="' + (H - M.t - M.b) + '"/>');
    g.push('<line class="grid" x1="' + r1(px(800)) + '" x2="' + r1(px(800)) + '" y1="' + M.t + '" y2="' + (H - M.b) + '"/>');
    g.push('<path class="sold" id="mSold"/><path class="ln ln-floor" id="mFloor"/><path class="ln ln-price" id="mPrice"/>');
    g.push('<line class="stem" id="mStem" y2="' + (H - M.b) + '"/><circle class="ring" id="mRing" r="9"/><circle class="knob" id="mKnob" r="6"/>');
    $("#mSvg").innerHTML = g.join("");
    $("#mZoneA").style.cssText = "left:" + r1(px(0) / W * 100) + "%;width:" + r1((px(800) - px(0)) / W * 100) + "%";
  }
  function drawLines(f) {
    const pts = [[px(0), py(f)]];
    for (let s = 800; s <= XMAX; s += 2) pts.push([px(s), py(Math.min(YMAX, mult(s, f)))]);
    const d = pts.map((p, i) => (i ? "L" : "M") + r1(p[0]) + " " + r1(p[1])).join(" ");
    $("#mPrice").setAttribute("d", d);
    $("#mFloor").setAttribute("d", "M" + r1(px(800)) + " " + r1(py(f)) + " L" + r1(px(XMAX)) + " " + r1(py(f)));
    const upTo = pts.filter((p) => p[0] <= px(S.sold) + 0.01), kx = px(S.sold), ky = py(Math.min(YMAX, mult(S.sold, f)));
    $("#mSold").setAttribute("d", S.sold > 0 ? upTo.concat([[kx, ky]]).map((p, i) => (i ? "L" : "M") + r1(p[0]) + " " + r1(p[1])).join(" ") + " L" + r1(kx) + " " + r1(py(0)) + " L" + r1(px(0)) + " " + r1(py(0)) + " Z" : "");
    ["mRing", "mKnob"].forEach((id) => { $("#" + id).setAttribute("cx", r1(kx)); $("#" + id).setAttribute("cy", r1(ky)); });
    const stem = $("#mStem"); stem.setAttribute("x1", r1(kx)); stem.setAttribute("x2", r1(kx)); stem.setAttribute("y1", r1(ky));
  }

  /* ---------- everything that depends on the three inputs ---------- */
  function render() {
    const m = stateAt(S.sold, S.volume), f = Number(m.floorPrice) / Number(m.salePrice);
    drawLines(f);
    $("#mSoldOut").textContent = S.sold + "M of 1,000M";
    $("#mVolOut").textContent = "$" + (S.volume / 1e6).toFixed(1) + "M";
    const volOn = m.graduated;
    $("#mVol").disabled = !volOn; $("#mVolBox").classList.toggle("off", !volOn);
    $("#mVolHint").textContent = volOn ? "2% of every trade stays in the reserve, and the floor is raised to match." : "This starts once the sale has sold out, at 800M coins.";
    const p = J.currentPrice(m), need = liability(m);
    $("#rPrice").textContent = price(p);
    $("#rCap").textContent = "$" + Math.round(Number(p) / 1e18 * 1e9).toLocaleString("en-US");
    $("#rFloor").textContent = price(m.floorPrice);
    $("#rReserve").textContent = usd(m.floorReserve, 0);
    $("#rNeed").textContent = usd(need, 0);
    const cover = need > 0n ? Number(m.floorReserve * 10000n / need) / 100 : null;
    $("#rCover").textContent = cover == null ? "No coins sold yet" : cover.toFixed(1) + "%";
    $("#rFill").style.width = cover == null ? "0%" : Math.min(100, 100 * 100 / cover).toFixed(2) + "%";
    $("#rSpare").textContent = cover == null ? "Nothing is owed until a coin is sold." : "If every holder sold now, the reserve would pay " + usd(need, 0) + " and keep " + usd(m.floorReserve - need, 0) + ".";
    renderBuy(m);
  }
  function renderBuy(m) {
    const out = $("#bOut"), bar = $("#bBar"), key = $("#bKey");
    bar.textContent = ""; key.textContent = "";
    const n = Number(String(S.budget).replace(/,/g, ""));
    if (!(n > 0) || n > 1e9) { out.textContent = "Enter an amount in dollars."; return; }
    const budget = BigInt(Math.round(n * 100)) * USD / 100n;
    let coins = 0n;
    try { coins = J.coinsForBudget(m, budget, 0n); } catch (_) { coins = 0n; }
    if (coins <= 0n) { out.textContent = n < 0.01 ? "That is too little to buy a coin." : "No coins are left to buy at this point."; return; }
    const q = J.quoteBuy(m, coins), after = applyBuy(m, q), back = J.quoteSell(after, coins);
    out.textContent = "";
    out.append("You pay ", el("b", "", usd(q.total)), " and receive ", el("b", "", coinsTxt(coins) + " coins"), ". Sell them straight back and you receive ", el("b", "", usd(back.net)), ".");
    if (coins === J.MAX_WALLET) out.append(" One wallet may hold 25M coins at most, so the buy stops there.");
    const parts = [["sw-floor", "Into the floor reserve, to buy these coins back", q.floorPart]];
    if (q.premiumPart > 0n) parts.push(["sw-prem", "Premium above the floor, held for when coins are sold back", q.premiumPart]);
    parts.push(["sw-extra", "Stays in the reserve (2%)", q.communityFee], ["sw-plat", "Launchpad (2%)", q.platformFee], ["sw-crea", "Creator (1%)", q.creatorFee]);
    parts.forEach((p) => {
      const seg = el("i", p[0]); seg.style.flex = Number(p[2]) + " 0 0"; bar.append(seg);
      const li = el("li"); li.append(el("i", p[0]), el("span", "", p[1]), el("b", "", usd(p[2]))); key.append(li);
    });
    bar.setAttribute("aria-label", parts.map((p) => p[1] + " " + usd(p[2])).join(", "));
  }

  function wireMachine() {
    drawFrame();
    const sold = $("#mSoldIn"), vol = $("#mVol"), buy = $("#bAmt"), chart = $("#mChart");
    sold.value = S.sold; vol.value = S.volume; buy.value = S.budget;
    sold.addEventListener("input", () => { S.sold = Number(sold.value); render(); });
    vol.addEventListener("input", () => { S.volume = Number(vol.value); render(); });
    buy.addEventListener("input", () => { S.budget = buy.value; render(); });
    const drag = (ev) => {
      const box = chart.getBoundingClientRect(), x = (ev.clientX - box.left) / box.width * W;
      S.sold = Math.max(0, Math.min(XMAX, Math.round((x - M.l) / (W - M.l - M.r) * XMAX / 5) * 5));
      sold.value = S.sold; render();
    };
    let down = false;
    chart.addEventListener("pointerdown", (ev) => { down = true; try { chart.setPointerCapture(ev.pointerId); } catch (_) { /* older browsers */ } drag(ev); });
    chart.addEventListener("pointermove", (ev) => { if (down) drag(ev); });
    ["pointerup", "pointercancel"].forEach((n) => chart.addEventListener(n, () => { down = false; }));
    render();
  }

  /* ---------- the stress test ----------
     A crowd of wallets trades one coin at random, or one attacker trades with himself through forty
     wallets (a wallet may hold 2.5% of a coin, so pushing the price takes many). Every trade is priced by the functions above. After each trade the page checks what the
     launchpad promises: the reserve can buy back every coin in circulation at the floor price, the floor
     has not gone down, and no dollar has appeared or vanished. At the end every holder sells everything. */
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function simulate(mode, seed) {
    const rand = rng(seed), attack = mode === "attacker";
    const N = attack ? 40 : 60, START = (attack ? 12000n : 6000n) * USD, TRADES = attack ? 500 : 600;
    const wallets = []; for (let i = 0; i < N; i++) wallets.push({ cash: START, coins: 0n });
    const total = START * BigInt(N);
    let m = fresh(), creator = 0n, platform = 0n, broken = 0, checks = 0, lastFloor = m.floorPrice, buys = 0, sells = 0, graduatedAt = -1;
    const series = [];
    const check = () => {
      checks++;
      const held = wallets.reduce((t, w) => t + w.cash, 0n);
      if (m.floorReserve < liability(m) || m.floorPrice < lastFloor || held + m.floorReserve + m.premiumReserve + creator + platform !== total) broken++;
      lastFloor = m.floorPrice;
    };
    const point = (kind) => series.push({ kind, price: Number(J.currentPrice(m)) / 1e18, floor: Number(m.floorPrice) / 1e18, reserve: Number(m.floorReserve) / 1e6, owed: Number(liability(m)) / 1e6, out: Number(J.outstanding(m) / J.COIN) });
    const buy = (w, budget) => {
      let coins = 0n; try { coins = J.coinsForBudget(m, budget, w.coins); } catch (_) { coins = 0n; }
      if (coins <= 0n) return false;
      const q = J.quoteBuy(m, coins); if (q.total > w.cash) return false;
      m = applyBuy(m, q); w.cash -= q.total; w.coins += coins; creator += q.creatorFee; platform += q.platformFee; buys++;
      if (m.graduated && graduatedAt < 0) graduatedAt = series.length;
      return true;
    };
    const sell = (w, coins) => {
      if (coins <= 0n || coins > w.coins) return false;
      const q = J.quoteSell(m, coins);
      m = applySell(m, q); w.cash += q.net; w.coins -= coins; creator += q.creatorFee; platform += q.platformFee; sells++;
      return true;
    };
    point("start");
    for (let i = 0; i < TRADES; i++) {
      const w = wallets[Math.floor(rand() * N)], wantBuy = rand() < (attack ? 0.55 : 0.6);
      let done = false;
      if (wantBuy && w.cash > 50n * USD) done = buy(w, BigInt(Math.floor(Number(w.cash) * (0.08 + rand() * (attack ? 0.6 : 0.4)))));
      if (!done && w.coins > 0n) done = sell(w, rand() < 0.3 ? w.coins : w.coins * BigInt(1 + Math.floor(rand() * 8)) / 10n);
      if (!done) continue;
      check(); point(wantBuy ? "buy" : "sell");
    }
    const tradesDone = buys + sells, peak = series.reduce((t, p) => Math.max(t, p.out), 0), exitFrom = series.length;
    // the end: every holder sells everything, in a random order
    const order = wallets.map((w, i) => i).sort(() => rand() - 0.5);
    let exits = 0, holders = 0;
    order.forEach((i) => { const w = wallets[i]; if (w.coins > 0n) { holders++; if (sell(w, w.coins)) exits++; check(); point("exit"); } });
    const cashEnd = wallets.reduce((t, w) => t + w.cash, 0n);
    return { mode, seed, series, exitFrom, graduatedAt, trades: tradesDone, buys, sells, checks, broken, holders, exits, peak, left: J.outstanding(m),
      floorRise: Number(m.floorPrice * 10000n / SALE_PRICE) / 100 - 100, reserveLeft: m.floorReserve + m.premiumReserve, creator, platform, start: total, end: cashEnd, loss: total - cashEnd };
  }

  const T = { w: 640, h: 230, l: 58, r: 14, t: 12, b: 24 };
  function drawStress(r, upTo) {
    const s = r.series.slice(0, upTo), n = r.series.length - 1 || 1;
    const x = (i) => T.l + i / n * (T.w - T.l - T.r);
    const top = Math.max.apply(null, r.series.map((p) => p.price)) * 1.08, yp = (v) => T.t + (1 - v / top) * (T.h - T.t - T.b);
    const d = (key, y) => s.map((p, i) => (i ? "L" : "M") + r1(x(i)) + " " + r1(y(p[key]))).join(" ");
    $("#sPrice").setAttribute("d", d("price", yp)); $("#sFloor").setAttribute("d", d("floor", yp));
    const topR = Math.max.apply(null, r.series.map((p) => Math.max(p.reserve, p.owed))) * 1.1 || 1, B = { t: 8, b: 20, h: 130 }, yr = (v) => B.t + (1 - v / topR) * (B.h - B.t - B.b);
    $("#sRes").setAttribute("d", s.length ? d("reserve", yr) + " L" + r1(x(s.length - 1)) + " " + r1(yr(0)) + " L" + r1(x(0)) + " " + r1(yr(0)) + " Z" : "");
    $("#sOwed").setAttribute("d", d("owed", yr));
    // round tick values: prices as multiples of the $0.0001 sale price, money in thousands of dollars
    const steps = (max, count) => { const raw = max / count, pow = Math.pow(10, Math.floor(Math.log10(raw))), nice = [1, 2, 2.5, 5, 10].find((k) => k * pow >= raw) * pow; const out = []; for (let v = nice; v <= max * 1.0001; v += nice) out.push(v); return out; };
    const sale = 0.0001, tick = (v) => "$" + v.toFixed(6).replace(/0+$/, ""), money = (v) => "$" + (v >= 1000 ? (v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "K" : Math.round(v));
    const rowAt = (y, label) => '<line class="grid" x1="' + T.l + '" x2="' + (T.w - T.r) + '" y1="' + r1(y) + '" y2="' + r1(y) + '"/><text class="tick" x="' + (T.l - 8) + '" y="' + (r1(y) + 4) + '" text-anchor="end">' + label + "</text>";
    $("#sTicks").innerHTML = steps(top / sale, 4).map((k) => rowAt(yp(k * sale), (Math.round(k * 100) / 100) + "\u00d7")).join("") +
      (upTo > r.exitFrom ? '<line class="mark" x1="' + r1(x(r.exitFrom)) + '" x2="' + r1(x(r.exitFrom)) + '" y1="' + T.t + '" y2="' + (T.h - T.b) + '"/>' : "");
    $("#sTicksB").innerHTML = steps(topR, 2).map((v) => rowAt(yr(v), money(v))).join("");
    const p = s[s.length - 1] || r.series[0], doneTrades = Math.min(r.trades, Math.max(0, Math.min(upTo, r.exitFrom) - 1));
    $("#sT").textContent = doneTrades.toLocaleString("en-US"); $("#sOut").textContent = (p.out / 1e6).toFixed(1) + "M";
    $("#sFl").textContent = tick(p.floor); $("#sChk").textContent = Math.max(0, upTo - 1).toLocaleString("en-US");
  }
  let stressTimer = 0;
  function runStress(mode, opts) {
    opts = opts || {};
    const r = simulate(mode, opts.seed == null ? Math.floor(Math.random() * 1e9) : opts.seed), out = $("#sSay"), calm = opts.animate === false || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    cancelAnimationFrame(stressTimer);
    $("#stressBox").hidden = false; out.textContent = "";
    $("#sBroken").textContent = "…"; $("#sBroken").parentNode.className = "";
    const finish = () => {
      drawStress(r, r.series.length);
      $("#sBroken").textContent = r.broken === 0 ? "0 times" : r.broken + " times"; $("#sBroken").parentNode.className = r.broken === 0 ? "good" : "bad";
      const lines = [];
      if (mode === "attacker") {
        lines.push("One attacker traded with himself through 40 wallets, because one wallet may hold only 2.5% of a coin: " + r.buys + " buys and " + r.sells + " sells, pushing " + (r.peak / 1e6).toFixed(0) + "M coins into circulation at the peak" + (r.graduatedAt >= 0 ? " and the price up the curve." : "."));
        lines.push("He put in " + usd(r.start, 0) + " and left with " + usd(r.end, 0) + ": a loss of " + usd(r.loss, 0) + ". That money went to the creator (" + usd(r.creator, 0) + "), the launchpad (" + usd(r.platform, 0) + ") and the coin's reserve (" + usd(r.reserveLeft, 0) + ").");
      } else {
        lines.push("60 wallets made " + r.buys + " buys and " + r.sells + " sells. " + (r.graduatedAt >= 0 ? "The sale sold out, and the floor finished " + r.floorRise.toFixed(1) + "% above the sale price." : "The sale did not sell out this time, so the floor stayed at the sale price."));
        lines.push("Then all " + r.holders + " holders sold everything, in a random order. " + (r.exits === r.holders ? "Every one of those sales was paid in full." : (r.holders - r.exits) + " of those sales could not be paid.") + " " + usd(r.reserveLeft, 0) + " is left in the reserve, with no coins in circulation.");
      }
      lines.push("After each of the " + r.checks.toLocaleString("en-US") + " trades the page checked three things: the reserve covers every coin at the floor, the floor has not gone down, and no dollar appeared or vanished. " + (r.broken === 0 ? "None failed." : r.broken + " failed."));
      lines.forEach((t) => out.append(el("p", "", t)));
      $("#stress").dataset.done = mode;
    };
    if (calm) { finish(); return r; }
    const t0 = performance.now(), dur = 5200;
    const frame = (now) => {
      const k = Math.min(1, (now - t0) / dur), upTo = Math.max(1, Math.round(k * r.series.length));
      drawStress(r, upTo);
      if (k < 1) stressTimer = requestAnimationFrame(frame); else finish();
    };
    delete $("#stress").dataset.done;
    stressTimer = requestAnimationFrame(frame);
    return r;
  }

  /* ---------- live checks ---------- */
  const short = (a) => a.slice(0, 4) + "…" + a.slice(-4);
  const SOL = window.JISR_SOLANA || {}, EVM_ID = "11155111";
  const evm = ((window.JISR_CONFIG || {}).chains || {})[EVM_ID] || {};
  const solLink = (addr) => (SOL.explorer || "https://explorer.solana.com") + "/address/" + addr + (SOL.clusterParam || "");
  async function ethCall(method, params) {
    const r = await fetch(evm.rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const body = await r.json();
    if (body.error) throw new Error(body.error.message || "RPC error");
    return body.result;
  }

  /* Each check asks the network one question and returns what it found. `ok` is the answer the launchpad promises. */
  function plan() {
    const list = [], ctx = {};
    // a check that builds on an earlier answer has nothing to say when that answer never came
    const need = (key) => { if (!(key in ctx)) throw new Error("the earlier answer is missing"); };
    if (SOL.programId) {
      const conn = new web3.Connection(SOL.rpcUrl, { commitment: "confirmed", disableRetryOnRateLimit: true }), pid = new web3.PublicKey(SOL.programId);
      list.push({ head: SOL.name });
      list.push({ label: "The launchpad program is on the network", run: async () => {
        const info = await conn.getAccountInfo(pid);
        return { ok: !!info && info.executable, text: info && info.executable ? "Program " + short(SOL.programId) + " is deployed and runs" : "Program not found", link: solLink(SOL.programId) };
      } });
      list.push({ label: "Nobody can change the program", run: async () => {
        const loader = new web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
        const data = web3.PublicKey.findProgramAddressSync([pid.toBytes()], loader)[0], info = await conn.getAccountInfo(data);
        if (!info) return { ok: false, text: "The program's data account was not found" };
        // layout: 4 bytes kind, 8 bytes slot, then 1 byte that says whether an upgrade authority exists
        const none = info.data[12] === 0;
        return { ok: none, text: none ? "Upgrade authority: none. The code is final, for us too" : "An upgrade authority still exists", link: solLink(data.toBase58()) };
      } });
      list.push({ label: "The launchpad is started", run: async () => {
        const cfg = await J.getConfig(conn, pid);
        ctx.cfg = cfg;
        if (!ctx.cfg) return { ok: false, text: "Not started yet" };
        return { ok: true, text: "Started. " + ctx.cfg.coinCount + (ctx.cfg.coinCount === 1n ? " coin" : " coins") + " launched; fees go to " + short(ctx.cfg.platformWallet.toBase58()), link: solLink(J.configAddress(pid).toBase58()) };
      } });
      list.push({ label: "The newest coins are fully covered", run: async () => {
        need("cfg");
        if (!ctx.cfg || ctx.cfg.coinCount === 0n) { ctx.markets = []; return { ok: true, text: "No coins yet, so nothing is owed" }; }
        const found = await J.getMarkets(conn, pid, ctx.cfg.coinCount, 3);
        const vaults = await conn.getMultipleAccountsInfo(found.map((m) => J.ata(m.address, ctx.cfg.stableMint)));
        ctx.markets = found;
        let all = true; const lines = [];
        ctx.markets.forEach((m, i) => {
          const held = J.tokenAmount(vaults[i]), owed = liability(m), set = m.floorReserve + m.premiumReserve + m.creatorFees + m.platformFees;
          const fine = held >= set && m.floorReserve >= owed; if (!fine) all = false;
          lines.push("$" + m.symbol + ": holds " + usd(held) + ", owes holders " + usd(owed) + " at the floor");
        });
        return { ok: all, text: lines[0], more: lines.slice(1), link: solLink(ctx.markets[0].address.toBase58()) };
      } });
      list.push({ label: "No more coins can ever be made", run: async () => {
        need("markets");
        if (!ctx.markets.length) return { ok: true, text: "No coins yet" };
        const m = ctx.markets[0], mint = J.decodeMint(await conn.getAccountInfo(m.coinMint));
        const fine = !!mint && mint.authority === null && mint.supply === J.TOTAL_SUPPLY;
        return { ok: fine, text: fine ? "$" + m.symbol + ": supply fixed at 1,000,000,000; the right to mint is gone" : "$" + m.symbol + ": the mint is not locked", link: solLink(m.coinMint.toBase58()) };
      } });
      list.push({ label: "A coin's name cannot be edited", run: async () => {
        need("markets");
        if (!ctx.markets.length) return { ok: true, text: "No coins yet" };
        const m = ctx.markets[0], addr = J.metadataAddress(m.coinMint), md = J.decodeMetadata(await conn.getAccountInfo(addr));
        if (!md) return { ok: true, text: "$" + m.symbol + " was launched without wallet metadata" };
        const fine = md.isMutable === false && md.updateAuthority.equals(m.address);
        return { ok: fine, text: fine ? "“" + md.name + "” is written for wallets and locked" : "The name of $" + m.symbol + " can still be changed", link: solLink(addr.toBase58()) };
      } });
    }
    if (evm.factory && evm.rpcUrl) {
      const scan = (evm.explorer || "https://sepolia.etherscan.io").replace(/\/+$/, "") + "/address/" + evm.factory;
      list.push({ head: evm.name || "Ethereum Sepolia" });
      list.push({ label: "The launchpad contract is on the network", run: async () => {
        const code = await ethCall("eth_getCode", [evm.factory, "latest"]);
        return { ok: !!code && code.length > 2, text: code && code.length > 2 ? "Factory " + short(evm.factory) + " is deployed, " + ((code.length - 2) / 2).toLocaleString("en-US") + " bytes of code" : "No contract at that address", link: scan };
      } });
      list.push({ label: "Coins launched there", run: async () => {
        const n = parseInt(await ethCall("eth_call", [{ to: evm.factory, data: "0x678fd289" }, "latest"]), 16); // coinCount()
        return { ok: Number.isFinite(n), text: n + (n === 1 ? " coin" : " coins") + " launched through this contract", link: scan };
      } });
    }
    return list;
  }

  let running = false;
  async function runChecks() {
    if (running) return;
    running = true;
    const ol = $("#cList"), btn = $("#cRun"), sum = $("#cSum"), items = plan();
    btn.disabled = true; ol.textContent = ""; sum.textContent = "Asking the networks…";
    let ok = 0, bad = 0, silent = 0;
    for (const it of items) {
      if (it.head) { ol.append(el("li", "head", it.head)); continue; }
      const li = el("li", "run"), st = el("span", "st", "… asking"), ms = el("span", "ms", ""), tx = el("span", "tx", it.label);
      li.append(st, ms, tx); ol.append(li);
      const t0 = performance.now();
      try {
        const r = await it.run();
        ms.textContent = Math.round(performance.now() - t0) + " ms";
        li.className = r.ok ? "ok" : "bad"; st.textContent = r.ok ? "✓ ok" : "✕ failed"; if (r.ok) ok++; else bad++;
        tx.textContent = "";
        if (r.link) { const a = el("a", "", r.text); a.href = r.link; a.target = "_blank"; a.rel = "noopener"; tx.append(a); } else tx.append(r.text);
        (r.more || []).forEach((line) => tx.append(el("small", "", line)));
        tx.append(el("small", "", it.label));
      } catch (e) {
        ms.textContent = Math.round(performance.now() - t0) + " ms";
        li.className = "na"; st.textContent = "– no answer"; silent++;
        tx.append(el("small", "", "The public endpoint did not answer. It limits how often it can be asked."));
      }
      await new Promise((r) => setTimeout(r, 180)); // public endpoints are shared; ask one question at a time
    }
    sum.textContent = (bad ? bad + " of " + (ok + bad + silent) + " checks failed. " : ok + " of " + (ok + bad + silent) + " checks answered as promised. ") +
      (silent ? silent + " got no answer; press Run again in a moment. " : "") + "Each line links to the same fact on a public block explorer.";
    btn.disabled = false; running = false;
  }

  function start() {
    if (!J || !web3) { $("#bOut").textContent = "This page could not load its scripts. Reload to try again."; return; }
    wireMachine();
    $("#cRun").addEventListener("click", runChecks);
    $("#sCrowd").addEventListener("click", () => runStress("crowd"));
    $("#sAttack").addEventListener("click", () => runStress("attacker"));
    // the checks start when they scroll into view, so a visitor sees them answer
    const box = $("#proof");
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); runChecks(); } }, { rootMargin: "0px 0px -20% 0px" });
      io.observe(box);
    } else runChecks();
  }
  /* The welcome window. A new visitor sees it once, shortly after the page appears; "How to help test" opens it
     again. Whether it has been seen is kept in this browser only, and the page works the same if that fails. */
  function welcome() {
    const box = $("#welcome"), again = $("#wOpen");
    if (!box || typeof box.showModal !== "function") { if (again) again.hidden = true; return; }
    const KEY = "jisr.welcomed";
    const seen = () => { try { return localStorage.getItem(KEY) === "1"; } catch (_) { return false; } };
    const open = () => { if (!box.open) box.showModal(); };
    box.addEventListener("close", () => { try { localStorage.setItem(KEY, "1"); } catch (_) {} });
    // a click on the dimmed page around the window closes it
    box.addEventListener("click", (e) => { const r = box.getBoundingClientRect(); if (e.target === box && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) box.close(); });
    if (again) again.addEventListener("click", open);
    const toRoad = $("#wRoad");
    if (toRoad) toRoad.addEventListener("click", () => box.close());
    if (!seen() && !/^#(board|launch|how|coin-)/.test(location.hash)) setTimeout(open, 700);
  }
  /* The road to mainnet: how much tester feedback has come in, and the market cap of the project's coin.
     Both are read from public services as the page opens; if one does not answer, its figure says so. */
  async function road() {
    const L = window.JISR_LAUNCH;
    if (!L || !$("#road")) return;
    const bar = (id, part) => { $(id).style.width = Math.max(part > 0 ? 1.5 : 0, Math.min(100, part * 100)).toFixed(1) + "%"; };
    const copy = $("#rCopy");
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(L.coin); copy.textContent = "Copied"; } catch (_) { copy.textContent = "Select the address to copy it"; }
      setTimeout(() => { copy.textContent = "Copy address"; }, 2500);
    });
    const hand = Number(L.feedbackOnX) || 0;
    try {
      const r = await fetch("https://api.github.com/repos/" + L.repo + "/issues?state=all&per_page=100", { headers: { accept: "application/vnd.github+json" } });
      if (!r.ok) throw new Error("no answer");
      const n = (await r.json()).filter((i) => !i.pull_request).length + hand;
      $("#rFb").textContent = n + " of " + L.feedbackGoal; bar("#rFbBar", n / L.feedbackGoal);
    } catch (_) { $("#rFb").textContent = hand ? hand + "+ of " + L.feedbackGoal : "not available now"; bar("#rFbBar", hand / L.feedbackGoal); }
    try {
      const r = await fetch("https://api.dexscreener.com/tokens/v1/solana/" + L.coin);
      if (!r.ok) throw new Error("no answer");
      const pairs = await r.json(), cap = Math.max(0, ...(Array.isArray(pairs) ? pairs : []).map((p) => Number(p.marketCap) || 0));
      if (!(cap > 0)) throw new Error("no figure");
      $("#rCap").textContent = "$" + Math.round(cap).toLocaleString("en-US") + " of $1M"; bar("#rCapBar", cap / L.capGoal);
    } catch (_) { $("#rCap").textContent = "see it on pump.fun"; }
  }
  /* Two plain counts for the road section: coins launched on the test networks, read from the chain, and
     visits to the site, from the counter in visits.js. Each says so when it could not be read. */
  async function counts() {
    if (!$("#rCoins")) return;
    const parts = [];
    let total = 0, known = false;
    if (SOL.programId) {
      try {
        const conn = new web3.Connection(SOL.rpcUrl, { commitment: "confirmed", disableRetryOnRateLimit: true });
        const cfg = await J.getConfig(conn, new web3.PublicKey(SOL.programId)), n = cfg ? Number(cfg.coinCount) : 0;
        total += n; known = true; parts.push(n + " on " + SOL.name);
      } catch (_) { /* this network is left out of the count */ }
    }
    if (evm.factory && evm.rpcUrl) {
      try {
        const n = parseInt(await ethCall("eth_call", [{ to: evm.factory, data: "0x678fd289" }, "latest"]), 16); // coinCount()
        if (Number.isFinite(n)) { total += n; known = true; parts.push(n + " on " + (evm.name || "Ethereum Sepolia")); }
      } catch (_) { /* this network is left out of the count */ }
    }
    $("#rCoins").textContent = known ? String(total) : "not available now";
    if (known) $("#rCoinsBy").firstChild.textContent = parts.join(", ") + ". ";
    const v = await (window.JISR_VISITS || Promise.resolve(null));
    $("#rVisits").textContent = v == null ? "not available now" : Number(v).toLocaleString("en-US");
  }
  /* Contact: the message is never sent by this site. The two buttons open X or GitHub with it filled in. */
  function contact() {
    const msg = $("#cMsg"), L = window.JISR_LAUNCH || {};
    if (!msg) return;
    const topic = $("#cTopic"), reach = $("#cReach"), x = $("#cX"), gh = $("#cGh"), note = $("#cNote");
    const set = (a, href) => { if (href) { a.href = href; a.setAttribute("aria-disabled", "false"); } else { a.removeAttribute("href"); a.setAttribute("aria-disabled", "true"); } };
    function update() {
      const text = msg.value.trim(), who = reach.value.trim();
      if (text.length < 10) { set(x, ""); set(gh, ""); note.textContent = text ? "Add a few more words so we can understand it." : "Write your message, then choose where to send it."; return; }
      const post = "@landingpadfun " + topic.value + ": " + text + (who ? " (reach me: " + who + ")" : "");
      set(x, post.length <= 280 ? "https://x.com/intent/post?text=" + encodeURIComponent(post) : "");
      set(gh, "https://github.com/" + (L.repo || "w8nwzbf9h5-svg/jisr-launchpad") + "/issues/new?title=" + encodeURIComponent(topic.value + ": " + text.slice(0, 70)) +
        "&body=" + encodeURIComponent(text + (who ? "\n\nReach me: " + who : "") + "\n\nSent from the contact form on landingpad.fun"));
      note.textContent = post.length <= 280 ? "Both open in a new tab with your message filled in. You press send there." : "This is " + (post.length - 280) + " characters too long for one post on X. Send it on GitHub, or shorten it.";
    }
    [msg, reach].forEach((e) => e.addEventListener("input", update));
    topic.addEventListener("change", update);
    $("#cForm").addEventListener("submit", (e) => e.preventDefault());
    update();
  }
  window.JISR_HOME = { stateAt, applyBuy, liability, state: S, render, runChecks, simulate, runStress, road, counts };
  start();
  welcome();
  road();
  counts();
  contact();
})();
