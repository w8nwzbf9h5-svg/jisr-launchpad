/* Jisr Launchpad web app. No build step: plain script, ethers v6 from vendor/.
   Everything shown on screen is read from the chain. Nothing is stored on a server. */
(function () {
  "use strict";
  const { ethers } = window;
  const CFG = window.JISR_CONFIG;

  const E18 = 10n ** 18n, SCALE = 10n ** 36n, BPS = 10000n;
  const TOTAL = 1_000_000_000n * E18, SALE = 800_000_000n * E18, CURVE = 200_000_000n * E18, CURVE_MAX = 190_000_000n * E18;
  const MAX_WALLET = 25_000_000n * E18;
  const FEE = 500n, CREATOR = 100n, PLATFORM = 200n;

  const FACTORY_ABI = [
    "function coinCount() view returns (uint256)",
    "function coins(uint256) view returns (address)",
    "function marketOf(address) view returns (address)",
    "function stable() view returns (address)",
    "function router() view returns (address)",
    "function wrappedNative() view returns (address)",
    "function platformWallet() view returns (address)",
    "function saleMarketCap() view returns (uint256)",
    "function createCoin(string name, string symbol, string metadataURI) returns (address coin, address market)",
    "event CoinCreated(address indexed creator, address indexed coin, address indexed market, string name, string symbol, string metadataURI)",
    "error BadName()"
  ];
  const MARKET_ABI = [
    "function creator() view returns (address)",
    "function salePrice() view returns (uint256)",
    "function floorPrice() view returns (uint256)",
    "function floorOut() view returns (uint256)",
    "function curveOut() view returns (uint256)",
    "function floorReserve() view returns (uint256)",
    "function premiumReserve() view returns (uint256)",
    "function creatorFees() view returns (uint256)",
    "function platformFees() view returns (uint256)",
    "function graduated() view returns (bool)",
    "function currentPrice() view returns (uint256)",
    "function floorLiability() view returns (uint256)",
    "function buy(uint256 coinsOut, uint256 maxStableIn, uint256 deadline) returns (uint256)",
    "function buyWithNative(uint256 coinsOut, uint256 deadline) payable returns (uint256, uint256)",
    "function sell(uint256 coinsIn, uint256 minStableOut, address to, uint256 deadline) returns (uint256)",
    "function sellForNative(uint256 coinsIn, uint256 minNativeOut, address to, uint256 deadline) returns (uint256)",
    "function claimCreatorFees() returns (uint256)",
    "function sweepPlatformFees() returns (uint256)",
    "event Bought(address indexed buyer, uint256 coins, uint256 stablePaid, bool paidInNative)",
    "event Sold(address indexed seller, address indexed to, uint256 coins, uint256 stableOut, bool paidInNative)",
    "error ZeroAmount()", "error Expired()", "error Slippage()", "error SoldOut()", "error NotOutstanding()",
    "error ShortPayment()", "error RefundFailed()", "error OnlyRouter()", "error WalletLimit()", "error NativeNotSupported()"
  ];
  const COIN_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function metadataURI() view returns (string)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "error WalletLimit()"
  ];
  const ERC20_ABI = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256)",
    "function mint(address,uint256)"
  ];
  // The helper that sells a coin here and sends the USDC to another network through Circle's CCTP.
  const BRIDGE_ABI = [
    "function sellAndBridge(address coin, uint256 coinsIn, uint256 minStableOut, uint32 destinationDomain, bytes32 mintRecipient, uint256 maxFee, uint32 minFinalityThreshold, bool forward, uint256 deadline) returns (uint256)",
    "error ZeroAmount()", "error UnknownCoin()", "error NoRecipient()", "error FeeTooHigh()"
  ];
  const TRANSMITTER_ABI = ["function receiveMessage(bytes message, bytes attestation) returns (bool)"];
  const ROUTER_ABI = [
    "function getAmountsIn(uint256 amountOut, address[] path) view returns (uint256[])",
    "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])"
  ];
  const ERRORS = {
    WalletLimit: "One wallet can hold 2.5% of a coin's supply at most.",
    Slippage: "The price moved before your trade went through. Try again.",
    Expired: "The request took too long. Try again.",
    SoldOut: "The last coins above the floor are sold out.",
    ZeroAmount: "Enter an amount first.",
    ShortPayment: "The payment arrived short. Nothing was bought.",
    BadName: "The name needs 2 to 32 characters and the ticker 2 to 10.",
    NotOutstanding: "Those coins cannot be sold here.",
    RefundFailed: "Your wallet refused the refund of unused funds.",
    NativeNotSupported: "This network has no swap route, so pay and receive in the reserve currency."
  };

  /* ---------- pricing, mirrored from CoinMarket.sol so quotes need one read ---------- */
  function mulDiv(a, b, d, up) { const p = a * b; let q = p / d; if (up && p % d !== 0n) q += 1n; return q; }
  function premium(m, s, up) { return s === 0n ? 0n : mulDiv(mulDiv(s, s, CURVE - s, up), m.salePrice, SCALE, up); }
  function quoteBuy(m, coins) {
    const fromFloor = coins < SALE - m.floorOut ? coins : SALE - m.floorOut;
    const fromCurve = coins - fromFloor;
    if (m.curveOut + fromCurve > CURVE_MAX) return null;
    const floorPart = mulDiv(coins, m.floorPrice, SCALE, true);
    const premiumPart = fromCurve > 0n ? premium(m, m.curveOut + fromCurve, true) - premium(m, m.curveOut, false) : 0n;
    const base = floorPart + premiumPart;
    const total = mulDiv(base, BPS, BPS - FEE, true);
    const creatorFee = total * CREATOR / BPS, platformFee = total * PLATFORM / BPS;
    return { fromFloor, fromCurve, floorPart, premiumPart, total, creatorFee, platformFee, communityFee: total - base - creatorFee - platformFee };
  }
  function quoteSell(m, coins) {
    const fromCurve = coins < m.curveOut ? coins : m.curveOut;
    const fromFloor = coins - fromCurve;
    if (fromFloor > m.floorOut) return null;
    const floorPart = mulDiv(coins, m.floorPrice, SCALE, false);
    let premiumPart = 0n;
    if (fromCurve > 0n) {
      const hi = premium(m, m.curveOut, false), lo = premium(m, m.curveOut - fromCurve, true);
      premiumPart = hi > lo ? hi - lo : 0n;
      if (premiumPart > m.premiumReserve) premiumPart = m.premiumReserve;
    }
    const gross = floorPart + premiumPart;
    const creatorFee = gross * CREATOR / BPS, platformFee = gross * PLATFORM / BPS, communityFee = gross * (FEE - CREATOR - PLATFORM) / BPS;
    return { fromCurve, fromFloor, floorPart, premiumPart, gross, creatorFee, platformFee, communityFee, net: gross - creatorFee - platformFee - communityFee };
  }
  /* Most coins a budget buys, fees included, without passing the wallet limit. */
  function coinsForBudget(m, budget, room) {
    let hi = (SALE - m.floorOut) + (CURVE_MAX - m.curveOut);
    if (room < hi) hi = room;
    if (hi <= 0n) return 0n;
    const fits = c => { const q = quoteBuy(m, c); return q && q.total <= budget; };
    if (fits(hi)) return hi;
    let lo = 0n;
    while (hi - lo > 10n ** 12n) { const mid = (lo + hi) / 2n; if (fits(mid)) lo = mid; else hi = mid; }
    return lo;
  }
  window.JISR_MATH = { quoteBuy, quoteSell, coinsForBudget };

  /* ---------- state ---------- */
  const S = {
    chainId: null, cfg: null, ro: null, wallet: null, signer: null, account: null,
    factory: null, stable: null, router: null, weth: null,
    view: "board", cur: null, m: null, board: [],
    tab: "buy", payWith: "stable", recvIn: "stable", recvOn: "", feeCache: {}, buyAmt: "", sellAmt: "", plan: null, busy: false, quoteSeq: 0
  };
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const short = a => a ? a.slice(0, 6) + "…" + a.slice(-4) : "";

  /* ---------- formatting ---------- */
  const usdNum = v => Number(ethers.formatUnits(v, S.stable.dec));
  function fQuote(n) {
    const a = Math.abs(n); let t;
    if (a === 0) t = "0";
    else if (a >= 1e6) t = (n / 1e6).toFixed(2) + "M";
    else if (a >= 1e4) t = (n / 1e3).toFixed(1) + "K";
    else if (a >= 1) t = n.toLocaleString("en-US", { maximumFractionDigits: 2 });
    else t = String(Number(n.toPrecision(3)));
    return t + " " + S.stable.symbol;
  }
  /* A value in the reserve currency: "$1,234" for a dollar stablecoin, "4.2 mTSLA" for anything else. */
  function fUsd(v) {
    const n = typeof v === "bigint" ? usdNum(v) : v, a = Math.abs(n);
    if (S.stable && !S.stable.isUsd) return fQuote(n);
    if (a < 0.005) return "$0";
    if (a >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (a >= 1e4) return "$" + (n / 1e3).toFixed(1) + "K";
    if (a >= 100) return "$" + Math.round(n).toLocaleString("en-US");
    return "$" + n.toFixed(2);
  }
  const priceNum = p => Number(ethers.formatUnits(p, 18 + S.stable.dec));
  function fPrice(p) {
    const n = priceNum(p), d = Math.max(2, Math.ceil(-Math.log10(n)) + 2), t = n.toFixed(Math.min(14, d));
    return S.stable && !S.stable.isUsd ? t + " " + S.stable.symbol : "$" + t;
  }
  function fTok(v) {
    const n = Number(ethers.formatUnits(v, 18));
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : 2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function fNative(v) { return Number(Number(ethers.formatEther(v)).toPrecision(5)).toLocaleString("en-US", { maximumFractionDigits: 8 }) + " " + S.cfg.native; }
  function fStable(v) { return usdNum(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + S.stable.symbol; }
  const mcap = p => priceNum(p) * 1e9;

  /* ---------- coin details stored with the coin ----------
     The contract keeps one text field per coin. The app writes a small JSON object into it: description,
     picture and links. Anyone can launch a coin, so everything read back is treated as untrusted:
     text is escaped, pictures must be https links or small PNG/JPEG/WebP data, links must be https. */
  const MAX_IMAGE_CHARS = 24000;
  function cleanImage(v) {
    if (typeof v !== "string") return "";
    if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= MAX_IMAGE_CHARS) return v;
    if (/^https:\/\/[^\s"'<>]{4,300}$/.test(v)) return v;
    return "";
  }
  function cleanLink(v, hosts) {
    if (typeof v !== "string") return "";
    let u; try { u = new URL(v.trim()); } catch (_) { return ""; }
    if (u.protocol !== "https:" || u.username || u.password) return "";
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (hosts && !hosts.includes(host)) return "";
    return u.href.length <= 200 ? u.href : "";
  }
  const LINKS = [["x", "X", ["x.com", "twitter.com"]], ["telegram", "Telegram", ["t.me", "telegram.me"]], ["website", "Website", null]];
  function parseMeta(uri) {
    const out = { description: "", image: "", links: [] };
    if (typeof uri !== "string" || !uri) return out;
    let o = null;
    if (uri[0] === "{") { try { o = JSON.parse(uri); } catch (_) { o = null; } }
    if (!o || typeof o !== "object") { out.image = cleanImage(uri); return out; }
    if (typeof o.description === "string") out.description = o.description.slice(0, 280);
    out.image = cleanImage(o.image);
    for (const [key, label, hosts] of LINKS) { const href = cleanLink(o[key], hosts); if (href) out.links.push({ label, href }); }
    return out;
  }
  function ava(m, cls) {
    const img = m.meta && m.meta.image;
    return img
      ? '<span class="ava ' + (cls || "") + '"><img src="' + esc(img) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></span>'
      : '<span class="ava ' + (cls || "") + '" aria-hidden="true">' + esc(m.symbol.slice(0, 2)) + "</span>";
  }
  /* Shrink a chosen photo to a small centred square so it can be stored with the coin. */
  async function shrinkPhoto(file) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Choose a PNG, JPEG or WebP picture.");
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That file could not be read as a picture.")); i.src = url; });
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      if (!side) throw new Error("That picture is empty.");
      for (const [px, q] of [[128, 0.8], [112, 0.7], [96, 0.65], [80, 0.6], [64, 0.55]]) {
        const c = document.createElement("canvas"); c.width = px; c.height = px;
        const g = c.getContext("2d");
        g.fillStyle = "#ffffff"; g.fillRect(0, 0, px, px);
        g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, px, px);
        let data = c.toDataURL("image/webp", q);
        if (!data.startsWith("data:image/webp")) data = c.toDataURL("image/jpeg", q);
        if (data.length <= 9000 || px === 64) return data;
      }
    } finally { URL.revokeObjectURL(url); }
  }

  /* ---------- toast + errors ---------- */
  let toastTimer;
  function toast(msg, ms) { const el = $("#toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms || 5000); }
  function explain(e) {
    if (!e) return "Something went wrong.";
    if (window.JISR_WALLET.rejected(e)) return "You cancelled the request in your wallet.";
    if (window.JISR_WALLET.notPermitted(e)) return "Your wallet has not allowed this site to use your account on " + (S.cfg ? S.cfg.name : "this network") + ". Open this site's permissions in your wallet and allow the account on that network, or disconnect and connect again.";
    const name = (e.revert && e.revert.name) || findErrorName(e);
    if (name && ERRORS[name]) return ERRORS[name];
    const txt = window.JISR_WALLET.detail(e) || String(e);
    if (/insufficient funds/i.test(txt)) return "Your wallet does not have enough " + (S.cfg ? S.cfg.native : "funds") + " for this and the network fee.";
    if (/EXCESSIVE_INPUT_AMOUNT|INSUFFICIENT_OUTPUT_AMOUNT/.test(txt)) return ERRORS.Slippage;
    if (/exceeds balance|ERC20InsufficientBalance/.test(txt)) return "Your wallet does not hold enough for this trade.";
    return txt.length > 160 ? txt.slice(0, 160) + "…" : txt;
  }
  function findErrorName(e) {
    const data = e.data || (e.info && e.info.error && e.info.error.data) || (e.error && e.error.data);
    const hex = typeof data === "string" ? data : data && data.data;
    if (typeof hex !== "string" || hex.length < 10) return null;
    for (const abi of [MARKET_ABI, FACTORY_ABI]) {
      try { const p = new ethers.Interface(abi).parseError(hex); if (p) return p.name; } catch (_) { /* keep looking */ }
    }
    return null;
  }

  /* ---------- network + wallet ---------- */
  /* One entry per factory. A network can have several, one for each currency coins can be priced in. */
  function markets() {
    const out = [];
    for (const id of Object.keys(CFG.chains)) {
      const c = CFG.chains[id];
      [c.factory].concat(c.extraFactories || []).filter(f => ethers.isAddress(f || "")).forEach((f, i) => out.push({ key: id + ":" + i, id, factory: f }));
    }
    return out;
  }
  async function setChain(key) {
    const mk = markets().find(x => x.key === key) || markets()[0];
    S.marketKey = mk.key; S.chainId = mk.id; S.cfg = Object.assign({}, CFG.chains[mk.id], { factory: mk.factory });
    // the cross-network sale helper deployed for this factory, if any
    const brs = CFG.chains[mk.id].bridges || {}, brKey = Object.keys(brs).find(k => k.toLowerCase() === mk.factory.toLowerCase());
    S.cfg.bridge = brKey && ethers.isAddress(brs[brKey] || "") ? brs[brKey] : null;
    S.recvOn = "";
    try { localStorage.setItem("jisr.market", mk.key); } catch (_) { /* optional */ }
    S.ro = S.cfg.rpcUrl ? new ethers.JsonRpcProvider(S.cfg.rpcUrl, Number(S.chainId), { staticNetwork: true }) : S.wallet;
    S.board = []; S.m = null; S.signer = null;
    if (!S.ro) { strip("Connect a wallet on " + S.cfg.name + " to load this network."); renderAll(); return; }
    S.factory = new ethers.Contract(S.cfg.factory, FACTORY_ABI, S.ro);
    const [stableAddr, routerAddr, weth, cap] = await Promise.all([S.factory.stable(), S.factory.router(), S.factory.wrappedNative(), S.factory.saleMarketCap()]);
    const st = new ethers.Contract(stableAddr, ERC20_ABI, S.ro);
    const [symbol, dec] = await Promise.all([st.symbol(), st.decimals()]);
    S.stable = { addr: stableAddr, symbol, dec: Number(dec), c: st, isUsd: /usd|dai/i.test(symbol) };
    S.hasNative = routerAddr !== ethers.ZeroAddress && weth !== ethers.ZeroAddress;
    S.router = S.hasNative ? new ethers.Contract(routerAddr, ROUTER_ABI, S.ro) : null; S.weth = weth;
    if (!S.hasNative) { S.payWith = "stable"; S.recvIn = "stable"; }
    $("#specPrice").textContent = "Fixed, " + fUsd(cap) + " market cap";
    $("#specPay").textContent = S.hasNative ? symbol + " or " + S.cfg.native : symbol;
    $("#specNet").textContent = "On " + S.cfg.name;
    $("#tPrice").textContent = fPrice(cap * 10n ** 9n);
    $("#tCap").textContent = fUsd(cap);
    setLabel(S.marketKey, S.cfg.name + " · " + symbol);
    $("#lNet").value = S.marketKey; $("#netSel").value = S.marketKey;
    $("#lNetHint").textContent = "This coin will live on " + S.cfg.name + " only, priced and reserved in " + symbol + "." +
      (S.stable.isUsd ? "" : " " + symbol + " is not a dollar stablecoin: the floor is a number of " + symbol + ", so its dollar value moves with it.");
    if (S.account) await bindSigner();
    strip(S.cfg.test ? "Test network. Coins and money here have no value." : "");
    await refresh();
  }
  function setLabel(key, text) { document.querySelectorAll('option[value="' + key + '"]').forEach(o => { o.textContent = text; }); }
  /* Fill in each network's currency name in the menus, in the background. */
  async function labelMarkets() {
    for (const mk of markets()) {
      const c = CFG.chains[mk.id];
      if (!c.rpcUrl || mk.key === S.marketKey) continue;
      try {
        const ro = new ethers.JsonRpcProvider(c.rpcUrl, Number(mk.id), { staticNetwork: true });
        const st = await new ethers.Contract(mk.factory, FACTORY_ABI, ro).stable();
        setLabel(mk.key, c.name + " · " + await new ethers.Contract(st, ERC20_ABI, ro).symbol());
      } catch (_) { /* leave the plain name */ }
    }
  }
  function strip(msg) { $("#strip").hidden = !msg; $("#stripTxt").innerHTML = msg ? "<b>" + esc(S.cfg && S.cfg.name ? S.cfg.name : "Notice") + ".</b> " + esc(msg) : ""; }
  async function bindSigner() {
    const net = await S.wallet.getNetwork();
    if (String(net.chainId) !== S.chainId) {
      const hex = "0x" + Number(S.chainId).toString(16);
      try { await S.wallet.send("wallet_switchEthereumChain", [{ chainId: hex }]); }
      catch (e) {
        // The wallet may not know this network yet: offer to add it, which also switches to it.
        let added = false;
        if (S.cfg.rpcUrl && !window.JISR_WALLET.rejected(e)) {
          const add = { chainId: hex, chainName: S.cfg.name, nativeCurrency: { name: S.cfg.native, symbol: S.cfg.native, decimals: 18 }, rpcUrls: [S.cfg.rpcUrl] };
          if (S.cfg.explorer) add.blockExplorerUrls = [S.cfg.explorer];
          try { await S.wallet.send("wallet_addEthereumChain", [add]); added = true; } catch (_) {}
        }
        if (!added) { S.signer = null; toast("Switch your wallet to " + S.cfg.name + " to trade here."); return; }
      }
      S.wallet = new ethers.BrowserProvider(window.ethereum);
    }
    S.signer = window.JISR_WALLET.signer(S.wallet, S.account);
  }
  async function connect() {
    if (!window.ethereum) {
      if (window.JISR_WALLET.onPhone()) { toast("Opening this page in the MetaMask app…"); location.href = window.JISR_WALLET.openInWalletUrl(); return; }
      toast("No wallet found. Open this page in a wallet's browser, or install a wallet extension."); return;
    }
    try {
      S.wallet = new ethers.BrowserProvider(window.ethereum);
      const accounts = await S.wallet.send("eth_requestAccounts", []);
      S.account = ethers.getAddress(accounts[0]);
      if (S.chainId) { if (!S.ro) await setChain(S.chainId); else await bindSigner(); }
      if (window.ethereum.on && !S.listening) {
        S.listening = true;
        window.ethereum.on("accountsChanged", () => location.reload());
        // a claim switches the wallet to another network and back on purpose; do not restart the page for that
        window.ethereum.on("chainChanged", () => { if (!S.holdReload) location.reload(); });
      }
      await refresh();
      pollXfers();
    } catch (e) { toast(explain(e)); }
  }

  /* ---------- reading the chain ---------- */
  async function readMarket(coinAddr, full) {
    const marketAddr = await S.factory.marketOf(coinAddr);
    const mk = new ethers.Contract(marketAddr, MARKET_ABI, S.ro), coin = new ethers.Contract(coinAddr, COIN_ABI, S.ro);
    const base = await Promise.all([coin.name(), coin.symbol(), mk.salePrice(), mk.floorPrice(), mk.floorOut(), mk.curveOut(), mk.graduated(), mk.currentPrice(), coin.metadataURI()]);
    const m = { coinAddr, marketAddr, name: base[0], symbol: base[1], salePrice: base[2], floorPrice: base[3], floorOut: base[4], curveOut: base[5], graduated: base[6], price: base[7], meta: parseMeta(base[8]) };
    if (!full) return m;
    const more = await Promise.all([mk.creator(), mk.floorReserve(), mk.premiumReserve(), mk.creatorFees(), mk.platformFees(), mk.floorLiability(),
      S.account ? coin.balanceOf(S.account) : 0n]);
    Object.assign(m, { creator: more[0], floorReserve: more[1], premiumReserve: more[2], creatorFees: more[3], platformFees: more[4], liability: more[5], held: more[6] });
    return m;
  }
  async function loadBoard() {
    const n = Number(await S.factory.coinCount());
    const from = Math.max(0, n - CFG.boardSize), idx = [];
    for (let i = n - 1; i >= from; i--) idx.push(i);
    const addrs = await Promise.all(idx.map(i => S.factory.coins(i)));
    S.board = await Promise.all(addrs.map(a => readMarket(a, false)));
  }
  async function loadWallet() {
    if (!S.account || !S.ro) { S.bal = null; return; }
    const [native, stable] = await Promise.all([S.ro.getBalance(S.account), S.stable.c.balanceOf(S.account)]);
    S.bal = { native, stable };
  }
  async function loadTrades(m) {
    try {
      const mk = new ethers.Contract(m.marketAddr, MARKET_ABI, S.ro);
      const latest = await S.ro.getBlockNumber(), from = Math.max(0, latest - CFG.tradeLookbackBlocks);
      const [b, s] = await Promise.all([mk.queryFilter(mk.filters.Bought(), from, latest), mk.queryFilter(mk.filters.Sold(), from, latest)]);
      const rows = b.map(e => ({ side: "buy", who: e.args[0], coins: e.args[1], usd: e.args[2], native: e.args[3], blk: e.blockNumber, i: e.index }))
        .concat(s.map(e => ({ side: "sell", who: e.args[0], coins: e.args[2], usd: e.args[3], native: e.args[4], blk: e.blockNumber, i: e.index })));
      rows.sort((x, y) => y.blk - x.blk || y.i - x.i);
      return rows.slice(0, 10);
    } catch (_) { return []; }
  }
  async function refresh() {
    if (!S.factory) { renderAll(); return; }
    S.loading = (S.loading || 0) + 1; document.body.dataset.loading = "1";
    try {
      await loadWallet();
      if (S.view === "coin" && S.cur) { S.m = await readMarket(S.cur, true); S.trades = await loadTrades(S.m); }
      else await loadBoard();
    } catch (e) { toast("Could not read " + S.cfg.name + ". " + explain(e)); }
    S.loading -= 1; if (!S.loading) delete document.body.dataset.loading;
    renderAll();
  }

  /* ---------- rendering ---------- */
  const VIEWS = ["board", "coin", "launch", "how"];
  function go(view, coin) {
    if (coin) S.cur = coin;
    if (view === "coin" && !S.cur) view = "board";
    S.view = view; S.plan = null;
    try { const h = view === "coin" ? "coin-" + S.cur : view; if (location.hash !== "#" + h) location.hash = h; } catch (_) { /* optional */ }
    renderAll();
    try { window.scrollTo(0, 0); } catch (_) { /* optional */ }
    refresh();
  }
  function renderAll() {
    VIEWS.forEach(v => { $("#v-" + v).hidden = S.view !== v; });
    ["board", "launch", "how"].forEach(v => { const b = $("#nav-" + v), on = S.view === v || (v === "board" && S.view === "coin"); if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    const wb = $("#walletBtn");
    wb.classList.toggle("on", !!S.account);
    $("#walletTxt").textContent = S.account ? short(S.account) + (S.bal ? " · " + fUsd(S.bal.stable) : "") : "Connect wallet";
    const faucet = S.cfg && S.cfg.faucet && S.account ? ' <button class="linkbtn" data-act="faucet">Get 10,000 test ' + esc(S.stable ? S.stable.symbol : "USD") + "</button>" : "";
    $("#foot").innerHTML = (S.cfg ? "Network: " + esc(S.cfg.name) + ". Factory <span class=\"addr\">" + esc(S.cfg.factory) + "</span>." : "No network configured.") + faucet +
      " Not audited. Use at your own risk. <a class=\"linkbtn\" href=\"whitepaper.html\">White paper</a>";
    renderXfers();
    // on a test network, offer the test money at the top of the page too, where a new visitor sees it
    const oldFaucet = $("#stripFaucet"); if (oldFaucet) oldFaucet.remove();
    if (faucet && !$("#strip").hidden) $("#stripTxt").insertAdjacentHTML("beforeend", ' <span id="stripFaucet">' + faucet + "</span>");
    if (S.view === "board") renderBoard();
    if (S.view === "coin") renderCoin();
  }
  function pills(m) {
    if (!m.graduated) return '<span class="pill">' + (m.floorOut * 100n / SALE) + "% sold</span>";
    return '<span class="pill floor">Graduated</span><span class="pill floor">' + (m.curveOut === 0n ? "On the floor" : "Above the floor") + "</span>";
  }
  function progressPct(m) { return m.graduated ? 100 : Number(m.floorOut * 1000n / SALE) / 10; }
  function renderBoard() {
    const el = $("#rows");
    if (!S.factory) { el.innerHTML = '<div class="empty">No network is set up yet. Deploy the factory, then add its address to deployments.js.</div>'; return; }
    if (!S.board.length) { el.innerHTML = '<div class="empty">No coins yet on ' + esc(S.cfg.name) + '. <button class="linkbtn" data-act="nav" data-v="launch">Launch the first one</button>.</div>'; return; }
    el.innerHTML = S.board.map(m =>
      '<button class="row" data-act="open" data-v="' + esc(m.coinAddr) + '">' +
      ava(m) +
      '<span><span class="name">' + esc(m.name) + '</span><br><span class="tick">$' + esc(m.symbol) + " · " + short(m.coinAddr) + "</span></span>" +
      '<span class="mc">' + fUsd(mcap(m.price)) + "<small>MARKET CAP</small></span>" +
      '<span class="prog"><span class="runway' + (m.graduated ? " done" : "") + '" role="img" aria-label="' + Math.floor(progressPct(m)) + ' percent of the sale sold"><i style="width:' + progressPct(m) + '%"></i></span></span>' +
      '<span class="st">' + pills(m) + "</span></button>").join("");
  }
  function renderCoin() {
    const m = S.m, el = $("#v-coin");
    if (!m || m.coinAddr !== S.cur) { el.innerHTML = '<button class="back" data-act="nav" data-v="board">← All coins</button><div class="empty">Loading the coin…</div>'; return; }
    const cover = m.liability > 0n ? Number(m.floorReserve * 1000n / m.liability) / 10 : null;
    const rise = Number(m.floorPrice * 10000n / m.salePrice) / 100 - 100;
    const left = mulDiv((SALE - m.floorOut) * m.floorPrice / SCALE, BPS, BPS - FEE, true);
    const third = m.graduated ? "<div><strong>" + fUsd(mcap(m.floorPrice)) + "</strong><small>Floor</small></div>" : "<div><strong>" + fUsd(left) + "</strong><small>Left in the sale</small></div>";
    const isCreator = S.account && S.account.toLowerCase() === m.creator.toLowerCase();
    el.innerHTML =
      '<button class="back" data-act="nav" data-v="board">← All coins</button>' +
      '<div class="chead">' + ava(m) + "<div><h1>" + esc(m.name) + "</h1>" +
      '<p><span class="num">$' + esc(m.symbol) + '</span> · created by <span class="num">' + short(m.creator) + "</span>" + (isCreator ? " (you)" : "") + " · " + esc(S.cfg.name) + "</p></div></div>" +
      (m.meta.description || m.meta.links.length ? '<div class="about">' +
        (m.meta.description ? '<p id="cDesc">' + esc(m.meta.description) + "</p>" : "") +
        (m.meta.links.length ? '<div class="chips" id="cLinks">' + m.meta.links.map(l => '<a class="chip sm" href="' + esc(l.href) + '" target="_blank" rel="noopener noreferrer nofollow">' + esc(l.label) + " ↗</a>").join("") + "</div>" : "") +
        '<p class="hint">Written by the coin\'s creator. The launchpad does not check it.</p></div>' : "") +
      '<div class="cgrid"><div class="col">' +
        '<div class="card stats o1"><div><strong id="sMc">' + fUsd(mcap(m.price)) + "</strong><small>Market cap</small></div><div><strong>" + fPrice(m.price) + "</strong><small>" + (m.graduated ? "Price" : "Fixed sale price") + "</small></div>" + third + "</div>" +
        '<div class="card o2"><div class="gradline"><span class="label">' + (m.graduated ? "Graduated" : "Sale progress") + '</span><span class="pills">' + pills(m) + "</span></div>" +
          '<div class="runway' + (m.graduated ? " done" : "") + '"><i style="width:' + progressPct(m) + '%"></i></div>' +
          '<p class="note">' + fTok(m.floorOut + m.curveOut) + " of 1.00B coins are held by buyers.</p></div>" +
        '<div class="card"><span class="label">Floor cover</span><div class="wallbox">' +
          '<div class="kv"><span>' + esc(S.stable.symbol) + ' in the floor reserve</span><b class="num" id="sReserve">' + fUsd(m.floorReserve) + "</b></div>" +
          '<div class="kv"><span>Needed to buy back every coin</span><b class="num">' + fUsd(m.liability) + "</b></div>" +
          '<div class="kv"><span>Cover</span><b class="num">' + (cover === null ? "No coins sold yet" : Math.floor(cover * 10) / 10 + "%") + "</b></div>" +
          '<div class="kv"><span>Floor price</span><b class="num">' + fPrice(m.floorPrice) + (rise > 0.005 ? " · up " + rise.toFixed(2) + "%" : "") + "</b></div>" +
          (S.stable.isUsd ? "" : '<div class="flag">Priced in ' + esc(S.stable.symbol) + ", not in dollars. The floor is a number of " + esc(S.stable.symbol) + ", so its dollar value moves with it.</div>") +
          '<p class="note">The contract that holds this reserve has no owner and no withdrawal function. <span class="addr">' + esc(m.marketAddr) + "</span></p></div></div>" +
        '<div class="card"><span class="label">Fees waiting</span>' +
          '<div class="kv"><span>Creator, 1%</span><b class="num">' + fUsd(m.creatorFees) + "</b></div>" +
          '<div class="kv"><span>Launchpad, 2%</span><b class="num">' + fUsd(m.platformFees) + "</b></div>" +
          '<div class="chips" style="margin-top:8px"><button class="chip sm" data-act="claimCreator"' + (m.creatorFees === 0n ? " disabled" : "") + '>Pay the creator</button><button class="chip sm" data-act="sweepPlatform"' + (m.platformFees === 0n ? " disabled" : "") + ">Pay the launchpad</button></div>" +
          '<p class="note">Every trade pays the fees out automatically. A fee waits here only when its wallet could not receive it at that moment; then anyone can press Pay, and the money can only go to the creator and to the launchpad wallet.</p></div>' +
        '<div class="card"><span class="label">Latest trades</span><div class="trades">' +
          ((S.trades || []).length ? S.trades.map(t => '<div class="tr"><span class="pill ' + t.side + '">' + t.side + "</span><span>" + (t.side === "buy" ? "paid " : "to ") + esc(t.native ? S.cfg.native : S.stable.symbol) +
            '<br><span class="who">' + short(t.who) + "</span></span><span class=\"amt\">" + fUsd(t.usd) + "<small>" + fTok(t.coins) + "</small></span></div>").join("") : '<p class="note">No recent trades.</p>') +
        "</div></div>" +
      '</div><div class="side"><div class="card" id="trade"></div></div></div>';
    renderTrade();
  }
  function payChips(act, sel) {
    return [["stable", S.stable.symbol]].concat(S.hasNative ? [["native", S.cfg.native]] : []).map(([v, l]) => '<button class="chip" data-act="' + act + '" data-v="' + v + '" aria-pressed="' + (sel === v) + '">' + esc(l) + "</button>").join("");
  }
  function renderTrade() {
    const m = S.m, el = $("#trade"); if (!m || !el) return;
    let h = '<div class="tabs" role="tablist"><button role="tab" data-act="tab" data-v="buy" aria-selected="' + (S.tab === "buy") + '">Buy</button><button role="tab" data-act="tab" data-v="sell" aria-selected="' + (S.tab === "sell") + '">Sell</button></div>';
    const unit = S.payWith === "stable" ? S.stable.symbol : S.cfg.native;
    if (S.tab === "buy") {
      const bal = S.bal ? (S.payWith === "stable" ? fStable(S.bal.stable) : fNative(S.bal.native)) : "connect a wallet to see it";
      h += '<div class="field"><label for="buyAmt">You pay</label><div class="amt-in"><input id="buyAmt" inputmode="decimal" autocomplete="off" placeholder="0.0" value="' + esc(S.buyAmt) + '"><span>' + esc(unit) + "</span></div>" +
        '<div class="hint">Balance: ' + bal + "</div></div>" +
        '<div class="stack"><div class="chips" role="group" aria-label="Pay with">' + payChips("payWith", S.payWith) + "</div></div>" +
        '<div id="quote"></div><button class="btn primary wide" id="goBtn" data-act="buy">Buy $' + esc(m.symbol) + "</button>";
    } else {
      h += '<div class="field"><label for="sellAmt">You sell</label><div class="amt-in"><input id="sellAmt" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(S.sellAmt) + '"><span>' + esc(m.symbol) + "</span></div>" +
        '<div class="hint">You hold ' + (S.account ? fTok(m.held) : "nothing yet: connect a wallet") + '</div><div class="chips">' + [25, 50, 100].map(v => '<button class="chip sm" data-act="pct" data-v="' + v + '">' + v + "%</button>").join("") + "</div></div>" +
        (S.recvOn ? "" : '<div class="stack"><div class="flabel">Receive in</div><div class="chips" role="group" aria-label="Receive in">' + payChips("recvIn", S.recvIn) + "</div></div>") +
        (bridgeDests().length ? '<div class="stack"><div class="flabel">Receive on</div><div class="chips" role="group" aria-label="Receive on">' +
          [{ id: "", name: S.cfg.name.replace(/ testnet$/, "") }].concat(bridgeDests()).map(d => '<button class="chip" data-act="recvOn" data-v="' + esc(d.id) + '" aria-pressed="' + (S.recvOn === d.id) + '">' + esc(d.name) + "</button>").join("") + "</div></div>" : "") +
        '<div id="quote"></div><button class="btn sell wide" id="goBtn" data-act="sell">Sell $' + esc(m.symbol) + "</button>";
    }
    el.innerHTML = h;
    updateQuote();
  }
  function feeRows(q, base) {
    return '<div class="kv"><span>Trading fee, 5%</span><b>' + fUsd(base * FEE / BPS) + "</b></div>" +
      '<div class="sub">Creator ' + fUsd(q.creatorFee) + " · floor reserve " + fUsd(q.communityFee) + " · launchpad " + fUsd(q.platformFee) + "</div>";
  }
  const path = (a, b) => [a, b];
  const slipUp = v => v + v * BigInt(CFG.slippageBps) / BPS, slipDown = v => v - v * BigInt(CFG.slippageBps) / BPS;
  function parseAmt(txt, dec) { try { const t = String(txt).replace(/,/g, ".").trim(); if (!t) return 0n; return ethers.parseUnits(t, dec); } catch (_) { return null; } }

  /* Work out the trade the inputs describe. Returns {ok, html, plan}. */
  async function buildPlan() {
    const m = S.m;
    if (S.tab === "buy") {
      const amt = parseAmt(S.buyAmt, S.payWith === "stable" ? S.stable.dec : 18);
      if (amt === null) return { html: '<div class="warn">That amount is not a number.</div>' };
      if (amt === 0n) return { html: '<div class="hint">Enter an amount to see what you get.</div>' };
      const room = MAX_WALLET - (m.held || 0n);
      if (room <= 0n) return { html: '<div class="warn">You already hold 2.5% of this coin, the most one wallet can hold.</div>' };
      let budget = amt;
      if (S.payWith === "native") budget = (await S.router.getAmountsOut(slipDown(amt), path(S.weth, S.stable.addr)))[1];
      const coins = coinsForBudget(m, budget, room);
      const q = coins > 0n ? quoteBuy(m, coins) : null;
      if (!q) return { html: '<div class="warn">That is too small to buy any coins.</div>' };
      const trimmed = q.total < budget - budget / 200n;
      const after = Object.assign({}, m, { floorOut: m.floorOut + q.fromFloor, curveOut: m.curveOut + q.fromCurve });
      const back = quoteSell(Object.assign(after, { premiumReserve: m.premiumReserve + q.premiumPart }), coins);
      const floorBack = mulDiv(coins, m.floorPrice, SCALE, false) * (BPS - FEE) / BPS;
      let html = '<div class="kv"><span>Cost</span><b>' + fUsd(q.total) + "</b></div>" + feeRows(q, q.total) +
        '<div class="kv"><span>If you sell back at the floor</span><b>' + fUsd(floorBack) + "</b></div>" +
        '<div class="kv big"><span>You receive</span><b>' + fTok(coins) + " " + esc(m.symbol) + "</b></div>" +
        (S.payWith === "native" ? '<div class="sub">Your ' + esc(S.cfg.native) + " is swapped to " + esc(S.stable.symbol) + " on the way in. Anything unused comes straight back.</div>" : "") +
        (q.fromCurve > 0n ? '<div class="flag">' + fTok(q.fromCurve) + " of these coins are priced above the floor. Selling right away would return " + fUsd(back ? back.net : 0n) + ".</div>" : "") +
        (!m.graduated && m.floorOut + q.fromFloor === SALE ? '<div class="flag"><b>This buy sells out the sale.</b> The coin graduates.</div>' : "") +
        (trimmed ? '<div class="flag"><b>Trimmed.</b> The wallet limit of 2.5%, or the coins left, caps this buy at ' + fUsd(q.total) + ". The rest stays in your wallet.</div>" : "");
      if (S.bal && amt > (S.payWith === "stable" ? S.bal.stable : S.bal.native)) return { html: html + '<div class="warn">Your balance is lower than this amount.</div>' };
      return { ok: true, html, plan: { kind: "buy", coins, q, value: amt } };
    }
    const amt = parseAmt(S.sellAmt, 18);
    if (amt === null) return { html: '<div class="warn">That amount is not a number.</div>' };
    if (amt === 0n) return { html: '<div class="hint">Enter how many coins to sell.</div>' };
    if (S.account && amt > m.held) return { html: '<div class="warn">You hold ' + fTok(m.held) + ". Lower the amount.</div>" };
    const q = quoteSell(m, amt);
    if (!q || q.net === 0n) return { html: '<div class="warn">That amount cannot be sold.</div>' };
    const dest = S.recvOn ? bridgeDests().find(d => d.id === S.recvOn) : null;
    if (dest) {
      // sold here, paid out on another network through Circle
      const f = await bridgeFees(dest.domain), maxFee = bridgeMaxFee(q.net, f), minOut = slipDown(q.net);
      const top = '<div class="kv"><span>Sale value</span><b>' + fUsd(q.gross) + "</b></div>" + feeRows(q, q.gross);
      if (maxFee >= minOut) return { html: top + '<div class="warn">This sale is too small to send to ' + esc(dest.name) + ": Circle's fee for the transfer is about " + fStable(maxFee) + ".</div>" };
      return { ok: true, plan: { kind: "sell", coins: amt, q, nativeOut: 0n, bridge: { dest } }, html: top +
        '<div class="kv"><span>Transfer fee (Circle), up to</span><b>' + fStable(maxFee) + "</b></div>" +
        '<div class="kv big"><span>You receive on ' + esc(dest.name) + "</span><b>about " + fStable(q.net - maxFee) + "</b></div>" +
        '<div class="sub">' + (f.forward
          ? "Sent to your own address on " + esc(dest.name) + ". Circle delivers it there, usually within a few minutes."
          : "Sent to your own address on " + esc(dest.name) + ". When Circle confirms it, usually within 20 minutes, you claim it from this page. Claiming needs a little " + esc(CFG.chains[dest.id].native) + " on " + esc(dest.name) + " for the network fee.") + "</div>" };
    }
    let nativeOut = 0n;
    if (S.recvIn === "native") nativeOut = (await S.router.getAmountsOut(q.net, path(S.stable.addr, S.weth)))[1];
    const html = '<div class="kv"><span>Sale value</span><b>' + fUsd(q.gross) + "</b></div>" + feeRows(q, q.gross) +
      '<div class="kv big"><span>You receive</span><b>' + (S.recvIn === "native" ? fNative(nativeOut) : fStable(q.net)) + "</b></div>" +
      (S.recvIn === "native" ? '<div class="sub">About ' + fUsd(q.net) + ", swapped to " + esc(S.cfg.native) + ".</div>" : "") +
      (!m.graduated ? '<div class="flag">Sold back at the fixed sale price. These coins go back on sale.</div>' : "");
    return { ok: true, html, plan: { kind: "sell", coins: amt, q, nativeOut } };
  }
  async function updateQuote() {
    const q = $("#quote"), btn = $("#goBtn"); if (!q || !btn) return;
    const seq = ++S.quoteSeq;
    let r;
    try { r = await buildPlan(); } catch (e) { r = { html: '<div class="warn">' + esc(explain(e)) + "</div>" }; }
    if (seq !== S.quoteSeq) return;
    S.plan = r.ok ? r.plan : null;
    q.innerHTML = '<div class="quote num">' + r.html + "</div>";
    if (!S.account) { btn.textContent = "Connect wallet"; btn.dataset.act = "connect"; btn.disabled = false; }
    else if (!S.signer) { btn.textContent = "Switch wallet to " + S.cfg.name; btn.dataset.act = "connect"; btn.disabled = false; }
    else btn.disabled = !r.ok || S.busy;
  }

  /* ---------- transactions ---------- */
  /* ---------- selling here, receiving on another network (Circle CCTP) ---------- */
  const cctpEnv = () => S.cfg.cctpEnv || CFG.cctp[S.cfg.test ? "test" : "main"];
  /* Networks the proceeds of a sale on this network can be sent to. */
  function bridgeDests() {
    if (!S.cfg || !S.cfg.bridge || S.cfg.cctp == null) return [];
    return Object.keys(CFG.chains).filter(id => id !== String(S.chainId) && CFG.chains[id].cctp != null && CFG.chains[id].cctp !== S.cfg.cctp && !!CFG.chains[id].test === !!S.cfg.test)
      .map(id => ({ id, name: CFG.chains[id].name.replace(/ testnet$/, ""), domain: CFG.chains[id].cctp }));
  }
  /* Circle's current fees for a route. Read from Circle each time, because the delivery fee follows gas prices. */
  async function bridgeFees(dstDomain, fresh) {
    const key = S.chainId + ":" + S.cfg.cctp + ">" + dstDomain, hit = S.feeCache[key];
    if (!fresh && hit && Date.now() - hit.at < 60000) return hit.v;
    let list;
    try {
      const r = await fetch(cctpEnv().api + "/v2/burn/USDC/fees/" + S.cfg.cctp + "/" + dstDomain + "?forward=true");
      if (!r.ok) throw new Error("status " + r.status);
      list = await r.json();
    } catch (_) { throw new Error("Could not read Circle's transfer fees. Try again in a moment."); }
    const pick = t => (Array.isArray(list) ? list : []).find(x => x && Number(x.finalityThreshold) === t);
    const e = pick(1000) || pick(2000);
    if (!e) throw new Error("Circle does not offer this route right now.");
    const ff = e.forwardFee && typeof e.forwardFee === "object" ? e.forwardFee : null;
    const fwdNum = ff ? Number(ff.med != null ? ff.med : ff.medium != null ? ff.medium : ff.high != null ? ff.high : ff.low) : 0;
    const rate = Number(e.minimumFee);
    if (!(rate >= 0) || rate > 100 || !(fwdNum >= 0)) throw new Error("Circle's fee answer was not understood. Try again in a moment.");
    // rate is in basis points and may have decimals; keep it as hundredths of a basis point
    const v = { threshold: Number(e.finalityThreshold), rateX100: BigInt(Math.ceil(rate * 100)), forwardFee: BigInt(Math.ceil(fwdNum)), forward: fwdNum > 0 };
    S.feeCache[key] = { at: Date.now(), v };
    return v;
  }
  /* The most Circle may take from an amount: its delivery fee plus its percentage fee, rounded up. */
  const bridgeMaxFee = (amount, f) => f.forwardFee + (amount * f.rateX100 + 999999n) / 1000000n;

  /* Cross-network sales made from this browser, kept so their progress can be shown and a delivery claimed. */
  const XFER_KEY = "jisr.xfers", HEX = /^0x[0-9a-fA-F]+$/, TXH = /^0x[0-9a-fA-F]{64}$/;
  function xfers() { try { const a = JSON.parse(localStorage.getItem(XFER_KEY) || "[]"); return Array.isArray(a) ? a.filter(x => x && TXH.test(x.hash || "")) : []; } catch (_) { return []; } }
  function putXfers(a) { try { localStorage.setItem(XFER_KEY, JSON.stringify(a.slice(0, 20))); } catch (_) { /* optional */ } }
  function saveXfer(x) { putXfers([x].concat(xfers().filter(y => y.hash !== x.hash))); renderXfers(); pollXfers(); }
  function patchXfer(hash, patch) { putXfers(xfers().map(x => x.hash === hash ? Object.assign({}, x, patch) : x)); }
  const myXfers = () => S.account ? xfers().filter(x => String(x.account).toLowerCase() === S.account.toLowerCase()) : [];
  /* A transfer Circle should deliver is offered for claiming only if delivery has not happened after 15 minutes. */
  const claimable = x => x.state === "ready" && (!x.forward || Date.now() - x.at > 15 * 60000);
  function renderXfers() {
    const el = $("#xfers"); if (!el) return;
    const list = myXfers();
    el.hidden = !list.length;
    if (!list.length) { el.innerHTML = ""; return; }
    const link = (chainId, hash, text) => { const ex = (CFG.chains[chainId] || {}).explorer; return ex && TXH.test(hash || "") ? ' <a class="linkbtn" target="_blank" rel="noopener" href="' + esc(ex + "/tx/" + hash) + '">' + esc(text) + "</a>" : ""; };
    el.innerHTML = "<h2>Sales sent to another network</h2>" + list.map(x => {
      const dst = CFG.chains[x.dst] || { name: "another network", native: "ETH" }, name = String(dst.name).replace(/ testnet$/, "");
      let amt; try { amt = Number(ethers.formatUnits(BigInt(x.amount) - BigInt(x.fee || "0"), Number(x.dec) || 6)).toLocaleString("en-US", { maximumFractionDigits: 2 }); } catch (_) { amt = "?"; }
      const status = x.state === "delivered" ? "<b class=\"ok\">Delivered on " + esc(name) + ".</b>" + link(x.dst, x.doneTx, "View")
        : claimable(x) ? "Ready on " + esc(name) + '. <button class="chip sm" data-act="claimXfer" data-v="' + esc(x.hash) + '">Claim on ' + esc(name) + "</button><span class=\"sub\"> Needs a little " + esc(dst.native) + " there for the network fee.</span>"
        : x.state === "ready" ? "Confirmed. Circle is delivering it on " + esc(name) + "…"
        : "Waiting for Circle to confirm the sale. This usually takes a few minutes…";
      return '<div class="xfer"><div><b class="num">about ' + esc(amt) + " " + esc(x.sym || "USDC") + "</b> to " + esc(name) + ' <span class="sub">from selling $' + esc(x.coin || "") + "</span>" + link(x.src, x.hash, "Sale") + "</div><div>" + status +
        (x.state === "delivered" ? ' <button class="linkbtn" data-act="hideXfer" data-v="' + esc(x.hash) + '">Hide</button>' : "") + "</div></div>";
    }).join("");
  }
  let xferTimer = null;
  async function pollXfers() {
    clearTimeout(xferTimer);
    const open = myXfers().filter(x => x.state !== "delivered");
    if (!open.length) return;
    for (const x of open) {
      try {
        if (!/^https:\/\//.test(x.api || "")) continue;
        const r = await fetch(x.api + "/v2/messages/" + Number(x.srcDomain) + "?transactionHash=" + x.hash);
        if (!r.ok) continue; // not seen by Circle yet
        const j = await r.json(), m = j && Array.isArray(j.messages) ? j.messages[0] : null;
        if (!m) continue;
        if (TXH.test(m.forwardTxHash || "")) patchXfer(x.hash, { state: "delivered", doneTx: m.forwardTxHash });
        else if (m.status === "complete" && HEX.test(m.attestation || "") && HEX.test(m.message || "") && m.message.length > 2) patchXfer(x.hash, { state: "ready", message: m.message, attestation: m.attestation });
      } catch (_) { /* try again on the next round */ }
    }
    renderXfers();
    if (myXfers().some(x => x.state !== "delivered")) xferTimer = setTimeout(pollXfers, 15000);
  }
  /* Complete a transfer on the destination network from the user's own wallet. Anyone may do this for any transfer. */
  async function claimXfer(hash) {
    const x = myXfers().find(y => y.hash === hash);
    if (!x || !claimable(x) || S.busy || !window.ethereum) return;
    const dst = CFG.chains[x.dst]; if (!dst || !ethers.isAddress(x.transmitter || "")) return;
    const name = dst.name.replace(/ testnet$/, ""), hex = "0x" + Number(x.dst).toString(16);
    S.busy = true; S.holdReload = true; document.body.classList.add("busy");
    try {
      toast("Switch your wallet to " + name + " to claim…", 60000);
      try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] }); }
      catch (e) {
        if (window.JISR_WALLET.rejected(e) || !dst.rpcUrl) throw e;
        const add = { chainId: hex, chainName: dst.name, nativeCurrency: { name: dst.native, symbol: dst.native, decimals: 18 }, rpcUrls: [dst.rpcUrl] };
        if (dst.explorer) add.blockExplorerUrls = [dst.explorer];
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [add] });
      }
      const signer = window.JISR_WALLET.signer(new ethers.BrowserProvider(window.ethereum), S.account);
      toast("Confirm the claim in your wallet…", 60000);
      const tx = await new ethers.Contract(x.transmitter, TRANSMITTER_ABI, signer).receiveMessage(x.message, x.attestation);
      toast("Claiming… waiting for the network.", 60000);
      await tx.wait();
      patchXfer(hash, { state: "delivered", doneTx: tx.hash });
      toast("Claimed on " + name + ".");
    } catch (e) {
      if (/nonce already used/i.test(window.JISR_WALLET.detail(e) + " " + String(e && e.message))) { patchXfer(hash, { state: "delivered" }); toast("This transfer was already delivered."); }
      else toast(explain(e), 8000);
    } finally {
      // go back to the network this page trades on
      try { S.wallet = new ethers.BrowserProvider(window.ethereum); await bindSigner(); } catch (_) { S.signer = null; }
      S.busy = false; S.holdReload = false; document.body.classList.remove("busy");
      renderXfers(); pollXfers();
    }
  }

  async function run(label, fn) {
    if (S.busy) return;
    if (!S.signer) { await connect(); if (!S.signer) return; }
    S.busy = true; document.body.classList.add("busy");
    try { toast(label + ": confirm in your wallet…", 60000); await fn(); }
    catch (e) { toast(explain(e), 8000); }
    finally { S.busy = false; document.body.classList.remove("busy"); await refresh(); }
  }
  async function ensureAllowance(tokenAddr, spender, need) {
    const t = new ethers.Contract(tokenAddr, ERC20_ABI, S.signer);
    const has = await t.allowance(S.account, spender);
    if (has >= need) return;
    if (has > 0n) await (await t.approve(spender, 0n)).wait(); // some stablecoins require a reset first
    toast("Step 1 of 2: allow this trade in your wallet…", 60000);
    await (await t.approve(spender, need)).wait();
  }
  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + CFG.deadlineSeconds);
  async function doBuy() {
    await run("Buy", async () => {
      S.m = await readMarket(S.cur, true);
      const r = await buildPlan(); if (!r.ok) { toast("The quote changed. Check it and try again."); return; }
      const p = r.plan, mk = new ethers.Contract(S.m.marketAddr, MARKET_ABI, S.signer);
      let tx;
      if (S.payWith === "stable") {
        const maxIn = slipUp(p.q.total);
        await ensureAllowance(S.stable.addr, S.m.marketAddr, maxIn);
        toast("Confirm the buy in your wallet…", 60000);
        tx = await mk.buy(p.coins, maxIn, deadline());
      } else {
        tx = await mk.buyWithNative(p.coins, deadline(), { value: p.value });
      }
      toast("Buying… waiting for the network.", 60000);
      await tx.wait();
      S.buyAmt = "";
      toast("Bought " + fTok(p.coins) + " " + S.m.symbol + ".");
    });
  }
  async function doSell() {
    await run("Sell", async () => {
      S.m = await readMarket(S.cur, true);
      const r = await buildPlan(); if (!r.ok) { toast("The quote changed. Check it and try again."); return; }
      const p = r.plan, mk = new ethers.Contract(S.m.marketAddr, MARKET_ABI, S.signer);
      if (p.bridge) {
        const dest = p.bridge.dest, env = cctpEnv();
        const f = await bridgeFees(dest.domain, true), minOut = slipDown(p.q.net), maxFee = bridgeMaxFee(p.q.net, f);
        if (maxFee >= minOut) { toast("This sale is too small to cover the transfer fee."); return; }
        await ensureAllowance(S.m.coinAddr, S.cfg.bridge, p.coins);
        toast("Confirm the sale in your wallet…", 60000);
        const br = new ethers.Contract(S.cfg.bridge, BRIDGE_ABI, S.signer);
        const btx = await br.sellAndBridge(S.m.coinAddr, p.coins, minOut, dest.domain, ethers.zeroPadValue(S.account, 32), maxFee, f.threshold, f.forward, deadline());
        toast("Selling… waiting for the network.", 60000);
        await btx.wait();
        saveXfer({ hash: btx.hash, account: S.account, src: String(S.chainId), srcDomain: S.cfg.cctp, dst: dest.id, amount: p.q.net.toString(), fee: maxFee.toString(),
          sym: S.stable.symbol, dec: S.stable.dec, coin: S.m.symbol, forward: f.forward, at: Date.now(), api: env.api, transmitter: env.transmitter, state: "pending" });
        S.sellAmt = "";
        toast("Sold " + fTok(p.coins) + " " + S.m.symbol + ". " + fStable(p.q.net) + " is on its way to " + dest.name + ".", 8000);
        return;
      }
      await ensureAllowance(S.m.coinAddr, S.m.marketAddr, p.coins);
      toast("Confirm the sale in your wallet…", 60000);
      const tx = S.recvIn === "native"
        ? await mk.sellForNative(p.coins, slipDown(p.nativeOut), S.account, deadline())
        : await mk.sell(p.coins, slipDown(p.q.net), S.account, deadline());
      toast("Selling… waiting for the network.", 60000);
      await tx.wait();
      S.sellAmt = "";
      toast("Sold " + fTok(p.coins) + " " + S.m.symbol + " for " + (S.recvIn === "native" ? fNative(p.nativeOut) : fStable(p.q.net)) + ".");
    });
  }
  async function doLaunch() {
    const name = $("#lName").value.trim(), symbol = $("#lTicker").value.trim().toUpperCase(), err = $("#lErr");
    if (name.length < 2 || name.length > 32) { err.textContent = "Give the coin a name of 2 to 32 characters."; return; }
    if (!/^[A-Z0-9]{2,10}$/.test(symbol)) { err.textContent = "The ticker needs 2 to 10 letters or numbers, with no spaces."; return; }
    const meta = {};
    const desc = $("#lDesc").value.trim();
    if (desc) meta.description = desc.slice(0, 280);
    const imgLink = $("#lImgUrl").value.trim();
    if (S.photo) meta.image = S.photo;
    else if (imgLink) { if (!cleanImage(imgLink)) { err.textContent = "The picture link must start with https://"; return; } meta.image = imgLink; }
    for (const [key, label, hosts] of LINKS) {
      const v = $("#l-" + key).value.trim(); if (!v) continue;
      const href = cleanLink(/^https?:\/\//i.test(v) ? v : "https://" + v, hosts);
      if (!href) { err.textContent = "The " + label + " link is not valid." + (hosts ? " It should be on " + hosts[0] + "." : " It must start with https://"); return; }
      meta[key] = href;
    }
    const uri = Object.keys(meta).length ? JSON.stringify(meta) : "";
    err.textContent = "";
    await run("Launch", async () => {
      const f = new ethers.Contract(S.cfg.factory, FACTORY_ABI, S.signer);
      const tx = await f.createCoin(name, symbol, uri);
      toast("Launching… waiting for the network.", 60000);
      const rc = await tx.wait();
      let coin = null;
      for (const l of rc.logs) { try { const p = f.interface.parseLog(l); if (p && p.name === "CoinCreated") coin = p.args.coin; } catch (_) { /* other contract's log */ } }
      $("#launchForm").reset(); setPhoto(null);
      toast("$" + symbol + " is live on " + S.cfg.name + ".");
      if (coin) { S.cur = coin; S.view = "coin"; S.tab = "buy"; try { location.hash = "coin-" + coin; } catch (_) { /* optional */ } }
    });
  }
  function setPhoto(data) {
    S.photo = data || null;
    $("#lImgPrev").innerHTML = data ? '<span class="ava big"><img src="' + esc(data) + '" alt="Chosen picture"></span><button type="button" class="linkbtn" data-act="clearPhoto">Remove the picture</button>' : "";
    $("#lImgUrl").disabled = !!data;
  }
  async function simpleTx(label, method, done) {
    await run(label, async () => {
      const mk = new ethers.Contract(S.m.marketAddr, MARKET_ABI, S.signer);
      await (await mk[method]()).wait();
      toast(done);
    });
  }
  async function faucet() {
    await run("Test money", async () => {
      const t = new ethers.Contract(S.stable.addr, ERC20_ABI, S.signer);
      await (await t.mint(S.account, 10000n * 10n ** BigInt(S.stable.dec))).wait();
      toast("10,000 test " + S.stable.symbol + " added to your wallet.");
    });
  }

  /* ---------- events ---------- */
  let quoteTimer;
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
    const a = b.dataset.act, v = b.dataset.v;
    if (a === "nav") go(v);
    else if (a === "open") { S.tab = "buy"; S.buyAmt = ""; S.sellAmt = ""; S.m = null; go("coin", v); }
    else if (a === "connect") connect();
    else if (a === "refresh") refresh();
    else if (a === "tab") { S.tab = v; renderTrade(); }
    else if (a === "payWith") { S.payWith = v; S.buyAmt = ""; renderTrade(); }
    else if (a === "recvIn") { S.recvIn = v; renderTrade(); }
    else if (a === "recvOn") { S.recvOn = v; if (v) S.recvIn = "stable"; renderTrade(); }
    else if (a === "claimXfer") claimXfer(v);
    else if (a === "hideXfer") { putXfers(xfers().filter(x => x.hash !== v)); renderXfers(); }
    else if (a === "pct") { if (S.m && S.m.held > 0n) { S.sellAmt = ethers.formatUnits(S.m.held * BigInt(v) / 100n, 18); renderTrade(); } }
    else if (a === "buy") doBuy();
    else if (a === "sell") doSell();
    else if (a === "claimCreator") simpleTx("Pay the creator", "claimCreatorFees", "Creator fees paid to the creator.");
    else if (a === "sweepPlatform") simpleTx("Pay the launchpad", "sweepPlatformFees", "Launchpad fees paid to the launchpad wallet.");
    else if (a === "faucet") faucet();
    else if (a === "clearPhoto") { $("#lImgFile").value = ""; setPhoto(null); }
  });
  $("#lImgFile").addEventListener("change", async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { setPhoto(await shrinkPhoto(f)); $("#lErr").textContent = ""; }
    catch (err) { setPhoto(null); e.target.value = ""; $("#lErr").textContent = err.message; }
  });
  $("#lNet").addEventListener("change", e => { $("#netSel").value = e.target.value; setChain(e.target.value).catch(err => toast(explain(err))); });
  document.addEventListener("input", e => {
    if (e.target.id === "buyAmt") S.buyAmt = e.target.value; else if (e.target.id === "sellAmt") S.sellAmt = e.target.value; else return;
    clearTimeout(quoteTimer); quoteTimer = setTimeout(updateQuote, 200);
  });
  $("#launchForm").addEventListener("submit", e => { e.preventDefault(); doLaunch(); });
  $("#netSel").addEventListener("change", e => { S.view = "board"; S.cur = null; setChain(e.target.value).catch(err => toast(explain(err))); });
  window.addEventListener("hashchange", () => {
    const h = location.hash.replace("#", "");
    if (h.startsWith("coin-") && ethers.isAddress(h.slice(5))) { if (S.cur !== h.slice(5) || S.view !== "coin") { S.m = null; go("coin", h.slice(5)); } }
    else if (VIEWS.includes(h) && h !== S.view) go(h);
  });

  /* ---------- start ---------- */
  async function start() {
    const list = markets(), ids = list.map(x => x.key), sel = $("#netSel");
    const many = id => list.filter(x => x.id === id).length > 1;
    const opts = list.map((x, i) => '<option value="' + x.key + '">' + esc(CFG.chains[x.id].name + (many(x.id) ? " · currency " + (Number(x.key.split(":")[1]) + 1) : "")) + "</option>").join("") || "<option>No network</option>";
    sel.innerHTML = opts; $("#lNet").innerHTML = opts;
    const h = location.hash.replace("#", "");
    if (h.startsWith("coin-") && ethers.isAddress(h.slice(5))) { S.view = "coin"; S.cur = h.slice(5); }
    else if (VIEWS.includes(h) && h !== "coin") S.view = h;
    if (!ids.length) { strip("No network is set up yet."); renderAll(); return; }
    let saved = null; try { saved = localStorage.getItem("jisr.market"); } catch (_) { /* optional */ }
    const id = ids.includes(saved) ? saved : ids[0];
    sel.value = id;
    renderAll();
    try { await setChain(id); } catch (e) { toast("Could not reach " + CFG.chains[id.split(":")[0]].name + ". " + explain(e), 9000); renderAll(); }
    labelMarkets();
    // Background refresh. Skipped while someone is typing or has a trade half entered, so the page never moves under a finger.
    setInterval(() => {
      const typing = document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);
      const midTrade = S.view === "coin" && (S.buyAmt || S.sellAmt);
      if (!S.busy && !document.hidden && !typing && !midTrade) refresh();
    }, 20000);
  }
  window.JISR_APP = { state: S, refresh, pollXfers };
  start();
})();
