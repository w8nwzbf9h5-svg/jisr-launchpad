/* Jisr on Solana: the page. Reads the program through web/solana/jisr-solana.js and asks the
   visitor's Phantom wallet to sign. The wallet's key never leaves the wallet. */
(function () {
  "use strict";
  const web3 = window.solanaWeb3, J = window.JisrSolana, C = window.JISR_SOLANA;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const short = (k) => { const s = String(k); return s.slice(0, 4) + "…" + s.slice(-4); };
  const SLIP_BPS = 100n; // 1%
  /* On a test network the page offers test dollars, free SOL for fees and the one-time setup. On the real
     network (test: false in config.js) none of that exists: the reserve currency is real and setup is done at deployment. */
  const TEST = C.test !== false, CUR = TEST ? "test $" : C.stableName || "USDC";

  const S = {
    conn: null, programId: null, cfg: null, dec: 6, stableReady: false,
    provider: null, wallet: null, sol: 0n, stable: 0n,
    view: "board", markets: [], cur: null, m: null, held: 0n,
    tab: "buy", buyAmt: "", sellAmt: "", busy: false, loaded: false, loadError: ""
  };

  /* ---------- formatting ---------- */
  const unit = () => 10n ** BigInt(S.dec);
  function fNum(v, decimals, digits) {
    const n = Number(v) / 10 ** decimals;
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e4) return (n / 1e3).toFixed(1) + "K";
    return n.toLocaleString("en-US", { maximumFractionDigits: digits == null ? 2 : digits, minimumFractionDigits: digits === 2 ? 2 : 0 });
  }
  const fUsd = (v) => "$" + fNum(v, S.dec, 2);
  const fTok = (v) => fNum(v, J.COIN_DECIMALS, 2);
  /* price is stablecoin base units per coin base unit, scaled by 1e18 */
  function fPrice(p) {
    const perCoin = Number(p) * 10 ** J.COIN_DECIMALS / 1e18 / 10 ** S.dec;
    return "$" + (perCoin >= 1 ? perCoin.toFixed(2) : perCoin >= 0.01 ? perCoin.toFixed(4) : perCoin.toPrecision(3).replace(/0+$/, "").replace(/\.$/, ""));
  }
  const mcap = (m) => J.marketCap(J.currentPrice(m));
  const soldPct = (m) => Math.min(100, Number(m.floorOut * 10000n / J.SALE_SUPPLY) / 100);
  function parseAmount(text, decimals) {
    const t = String(text || "").replace(/,/g, "").trim();
    if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return null;
    const [a, b = ""] = t.split(".");
    try { return BigInt(a || "0") * 10n ** BigInt(decimals) + BigInt((b + "0".repeat(decimals)).slice(0, decimals) || "0"); } catch (_) { return null; }
  }
  let toastTimer;
  function toast(msg, ms) { const el = $("#toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms || 5000); }
  const tx = (sig) => C.explorer + "/tx/" + sig + (C.clusterParam || "");

  /* ---------- errors ---------- */
  const PROGRAM_ERRORS = {
    6000: "Enter an amount greater than zero.", 6001: "The price moved past the limit. Check the new quote and try again.",
    6002: "The coins above the floor are sold out.", 6003: "More coins offered than are held by buyers.",
    6004: "One wallet can hold 2.5% of the supply at most.", 6005: "The name must be 2 to 32 letters, the ticker 2 to 10, and the details short.",
    6006: "Only the admin can do this.", 6007: "This stablecoin is not supported.", 6008: "The amount is too large."
  };
  function explain(e) {
    const t = String((e && (e.message || e)) || "");
    if ((e && e.code === 4001) || /user rejected|rejected the request|cancell?ed/i.test(t)) return "You cancelled the request in your wallet.";
    const custom = /"Custom":\s*(\d+)/.exec(t) || /custom program error: 0x([0-9a-f]+)/i.exec(t);
    if (custom) { const code = /0x/i.test(custom[0]) ? parseInt(custom[1], 16) : Number(custom[1]); if (PROGRAM_ERRORS[code]) return PROGRAM_ERRORS[code]; if (code === 1) return "Not enough balance for this trade."; }
    if (/may not be used to pay transaction fees|InvalidAccountForFee|no record of a prior credit|insufficient lamports|insufficient funds for (fee|rent)|InsufficientFundsForFee|AccountNotFound/i.test(t))
      return "Your wallet has no SOL on " + C.name + " to pay the network fee." + (!TEST ? " Add a little SOL to it, then try again." : helperKey() ? " Press “Get SOL for fees” in the bar at the top, then try again." : " Get some from faucet.solana.com, then try again.");
    if (/blockhash not found|block height exceeded|expired/i.test(t)) return "The request took too long and expired. Try again.";
    if (/failed to fetch|networkerror|429|too many requests/i.test(t)) return "The Solana network did not answer. Try again in a moment.";
    return t.length > 180 ? t.slice(0, 180) + "…" : t || "Something went wrong.";
  }

  /* ---------- wallet ---------- */
  const findProvider = () => (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom ? window.phantom.solana : window.solana && window.solana.isPhantom ? window.solana : window.solana || null);
  const onPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  async function connect() {
    const p = findProvider();
    if (!p) {
      if (onPhone()) { toast("Opening this page in the Phantom app…"); location.href = "https://phantom.app/ul/browse/" + encodeURIComponent(location.href) + "?ref=" + encodeURIComponent(location.origin); return; }
      toast("No Solana wallet found. Install Phantom, or open this page in Phantom's browser."); return;
    }
    try {
      const r = await p.connect();
      S.provider = p; S.wallet = new web3.PublicKey(String((r && r.publicKey) || p.publicKey));
      if (p.on) p.on("accountChanged", () => location.reload());
      await refresh();
    } catch (e) { toast(explain(e)); }
  }
  /* Ask the wallet to sign, then send through this page's own connection, so the wallet's network setting does not matter. */
  async function send(ixs, extraSigners) {
    const t = new web3.Transaction().add(...ixs);
    t.feePayer = S.wallet;
    const bh = await S.conn.getLatestBlockhash();
    t.recentBlockhash = bh.blockhash;
    const signed = await S.provider.signTransaction(t); // the wallet signs first; the test dollar's public keys sign after
    if (extraSigners && extraSigners.length) signed.partialSign(...extraSigners);
    const sig = await S.conn.sendRawTransaction(signed.serialize());
    const res = await S.conn.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, "confirmed");
    if (res.value.err) throw new Error(JSON.stringify(res.value.err));
    return sig;
  }
  async function run(label, fn) {
    if (S.busy) return;
    if (!S.wallet) { await connect(); if (!S.wallet) return; }
    S.busy = true; document.body.classList.add("busy");
    try { toast(label, 60000); await fn(); }
    catch (e) { toast(explain(e), 8000); }
    // the page counts as busy until it shows the new state, so nothing can be pressed against old numbers
    finally { try { await refresh(); } catch (_) { /* shown on next load */ } S.busy = false; document.body.classList.remove("busy"); }
  }

  /* ---------- reading ---------- */
  async function refresh() {
    S.loadError = "";
    try {
      S.cfg = await J.getConfig(S.conn, S.programId);
      const testMint = J.TEST_DOLLAR.mintKey().publicKey;
      if (S.cfg) {
        const mi = J.decodeMint(await S.conn.getAccountInfo(S.cfg.stableMint));
        S.dec = mi ? mi.decimals : 6;
        S.isTestDollar = S.cfg.stableMint.equals(testMint);
        S.markets = await J.getMarkets(S.conn, S.programId, S.cfg.coinCount, 60);
        S.markets.forEach((m) => { m.meta = J.unpackMeta(m.uri); });
        S.m = S.cur ? S.markets.find((m) => m.coinMint.toBase58() === S.cur) || null : null;
        if (S.cur && !S.m) { const one = await J.getMarket(S.conn, S.programId, new web3.PublicKey(S.cur)); if (one) { one.meta = J.unpackMeta(one.uri); S.m = one; } }
      } else {
        S.stableReady = !!J.decodeMint(await S.conn.getAccountInfo(testMint));
      }
      if (S.wallet) {
        S.sol = BigInt(await S.conn.getBalance(S.wallet));
        if (S.cfg) { const b = await J.getBalances(S.conn, S.wallet, S.cfg.stableMint, S.m ? S.m.coinMint : null); S.stable = b.stable; S.held = b.coin; }
      }
    } catch (e) { S.loadError = explain(e); }
    S.loaded = true;
    render();
  }

  /* ---------- drawing ---------- */
  const ava = (m, cls) => m.meta && m.meta.image
    ? '<span class="ava ' + (cls || "") + '"><img src="' + esc(m.meta.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></span>'
    : '<span class="ava ' + (cls || "") + '" aria-hidden="true">' + esc(m.symbol.slice(0, 2)) + "</span>";
  const pills = (m) => m.graduated ? '<span class="pill floor">Graduated</span>' : '<span class="pill buy">On sale</span>';
  function render() {
    const w = $("#walletBtn");
    w.classList.toggle("on", !!S.wallet);
    $("#walletTxt").textContent = S.wallet ? short(S.wallet.toBase58()) + (S.cfg ? " · " + fUsd(S.stable) : "") : "Connect Phantom";
    const faucet = TEST && S.cfg && S.isTestDollar ? ' <button class="linkbtn" data-act="faucet">Get 10,000 test dollars</button>' : "";
    $("#stripTxt").innerHTML = "<b>" + esc(C.name) + ".</b> " + (TEST ? "Test network. Coins and money here have no value." : "Trades here use real " + esc(CUR) + ".") + faucet +
      (S.wallet && S.sol < LOW_SOL ? " Your wallet has almost no SOL for network fees" + (!TEST ? "." : ": ") + (!TEST ? "" : helperKey()
        ? '<button class="linkbtn" data-act="solFaucet">Get SOL for fees</button>.'
        : '<a class="linkbtn" href="https://faucet.solana.com" target="_blank" rel="noopener">get devnet SOL</a>.') : "");
    $("#specPay").textContent = TEST ? "Test dollars" : CUR;
    for (const v of ["board", "coin", "launch", "setup"]) $("#v-" + v).hidden = v !== shown();
    document.querySelectorAll("nav [data-act=nav]").forEach((b) => b.setAttribute("aria-current", b.dataset.v === S.view ? "page" : "false"));
    if (shown() === "setup") renderSetup();
    else if (S.view === "board") renderBoard();
    else if (S.view === "coin") renderCoin();
    else renderLaunch();
    $("#foot").innerHTML = "Network: " + esc(C.name) + ". Program " + (S.programId ? '<span class="num">' + esc(S.programId.toBase58()) + "</span>" : "not deployed") +
      '. Not audited. Use at your own risk. <a class="linkbtn" href="whitepaper.html">White paper</a>' +
      (C.other ? ' · <a class="linkbtn" href="solana.html?net=' + esc(C.other.key) + '">Switch to ' + esc(C.other.name) + "</a>" : "");
  }
  /* The setup card replaces every view until the program is deployed and initialized. */
  const shown = () => (!S.programId || !S.loaded || S.loadError || !S.cfg ? "setup" : S.view);
  function renderSetup() {
    const el = $("#v-setup");
    if (!S.programId) { el.innerHTML = '<div class="card"><h2>Solana is not live yet</h2><p class="note">The Jisr program has not been deployed to ' + esc(C.name) + ". The Ethereum-family networks are on the <a href=\"./\">main page</a>.</p></div>"; return; }
    if (!S.loaded) { el.innerHTML = '<div class="empty">Reading the program on ' + esc(C.name) + "…</div>"; return; }
    if (S.loadError) { el.innerHTML = '<div class="card"><h2>Could not read the network</h2><p class="note">' + esc(S.loadError) + '</p><button class="btn" data-act="refresh">Try again</button></div>'; return; }
    if (!TEST) { el.innerHTML = '<div class="card"><h2>Not started yet</h2><p class="note">The program is deployed on ' + esc(C.name) + " but the launchpad has not been started. That step is part of the deployment and is not done from this page.</p></div>"; return; }
    el.innerHTML = '<div class="card"><h2>One-time setup</h2>' +
      '<p class="note">The program is deployed but not started. Starting it records the reserve currency and makes the wallet that sends this the admin and the platform wallet. The admin can change the platform wallet and nothing else.</p>' +
      '<div class="kv"><span>1. The test dollar</span><b>' + (S.stableReady ? "Ready" : '<button class="btn" data-act="mkStable">Create it</button>') + "</b></div>" +
      '<div class="kv"><span>2. Start the launchpad with your wallet</span><b><button class="btn primary" data-act="init"' + (S.stableReady ? "" : " disabled") + ">Start</button></b></div>" +
      '<p class="hint">Each step is one transaction from your wallet and needs a little SOL on ' + esc(C.name) + ".</p></div>";
  }
  function renderBoard() {
    $("#specNet").textContent = "On " + C.name;
    renderAdmin();
    const el = $("#rows");
    if (!S.markets.length) { el.innerHTML = '<div class="empty">No coins yet on ' + esc(C.name) + '. <button class="linkbtn" data-act="nav" data-v="launch">Launch the first one.</button></div>'; return; }
    el.innerHTML = S.markets.map((m) =>
      '<button class="row" data-act="open" data-v="' + esc(m.coinMint.toBase58()) + '">' + ava(m) +
      '<span><span class="name">' + esc(m.name) + '</span><br><span class="tick">$' + esc(m.symbol) + " · " + short(m.coinMint.toBase58()) + "</span></span>" +
      '<span class="mc">' + fUsd(mcap(m)) + "<small>MARKET CAP</small></span>" +
      '<span class="prog"><span class="runway' + (m.graduated ? " done" : "") + '" role="img" aria-label="' + Math.floor(soldPct(m)) + ' percent of the sale sold"><i style="width:' + soldPct(m) + '%"></i></span></span>' +
      '<span class="st">' + pills(m) + "</span></button>").join("");
  }
  /* Shown only to the admin wallet and to a wallet named as the next admin. The admin can change the wallet
     that receives the launchpad's 2% fee and hand the admin role on. The program gives the admin no other power. */
  function renderAdmin() {
    const el = $("#adminBox"), c = S.cfg, w = S.wallet;
    const isAdmin = w && c && c.admin.equals(w), isNext = w && c && c.pendingAdmin.equals(w);
    if (!isAdmin && !isNext) { el.innerHTML = ""; return; }
    const waiting = !c.pendingAdmin.equals(web3.PublicKey.default);
    el.innerHTML = '<div class="card"><span class="label">Launchpad admin</span>' +
      (isNext ? '<p class="note">This wallet has been named the next admin of the launchpad. Accepting takes the role over from <span class="num">' + short(c.admin.toBase58()) + '</span>.</p><button class="btn primary" data-act="admAccept">Accept the admin role</button>' : "") +
      (isAdmin ? '<p class="note">Your wallet is the admin. The admin can change the wallet that receives the launchpad&#39;s 2% fee and hand the admin role on. It cannot touch any coin or any reserve.</p>' +
        '<div class="kv"><span>Platform wallet now</span><b class="num">' + short(c.platformWallet.toBase58()) + "</b></div>" +
        '<div class="field"><label for="admWallet">New platform wallet</label><input type="text" id="admWallet" autocomplete="off" placeholder="Solana wallet address"></div>' +
        '<button class="btn" data-act="admWallet">Change the platform wallet</button>' +
        '<div class="field"><label for="admNext">Hand the admin role to</label><input type="text" id="admNext" autocomplete="off" placeholder="Solana wallet address"></div>' +
        '<button class="btn" data-act="admNext">Name the next admin</button>' +
        '<p class="hint">' + (waiting ? 'Waiting for <span class="num">' + short(c.pendingAdmin.toBase58()) + "</span> to accept. Until then you stay the admin." : "The wallet you name becomes the admin only after it accepts here. Until then you stay the admin.") + "</p>" : "") +
      '<div class="err" id="admErr" role="alert" hidden></div></div>';
  }
  function renderCoin() {
    const m = S.m, el = $("#v-coin");
    if (!m) { el.innerHTML = '<button class="back" data-act="nav" data-v="board">← All coins</button><div class="empty">Coin not found.</div>'; return; }
    const out = m.floorOut + m.curveOut, liability = (out * m.floorPrice + J.PRICE_SCALE - 1n) / J.PRICE_SCALE;
    const cover = out === 0n ? null : Number(m.floorReserve * 10000n / (liability || 1n)) / 100;
    const rise = Number((m.floorPrice - m.salePrice) * 1000000n / m.salePrice) / 10000;
    const links = [["X", m.meta.x], ["Telegram", m.meta.telegram], ["Website", m.meta.website]].filter((l) => l[1]);
    const mine = S.wallet && m.creator.equals(S.wallet);
    el.innerHTML =
      '<button class="back" data-act="nav" data-v="board">← All coins</button>' +
      '<div class="chead">' + ava(m, "big") + "<div><h1>" + esc(m.name) + '</h1><p><span class="num">$' + esc(m.symbol) + '</span> · created by <span class="num">' + short(m.creator.toBase58()) + "</span>" + (mine ? " (you)" : "") + " · " + esc(C.name) + "</p></div></div>" +
      (m.meta.description || links.length ? '<div class="about">' + (m.meta.description ? "<p>" + esc(m.meta.description) + "</p>" : "") +
        (links.length ? '<div class="chips">' + links.map((l) => '<a class="chip sm" href="' + esc(l[1]) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(l[0]) + " ↗</a>").join("") + "</div>" : "") +
        '<p class="hint">Written by the coin\'s creator. The launchpad does not check it.</p></div>' : "") +
      '<div class="cgrid"><div class="col">' +
        '<div class="card stats o1"><div><strong>' + fUsd(mcap(m)) + "</strong><small>Market cap</small></div><div><strong>" + fPrice(J.currentPrice(m)) + "</strong><small>" + (m.graduated ? "Price" : "Fixed sale price") + "</small></div><div><strong>" + fTok(S.held) + "</strong><small>You hold</small></div></div>" +
        '<div class="card o2"><div class="gradline"><span class="label">' + (m.graduated ? "Graduated" : "Sale progress") + '</span><span class="pills">' + pills(m) + "</span></div>" +
          '<div class="runway' + (m.graduated ? " done" : "") + '"><i style="width:' + soldPct(m) + '%"></i></div><p class="note">' + fTok(out) + " of 1.00B coins are held by buyers.</p></div>" +
        '<div class="card"><span class="label">Floor cover</span><div class="wallbox">' +
          '<div class="kv"><span>In the floor reserve</span><b class="num">' + fUsd(m.floorReserve) + "</b></div>" +
          '<div class="kv"><span>Needed to buy back every coin</span><b class="num">' + fUsd(liability) + "</b></div>" +
          '<div class="kv"><span>Cover</span><b class="num">' + (cover === null ? "No coins sold yet" : Math.floor(cover * 10) / 10 + "%") + "</b></div>" +
          '<div class="kv"><span>Floor price</span><b class="num">' + fPrice(m.floorPrice) + (rise > 0.005 ? " · up " + rise.toFixed(2) + "%" : "") + "</b></div></div></div>" +
        '<div class="card"><span class="label">Fees waiting</span><div class="wallbox">' +
          '<div class="kv"><span>For the creator</span><b class="num">' + fUsd(m.creatorFees) + (m.creatorFees > 0n ? ' <button class="chip sm" data-act="payCreator">Pay the creator</button>' : "") + "</b></div>" +
          '<div class="kv"><span>For the launchpad</span><b class="num">' + fUsd(m.platformFees) + (m.platformFees > 0n ? ' <button class="chip sm" data-act="payPlatform">Pay the launchpad</button>' : "") + "</b></div>" +
          '<p class="hint">Fees are paid out automatically with every trade made on this page. A fee waits here only when its wallet could not receive it at that moment; then anyone can press Pay, and the money goes only to the creator and to the launchpad\'s wallet.</p></div></div>' +
      '</div><div class="side"><div class="card" id="trade"></div></div></div>';
    renderTrade();
  }
  function renderTrade() {
    const m = S.m, el = $("#trade"); if (!m || !el) return;
    const buy = S.tab === "buy";
    el.innerHTML =
      '<div class="tabs" role="tablist"><button role="tab" data-act="tab" data-v="buy" aria-selected="' + buy + '">Buy</button><button role="tab" data-act="tab" data-v="sell" aria-selected="' + !buy + '">Sell</button></div>' +
      (buy
        ? '<div class="field"><label for="buyAmt">You pay</label><div class="amt-in"><input id="buyAmt" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(S.buyAmt) + '"><span>' + esc(CUR) + "</span></div>" + '<div class="hint">Your balance: ' + fUsd(S.stable) + "</div></div>"
        : '<div class="field"><label for="sellAmt">You sell</label><div class="amt-in"><input id="sellAmt" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(S.sellAmt) + '"><span>$' + esc(m.symbol) + '</span></div><div class="hint">You hold ' + fTok(S.held) + ' <button class="linkbtn" data-act="sellMax">Sell all</button></div></div>') +
      '<div id="quote" class="quote"></div><button class="btn ' + (buy ? "primary" : "sell") + ' wide" id="goBtn" data-act="' + (buy ? "buy" : "sell") + '">' + (buy ? "Buy" : "Sell") + " $" + esc(m.symbol) + "</button>";
    renderQuote();
  }
  /* The plan for the amount typed: what will be sent, and the lines to show. */
  function plan() {
    const m = S.m;
    try {
      if (S.tab === "buy") {
        const budget = parseAmount(S.buyAmt, S.dec);
        if (!budget) return { html: "" };
        if (S.held >= J.MAX_WALLET) return { html: '<div class="warn">Your wallet already holds the most one wallet may hold: 2.5% of the supply.</div>' };
        const coins = J.coinsForBudget(m, budget, S.held);
        if (coins === 0n) return { html: '<div class="warn">That amount is too small to buy a coin, or the coin is sold out.</div>' };
        const q = J.quoteBuy(m, coins), capped = coins === J.MAX_WALLET - S.held && J.quoteBuy(m, coins).total < budget - unit() / 100n;
        return { ok: true, kind: "buy", coins, q, html:
          '<div class="kv"><span>Coins you receive</span><b>' + fTok(coins) + " $" + esc(m.symbol) + "</b></div>" +
          '<div class="kv"><span>Fee (5%)</span><b>' + fUsd(q.fee) + "</b></div>" +
          '<div class="kv big"><span>You pay</span><b>' + fUsd(q.total) + "</b></div>" +
          (capped ? '<div class="sub">Limited to the 2.5% a wallet may hold.</div>' : "") +
          (S.wallet && q.total > S.stable ? '<div class="warn">You have ' + fUsd(S.stable) + (TEST ? ". Get test dollars from the bar at the top." : " in " + esc(CUR) + ".") + "</div>" : "") };
      }
      const coins = parseAmount(S.sellAmt, J.COIN_DECIMALS);
      if (!coins) return { html: "" };
      if (S.wallet && coins > S.held) return { html: '<div class="warn">You hold ' + fTok(S.held) + " $" + esc(m.symbol) + ".</div>" };
      const q = J.quoteSell(m, coins);
      return { ok: true, kind: "sell", coins, q, html:
        '<div class="kv"><span>Sale value</span><b>' + fUsd(q.gross) + "</b></div>" +
        '<div class="kv"><span>Fee (5%)</span><b>' + fUsd(q.fee) + "</b></div>" +
        '<div class="kv big"><span>You receive</span><b>' + fUsd(q.net) + "</b></div>" };
    } catch (e) { return { html: '<div class="warn">' + esc(explain(/SoldOut/.test(String(e.message)) ? { message: '"Custom":6002' } : /NotOutstanding/.test(String(e.message)) ? { message: '"Custom":6003' } : e)) + "</div>" }; }
  }
  function renderQuote() { const p = plan(), q = $("#quote"), b = $("#goBtn"); if (q) q.innerHTML = p.html; if (b) b.disabled = !p.ok; }
  function renderLaunch() {
    const l = $("#lTerms"); if (l) l.textContent = S.cfg ? "Every coin sells its first 800M coins at " + fPrice(S.cfg.salePrice) + " each, a " + fUsd(J.marketCap(S.cfg.salePrice)) + " market cap." : "";
  }

  /* ---------- actions ---------- */
  const mk = () => S.m.coinMint;
  /* Every trade made here also pays out the fees: the creator's and the launchpad's go to their wallets in
     the same transaction, so nobody has to press Pay. A payout is added only when it is certain to go
     through (see readyPayoutIxs); otherwise the trade goes alone and the fee waits in the coin's market. */
  async function payouts(q) {
    try { return await J.readyPayoutIxs(S.conn, S.programId, S.cfg.stableMint, mk(), S.m.creator, S.cfg.platformWallet, q.creatorFee > 0n, q.platformFee > 0n); }
    catch (_) { return []; }
  }
  async function doBuy() {
    await run("Confirm the purchase in your wallet…", async () => {
      await refresh(); const p = plan(); if (!p.ok || p.kind !== "buy") return;
      const maxIn = p.q.total + p.q.total * SLIP_BPS / 10000n;
      await send(J.buyIxs(S.programId, S.wallet, S.cfg.stableMint, mk(), p.coins, maxIn).concat(await payouts(p.q)));
      S.buyAmt = ""; toast("Bought " + fTok(p.coins) + " $" + S.m.symbol + ".");
    });
  }
  async function doSell() {
    await run("Confirm the sale in your wallet…", async () => {
      await refresh(); const p = plan(); if (!p.ok || p.kind !== "sell") return;
      const minOut = p.q.net - p.q.net * SLIP_BPS / 10000n;
      await send(J.sellIxs(S.programId, S.wallet, S.cfg.stableMint, mk(), p.coins, minOut).concat(await payouts(p.q)));
      S.sellAmt = ""; toast("Sold " + fTok(p.coins) + " $" + S.m.symbol + " for about " + fUsd(p.q.net) + ".");
    });
  }
  async function doLaunch() {
    const name = $("#lName").value.trim(), symbol = $("#lTicker").value.trim().toUpperCase(), err = $("#lErr");
    const link = (id) => { const v = $(id).value.trim(); return v && !/^https:\/\//i.test(v) ? "https://" + v.replace(/^https?:\/\//i, "") : v; };
    const details = J.packMeta({ description: $("#lDesc").value.trim(), image: link("#lImg"), x: link("#l-x"), telegram: link("#l-telegram"), website: link("#l-website") });
    const bad = J.byteLength(name) < 2 || J.byteLength(name) > 32 ? "The name must be 2 to 32 letters."
      : !/^[A-Z0-9]{2,10}$/.test(symbol) ? "The ticker must be 2 to 10 letters or digits."
      : J.byteLength(details) > J.MAX_URI_BYTES ? "The description and links are too long together: " + J.byteLength(details) + " of " + J.MAX_URI_BYTES + " bytes. Shorten the description."
      : "";
    err.textContent = bad; err.hidden = !bad;
    if (bad) return;
    await run("Confirm the launch in your wallet…", async () => {
      const cfg = await J.getConfig(S.conn, S.programId);
      // what wallets will show for this coin. Settings: metadata "off" launches with no wallet metadata;
      // metadata false is the first devnet build, which has no such step
      const market = J.marketAddress(S.programId, J.coinMintAddress(S.programId, cfg.coinCount));
      const link = C.metadata === false ? undefined : C.metadata === "off" ? null : J.metadataUri(C.metadataBase, market);
      if (link && J.byteLength(link) > J.MAX_METADATA_URI) throw new Error("The metadata service address in the settings is too long.");
      const made = J.createCoinIxs(S.programId, S.wallet, cfg.stableMint, cfg.coinCount, name, symbol, details, link);
      await send(made.ixs);
      for (const id of ["#lName", "#lTicker", "#lDesc", "#lImg", "#l-x", "#l-telegram", "#l-website"]) $(id).value = "";
      S.cur = made.coinMint.toBase58(); S.view = "coin"; location.hash = "coin/" + S.cur;
      toast("$" + symbol + " is live.");
    });
  }
  const doFaucet = () => run("Confirm in your wallet to receive test dollars…", async () => {
    await send(J.testDollarFaucetIxs(S.wallet, S.wallet, 10000n * unit()), [J.TEST_DOLLAR.faucetKey()]);
    toast("10,000 test dollars added to your wallet.");
  });
  const doMkStable = () => run("Confirm in your wallet to create the test dollar…", async () => {
    const rent = await S.conn.getMinimumBalanceForRentExemption(82);
    await send(J.createTestDollarIxs(S.wallet, rent), [J.TEST_DOLLAR.mintKey()]);
    toast("The test dollar exists now.");
  });
  const doInit = () => run("Confirm in your wallet to start the launchpad…", async () => {
    await send([J.initializeIx(S.programId, S.wallet, J.TEST_DOLLAR.mintKey().publicKey, S.wallet)]);
    toast("The launchpad is started. Your wallet is the admin and the platform wallet.");
  });
  const doPay = (creator) => run("Confirm in your wallet…", async () => {
    await send(creator ? J.claimCreatorFeesIxs(S.programId, S.wallet, S.cfg.stableMint, mk(), S.m.creator) : J.sweepPlatformFeesIxs(S.programId, S.wallet, S.cfg.stableMint, mk(), S.cfg.platformWallet));
    toast(creator ? "The creator was paid." : "The launchpad was paid.");
  });

  /* Admin actions. An address is checked before the wallet is asked to sign. */
  function addressFrom(id) {
    const v = ($(id) || {}).value || "", err = $("#admErr");
    let key = null;
    try { key = new web3.PublicKey(v.trim()); } catch (_) { key = null; }
    const bad = !key ? "That is not a Solana address." : !web3.PublicKey.isOnCurve(key.toBytes()) ? "That address is not a wallet. Use a wallet address, not a token account or a program." : "";
    if (err) { err.textContent = bad; err.hidden = !bad; }
    return bad ? null : key;
  }
  function doAdmWallet() {
    const key = addressFrom("#admWallet"); if (!key) return;
    run("Confirm in your wallet to change the platform wallet…", async () => {
      await send([J.setPlatformWalletIx(S.programId, S.wallet, key)]);
      toast("The platform wallet is now " + short(key.toBase58()) + ".");
    });
  }
  function doAdmNext() {
    const key = addressFrom("#admNext"); if (!key) return;
    run("Confirm in your wallet to name the next admin…", async () => {
      await send([J.proposeAdminIx(S.programId, S.wallet, key)]);
      toast(short(key.toBase58()) + " can now accept the admin role.");
    });
  }
  const doAdmAccept = () => run("Confirm in your wallet to accept the admin role…", async () => {
    await send([J.acceptAdminIx(S.programId, S.wallet)]);
    toast("Your wallet is now the admin.");
  });

  /* A little SOL for network fees, from what is left at the public devnet deployer address. The transfer is
     signed and paid by that public key, so a wallet with nothing at all can receive it. Test networks only. */
  const LOW_SOL = 10000000n, HELP_LAMPORTS = 200000000; // below 0.01 SOL is "almost none"; the gift is 0.2 SOL
  function helperKey() {
    const h = C.feeHelperSeed;
    if (!TEST || !/^[0-9a-f]{64}$/.test(h || "")) return null;
    try { return web3.Keypair.fromSeed(Uint8Array.from(h.match(/../g).map((b) => parseInt(b, 16)))); } catch (_) { return null; }
  }
  async function doSolFaucet() {
    const kp = helperKey();
    if (!kp || S.busy) return;
    if (!S.wallet) { await connect(); if (!S.wallet) return; }
    S.busy = true; document.body.classList.add("busy");
    try {
      toast("Sending a little SOL to your wallet…", 60000);
      if (BigInt(await S.conn.getBalance(S.wallet)) >= LOW_SOL) { toast("Your wallet already has SOL for fees."); return; }
      if ((await S.conn.getBalance(kp.publicKey)) < HELP_LAMPORTS + 10000000) { toast("The shared devnet SOL is used up. Get some for your wallet at faucet.solana.com (choose devnet).", 9000); return; }
      const t = new web3.Transaction().add(web3.SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: S.wallet, lamports: HELP_LAMPORTS }));
      t.feePayer = kp.publicKey;
      const bh = await S.conn.getLatestBlockhash();
      t.recentBlockhash = bh.blockhash;
      t.sign(kp);
      const sig = await S.conn.sendRawTransaction(t.serialize());
      const res = await S.conn.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, "confirmed");
      if (res.value.err) throw new Error(JSON.stringify(res.value.err));
      toast("0.2 SOL added to your wallet for network fees.");
    } catch (e) { toast(explain(e), 8000); }
    // the page counts as busy until it shows the new state, so nothing can be pressed against old numbers
    finally { try { await refresh(); } catch (_) { /* shown on next load */ } S.busy = false; document.body.classList.remove("busy"); }
  }

  /* ---------- wiring ---------- */
  function go(view, cur) {
    S.view = view; S.cur = cur || null; S.m = cur ? S.markets.find((m) => m.coinMint.toBase58() === cur) || null : null; S.held = 0n;
    const h = view === "coin" ? "coin/" + cur : view;
    if (location.hash.slice(1) !== h) location.hash = h;
    render(); window.scrollTo(0, 0);
    if (view === "coin" && S.programId) refresh();
  }
  function route() {
    const h = location.hash.slice(1);
    if (/^coin\/[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(h)) { S.view = "coin"; S.cur = h.slice(5); }
    else S.view = h === "launch" ? "launch" : "board";
  }
  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act, v = b.dataset.v;
    if (a === "connect") connect();
    else if (a === "nav") go(v);
    else if (a === "open") go("coin", v);
    else if (a === "refresh") refresh();
    else if (a === "tab") { S.tab = v; renderTrade(); }
    else if (a === "sellMax") { S.sellAmt = (Number(S.held) / 10 ** J.COIN_DECIMALS).toString(); renderTrade(); }
    else if (a === "buy") doBuy();
    else if (a === "sell") doSell();
    else if (a === "launch") doLaunch();
    else if (a === "faucet") doFaucet();
    else if (a === "solFaucet") doSolFaucet();
    else if (a === "mkStable") doMkStable();
    else if (a === "init") doInit();
    else if (a === "payCreator") doPay(true);
    else if (a === "payPlatform") doPay(false);
    else if (a === "admWallet") doAdmWallet();
    else if (a === "admNext") doAdmNext();
    else if (a === "admAccept") doAdmAccept();
  });
  document.addEventListener("input", (ev) => {
    if (ev.target.id === "buyAmt") { S.buyAmt = ev.target.value; renderQuote(); }
    else if (ev.target.id === "sellAmt") { S.sellAmt = ev.target.value; renderQuote(); }
  });
  window.addEventListener("hashchange", () => { const was = S.cur; route(); if (S.cur !== was) { S.m = null; S.held = 0n; } render(); if (S.programId) refresh(); });

  route();
  if (C.programId) {
    try { S.programId = new web3.PublicKey(C.programId); S.conn = new web3.Connection(C.rpcUrl, "confirmed"); } catch (_) { S.programId = null; }
  }
  render();
  if (S.programId) {
    refresh();
    // keep prices fresh while a coin is open, unless the visitor is typing or a request is running
    setInterval(() => { if (S.view === "coin" && !S.busy && document.visibilityState === "visible" && !["buyAmt", "sellAmt"].includes((document.activeElement || {}).id)) refresh(); }, 20000);
  }
  window.JISR_SOLANA_APP = { state: S, refresh };
})();
