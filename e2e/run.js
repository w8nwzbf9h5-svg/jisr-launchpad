// End-to-end test: a local chain, the real contracts, the real web app, and a real (headless) browser.
// The browser gets a stand-in wallet that forwards requests to the local chain's unlocked test account.
//
//   npm run e2e            (needs Chrome; set CHROME_PATH if it is not at /usr/bin/google-chrome)
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const puppeteer = require("puppeteer-core");
const { ethers } = require("ethers");

const ROOT = path.join(__dirname, "..");
const RPC = "http://127.0.0.1:8545", WEB = "http://127.0.0.1:4173";
const E18 = 10n ** 18n, M = 1_000_000n * E18;
const DEPLOYMENTS = path.join(ROOT, "web", "deployments.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol) => (a > b ? a - b : b - a) <= tol;

function waitFor(child, text, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for: " + text)), ms);
    const on = (d) => { if (String(d).includes(text)) { clearTimeout(timer); resolve(); } };
    child.stdout.on("data", on); child.stderr.on("data", on);
  });
}

(async () => {
  const kids = [];
  const original = fs.readFileSync(DEPLOYMENTS, "utf8");
  let browser, failed = false;
  const steps = [];
  const step = (name) => { steps.push(name); console.log("  ✔ " + name); };
  try {
    const node = spawn(process.execPath, [require.resolve("hardhat/internal/cli/cli"), "node", "--port", "8545"], { cwd: ROOT }); kids.push(node);
    await waitFor(node, "Started HTTP", 60000);
    const out = execFileSync(process.execPath, [require.resolve("hardhat/internal/cli/cli"), "run", "scripts/local-demo.js", "--network", "localhost"], { cwd: ROOT }).toString().trim().split("\n").pop();
    const dep = JSON.parse(out);
    const web = spawn(process.execPath, ["scripts/serve.js"], { cwd: ROOT }); kids.push(web);
    await waitFor(web, "Web app on", 15000);

    const provider = new ethers.JsonRpcProvider(RPC);
    const accounts = await provider.send("eth_accounts", []);
    const account = ethers.getAddress(accounts[5]);
    const art = (n) => require(path.join(ROOT, "artifacts", "contracts", n + ".sol", n + ".json")).abi;
    const stable = new ethers.Contract(dep.stable, require(path.join(ROOT, "artifacts/contracts/mocks/MockStable.sol/MockStable.json")).abi, provider);
    const factory = new ethers.Contract(dep.factory, art("LaunchpadFactory"), provider);

    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.evaluateOnNewDocument((rpc, acct) => {
      let id = 1;
      window.ethereum = {
        request: async ({ method, params }) => {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [acct];
          if (method === "wallet_switchEthereumChain") return null;
          const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params: params || [] }) });
          const j = await r.json();
          if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; }
          return j.result;
        },
        on() {}, removeListener() {},
      };
    }, RPC, account);

    // hide any earlier message first, so each wait sees only the message its own action produced
    const hush = () => page.evaluate(() => { document.querySelector("#toast").hidden = true; });
    const toast = (text) => page.waitForFunction((t) => { const el = document.querySelector("#toast"); return el && !el.hidden && el.textContent.includes(t); }, { timeout: 40000 }, text);
    const idle = () => page.waitForFunction(() => !document.body.classList.contains("busy") && !document.body.dataset.loading, { timeout: 40000 });
    const quoteReady = (text) => page.waitForFunction((t) => { const b = document.querySelector("#goBtn"), q = document.querySelector("#quote"); return b && !b.disabled && q && q.textContent.includes(t); }, { timeout: 20000 }, text || "You receive");
    const type = async (sel, v) => { await page.waitForSelector(sel); await page.$eval(sel, (el) => { el.value = ""; }); await page.type(sel, v); };
    const text = (sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, " ").trim());
    const click = async (sel) => { await page.waitForSelector(sel); await page.$eval(sel, (el) => el.click()); };
    const settle = async () => { await sleep(150); await idle(); await sleep(150); };

    // 1. The board loads from the chain without a wallet.
    await page.goto(WEB, { waitUntil: "networkidle0" });
    await page.waitForSelector("#rows .row");
    const board = await text("#rows");
    assert(board.includes("Camel Cash") && board.includes("Karak Chai"), "board should list the two demo coins");
    assert(board.includes("40% sold") && board.includes("Graduated"), "board should show sale progress and graduation: " + board);
    step("board lists coins read from the chain");

    // 2. Connect the wallet and take test money.
    await click("#walletBtn");
    await page.waitForFunction(() => document.querySelector("#walletTxt").textContent.includes("0x"));
    await click("[data-act=faucet]");
    await toast("added to your wallet"); await settle();
    assert.equal(await stable.balanceOf(account), 10000n * 10n ** 6n);
    step("wallet connects and receives test money");

    // 3. Launch a coin.
    await click("#nav-launch");
    await type("#lName", "E2E Coin"); await type("#lTicker", "e2e");
    await hush(); await click("#launchBtn");
    await toast("is live"); await settle();
    await page.waitForFunction(() => { const h = document.querySelector("#v-coin h1"); return h && h.textContent === "E2E Coin"; });
    const count = Number(await factory.coinCount());
    const coinAddr = await factory.coins(count - 1), marketAddr = await factory.marketOf(coinAddr);
    const coin = new ethers.Contract(coinAddr, art("Coin"), provider), market = new ethers.Contract(marketAddr, art("CoinMarket"), provider);
    assert.equal(await market.creator(), account);
    assert.equal(await coin.balanceOf(account), 0n, "the creator gets no coins");
    step("launching a coin creates it on chain with no coins for the creator");

    // 4. Buy with the stablecoin: $1,000 buys 9.5M coins.
    await type("#buyAmt", "1000"); await quoteReady();
    assert((await text("#quote")).includes("9.50M E2E"), "quote should show 9.50M: " + (await text("#quote")));
    await hush(); await click("#goBtn"); await toast("Bought"); await settle();
    assert(near(await coin.balanceOf(account), (95n * M) / 10n, 10n ** 13n), "should hold 9.5M coins");
    assert(near(await stable.balanceOf(account), 9000n * 10n ** 6n, 10n), "should have paid $1,000");
    assert.equal(await market.floorReserve() >= await market.floorLiability(), true);
    step("buying with the stablecoin: $1,000 in, 9.5M coins out");

    // 5. Buy with the native currency: unused native is refunded.
    await click("[data-act=payWith][data-v=native]");
    const eth0 = await provider.getBalance(account);
    await type("#buyAmt", "0.2"); await quoteReady();
    await hush(); await click("#goBtn"); await toast("Bought"); await settle();
    const held5 = await coin.balanceOf(account);
    assert(near(held5, (95n * M) / 10n + (60192n * M) / 10000n, 10n ** 14n), "native buy should add about 6.0192M coins, holds " + held5);
    const spentEth = eth0 - (await provider.getBalance(account));
    assert(spentEth > 197n * 10n ** 15n && spentEth < 2n * 10n ** 17n, "about 0.198 native spent, the rest refunded: " + spentEth);
    step("buying with the native currency swaps on the way in and refunds the unused part");

    // 6. Sell half for the stablecoin.
    await click("[data-act=tab][data-v=sell]");
    await click("[data-act=pct][data-v='50']"); await quoteReady();
    const st0 = await stable.balanceOf(account);
    await hush(); await click("#goBtn"); await toast("Sold"); await settle();
    const got = (await stable.balanceOf(account)) - st0;
    const expectNet = ((held5 / 2n) * 100n * 95n) / 100n / 10n ** 18n; // $0.0001 a coin, less 5%
    assert(near(got, expectNet, 5n), `sale should pay about ${expectNet}, paid ${got}`);
    step("selling half pays the floor price less the 5% fee");

    // 7. Sell the rest for the native currency.
    await click("[data-act=tab][data-v=sell]");
    await click("[data-act=recvIn][data-v=native]");
    await click("[data-act=pct][data-v='100']"); await quoteReady();
    const eth1 = await provider.getBalance(account);
    await hush(); await click("#goBtn"); await toast("Sold"); await settle();
    assert.equal(await coin.balanceOf(account), 0n, "all coins sold");
    assert((await provider.getBalance(account)) > eth1, "native received");
    assert.equal(await market.outstanding(), 0n);
    step("selling the rest for the native currency empties the wallet's coins");

    // 8. Creator fees: anyone can trigger, the creator is paid.
    const owed = await market.creatorFees();
    assert(owed > 0n);
    const st1 = await stable.balanceOf(account);
    await hush(); await click("[data-act=claimCreator]"); await toast("Creator fees paid"); await settle();
    assert.equal((await stable.balanceOf(account)) - st1, owed);
    assert.equal(await market.creatorFees(), 0n);
    step("creator fees are paid out to the creator");

    // 9. The wallet limit trims an oversized buy to 25M coins.
    await click("[data-act=tab][data-v=buy]");
    await click("[data-act=payWith][data-v=stable]");
    await type("#buyAmt", "3000"); await quoteReady("Trimmed");
    await hush(); await click("#goBtn"); await toast("Bought"); await settle();
    assert.equal(await coin.balanceOf(account), 25n * M, "holds exactly the 2.5% limit");
    await type("#buyAmt", "100");
    await page.waitForFunction(() => document.querySelector("#quote").textContent.includes("already hold 2.5%"));
    step("the 2.5% wallet limit trims a large buy and blocks the next one");

    // 10. A graduated coin: buying above the floor, then selling back.
    await page.goto(WEB + "/#coin-" + dep.coins[1], { waitUntil: "networkidle0" });
    await page.waitForFunction(() => { const h = document.querySelector("#v-coin h1"); return h && h.textContent === "Karak Chai"; });
    const kMarket = new ethers.Contract(await factory.marketOf(dep.coins[1]), art("CoinMarket"), provider);
    const kCoin = new ethers.Contract(dep.coins[1], art("Coin"), provider);
    const floorBefore = await kMarket.floorPrice();
    assert(floorBefore > await kMarket.salePrice(), "graduated coin's floor is above the sale price");
    // the page's own pricing code must agree with the contract to the last unit
    await page.waitForFunction(() => window.JISR_APP.state.m && window.JISR_APP.state.m.liability !== undefined);
    for (const coins of [1n, 123456789n * 10n ** 12n, 3n * M, 17n * M]) {
      const mine = await page.evaluate((c) => { const q = window.JISR_MATH.quoteBuy(window.JISR_APP.state.m, BigInt(c)); return [q.total, q.premiumPart, q.communityFee].map(String); }, coins.toString());
      const chain = await kMarket.quoteBuy(coins);
      assert.deepEqual(mine, [chain.total, chain.premiumPart, chain.communityFee].map(String), "page and contract buy quotes differ for " + coins);
      const mineS = await page.evaluate((c) => { const q = window.JISR_MATH.quoteSell(window.JISR_APP.state.m, BigInt(c)); return [q.net, q.premiumPart].map(String); }, coins.toString());
      const chainS = await kMarket.quoteSell(coins);
      assert.deepEqual(mineS, [chainS.net, chainS.premiumPart].map(String), "page and contract sell quotes differ for " + coins);
    }
    await type("#buyAmt", "500"); await quoteReady("priced above the floor");
    await hush(); await click("#goBtn"); await toast("Bought"); await settle();
    const kHeld = await kCoin.balanceOf(account);
    assert(kHeld > 0n);
    await click("[data-act=tab][data-v=sell]");
    await click("[data-act=recvIn][data-v=stable]");
    await click("[data-act=pct][data-v='100']"); await quoteReady();
    await hush(); await click("#goBtn"); await toast("Sold"); await settle();
    assert.equal(await kCoin.balanceOf(account), 0n);
    assert((await kMarket.floorPrice()) >= floorBefore, "the floor never falls");
    assert((await kMarket.floorReserve()) >= (await kMarket.floorLiability()), "still fully covered");
    step("a graduated coin trades above the floor, and page quotes match the contract exactly");

    // 11. The launchpad fee goes to the platform wallet.
    const platform = await factory.platformWallet();
    const p0 = await stable.balanceOf(platform), pOwed = await kMarket.platformFees();
    await hush(); await click("[data-act=sweepPlatform]"); await toast("Launchpad fees paid"); await settle();
    assert.equal((await stable.balanceOf(platform)) - p0, pOwed);
    step("launchpad fees are paid to the platform wallet");

    // 12. The new coin is on the board.
    await click("[data-act=nav][data-v=board]");
    await page.waitForFunction(() => document.querySelector("#rows").textContent.includes("E2E Coin"));
    await page.screenshot({ path: path.join(__dirname, "board.png"), fullPage: true });
    await page.goto(WEB + "/#coin-" + coinAddr, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => { const h = document.querySelector("#v-coin h1"); return h && h.textContent === "E2E Coin"; });
    await sleep(500);
    await page.screenshot({ path: path.join(__dirname, "coin.png"), fullPage: true });
    step("the launched coin appears on the board");

    // ---- The owner's deploy page ----
    const aStatus = (t) => page.waitForFunction((x) => document.querySelector("#aStatus").textContent.includes(x), { timeout: 60000 }, t);
    const facAbi = art("LaunchpadFactory");

    // 13. Deploy the test kit from the wallet.
    await page.goto(WEB + "/admin.html", { waitUntil: "networkidle0" });
    await click("#aConnect"); await aStatus("المحفظة مرتبطة");
    assert((await text("#aNet")).includes("31337"));
    await click("#aTestKit"); await aStatus("تم نشر العدّة التجريبية");
    const kitSnippet = await page.$eval("#aOut", (el) => el.value);
    const kitFactory = kitSnippet.match(/"factory": "(0x[0-9a-fA-F]{40})"/)[1];
    assert(kitSnippet.includes('"faucet": true'), "the test kit snippet turns the faucet on");
    const kit = new ethers.Contract(kitFactory, facAbi, provider);
    assert.equal(await kit.owner(), account);
    assert.equal(await kit.platformWallet(), account);
    assert.equal(Number(await kit.coinCount()), 0);
    step("deploy page: the test kit deploys from the wallet and produces the linking snippet");

    // 14. Deploy a factory with chosen addresses, after the address check.
    await type("#aStable", dep.stable); await type("#aRouter", dep.router);
    assert.equal(await page.$eval("#aDeploy", (el) => el.disabled), true, "deploy stays locked until the addresses are checked");
    await click("#aCheck"); await aStatus("العناوين سليمة");
    assert((await text("#aCheckOut")).includes("mUSD") && (await text("#aCheckOut")).includes("3,200"), "the check shows the stablecoin and the live rate: " + (await text("#aCheckOut")));
    await click("#aDeploy"); await aStatus("تم نشر المصنع");
    const realFactory = await text("#aFactoryOut");
    const real = new ethers.Contract(realFactory, facAbi, provider);
    assert.equal(await real.stable(), dep.stable);
    assert.equal(await real.router(), dep.router);
    // a wrong address is refused before any transaction
    await type("#aRouter", dep.stable); await click("#aCheck"); await aStatus("ليس محوّلاً");
    assert.equal(await page.$eval("#aDeploy", (el) => el.disabled), true);
    step("deploy page: addresses are checked, a wrong one is refused, and the factory deploys");

    // 15. The owner changes the platform wallet; that is all the owner can do.
    await type("#aFactory", realFactory); await click("#aLoad"); await aStatus("أنت مالك هذا المصنع");
    const newWallet = ethers.getAddress(accounts[7]);
    await type("#aNewWallet", newWallet); await click("#aSetWallet");
    await page.waitForFunction((w) => document.querySelector("#aInfo").textContent.includes(w), { timeout: 60000 }, newWallet);
    assert.equal(await real.platformWallet(), newWallet);
    step("deploy page: the owner changes the platform wallet");

    // 16. Paste the snippet into deployments.js and the public site is linked to the new factory.
    await type("#aFactory", realFactory);
    const snippet = await page.$eval("#aOut", (el) => el.value);
    assert(snippet.includes(realFactory));
    fs.writeFileSync(DEPLOYMENTS, snippet);
    await page.goto(WEB + "/#board", { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelector("#rows").textContent.includes("No coins yet"));
    assert((await text("#foot")).includes(realFactory), "the site now points at the new factory");
    await click("#walletBtn");
    await page.waitForFunction(() => document.querySelector("#walletTxt").textContent.includes("0x"));
    await click("#nav-launch");
    await type("#lName", "Linked Coin"); await type("#lTicker", "LINK2");
    await hush(); await click("#launchBtn"); await toast("is live"); await settle();
    assert.equal(Number(await real.coinCount()), 1);
    await type("#buyAmt", "100"); await quoteReady();
    await hush(); await click("#goBtn"); await toast("Bought"); await settle();
    const linkedMarket = new ethers.Contract(await real.marketOf(await real.coins(0)), art("CoinMarket"), provider);
    assert.equal(await linkedMarket.floorReserve(), 97n * 10n ** 6n);
    await page.goto(WEB + "/admin.html", { waitUntil: "networkidle0" });
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(__dirname, "admin.png"), fullPage: true });
    step("linking: the pasted snippet points the site at the new factory, and launching and buying work there");

    assert.deepEqual(pageErrors, [], "the page threw errors: " + pageErrors.join(" | "));
    console.log(`\n  ${steps.length} end-to-end steps passed`);
  } catch (e) {
    failed = true;
    console.error("\n  ✘ FAILED after: " + (steps[steps.length - 1] || "start") + "\n", e);
  } finally {
    if (browser) await browser.close().catch(() => {});
    for (const k of kids) k.kill();
    fs.writeFileSync(DEPLOYMENTS, original);
    process.exit(failed ? 1 : 0);
  }
})();
