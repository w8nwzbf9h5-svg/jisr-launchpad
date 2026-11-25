/* Markets: every coin on every configured network, each with a price chart, its trades and its holders.
   Everything is read from the chain in the visitor's browser; there is no server and nothing is stored.
   What that means for the numbers:
     - a candle's price is the launchpad's own price after each trade, worked out from how many coins were
       sold at that moment (the same formula the contracts use), so a flat line during the fixed-price sale
       is the truth and not missing data;
     - history reaches back only as far as a public endpoint will answer (see LOOKBACK and SOL_LIMIT). */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CFG = window.JISR_CONFIG || { chains: {} }, W = window.JISR_WALLET, ethers = window.ethers;
  const SOL = window.JISR_SOLANA, J = window.JisrSolana, web3 = window.solanaWeb3, LC = window.LightweightCharts;

  const SUPPLY = 1e9, SALE = 8e8, CURVE = 2e8;           // whole coins
  const LOOKBACK = 200000, LOG_STEP = 9500;              // EVM: blocks searched for a coin's launch, and the most asked for at once
  const SOL_LIMIT = 150;                                 // Solana: the newest transactions read for one coin
  const LIST_SIZE = 40;                                  // coins listed per launchpad, newest first
  const UP = "#35C29A", DOWN = "#E0654F", FLOOR = "#F5A524", VOL = "#33415E";

  const S = { coins: [], cur: null, tf: 300, tab: "trades", sort: "new", q: "", cache: {}, chart: null, candles: null, vol: null, floorLine: null, notes: [], seq: 0 };

  /* ---------- formatting ---------- */
  const trim = (s) => s.indexOf(".") < 0 ? s : s.replace(/0+$/, "").replace(/\.$/, "");
  function num(n, digits) {
    if (!isFinite(n)) return "–";
    const a = Math.abs(n);
    if (a >= 1e9) return trim((n / 1e9).toFixed(2)) + "B";
    if (a >= 1e6) return trim((n / 1e6).toFixed(2)) + "M";
    if (a >= 1e4) return trim((n / 1e3).toFixed(1)) + "K";
    if (a >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: digits == null ? 2 : digits });
    if (a === 0) return "0";
    return trim(n.toPrecision(4).includes("e") ? n.toFixed(12) : n.toPrecision(4));
  }
  /* An amount of the reserve currency: dollars when the reserve is a dollar coin, otherwise the number and its symbol. */
  const money = (n, c) => !isFinite(n) ? "–" : c.usd ? "$" + num(n) : num(n) + " " + c.unit;
  const short = (a) => { a = String(a); return a.length > 12 ? a.slice(0, 4) + "…" + a.slice(-4) : a; };
  function ago(t) {
    if (!t) return "";
    const s = Math.max(0, Date.now() / 1000 - t);
    return s < 60 ? Math.floor(s) + "s" : s < 3600 ? Math.floor(s / 60) + "m" : s < 86400 ? Math.floor(s / 3600) + "h" : Math.floor(s / 86400) + "d";
  }
  const safeImage = (u) => { try { const x = new URL(String(u || "")); return x.protocol === "https:" && x.href.length <= 200 ? x.href : ""; } catch (_) { return ""; } };
  const ava = (c) => c.image
    ? '<span class="ava"><img src="' + esc(c.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></span>'
    : '<span class="ava" aria-hidden="true">' + esc(c.symbol.slice(0, 2)) + "</span>";

  /* The launchpad's price, in the reserve currency per coin, when `sold` coins are in buyers' hands. */
  function priceAt(sold, sale, floor) {
    const c = Math.min(Math.max(0, sold - SALE), CURVE * 0.999999), k = CURVE / (CURVE - c);
    return (floor == null ? sale : floor) + sale * (k * k - 1);
  }

  /* ---------- Solana ---------- */
  const sol = { conn: null, pid: null, cfg: null, dec: 6 };
  async function loadSolana() {
    if (!SOL || !J || !web3 || !SOL.programId) return [];
    sol.pid = new web3.PublicKey(SOL.programId);
    sol.conn = sol.conn || new web3.Connection(SOL.rpcUrl, "confirmed");
    sol.cfg = await J.getConfig(sol.conn, sol.pid);
    if (!sol.cfg) return [];
    try { sol.dec = J.decodeMint(await sol.conn.getAccountInfo(sol.cfg.stableMint)).decimals; } catch (_) { sol.dec = 6; }
    const ms = await J.getMarkets(sol.conn, sol.pid, sol.cfg.coinCount, LIST_SIZE);
    const unit = Math.pow(10, sol.dec), coin = Number(J.COIN), scale = 1e18 * unit / coin;
    const stableName = SOL.stableName || "USD";
    return ms.map((m) => {
      const sold = Number(m.floorOut + m.curveOut) / coin, sale = Number(m.salePrice) / scale, floor = Number(m.floorPrice) / scale, mint = m.coinMint.toBase58();
      const meta = J.unpackMeta(m.uri) || {};
      const ex = (kind, v) => SOL.explorer + "/" + kind + "/" + v + (SOL.clusterParam || "");
      return {
        id: "s/" + mint, kind: "sol", net: SOL.name, tag: "SOL", order: Number(m.index), name: m.name, symbol: m.symbol, image: safeImage(meta.image),
        usd: /usd/i.test(stableName) || SOL.test !== false, unit: stableName, sale, floor, sold, graduated: m.graduated, price: Number(J.currentPrice(m)) / scale,
        reserve: Number(m.floorReserve + m.premiumReserve) / unit, owed: sold * floor, creator: m.creator.toBase58(), coinAddr: mint, marketAddr: m.address.toBase58(),
        trade: "solana.html" + (SOL.key && SOL.key !== "devnet" ? "?net=" + SOL.key : "") + "#coin/" + mint, addrUrl: (a) => ex("address", a), txUrl: (t) => ex("tx", t), created: null
      };
    });
  }
  const amount = (list, owner, mint) => { const e = (list || []).find((b) => b.owner === owner && b.mint === mint); return e ? BigInt(e.uiTokenAmount.amount) : null; };
  async function parsedTxs(sigs) {
    const out = [], opt = { maxSupportedTransactionVersion: 0, commitment: "confirmed" };
    for (let i = 0; i < sigs.length; i += 25) {
      const part = sigs.slice(i, i + 25);
      try { out.push(...await sol.conn.getParsedTransactions(part, opt)); }
      catch (_) { for (const s of part) { try { out.push(await sol.conn.getParsedTransaction(s, opt)); } catch (e) { out.push(null); } } }
    }
    return out;
  }
  async function solDetail(c) {
    const market = new web3.PublicKey(c.marketAddr), stable = sol.cfg.stableMint.toBase58(), unit = Math.pow(10, sol.dec), coin = Number(J.COIN);
    const sigs = await sol.conn.getSignaturesForAddress(market, { limit: SOL_LIMIT });
    const txs = await parsedTxs(sigs.filter((s) => !s.err).map((s) => s.signature));
    const trades = []; let created = null;
    for (const tx of txs) {
      if (!tx || !tx.meta || tx.meta.err) continue;
      const pre = amount(tx.meta.preTokenBalances, c.marketAddr, c.coinAddr), post = amount(tx.meta.postTokenBalances, c.marketAddr, c.coinAddr);
      if (post == null) continue;
      if (pre == null) { created = tx.blockTime || created; continue; }      // the launch itself: the coins arrive in the market
      if (pre === post) continue;                                           // a fee payout or a top-up, not a trade
      const who = (tx.transaction.message.accountKeys.find((k) => k.signer) || {}).pubkey, whoKey = who ? who.toBase58() : "";
      const buy = post < pre, coins = Number(buy ? pre - post : post - pre) / coin;
      const a = amount(tx.meta.preTokenBalances, whoKey, stable) || 0n, b = amount(tx.meta.postTokenBalances, whoKey, stable) || 0n;
      let paid = Number(buy ? a - b : b - a) / unit;
      if (!(paid > 0)) {                                                    // paid from another account: fall back to what moved in the reserve
        const va = amount(tx.meta.preTokenBalances, c.marketAddr, stable) || 0n, vb = amount(tx.meta.postTokenBalances, c.marketAddr, stable) || 0n;
        paid = Math.abs(Number(vb - va)) / unit;
      }
      trades.push({ t: tx.blockTime || 0, buy, coins, value: paid, price: priceAt(SUPPLY - Number(post) / coin, c.sale), who: whoKey, tx: tx.transaction.signatures[0] });
    }
    trades.sort((x, y) => x.t - y.t);
    // Holders: the network's own list of the largest accounts. The public endpoint often refuses that call, so
    // it is tried twice, and failing that the list is built from the balances seen in the trades read above
    // (complete for wallets that traded here, blind to coins sent wallet to wallet).
    let holders = null, more = false, approx = false;
    for (let k = 0; k < 2 && !holders; k++) {
      try {
        const big = (await sol.conn.getTokenLargestAccounts(new web3.PublicKey(c.coinAddr))).value.filter((h) => Number(h.amount) > 0);
        const owners = (await sol.conn.getMultipleParsedAccounts(big.map((h) => h.address))).value;
        holders = big.map((h, i) => { const o = owners[i] && owners[i].data && owners[i].data.parsed && owners[i].data.parsed.info.owner; return { who: o || h.address.toBase58(), coins: Number(h.amount) / coin }; });
        more = big.length >= 20;
      } catch (_) { if (k === 0) await new Promise((r) => setTimeout(r, 1500)); }
    }
    if (!holders) {
      const bal = {};
      txs.slice().reverse().forEach((tx) => { if (tx && tx.meta && !tx.meta.err) (tx.meta.postTokenBalances || []).forEach((b) => { if (b.mint === c.coinAddr && b.owner) bal[b.owner] = Number(b.uiTokenAmount.amount) / coin; }); });
      const list = Object.keys(bal).filter((o) => bal[o] > 0).map((o) => ({ who: o, coins: bal[o] })).sort((x, y) => y.coins - x.coins);
      if (list.length) { holders = list; approx = true; }
    }
    let locked = null;
    try {
      const infos = await sol.conn.getMultipleAccountsInfo([new web3.PublicKey(c.coinAddr), J.metadataAddress(new web3.PublicKey(c.coinAddr))]);
      const mint = J.decodeMint(infos[0]), md = infos[1] ? J.decodeMetadata(infos[1]) : null;
      locked = { mint: !mint.authority || mint.authority.toBase58() === c.marketAddr, name: md ? md.isMutable === false : null };
    } catch (_) { locked = null; }
    return { trades, holders, more, approx, created, cut: sigs.length >= SOL_LIMIT, locked };
  }

  /* ---------- EVM networks ---------- */
  const FACTORY = ["function coinCount() view returns (uint256)", "function coins(uint256) view returns (address)", "function marketOf(address) view returns (address)", "function stable() view returns (address)",
    "event CoinCreated(address indexed creator, address indexed coin, address indexed market, string name, string symbol, string metadataURI)"];
  const MARKET = ["function creator() view returns (address)", "function salePrice() view returns (uint256)", "function floorPrice() view returns (uint256)", "function floorOut() view returns (uint256)",
    "function curveOut() view returns (uint256)", "function floorReserve() view returns (uint256)", "function premiumReserve() view returns (uint256)", "function graduated() view returns (bool)",
    "function currentPrice() view returns (uint256)", "function floorLiability() view returns (uint256)",
    "event Bought(address indexed buyer, uint256 coins, uint256 stablePaid, bool paidInNative)", "event Sold(address indexed seller, address indexed to, uint256 coins, uint256 stableOut, bool paidInNative)"];
  const COIN = ["function name() view returns (string)", "function symbol() view returns (string)", "function metadataURI() view returns (string)", "function totalSupply() view returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 value)"];
  const TOKEN = ["function symbol() view returns (string)", "function decimals() view returns (uint8)"];
  const evm = {};       // chain id -> { p, times: {block: seconds} }
  /* Logs from block `from` to the newest block. Public endpoints refuse wide ranges, so the range is asked
     for in pieces, and a piece that is refused is halved. */
  async function logs(p, filter, from) {
    const head = await p.getBlockNumber(), out = [];
    let step = LOG_STEP;
    while (from <= head) {
      const to = Math.min(head, from + step - 1);
      try { out.push(...await p.getLogs(Object.assign({}, filter, { fromBlock: from, toBlock: to }))); from = to + 1; }
      catch (e) { if (step <= 500) throw e; step = Math.floor(step / 2); }
    }
    return out;
  }
  /* The block a coin was launched in, found by looking back from the newest block for the factory's record
     of it. Nothing about a coin is older than this, so its trades are read from here on. Remembered in this
     browser, because the answer never changes. */
  async function bornAt(c) {
    const key = "jisr.mk.born:" + c.id;
    try { const v = JSON.parse(localStorage.getItem(key) || "null"); if (v && v.block >= 0) return v; } catch (_) {}
    const p = evm[c.chain].p, head = await p.getBlockNumber(), FI = new ethers.Interface(FACTORY);
    const filter = { address: c.factory, topics: [FI.getEvent("CoinCreated").topicHash, null, ethers.zeroPadValue(c.coinAddr, 32)] };
    let to = head, step = LOG_STEP;
    while (to >= 0 && head - to < LOOKBACK) {
      const from = Math.max(0, to - step + 1);
      let found;
      try { found = await p.getLogs(Object.assign({}, filter, { fromBlock: from, toBlock: to })); }
      catch (e) { if (step <= 500) throw e; step = Math.floor(step / 2); continue; }
      if (found.length) { const v = { block: found[0].blockNumber }; try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) {} return v; }
      if (from === 0) break;
      to = from - 1;
    }
    return { block: Math.max(0, head - LOOKBACK), old: true };       // launched before the range searched
  }
  async function blockTimes(id, blocks) {
    const e = evm[id], need = [...new Set(blocks)].filter((b) => !(b in e.times));
    await Promise.all(need.map(async (b) => { try { e.times[b] = Number((await e.p.getBlock(b)).timestamp); } catch (_) { e.times[b] = 0; } }));
    return e.times;
  }
  function imageOf(uri) {
    if (typeof uri !== "string" || !uri) return "";
    if (uri[0] === "{") { try { return safeImage(JSON.parse(uri).image); } catch (_) { return ""; } }
    return safeImage(uri);
  }
  async function loadEvm() {
    const out = [];
    if (!ethers || !W) return out;
    for (const id of Object.keys(CFG.chains)) {
      const ch = CFG.chains[id], facs = [ch.factory].concat(ch.extraFactories || []).filter((f) => ethers.isAddress(f || ""));
      if (!facs.length) continue;
      const p = W.reader(id);
      if (!p) continue;
      evm[id] = evm[id] || { p, times: {} };
      for (const fac of facs) {
        try {
          const F = new ethers.Contract(fac, FACTORY, p), [count, stableAddr] = await Promise.all([F.coinCount(), F.stable()]);
          const T = new ethers.Contract(stableAddr, TOKEN, p), [sym, dec] = await Promise.all([T.symbol(), T.decimals()]);
          const unit = Math.pow(10, Number(dec)), n = Number(count), idx = [];
          for (let i = n - 1; i >= 0 && idx.length < LIST_SIZE; i--) idx.push(i);
          const rows = await Promise.all(idx.map(async (i) => {
            const coinAddr = await F.coins(i), marketAddr = await F.marketOf(coinAddr);
            const C = new ethers.Contract(coinAddr, COIN, p), M = new ethers.Contract(marketAddr, MARKET, p);
            const v = await Promise.all([C.name(), C.symbol(), C.metadataURI().catch(() => ""), M.creator(), M.salePrice(), M.floorPrice(), M.floorOut(), M.curveOut(), M.floorReserve(), M.premiumReserve(), M.graduated(), M.currentPrice(), M.floorLiability()]);
            const per = (x) => Number(x) / 1e18 / unit, coins = (x) => Number(x) / 1e18;
            return {
              id: "e/" + id + "/" + coinAddr, kind: "evm", chain: id, net: ch.name, tag: ch.native || "EVM", order: i, name: v[0], symbol: v[1], image: imageOf(v[2]),
              usd: /usd/i.test(sym), unit: sym, sale: per(v[4]), floor: per(v[5]), sold: coins(v[6]) + coins(v[7]), graduated: v[10], price: per(v[11]),
              reserve: (Number(v[8]) + Number(v[9])) / unit, owed: Number(v[12]) / unit, creator: v[3], coinAddr, marketAddr, factory: fac, unitScale: unit,
              trade: "app.html#coin-" + coinAddr, addrUrl: (a) => ch.explorer ? ch.explorer + "/address/" + a : "", txUrl: (t) => ch.explorer ? ch.explorer + "/tx/" + t : "", created: null
            };
          }));
          out.push(...rows);
        } catch (e) { S.notes.push(ch.name + " did not answer."); }
      }
    }
    return out;
  }
  async function evmDetail(c) {
    const e = evm[c.chain], p = e.p, M = new ethers.Interface(MARKET), CI = new ethers.Interface(COIN);
    const born = await bornAt(c);
    const tl = await logs(p, { address: c.marketAddr, topics: [[M.getEvent("Bought").topicHash, M.getEvent("Sold").topicHash]] }, born.block);
    const hl = await logs(p, { address: c.coinAddr, topics: [CI.getEvent("Transfer").topicHash] }, born.block).catch(() => null);
    const times = await blockTimes(c.chain, tl.map((l) => l.blockNumber).concat(born.old ? [] : [born.block]));
    tl.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
    const trades = tl.map((l) => {
      const ev = M.parseLog(l), buy = ev.name === "Bought";
      return { t: times[l.blockNumber] || 0, buy, coins: Number(ev.args.coins) / 1e18, value: Number(buy ? ev.args.stablePaid : ev.args.stableOut) / c.unitScale, who: buy ? ev.args.buyer : ev.args.seller, tx: l.transactionHash, price: 0 };
    });
    // The number of coins sold after each trade, counted back from what is sold now, gives the price at that moment.
    let sold = c.sold;
    for (let i = trades.length - 1; i >= 0; i--) { trades[i].price = priceAt(sold, c.sale); sold += trades[i].buy ? -trades[i].coins : trades[i].coins; }
    let holders = null;
    if (hl) {
      const bal = {};
      for (const l of hl) { const ev = CI.parseLog(l), v = ev.args.value; bal[ev.args.from] = (bal[ev.args.from] || 0n) - v; bal[ev.args.to] = (bal[ev.args.to] || 0n) + v; }
      holders = Object.keys(bal).filter((a) => a !== ethers.ZeroAddress && bal[a] > 0n).map((a) => ({ who: a, coins: Number(bal[a]) / 1e18 })).sort((a, b) => b.coins - a.coins);
    }
    let supply = null;
    try { supply = Number(await new ethers.Contract(c.coinAddr, COIN, p).totalSupply()) / 1e18; } catch (_) { supply = null; }
    return { trades, holders, more: false, created: born.old ? null : times[born.block] || null, cut: !!born.old, supply };
  }

  /* ---------- the chart ---------- */
  function chart() {
    if (S.chart || !LC) return;
    S.chart = LC.createChart($("#chart"), {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#8C95A9", fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, attributionLogo: true },
      grid: { vertLines: { color: "#1B2231" }, horzLines: { color: "#1B2231" } },
      rightPriceScale: { borderColor: "#242B3B", scaleMargins: { top: 0.12, bottom: 0.26 } },
      timeScale: { borderColor: "#242B3B", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 }
    });
    S.candles = S.chart.addSeries(LC.CandlestickSeries, { upColor: UP, downColor: DOWN, borderVisible: false, wickUpColor: UP, wickDownColor: DOWN });
    S.vol = S.chart.addSeries(LC.HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "", color: VOL, lastValueVisible: false, priceLineVisible: false });
    S.vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    S.chart.subscribeCrosshairMove((p) => { const d = p && p.seriesData && p.seriesData.get(S.candles), v = p && p.seriesData && p.seriesData.get(S.vol); readout(d || S.last, v ? v.value : S.lastVol); });
  }
  /* Candles from the trades: each opens where the one before closed. Times are shifted so the axis shows local time. */
  function bars(trades, tf, start) {
    const shift = -new Date().getTimezoneOffset() * 60, cs = [], vs = [];
    let prev = start;
    for (const t of trades) {
      const time = Math.floor(t.t / tf) * tf + shift, last = cs[cs.length - 1];
      if (last && last.time === time) { last.high = Math.max(last.high, t.price); last.low = Math.min(last.low, t.price); last.close = t.price; vs[vs.length - 1].value += t.value; }
      else { cs.push({ time, open: prev, high: Math.max(prev, t.price), low: Math.min(prev, t.price), close: t.price }); vs.push({ time, value: t.value }); }
      prev = t.price;
    }
    return { cs, vs };
  }
  function readout(d, v) {
    const c = S.cur, el = $("#ohlc");
    if (!c || !d) { el.textContent = ""; return; }
    const f = (x) => money(x, c);
    el.innerHTML = "Open <b>" + esc(f(d.open)) + "</b> High <b>" + esc(f(d.high)) + "</b> Low <b>" + esc(f(d.low)) + "</b> Close <b>" + esc(f(d.close)) + "</b>" + (v != null ? " Volume <b>" + esc(f(v)) + "</b>" : "");
  }
  function draw() {
    const c = S.cur, d = c && S.cache[c.id];
    if (!c) return;
    if (!LC) { $("#chartNote").hidden = false; $("#chartNote").textContent = "The chart could not be loaded. The trades are listed below."; return; }
    chart();
    document.querySelectorAll(".mk-tf button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.tf) === S.tf)));
    const digits = Math.min(12, Math.max(2, Math.ceil(-Math.log10(Math.max(c.sale, 1e-12))) + 3));
    S.candles.applyOptions({ priceFormat: { type: "price", precision: digits, minMove: Math.pow(10, -digits) } });
    if (S.floorLine) { try { S.candles.removePriceLine(S.floorLine); } catch (_) {} S.floorLine = null; }
    const trades = d ? d.trades.filter((t) => t.t > 0) : [], note = $("#chartNote");
    if (trades.length) {
      const b = bars(trades, S.tf, c.sale);
      S.candles.setData(b.cs); S.vol.setData(b.vs);
      S.last = b.cs[b.cs.length - 1]; S.lastVol = b.vs[b.vs.length - 1].value;
      S.chart.timeScale().fitContent();
      note.hidden = true;
    } else {
      S.candles.setData([]); S.vol.setData([]); S.last = null; S.lastVol = null;
      note.hidden = false;
      note.textContent = !d ? "Reading the trades from the chain…" : d.failed ? "The network did not return this coin's trades. Press Refresh to try again." : "No trades yet. The price is the fixed sale price, " + money(c.sale, c) + " a coin.";
    }
    S.floorLine = S.candles.createPriceLine({ price: c.floor, color: FLOOR, lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: "floor" });
    readout(S.last, S.lastVol);
  }

  /* ---------- drawing the page ---------- */
  function shown() {
    const q = S.q.trim().toLowerCase();
    const list = S.coins.filter((c) => !q || c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
    const by = { new: (a, b) => (b.created || 0) - (a.created || 0) || (a.kind === b.kind ? b.order - a.order : a.kind < b.kind ? 1 : -1), cap: (a, b) => b.price - a.price, sold: (a, b) => b.sold - a.sold };
    return list.sort(by[S.sort] || by.new);
  }
  function renderList() {
    const list = shown(), box = $("#rows");
    document.querySelectorAll(".mk-sort button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.sort === S.sort)));
    if (!S.loaded) return;
    box.innerHTML = list.length ? list.map((c) =>
      '<button type="button" class="mk-row" role="listitem" data-id="' + esc(c.id) + '"' + (S.cur && S.cur.id === c.id ? ' aria-current="true"' : "") + ">" +
      '<span class="who">' + ava(c) + '<span class="nm"><b>' + esc(c.name) + '</b><small><span class="net">' + esc(c.tag) + "</span>" + esc(c.symbol) + (c.graduated ? ", graduated" : "") + "</small></span></span>" +
      '<span class="n">' + esc(money(c.price, c)) + '</span><span class="n">' + esc(money(c.price * SUPPLY, c)) + "</span>" +
      '<span class="bar" title="' + esc(num(c.sold)) + ' of 800M sold"><i style="width:' + Math.min(100, c.sold / SALE * 100).toFixed(1) + '%"></i></span></button>').join("")
      : '<p class="mk-note">' + (S.coins.length ? "No coin matches that search." : "No coins have been launched yet. Launch the first one from the Solana or Ethereum page.") + "</p>";
    const note = $("#listNote");
    note.hidden = !S.notes.length; note.textContent = S.notes.join(" ");
  }
  const stat = (k, v, small, cls) => "<div><dt>" + esc(k) + "</dt><dd" + (cls ? ' class="' + cls + '"' : "") + ">" + esc(v) + (small ? "<small>" + esc(small) + "</small>" : "") + "</dd></div>";
  function renderDetail() {
    const c = S.cur, box = $("#detail");
    $("#mk").classList.toggle("one", !!c);
    box.hidden = !c;
    if (!c) return;
    const d = S.cache[c.id], day = Date.now() / 1000 - 86400;
    $("#dAva").innerHTML = ava(c);
    $("#dName").textContent = c.name + " (" + c.symbol + ")";
    const url = c.addrUrl(c.coinAddr), created = d && d.created;
    $("#dSub").innerHTML = '<span class="net">' + esc(c.tag) + "</span>" + esc(c.net) + (created ? ", launched " + esc(ago(created)) + " ago" : "") + ", " +
      (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(short(c.coinAddr)) + "</a>" : esc(short(c.coinAddr)));
    $("#dTrade").href = c.trade;
    const vol = d && !d.failed ? d.trades.filter((t) => t.t >= day).reduce((s, t) => s + t.value, 0) : null;
    const cover = c.owed > 0 ? c.reserve / c.owed * 100 : null;
    $("#dStats").innerHTML =
      stat("Price", money(c.price, c), c.sold < SALE ? "fixed until 800M are sold" : "on the curve") +
      stat("Market cap", money(c.price * SUPPLY, c), "price × 1B coins") +
      stat("Floor", money(c.floor, c), "paid on any sale", "floor") +
      stat("Reserve", money(c.reserve, c), cover == null ? "nothing owed yet" : "owes " + money(c.owed, c) + ", " + cover.toFixed(1) + "% covered") +
      stat("Sold", num(c.sold) + " coins", c.graduated ? "graduated" : (c.sold / SALE * 100).toFixed(1) + "% of the 800M sale") +
      stat("Volume, 24h", vol == null ? "…" : money(vol, c), d && !d.failed ? d.trades.filter((t) => t.t >= day).length + " trades" : "") +
      stat("Trades", d && !d.failed ? String(d.trades.length) + (d.cut ? "+" : "") : "…", d && d.cut ? "the newest read" : "in the history read") +
      stat("Holders", d && d.holders ? String(d.holders.filter((h) => h.who !== c.marketAddr).length) + (d.more ? "+" : "") : "…", d && d.more ? "the 20 largest are listed" : "");
    document.querySelectorAll(".mk-tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === S.tab)));
    renderPane();
    draw();
  }
  const who = (c, a) => { const u = c.addrUrl(a); return (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(short(a)) + "</a>" : esc(short(a))) + (a === c.creator ? '<span class="tag">creator</span>' : ""); };
  function renderPane() {
    const c = S.cur, d = S.cache[c.id], pane = $("#pane");
    if (!d) { pane.innerHTML = '<p class="mk-note">Reading from the chain…</p>'; return; }
    if (d.failed) { pane.innerHTML = '<p class="mk-note">The network did not answer. Press Refresh to try again.</p>'; return; }
    if (S.tab === "trades") {
      const rows = d.trades.slice().reverse().slice(0, 200).map((t) => "<tr><td>" + esc(t.t ? ago(t.t) + " ago" : "–") + '</td><td><span class="side ' + (t.buy ? "buy" : "sell") + '">' + (t.buy ? "Buy" : "Sell") + '</span></td><td class="r">' + esc(money(t.value, c)) +
        '</td><td class="r">' + esc(num(t.coins)) + '</td><td class="r">' + esc(money(t.price, c)) + "</td><td>" + who(c, t.who) + "</td><td>" + (c.txUrl(t.tx) ? '<a href="' + esc(c.txUrl(t.tx)) + '" target="_blank" rel="noopener">view</a>' : esc(short(t.tx))) + "</td></tr>").join("");
      pane.innerHTML = rows ? '<div class="mk-tablewrap"><table class="mk-table"><thead><tr><th>When</th><th>Side</th><th class="r">Value</th><th class="r">Coins</th><th class="r">Price after</th><th>Wallet</th><th>Transaction</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
        (d.cut ? '<p class="mk-note">Showing the newest trades. Older ones are on the chain but are not read here.</p>' : "")
        : '<p class="mk-note">No trades yet.</p>';
    } else if (S.tab === "holders") {
      if (!d.holders) { pane.innerHTML = '<p class="mk-note">The network did not return the holders. Press Refresh to try again.</p>'; return; }
      const rows = d.holders.slice(0, 50).map((h, i) => "<tr><td class=\"r\">" + (i + 1) + "</td><td>" + (h.who === c.marketAddr ? esc(short(h.who)) + '<span class="tag">not sold yet, held by the launchpad</span>' : who(c, h.who)) +
        '</td><td class="r">' + esc(num(h.coins)) + '</td><td class="r">' + (h.coins / SUPPLY * 100).toFixed(2) + '%</td><td class="r">' + esc(money(h.coins * c.floor, c)) + "</td></tr>").join("");
      pane.innerHTML = '<div class="mk-tablewrap"><table class="mk-table"><thead><tr><th class="r">#</th><th>Wallet</th><th class="r">Coins</th><th class="r">Share of supply</th><th class="r">Worth at the floor</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
        (d.more ? '<p class="mk-note">The 20 largest accounts are listed.</p>' : "") + (d.approx ? '<p class="mk-note">The network would not list the holders, so this list is built from the trades above. Coins sent from wallet to wallet outside the launchpad are not counted.</p>' : "");
    } else {
      const hs = d.holders ? d.holders.filter((h) => h.who !== c.marketAddr) : null, top = hs && hs.length ? hs[0].coins / SUPPLY * 100 : null;
      const mine = hs ? (hs.find((h) => h.who === c.creator) || { coins: 0 }).coins / SUPPLY * 100 : null;
      const li = (ok, title, text) => '<li class="' + (ok == null ? "na" : ok ? "ok" : "no") + '"><span class="st">' + (ok == null ? "n/a" : ok ? "ok" : "FAIL") + "</span><span>" + esc(title) + "<small>" + esc(text) + "</small></span></li>";
      pane.innerHTML = '<ul class="mk-checks">' +
        li(c.owed > 0 ? c.reserve >= c.owed : null, "The reserve covers every coin at the floor", "It holds " + money(c.reserve, c) + " and owes " + money(c.owed, c) + " if every holder sold now.") +
        li(c.floor >= c.sale, "The floor has never gone down", "The floor is " + money(c.floor, c) + ". The sale price was " + money(c.sale, c) + ".") +
        li(top == null ? null : top <= 2.5001, "No wallet holds more than 2.5%", top == null ? "The holders could not be read." : "The largest wallet holds " + top.toFixed(2) + "% of the supply.") +
        li(null, "What the creator holds", mine == null ? "The holders could not be read." : "The creator's wallet holds " + mine.toFixed(2) + "% of the supply, bought at the same price as everyone.") +
        (c.kind === "sol" ? li(d.locked ? d.locked.mint : null, "Nobody can make more coins", d.locked ? (d.locked.mint ? "No wallet holds the right to mint this coin." : "The mint is controlled by another address.") : "Could not be read.") +
          li(d.locked ? d.locked.name : null, "The name and picture link cannot be changed", d.locked && d.locked.name === false ? "The wallet details can still be edited." : d.locked && d.locked.name ? "The wallet details are locked." : "This coin has no wallet details.")
          : li(d.supply == null ? null : Math.abs(d.supply - SUPPLY) < 1, "The supply is fixed at 1 billion", d.supply == null ? "Could not be read." : "The coin's contract reports " + num(d.supply) + " coins.")) +
        "</ul>";
    }
  }

  /* ---------- loading ---------- */
  async function loadList() {
    S.notes = [];
    const parts = await Promise.all([loadSolana().catch(() => { S.notes.push((SOL && SOL.name || "Solana") + " did not answer."); return []; }), loadEvm().catch(() => [])]);
    const coins = parts[0].concat(parts[1]);
    for (const c of coins) { const old = S.coins.find((o) => o.id === c.id), d = S.cache[c.id]; c.created = (d && d.created) || (old && old.created) || null; }
    S.coins = coins; S.loaded = true;
    if (S.cur) S.cur = coins.find((c) => c.id === S.cur.id) || S.cur;
  }
  /* What changes when a coin is traded. The trades are read again only when this has moved. */
  const stamp = (c) => c.sold + ":" + c.reserve;
  async function loadDetail(c, fresh) {
    if (!c) return;
    if (S.cache[c.id] && !fresh) return;
    const mine = ++S.seq;
    try { const d = await (c.kind === "sol" ? solDetail(c) : evmDetail(c)); d.stamp = stamp(c); S.cache[c.id] = d; if (d.created) c.created = d.created; }
    catch (e) { if (!S.cache[c.id]) S.cache[c.id] = { failed: true, trades: [], holders: null }; }
    if (S.cur && S.cur.id === c.id && mine <= S.seq) { renderDetail(); renderList(); }
  }
  function pick(id, push) {
    const c = S.coins.find((x) => x.id === id) || null;
    S.cur = c;
    if (push) { try { history.replaceState(null, "", c ? "#" + c.id : location.pathname + location.search); } catch (_) {} }
    renderList(); renderDetail();
    if (c) { loadDetail(c, false); if (window.matchMedia("(max-width: 979px)").matches) window.scrollTo(0, 0); }
  }
  async function refresh(all) {
    const btn = $("#dRefresh"); btn.disabled = true;
    try { await loadList(); renderList(); if (S.cur) { renderDetail(); await loadDetail(S.cur, all); } } finally { btn.disabled = false; }
  }
  async function start() {
    $("#q").addEventListener("input", (e) => { S.q = e.target.value; renderList(); });
    document.querySelectorAll(".mk-sort button").forEach((b) => b.addEventListener("click", () => { S.sort = b.dataset.sort; renderList(); }));
    document.querySelectorAll(".mk-tf button").forEach((b) => b.addEventListener("click", () => { S.tf = Number(b.dataset.tf); draw(); }));
    document.querySelectorAll(".mk-tabs button").forEach((b) => b.addEventListener("click", () => { S.tab = b.dataset.tab; renderDetail(); }));
    $("#rows").addEventListener("click", (e) => { const r = e.target.closest(".mk-row"); if (r) pick(r.dataset.id, true); });
    $("#back").addEventListener("click", () => pick(null, true));
    $("#dRefresh").addEventListener("click", () => refresh(true));
    window.addEventListener("hashchange", () => pick(decodeURIComponent(location.hash.slice(1)), false));
    await loadList();
    const want = decodeURIComponent(location.hash.slice(1)), wide = window.matchMedia("(min-width: 980px)").matches;
    const first = S.coins.find((c) => c.id === want) || (wide ? shown()[0] : null);
    pick(first ? first.id : null, false);
    // keep the numbers current while the page is open and in view
    setInterval(() => {
      if (document.hidden) return;
      refresh(false).then(() => { const c = S.cur, d = c && S.cache[c.id]; if (c && d && d.stamp !== stamp(c)) loadDetail(c, true); });
    }, 45000);
  }
  window.JISR_MARKETS = { state: S, refresh, pick, priceAt, bars };
  start();
})();
