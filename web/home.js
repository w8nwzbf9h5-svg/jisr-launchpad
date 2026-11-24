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
    // the checks start when they scroll into view, so a visitor sees them answer
    const box = $("#proof");
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); runChecks(); } }, { rootMargin: "0px 0px -20% 0px" });
      io.observe(box);
    } else runChecks();
  }
  window.JISR_HOME = { stateAt, applyBuy, liability, state: S, render, runChecks };
  start();
})();
