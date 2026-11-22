/* Deploy and manage the LaunchpadFactory from the owner's own wallet. */
(function () {
  "use strict";
  const { ethers } = window;
  const CFG = window.JISR_CONFIG, ART = window.JISR_ARTIFACTS;
  const MAINNETS = { "1": true, "56": true };
  const ERC20 = ["function symbol() view returns (string)", "function decimals() view returns (uint8)"];
  const ROUTER = ["function WETH() view returns (address)", "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])"];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const S = { provider: null, signer: null, account: null, chainId: null, checked: null, busy: false, testKit: false, factory: null };

  function status(msg, kind) { const el = $("aStatus"); el.textContent = msg; el.className = "status" + (kind ? " " + kind : ""); }
  function explain(e) {
    if (e && (e.code === "ACTION_REJECTED" || e.code === 4001 || (e.info && e.info.error && e.info.error.code === 4001))) return "ألغيت الطلب من المحفظة.";
    const t = String((e && (e.shortMessage || e.reason || e.message)) || e);
    if (/insufficient funds/i.test(t)) return "رصيد المحفظة لا يكفي لرسوم الشبكة.";
    if (/OwnableUnauthorizedAccount/.test(t)) return "هذه المحفظة ليست مالك المصنع.";
    return t.length > 200 ? t.slice(0, 200) + "…" : t;
  }
  const netName = () => (CFG.chains[S.chainId] ? CFG.chains[S.chainId].name : "شبكة غير معرّفة") + " (" + S.chainId + ")";
  const isAddr = (v) => ethers.isAddress((v || "").trim());
  const val = (id) => $(id).value.trim();

  function sync() {
    const on = !!S.signer && !S.busy, known = !!CFG.chains[S.chainId];
    $("aTestKit").disabled = !on || !known || !!MAINNETS[S.chainId];
    $("aCheck").disabled = !on || !known;
    $("aDeploy").disabled = !on || !S.checked || (MAINNETS[S.chainId] && !$("aAck").checked);
    $("aLoad").disabled = !on;
    $("aSetWallet").disabled = !on || !S.factory;
    $("aAckWrap").hidden = !MAINNETS[S.chainId];
  }
  async function guarded(label, fn) {
    if (S.busy) return;
    S.busy = true; sync();
    try { status(label); await fn(); }
    catch (e) { status(explain(e), "bad"); }
    finally { S.busy = false; sync(); }
  }

  async function connect() {
    if (!window.ethereum) { status("لا توجد محفظة. افتح هذه الصفحة من متصفح المحفظة، أو ثبّت إضافة محفظة.", "bad"); return; }
    await guarded("جاري ربط المحفظة…", async () => {
      S.provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await S.provider.send("eth_requestAccounts", []);
      S.account = ethers.getAddress(accounts[0]);
      S.signer = await S.provider.getSigner(S.account);
      S.chainId = String((await S.provider.getNetwork()).chainId);
      $("aAccount").textContent = S.account;
      $("aNet").textContent = netName() + (MAINNETS[S.chainId] ? " · شبكة حقيقية" : "");
      $("aBal").textContent = Number(ethers.formatEther(await S.provider.getBalance(S.account))).toFixed(5) + " " + (CFG.chains[S.chainId] ? CFG.chains[S.chainId].native : "");
      if (!val("aPlatform")) $("aPlatform").value = S.account;
      if (!val("aOwner")) $("aOwner").value = S.account;
      const known = CFG.chains[S.chainId];
      if (known && ethers.isAddress(known.factory || "") && !val("aFactory")) $("aFactory").value = known.factory;
      if (window.ethereum.on) { window.ethereum.on("chainChanged", () => location.reload()); window.ethereum.on("accountsChanged", () => location.reload()); }
      status(known ? "المحفظة مرتبطة على " + netName() + "." : "المحفظة مرتبطة، لكن هذه الشبكة غير معرّفة في الملف config.js.", known ? "good" : "bad");
    });
  }

  async function deployContract(name, args, label) {
    status(label + ": وقّع من المحفظة…");
    const f = new ethers.ContractFactory(ART[name].abi, ART[name].bytecode, S.signer);
    const c = await f.deploy(...args);
    status(label + ": بانتظار الشبكة…");
    await c.waitForDeployment();
    return c;
  }
  function showResult(factory, testKit) {
    S.testKit = testKit; S.factoryOut = factory;
    $("aFactoryOut").textContent = factory;
    $("aFactory").value = factory;
    $("aResult").hidden = false;
    writeSnippet();
  }
  function writeSnippet() {
    const cur = JSON.parse(JSON.stringify(window.JISR_DEPLOYMENTS || {}));
    const entry = Object.assign({}, cur[S.chainId], { factory: S.factoryOut });
    if (S.testKit) entry.faucet = true; else delete entry.faucet;
    const rpc = val("aRpc");
    if (/^https?:\/\//.test(rpc)) entry.rpcUrl = rpc;
    cur[S.chainId] = entry;
    $("aOut").value = "// Maps a chain id to the LaunchpadFactory deployed there.\nwindow.JISR_DEPLOYMENTS = " + JSON.stringify(cur, null, 2) + ";\n";
  }

  async function testKit() {
    await guarded("نشر العدّة التجريبية…", async () => {
      if (MAINNETS[S.chainId]) throw new Error("العدّة التجريبية لا تُنشر على شبكة حقيقية.");
      const stable = await deployContract("MockStable", [6], "1 من 3: العملة المستقرة التجريبية");
      const rate = (S.chainId === "97" ? 650n : 3200n) * 10n ** 6n;
      const router = await deployContract("MockRouter", [ethers.Wallet.createRandom().address, stable.target, rate], "2 من 3: محوّل العملات التجريبي");
      const factory = await deployContract("LaunchpadFactory", [stable.target, router.target, S.account, S.account], "3 من 3: المصنع");
      showResult(factory.target, true);
      status("تم نشر العدّة التجريبية. انسخ النص من الخطوة 4 إلى الملف deployments.js.", "good");
    });
  }

  async function check() {
    S.checked = null; $("aCheckOut").innerHTML = "";
    await guarded("جاري فحص العناوين…", async () => {
      for (const [id, name] of [["aStable", "العملة المستقرة"], ["aRouter", "محوّل العملات"], ["aPlatform", "محفظة المنصة"], ["aOwner", "المالك"]]) {
        if (!isAddr(val(id))) throw new Error("عنوان " + name + " غير صحيح.");
      }
      const stable = new ethers.Contract(val("aStable"), ERC20, S.provider), router = new ethers.Contract(val("aRouter"), ROUTER, S.provider);
      let symbol, dec, weth, rate;
      try { [symbol, dec] = await Promise.all([stable.symbol(), stable.decimals()]); } catch (_) { throw new Error("عنوان العملة المستقرة ليس عقد عملة على هذه الشبكة."); }
      try { weth = await router.WETH(); } catch (_) { throw new Error("عنوان محوّل العملات ليس محوّلاً من نوع Uniswap V2 على هذه الشبكة."); }
      try { rate = (await router.getAmountsOut(ethers.parseEther("1"), [weth, val("aStable")]))[1]; } catch (_) { throw new Error("لا توجد سيولة بين عملة الشبكة وهذه العملة المستقرة على هذا المحوّل."); }
      const native = CFG.chains[S.chainId].native;
      const perNative = Number(ethers.formatUnits(rate, Number(dec)));
      $("aCheckOut").innerHTML =
        '<div class="kv"><span>العملة المستقرة</span><b class="ltr">' + esc(symbol) + " · " + Number(dec) + " decimals</b></div>" +
        '<div class="kv"><span>سعر التحويل الحالي عبر المحوّل</span><b class="ltr">1 ' + esc(native) + " ≈ " + perNative.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " " + esc(symbol) + "</b></div>" +
        '<div class="kv"><span>سعر بيع كل عملة في المنصة</span><b class="ltr">0.0001 ' + esc(symbol) + "</b></div>" +
        '<p class="muted">تأكد أن سعر التحويل قريب من سعر السوق. إذا كان بعيداً فالسيولة على هذا المحوّل ضعيفة ولا يصلح.</p>';
      S.checked = { stable: val("aStable"), router: val("aRouter"), platform: val("aPlatform"), owner: val("aOwner") };
      status("العناوين سليمة. راجع الأرقام ثم انشر المصنع.", "good");
    });
  }
  async function deployFactory() {
    await guarded("نشر المصنع…", async () => {
      const c = S.checked;
      if (!c || c.stable !== val("aStable") || c.router !== val("aRouter") || c.platform !== val("aPlatform") || c.owner !== val("aOwner")) { S.checked = null; throw new Error("تغيّرت العناوين بعد الفحص. افحصها من جديد."); }
      const factory = await deployContract("LaunchpadFactory", [c.stable, c.router, c.platform, c.owner], "المصنع");
      showResult(factory.target, false);
      status("تم نشر المصنع. انسخ النص من الخطوة 4 إلى الملف deployments.js.", "good");
    });
  }

  async function load() {
    S.factory = null; $("aInfo").innerHTML = "";
    await guarded("جاري قراءة المصنع…", async () => {
      if (!isAddr(val("aFactory"))) throw new Error("عنوان المصنع غير صحيح.");
      const f = new ethers.Contract(val("aFactory"), ART.LaunchpadFactory.abi, S.provider);
      let d;
      try { d = await Promise.all([f.stable(), f.router(), f.platformWallet(), f.owner(), f.coinCount()]); } catch (_) { throw new Error("هذا العنوان ليس مصنعاً على هذه الشبكة."); }
      const row = (k, v) => '<div class="kv"><span>' + k + '</span><b class="ltr">' + esc(v) + "</b></div>";
      $("aInfo").innerHTML = row("العملة المستقرة", d[0]) + row("محوّل العملات", d[1]) + row("محفظة المنصة", d[2]) + row("المالك", d[3]) + row("عدد العملات المُطلقة", d[4].toString());
      S.factory = val("aFactory");
      status(d[3].toLowerCase() === S.account.toLowerCase() ? "أنت مالك هذا المصنع." : "هذه المحفظة ليست مالك هذا المصنع، فلا تستطيع تغيير محفظة المنصة.", "good");
    });
  }
  async function setWallet() {
    await guarded("تغيير محفظة المنصة…", async () => {
      if (!isAddr(val("aNewWallet"))) throw new Error("عنوان المحفظة الجديدة غير صحيح.");
      const f = new ethers.Contract(S.factory, ART.LaunchpadFactory.abi, S.signer);
      status("وقّع من المحفظة…");
      await (await f.setPlatformWallet(val("aNewWallet"))).wait();
      status("تم تغيير محفظة المنصة.", "good");
    });
    if ($("aStatus").classList.contains("good")) await load();
  }

  $("aConnect").addEventListener("click", connect);
  $("aTestKit").addEventListener("click", testKit);
  $("aCheck").addEventListener("click", check);
  $("aDeploy").addEventListener("click", deployFactory);
  $("aAck").addEventListener("change", sync);
  $("aLoad").addEventListener("click", load);
  $("aSetWallet").addEventListener("click", setWallet);
  $("aRpc").addEventListener("input", writeSnippet);
  ["aStable", "aRouter", "aPlatform", "aOwner"].forEach((id) => $(id).addEventListener("input", () => { S.checked = null; $("aCheckOut").innerHTML = ""; sync(); }));
  $("aCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("aOut").value); status("تم نسخ النص.", "good"); }
    catch (_) { $("aOut").focus(); $("aOut").select(); status("حدّد النص وانسخه يدوياً.", ""); }
  });
  sync();
})();
