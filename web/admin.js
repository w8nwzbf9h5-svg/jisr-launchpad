/* Deploy and manage the LaunchpadFactory from the owner's own wallet. Works on any EVM network. */
(function () {
  "use strict";
  const { ethers } = window;
  const CFG = window.JISR_CONFIG, ART = window.JISR_ARTIFACTS, W = window.JISR_WALLET;
  const ERC20 = ["function symbol() view returns (string)", "function decimals() view returns (uint8)"];
  const ROUTER = ["function WETH() view returns (address)", "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[])"];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const S = { provider: null, signer: null, account: null, chainId: null, checked: null, busy: false, testKit: false, factory: null, factoryOut: null };

  function status(msg, kind) { const el = $("aStatus"); el.textContent = msg; el.className = "status" + (kind ? " " + kind : ""); }
  function explain(e) {
    if (W.rejected(e)) return "ألغيت الطلب من المحفظة.";
    if (W.notPermitted(e)) { $("aReconnect").hidden = false; return "المحفظة لم تسمح لهذا الموقع باستخدام حسابك على هذه الشبكة. افتح صلاحيات الموقع داخل المحفظة وفعّل حسابك على هذه الشبكة، أو اضغط «أعد ربط المحفظة» هنا ووافق من جديد مع اختيار هذه الشبكة ضمن الصلاحيات."; }
    const t = W.detail(e) || String(e);
    if (/insufficient funds/i.test(t)) return "رصيد المحفظة لا يكفي لرسوم الشبكة.";
    if (/OwnableUnauthorizedAccount/.test(t)) return "هذه المحفظة ليست مالك المصنع.";
    if (/BadMarketCap/.test(t)) return "القيمة السوقية المدخلة خارج الحدود المسموحة.";
    if (/did not answer in time/i.test(t)) return "المحفظة لم تردّ. افتح تطبيق المحفظة وتأكد أنها تعمل، ثم أعد المحاولة.";
    if (/did not return a transaction id/i.test(t)) return "المحفظة لم تُرجع رقم العملية. تحقق من سجل المحفظة قبل إعادة المحاولة.";
    return "ردّ المحفظة: " + (t.length > 260 ? t.slice(0, 260) + "…" : t);
  }
  const isAddr = (v) => ethers.isAddress((v || "").trim());
  const val = (id) => $(id).value.trim();
  const known = () => CFG.chains[S.chainId] && !/^Network \d+$/.test(CFG.chains[S.chainId].name) ? CFG.chains[S.chainId] : null;
  /* The network as the site will describe it: from config.js if it is listed there, else from the form. */
  function net() {
    const k = known();
    if (k) return { name: k.name, native: k.native, test: !!k.test, listed: true };
    return { name: val("aNetName"), native: val("aNetNative").toUpperCase(), test: $("aNetTest").checked, listed: false };
  }
  const netReady = () => { const n = net(); return n.listed || (n.name.length >= 2 && /^[A-Z0-9]{2,8}$/.test(n.native)); };

  function sync() {
    const on = !!S.signer && !S.busy, ready = on && netReady(), n = net();
    $("aNewNet").hidden = !S.signer || n.listed;
    $("aTestKit").disabled = !ready || !n.test;
    $("aTestKitStock").disabled = !ready || !n.test;
    $("aCheck").disabled = !ready;
    $("aDeploy").disabled = !ready || !S.checked || (!n.test && !$("aAck").checked);
    $("aLoad").disabled = !on;
    $("aSetWallet").disabled = !on || !S.factory;
    $("aBrDeploy").disabled = !on;
    $("aAckWrap").hidden = !S.signer || n.test;
    if (S.signer) $("aNet").textContent = (n.name || "شبكة غير معرّفة") + " (" + S.chainId + ")" + (n.test ? " · تجريبية" : " · شبكة حقيقية");
  }
  async function guarded(label, fn) {
    if (S.busy) return;
    S.busy = true; sync();
    try { status(label); await fn(); }
    catch (e) { status(explain(e), "bad"); }
    finally { S.busy = false; sync(); }
  }

  async function connect() {
    if (!window.ethereum) {
      if (W.onPhone()) { status("جاري فتح الصفحة داخل تطبيق MetaMask…"); location.href = W.openInWalletUrl(); return; }
      status("لا توجد محفظة. افتح هذه الصفحة من متصفح المحفظة، أو ثبّت إضافة محفظة.", "bad"); return;
    }
    await guarded("جاري ربط المحفظة…", async () => {
      S.provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await S.provider.send("eth_requestAccounts", []);
      S.account = ethers.getAddress(accounts[0]);
      S.signer = W.signer(S.provider, S.account);
      S.chainId = String((await S.provider.getNetwork()).chainId);
      $("aAccount").textContent = S.account;
      const k = known();
      $("aBal").textContent = Number(ethers.formatEther(await S.provider.getBalance(S.account))).toFixed(5) + " " + (k ? k.native : "");
      if (!val("aPlatform")) $("aPlatform").value = S.account;
      if (!val("aOwner")) $("aOwner").value = S.account;
      const c = CFG.chains[S.chainId];
      if (c && ethers.isAddress(c.factory || "") && !val("aFactory")) $("aFactory").value = c.factory;
      if (c && ethers.isAddress(c.factory || "") && !val("aBrFactory")) $("aBrFactory").value = c.factory;
      if (!val("aBrMessenger") && CFG.chains[S.chainId] && CFG.chains[S.chainId].cctp != null && S.chainId !== "31337") $("aBrMessenger").value = CFG.cctp[CFG.chains[S.chainId].test ? "test" : "main"].messenger;
      if (window.ethereum.on) { window.ethereum.on("chainChanged", () => location.reload()); window.ethereum.on("accountsChanged", () => location.reload()); }
      const restored = restoreResult();
      status(restored ? "المحفظة مرتبطة. آخر نشر من هذا الجهاز محفوظ: النص جاهز للنسخ في الخطوة 4." : k ? "المحفظة مرتبطة على " + k.name + "." : "المحفظة مرتبطة. هذه شبكة جديدة على الموقع: اكتب اسمها ورمز عملتها في الخطوة 1.", "good");
    });
  }

  async function reconnect() {
    await guarded("إعادة ربط المحفظة…", async () => { await W.reconnect(); location.reload(); });
  }

  /* Gas to offer when neither the wallet nor the public endpoint can estimate it (measured use plus a margin). */
  const GAS = { MockStable: 800000n, MockRouter: 1200000n, LaunchpadFactory: 4800000n, BridgeSeller: 1500000n };
  async function deployContract(name, args, label) {
    const data = (await new ethers.ContractFactory(ART[name].abi, ART[name].bytecode).getDeployTransaction(...args)).data;
    let addr = null, hash;
    status(label + ": وقّع من المحفظة…");
    if (await W.hasCode(S.chainId, W.PROXY)) {
      // Through the standard CREATE2 deployer: an ordinary transaction with a recipient, which every wallet accepts.
      const salt = ethers.hexlify(ethers.randomBytes(32));
      addr = ethers.getCreate2Address(W.PROXY, salt, ethers.keccak256(data));
      hash = await W.rawSend(S.chainId, S.account, { to: W.PROXY, data: ethers.concat([salt, data]) }, GAS[name] + 150000n, 3);
    } else {
      hash = await W.rawSend(S.chainId, S.account, { data }, GAS[name], 3);
    }
    status(label + ": بانتظار الشبكة…");
    const rc = await W.waitReceipt(S.chainId, hash);
    if (!rc) throw new Error(label + ": لم تؤكد الشبكة العملية خلال 10 دقائق. تحقق من سجل المحفظة ثم أعد المحاولة.");
    if (Number(rc.status) !== 1) throw new Error(label + ": رفضت الشبكة العملية.");
    if (!addr) addr = rc.contractAddress;
    if (!addr || !(await W.hasCode(S.chainId, addr))) throw new Error(label + ": لم يظهر العقد على الشبكة.");
    return { target: ethers.getAddress(addr) };
  }
  function showResult(factory, testKit) {
    S.testKit = testKit; S.factoryOut = factory;
    $("aFactoryOut").textContent = factory;
    $("aFactory").value = factory;
    $("aResult").hidden = false;
    // remember the result on this device, so a page reload does not lose the address
    try { localStorage.setItem("jisr.lastDeploy", JSON.stringify({ chainId: S.chainId, factory, testKit: !!testKit })); } catch (_) {}
    writeSnippet();
  }
  function restoreResult() {
    try {
      const d = JSON.parse(localStorage.getItem("jisr.lastDeploy") || "null");
      if (d && d.chainId === S.chainId && ethers.isAddress(d.factory || "")) { showResult(d.factory, !!d.testKit); return true; }
    } catch (_) {}
    return false;
  }
  function writeSnippet() {
    if (!S.factoryOut && !S.bridgeOut) return;
    const cur = JSON.parse(JSON.stringify(window.JISR_DEPLOYMENTS || {}));
    const prev = cur[S.chainId] || {}, entry = Object.assign({}, prev), n = net();
    const hasOther = !!S.factoryOut && ethers.isAddress(prev.factory || "") && prev.factory.toLowerCase() !== S.factoryOut.toLowerCase();
    $("aReplaceWrap").hidden = !hasOther;
    if (!S.factoryOut) {
      // only a helper was deployed: the factories already linked stay exactly as they are
    } else if (hasOther && !$("aReplace").checked) {
      // keep the factory already linked and add this one beside it, as another currency on the same network
      entry.extraFactories = (prev.extraFactories || []).filter((f) => f.toLowerCase() !== S.factoryOut.toLowerCase()).concat([S.factoryOut]);
    } else {
      entry.factory = S.factoryOut;
      if (entry.extraFactories) entry.extraFactories = entry.extraFactories.filter((f) => f.toLowerCase() !== S.factoryOut.toLowerCase());
    }
    if (!n.listed) { entry.name = n.name; entry.native = n.native; if (n.test) entry.test = true; }
    if (S.testKit) entry.faucet = true;
    if (S.bridgeOut) entry.bridges = Object.assign({}, prev.bridges, { [S.bridgeOut.factory]: S.bridgeOut.seller });
    const rpc = val("aRpc");
    if (/^https?:\/\//.test(rpc)) entry.rpcUrl = rpc;
    cur[S.chainId] = entry;
    $("aOut").value = "// Maps a chain id to the LaunchpadFactory deployed there.\nwindow.JISR_DEPLOYMENTS = " + JSON.stringify(cur, null, 2) + ";\n";
  }

  /* The helper for selling here and receiving on another network. One per factory. */
  async function deployBridge() {
    await guarded("نشر عقد البيع عبر الشبكات…", async () => {
      const n = CFG.chains[S.chainId] || {};
      if (n.cctp == null) throw new Error("Circle لا تدعم هذه الشبكة، فالبيع عبر الشبكات غير متاح عليها.");
      const factory = val("aBrFactory"), messenger = val("aBrMessenger");
      if (!ethers.isAddress(factory) || !ethers.isAddress(messenger)) throw new Error("اكتب عنوان المصنع وعنوان عقد Circle بصيغة صحيحة.");
      if (!(await W.hasCode(S.chainId, factory))) throw new Error("لا يوجد عقد على عنوان المصنع في هذه الشبكة.");
      if (!(await W.hasCode(S.chainId, messenger))) throw new Error("لا يوجد عقد على عنوان Circle في هذه الشبكة.");
      const stable = await new ethers.Contract(factory, ART.LaunchpadFactory.abi, S.provider).stable();
      if (n.usdc && stable.toLowerCase() !== n.usdc.toLowerCase()) throw new Error("عملة احتياط هذا المصنع ليست USDC الأصلية على هذه الشبكة، وجسر Circle ينقل USDC فقط. انشر مصنعاً احتياطه USDC أولاً.");
      const seller = await deployContract("BridgeSeller", [factory, messenger], "عقد البيع عبر الشبكات");
      S.bridgeOut = { factory: ethers.getAddress(factory), seller: seller.target };
      $("aBrOut").textContent = "العقد: " + seller.target;
      $("aFactoryOut").textContent = S.factoryOut || ethers.getAddress(factory);
      $("aResult").hidden = false;
      writeSnippet();
      status("تم نشر عقد البيع عبر الشبكات. انسخ النص من الخطوة 4 إلى الملف deployments.js.", "good");
    });
  }

  /* kind "usd": a 6-decimal test dollar, supply priced at 100,000. kind "stock": an 18-decimal test stock, supply priced at 400 shares. */
  async function testKit(kind) {
    await guarded("نشر العدّة التجريبية…", async () => {
      if (!net().test) throw new Error("العدّة التجريبية لا تُنشر على شبكة حقيقية.");
      const stock = kind === "stock";
      const dec = stock ? 18 : 6, cap = (stock ? 400n : 100000n) * 10n ** BigInt(dec), unit = cap / 100000n;
      // Steps already done are remembered on this device, so a retry after a failure does not pay for them again.
      const key = "jisr.kit:" + S.chainId + ":" + S.account + ":" + kind;
      let done = {};
      try { done = JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch (_) {}
      const keep = () => { try { localStorage.setItem(key, JSON.stringify(done)); } catch (_) {} };
      const have = async (a) => ethers.isAddress(a || "") && (await W.hasCode(S.chainId, a));
      if (!(await have(done.token))) {
        done = { token: (await deployContract("MockStable", stock ? ["Mock Tesla Stock", "mTSLA", dec] : ["Mock USD", "mUSD", dec], "1 من 3: عملة الاحتياط التجريبية")).target }; keep();
      }
      const perNative = (net().native === "BNB" ? 650n : 3200n) * unit;
      if (!(await have(done.router))) {
        done.router = (await deployContract("MockRouter", [ethers.Wallet.createRandom().address, done.token, perNative], "2 من 3: محوّل العملات التجريبي")).target; keep();
      }
      const factory = await deployContract("LaunchpadFactory", [done.token, done.router, S.account, S.account, cap], "3 من 3: المصنع");
      try { localStorage.removeItem(key); } catch (_) {}
      showResult(factory.target, true);
      status("تم نشر العدّة التجريبية. انسخ النص من الخطوة 4 إلى الملف deployments.js.", "good");
    });
  }

  async function check() {
    S.checked = null; $("aCheckOut").innerHTML = "";
    await guarded("جاري فحص العناوين…", async () => {
      for (const [id, name] of [["aStable", "عملة الاحتياط"], ["aPlatform", "محفظة المنصة"], ["aOwner", "المالك"]]) {
        if (!isAddr(val(id))) throw new Error("عنوان " + name + " غير صحيح.");
      }
      const routerAddr = val("aRouter");
      if (routerAddr && !isAddr(routerAddr)) throw new Error("عنوان محوّل العملات غير صحيح. اتركه فارغاً إذا لا تريد محوّلاً.");
      const stable = new ethers.Contract(val("aStable"), ERC20, S.provider);
      let symbol, dec;
      try { [symbol, dec] = await Promise.all([stable.symbol(), stable.decimals()]); } catch (_) { throw new Error("عنوان عملة الاحتياط ليس عقد عملة على هذه الشبكة."); }
      dec = Number(dec);
      let cap;
      try { cap = ethers.parseUnits(val("aCap").replace(/,/g, ""), dec); } catch (_) { throw new Error("القيمة السوقية ليست رقماً صحيحاً."); }
      if (cap < 1000000n || cap > 10n ** 40n) throw new Error("القيمة السوقية خارج الحدود المسموحة.");
      const n = net(), usd = /usd|dai/i.test(symbol);
      const capNum = Number(ethers.formatUnits(cap, dec));
      let h = '<div class="kv"><span>عملة الاحتياط</span><b class="ltr">' + esc(symbol) + " · " + dec + " decimals</b></div>" +
        '<div class="kv"><span>القيمة السوقية عند سعر البيع</span><b class="ltr">' + capNum.toLocaleString("en-US", { maximumFractionDigits: 6 }) + " " + esc(symbol) + "</b></div>" +
        '<div class="kv"><span>سعر بيع كل عملة</span><b class="ltr">' + Number((capNum / 1e9).toPrecision(6)) + " " + esc(symbol) + "</b></div>";
      if (routerAddr) {
        const router = new ethers.Contract(routerAddr, ROUTER, S.provider);
        let weth, rate;
        try { weth = await router.WETH(); } catch (_) { throw new Error("عنوان محوّل العملات ليس محوّلاً من نوع Uniswap V2 على هذه الشبكة."); }
        try { rate = (await router.getAmountsOut(ethers.parseEther("1"), [weth, val("aStable")]))[1]; } catch (_) { throw new Error("لا توجد سيولة بين عملة الشبكة وعملة الاحتياط على هذا المحوّل. اتركه فارغاً أو اختر محوّلاً آخر."); }
        h += '<div class="kv"><span>سعر التحويل الحالي عبر المحوّل</span><b class="ltr">1 ' + esc(n.native) + " ≈ " + Number(ethers.formatUnits(rate, dec)).toLocaleString("en-US", { maximumFractionDigits: 4 }) + " " + esc(symbol) + "</b></div>" +
          '<p class="muted">تأكد أن سعر التحويل قريب من سعر السوق. إذا كان بعيداً فالسيولة على هذا المحوّل ضعيفة ولا يصلح.</p>';
      } else {
        h += '<div class="kv"><span>محوّل العملات</span><b>بدون: الدفع بعملة الاحتياط فقط</b></div>';
      }
      if (!usd) h += '<div class="flag">' + esc(symbol) + " ليست عملة مستقرة بالدولار. الأرضية ستكون عدداً من وحدات " + esc(symbol) + "، فقيمتها بالدولار تتحرك معها. تأكد أيضاً أن هذه العملة تسمح للعقود بحملها وتحويلها دون قيود.</div>";
      $("aCheckOut").innerHTML = h;
      S.checked = { stable: val("aStable"), router: routerAddr, platform: val("aPlatform"), owner: val("aOwner"), capText: val("aCap"), cap };
      status("العناوين سليمة. راجع الأرقام ثم انشر المصنع.", "good");
    });
  }
  async function deployFactory() {
    await guarded("نشر المصنع…", async () => {
      const c = S.checked;
      if (!c || c.stable !== val("aStable") || c.router !== val("aRouter") || c.platform !== val("aPlatform") || c.owner !== val("aOwner") || c.capText !== val("aCap")) { S.checked = null; throw new Error("تغيّرت القيم بعد الفحص. افحصها من جديد."); }
      const factory = await deployContract("LaunchpadFactory", [c.stable, c.router || ethers.ZeroAddress, c.platform, c.owner, c.cap], "المصنع");
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
      $("aInfo").innerHTML = row("عملة الاحتياط", d[0]) + row("محوّل العملات", d[1] === ethers.ZeroAddress ? "بدون" : d[1]) + row("محفظة المنصة", d[2]) + row("المالك", d[3]) + row("عدد العملات المُطلقة", d[4].toString());
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
  $("aReconnect").addEventListener("click", reconnect);
  $("aBrDeploy").addEventListener("click", deployBridge);
  $("aTestKit").addEventListener("click", () => testKit("usd"));
  $("aTestKitStock").addEventListener("click", () => testKit("stock"));
  $("aCheck").addEventListener("click", check);
  $("aDeploy").addEventListener("click", deployFactory);
  $("aAck").addEventListener("change", sync);
  $("aLoad").addEventListener("click", load);
  $("aSetWallet").addEventListener("click", setWallet);
  $("aRpc").addEventListener("input", writeSnippet);
  $("aReplace").addEventListener("change", writeSnippet);
  ["aNetName", "aNetNative"].forEach((id) => $(id).addEventListener("input", () => { sync(); writeSnippet(); }));
  $("aNetTest").addEventListener("change", () => { sync(); writeSnippet(); });
  ["aStable", "aRouter", "aPlatform", "aOwner", "aCap"].forEach((id) => $(id).addEventListener("input", () => { S.checked = null; $("aCheckOut").innerHTML = ""; sync(); }));
  $("aCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("aOut").value); status("تم نسخ النص.", "good"); }
    catch (_) { $("aOut").focus(); $("aOut").select(); status("حدّد النص وانسخه يدوياً.", ""); }
  });
  sync();
})();
