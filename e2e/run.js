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
const RPC = "http://127.0.0.1:8545", WEB = "http://127.0.0.1:4173", APP = WEB + "/app.html";
const E18 = 10n ** 18n, M = 1_000_000n * E18;
const DEPLOYMENTS = path.join(ROOT, "web", "deployments.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const zlib = require("zlib");
const os = require("os");
/** A real 300x180 PNG (orange with a blue square), written to a temp file for the upload test. */
function makePng() {
  const w = 300, h = 180, raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 4 + 1) + 1 + x * 4, blue = x > 110 && x < 190 && y > 50 && y < 130;
    raw[o] = blue ? 39 : 242; raw[o + 1] = blue ? 66 : 89; raw[o + 2] = blue ? 245 : 13; raw[o + 3] = 255;
  }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  const file = path.join(os.tmpdir(), "jisr-e2e-coin.png"); fs.writeFileSync(file, png); return file;
}
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
          // A stand-in for a limited mobile wallet: it cannot estimate gas, and it refuses a transaction with no recipient.
          if (localStorage.getItem("e2e.limitedWallet")) {
            if (method === "eth_estimateGas") { const e = new Error("Internal JSON-RPC error."); e.code = -32603; throw e; }
            if (method === "eth_sendTransaction" && localStorage.getItem("e2e.limitedWallet") === "noperm") { const e = new Error("Invalid parameters: must provide an Ethereum address."); e.code = -32602; throw e; }
            if (method === "eth_sendTransaction" && !(params[0] && params[0].to)) { const e = new Error("Unsupported transaction type"); e.code = -32000; throw e; }
          }
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
    await page.goto(APP, { waitUntil: "networkidle0" });
    await page.waitForSelector("#rows .row");
    const board = await text("#rows");
    assert(board.includes("Camel Cash") && board.includes("Karak Chai"), "board should list the two demo coins");
    assert(board.includes("40% sold") && board.includes("Graduated"), "board should show sale progress and graduation: " + board);
    assert.equal(await text("#specPrice"), "Fixed, $100.0K market cap");
    step("board lists coins read from the chain");

    // 1a. The home page: the model gives the launchpad's own numbers, old links still land in the launchpad.
    {
      const thrown = [], onErr = (e) => thrown.push(String(e));
      page.on("pageerror", onErr);
      await page.goto(WEB + "/", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.JISR_HOME && document.querySelector("#bOut").textContent.length > 0);
      // a new visitor is welcomed once, and invited to test and to give feedback
      await page.waitForFunction(() => document.querySelector("#welcome").open);
      const invites = await page.$$eval("#welcome a", (as) => as.map((x) => x.getAttribute("href")));
      assert(invites.includes("solana.html") && invites.includes("app.html") && invites.includes("#contact"),
        "the welcome window offers both launchpads and the way to give feedback: " + invites.join(" "));
      await page.keyboard.press("Escape");
      assert.equal(await page.$eval("#welcome", (d) => d.open), false, "the welcome window closes");
      await page.waitForFunction(() => localStorage.getItem("jisr.welcomed") === "1", { timeout: 5000 });   // and is not shown to the same visitor again
      await page.click("#wOpen");
      assert.equal(await page.$eval("#welcome", (d) => d.open), true, "it opens again from the test notice");
      await page.keyboard.press("Escape");
      // the road to mainnet names the project's coin by its address and both marks
      const roadText = await text("#road");
      assert(roadText.includes("GaWqCRMjHVZD6JNG9yDt9c9eLN1nZnQRJmR4w2zEpump") && roadText.includes("100 pieces of feedback") && roadText.includes("$1M market cap") && roadText.includes("does not have the floor"),
        "the road to mainnet shows the coin's address, the two marks and the warning");
      assert.equal(await page.$eval("#road a.btn.primary", (a) => a.href), "https://pump.fun/coin/GaWqCRMjHVZD6JNG9yDt9c9eLN1nZnQRJmR4w2zEpump");
      assert((await text("#lpad")).includes("Market cap") && (await text("#lpad")).includes("Volume, 24h"), "the coin's figures have their place on the page");
      // the contact form sends a message to the project's inbox through the form service, and says so when it cannot
      await page.evaluate(() => { location.hash = "contact"; }); await page.waitForFunction(() => !document.querySelector("#contact").hidden);
      assert.equal(await page.$eval("#cSend", (b) => b.disabled), true, "nothing to send before a message is written");
      await page.type("#cMsg", "The sell button stays grey after I connect.");
      await page.type("#cEmail", "tester@example.org");
      assert.equal(await page.$$eval('#cForm a[href*="x.com"], #cForm a[href*="github.com"], #cForm a[href*="t.me"]', (a) => a.length), 0, "the contact form does not send the visitor to another site");
      await page.evaluate(() => { window.__sent = []; window.__realFetch = window.fetch; window.fetch = (url, opt) => { if (String(url).startsWith("https://formsubmit.co/")) { window.__sent.push({ url: String(url), body: JSON.parse(opt.body) }); return Promise.resolve(new Response(JSON.stringify({ success: window.__answer }), { status: 200, headers: { "content-type": "application/json" } })); } return window.__realFetch(url, opt); }; window.__answer = "false"; });
      await page.click("#cSend");
      await page.waitForFunction(() => document.querySelector("#cNote").textContent.includes("feedback@landingpad.fun"));
      assert.equal(await page.$eval("#cMsg", (m) => m.value.length > 0), true, "a message that was not delivered stays in the box, and the visitor is told where to email it");
      await page.evaluate(() => { window.__answer = "true"; });
      await page.click("#cSend");
      await page.waitForFunction(() => document.querySelector("#cNote").textContent.startsWith("Sent."));
      const posted = await page.evaluate(() => window.__sent);
      assert.equal(posted.length, 2);
      assert(/^https:\/\/formsubmit\.co\/ajax\/[0-9a-f]{32}$/.test(posted[1].url), "the form posts to the private code, not to an address: " + posted[1].url);
      assert(posted[1].body.message === "The sell button stays grey after I connect." && posted[1].body.topic === "Bug or problem" && posted[1].body._replyto === "tester@example.org", "the message, its topic and the reply address are sent: " + JSON.stringify(posted[1].body));
      assert.equal(await page.$eval("#cMsg", (m) => m.value), "", "the box is cleared once the message is sent");
      await page.evaluate(() => { window.fetch = window.__realFetch; });
      // the vote on the proposed rule changes: all three answers are needed, they are sent in English, and one vote is kept per browser
      await page.evaluate(() => { window.__votes = []; window.__fetchBefore = window.fetch; window.fetch = (u, o) => (String(u).includes("formsubmit.co") ? (window.__votes.push({ url: String(u), body: JSON.parse(o.body) }), Promise.resolve(new Response(JSON.stringify({ success: "true" }), { status: 200 }))) : window.__fetchBefore(u, o)); });
      await page.$eval("#vSend", (b) => b.click());
      assert.equal(await text("#vNote"), "Choose an answer for each proposal.");
      assert.equal(await page.evaluate(() => window.__votes.length), 0, "a vote with a missing answer is not sent");
      await page.evaluate(() => { [["vCap", "Yes"], ["vBrake", "No"], ["vShare", "Not sure"]].forEach(([n, v]) => document.querySelector('input[name="' + n + '"][value="' + v + '"]').click()); document.querySelector("#vWhy").value = "Keep the fee low."; });
      await page.$eval("#vSend", (b) => b.click());
      await page.waitForFunction(() => document.querySelector("#vNote").textContent.startsWith("Your vote is in."));
      const ballot = await page.evaluate(() => window.__votes);
      assert.equal(ballot.length, 1);
      assert(/^https:\/\/formsubmit\.co\/ajax\/[0-9a-f]{32}$/.test(ballot[0].url) && ballot[0].body.ceiling_off === "Yes" && ballot[0].body.brake_on_selling === "No" && ballot[0].body.floor_share === "Not sure" && ballot[0].body.message === "Keep the fee low.", "the three answers and the remark are sent: " + JSON.stringify(ballot[0]));
      assert.equal(await page.$eval("#vSend", (b) => b.disabled), true, "the vote cannot be sent twice");
      await page.evaluate(() => { window.fetch = window.__fetchBefore; });
      assert((await text("#rCoins")).length > 0 && (await text("#rVisits")).length > 0, "the counts of coins and visits are shown, or say they are not available");
      // the scoreboard at the foot of the page: four figures, a line saying how fresh they are, and a button to read again
      assert.equal(await page.$$eval("#nTiles .tile", (t) => t.length), 4, "the scoreboard has four figures");
      assert.deepEqual(await page.$$eval("#nTiles a.tile", (t) => t.map((a) => a.getAttribute("href"))), ["markets.html", "#contact", "#lpad"], "three of the figures lead to the charts, the contact form and the coin");
      await page.waitForFunction(() => !window.JISR_HOME.live.busy && window.JISR_HOME.live.at > 0, { timeout: 30000 });
      const readAt = await page.evaluate(() => window.JISR_HOME.live.at);
      assert(/^(Live\. Read|The figures could not be read)/.test(await text("#nAgo")), "the line above the scoreboard says how fresh the figures are: " + (await text("#nAgo")));
      await page.evaluate(() => { location.hash = "numbers"; }); await page.waitForFunction(() => !document.querySelector("#numbers").hidden);
      await page.click("#nRefresh");
      await page.waitForFunction((t) => !window.JISR_HOME.live.busy && window.JISR_HOME.live.at > t, { timeout: 30000 }, readAt);
      const setIn = (id, v) => page.evaluate((id, v) => { const e = document.querySelector(id); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); }, id, v);
      await setIn("#mSoldIn", 0); await setIn("#bAmt", "1000");
      const buyLine = await text("#bOut");
      assert(buyLine.includes("9.5M coins") && buyLine.includes("$902.50"), "the model: $1,000 buys 9.5M coins and they sell back for $902.50: " + buyLine);
      assert.equal(await page.$eval("#mVol", (e) => e.disabled), true, "the floor cannot rise before the sale has sold out");
      await setIn("#mSoldIn", 800);
      assert.equal(await text("#rReserve"), "$81,684", "the reserve at graduation");
      assert.equal(await page.$eval("#mVol", (e) => e.disabled), false);
      await setIn("#mVol", 4000000);
      assert.equal(await text("#rFloor"), "$0.000202", "after $4M of trading the floor has about doubled");
      assert.equal(await text("#rCover"), "100.0%");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "the home page fits a phone screen");
      assert.deepEqual(thrown, [], "the home page threw errors: " + thrown.join(" | "));
      page.off("pageerror", onErr);
      // the stress test: 20 random sequences of each kind; the promised rules hold after every trade, everyone can exit, the attacker loses
      const stress = await page.evaluate(() => {
        const out = { broken: 0, unpaid: 0, attackerGain: 0, trades: 0 };
        for (let seed = 1; seed <= 20; seed++) for (const mode of ["crowd", "attacker"]) {
          const r = window.JISR_HOME.simulate(mode, seed);
          out.broken += r.broken; out.trades += r.checks;
          if (r.exits !== r.holders || r.left !== 0n) out.unpaid++;
          if (mode === "attacker" && r.loss <= 0n) out.attackerGain++;
        }
        return out;
      });
      assert.deepEqual([stress.broken, stress.unpaid, stress.attackerGain], [0, 0, 0], "stress test over " + stress.trades + " trades: " + JSON.stringify(stress));
      await page.evaluate(() => window.JISR_HOME.runStress("attacker", { seed: 3, animate: false }));
      assert.equal(await text("#sBroken"), "0 times");
      assert((await text("#sSay")).includes("a loss of $"), "the attacker's loss is reported");
      assert.deepEqual(thrown, [], "the stress test threw errors: " + thrown.join(" | "));
      await page.goto("about:blank");
      await page.goto(WEB + "/#board", { waitUntil: "networkidle0" });
      assert(page.url().endsWith("/app.html#board"), "an old link to the board lands in the launchpad: " + page.url());
      await page.goto(APP, { waitUntil: "networkidle0" });
      step("home page: the model matches the contracts, the stress test holds over " + stress.trades + " simulated trades, old links still open the launchpad");
    }

    // 1a2. The home page in the nine other languages: every text is translated, the page still works and fits a phone.
    {
      const out = execFileSync("node", [path.join(ROOT, "scripts", "i18n.js"), "build"], { encoding: "utf8" });
      assert(!/not translated|marks differ|unknown code|appears twice/.test(out), "the translation files are complete and well formed:\n" + out);
      const english = "Launch Beyond Limits.";
      for (const lang of ["ar", "zh", "es", "hi", "fr", "ru", "pt", "id", "tr"]) {
        const thrown = [], onErr = (e) => thrown.push(String(e));
        page.on("pageerror", onErr);
        await page.goto(WEB + "/?lang=" + lang, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => window.JISR_HOME && document.querySelector("#bOut").textContent.length > 0);
        await page.evaluate(() => window.JISR_HOME.runStress("attacker", { seed: 3, animate: false }));
        const seen = await page.evaluate(() => ({ missing: window.JISR_I18N.missing, lang: document.documentElement.lang, dir: document.documentElement.dir, h1: document.querySelector("h1").textContent,
          pick: document.querySelector(".lang-pick").value, fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth, buy: document.querySelector("#bOut").textContent, hidden: getComputedStyle(document.body).visibility }));
        assert.deepEqual(seen.missing, [], lang + ": texts with no translation: " + seen.missing.join(" | "));
        assert(seen.lang === lang && seen.pick === lang && seen.h1 !== english && seen.h1.length > 5, lang + ": the page is shown in that language: " + JSON.stringify(seen));
        assert.equal(seen.dir, lang === "ar" ? "rtl" : "", lang + ": text direction");
        assert(seen.buy.includes("$1,000.00") && seen.buy.includes("$902.50") && seen.hidden === "visible", lang + ": the model still gives the same figures: " + seen.buy);
        assert.equal(seen.fits, true, lang + ": the home page fits a phone screen");
        assert.deepEqual(thrown, [], lang + ": the home page threw errors: " + thrown.join(" | "));
        page.off("pageerror", onErr);
      }
      // choosing a language from the menu reloads the page in it and remembers the choice; English brings it back
      await page.select(".lang-pick", "es");
      await page.waitForFunction(() => document.documentElement.lang === "es" && window.JISR_HOME && !/[?&]lang=/.test(location.search));
      assert.equal(await text("h1"), "Lanza sin límites.");
      await page.goto(WEB + "/", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.JISR_HOME && document.documentElement.lang === "es");
      await page.select(".lang-pick", "en");
      await page.waitForFunction((t) => window.JISR_HOME && document.querySelector("h1").textContent === t, {}, english);
      // the simulator for the proposed rules works out its figures and fits a phone
      const simErr = [], onSim = (e) => simErr.push(String(e));
      page.on("pageerror", onSim);
      await page.goto(WEB + "/simulator.html", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelectorAll("#rows tr").length === 4 && /%$/.test(document.querySelector("#sBack").textContent));
      const sim = await page.evaluate(() => ({ back: document.querySelector("#sBack").textContent, real: document.querySelector("#sReal").textContent, fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth, lines: document.querySelectorAll("#svg path.ln").length }));
      assert(sim.back === "81%" && /^\$4\d\dK$/.test(sim.real) && sim.fits && sim.lines === 2, "the simulator shows the proposed setup at a $40M top: " + JSON.stringify(sim));
      assert.deepEqual(simErr, [], "the simulator threw errors: " + simErr.join(" | "));
      page.off("pageerror", onSim);
      await page.goto(APP, { waitUntil: "networkidle0" });
    }

    // 1b. The white paper is linked from the site and reads in English and Arabic.
    assert.equal(await page.$eval("#nav-paper", (el) => el.getAttribute("href")), "whitepaper.html");
    await page.goto(WEB + "/whitepaper.html?lang=en", { waitUntil: "networkidle0" });
    assert((await text("#paper-en h1")).includes("White Paper"));
    assert.equal(await page.$eval("#paper-ar", (el) => el.hidden), true);
    assert.equal(await page.$$eval("#langSel option", (o) => o.length), 10, "ten languages are offered");
    await page.select("#langSel", "ar");
    assert.equal(await page.$eval("#paper-en", (el) => el.hidden), true);
    assert((await text("#paper-ar h1")).includes("الورقة البيضاء"));
    assert.equal(await page.$eval("#paper-ar", (el) => el.dir), "rtl");
    for (const code of ["zh", "es", "hi", "fr", "ru", "pt", "tr", "id"]) {
      await page.select("#langSel", code);
      assert.equal(await page.$eval("#paper-" + code, (el) => el.hidden), false);
      assert((await text("#paper-" + code)).includes("0x4e34BD62B8245Fa7841061eeFa010fF054FA9d06"), code + " carries the same facts");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, code + " fits a phone screen");
    }
    await page.select("#langSel", "ar");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "the paper fits a phone screen");
    assert.equal(await page.$$eval("#paper-en figure.fig", (f) => f.length), 4, "the paper has its four figures");
    assert.equal(await page.$$eval("figure.fig", (f) => f.length), 40, "in every language");
    await page.goto(APP, { waitUntil: "networkidle0" });
    await page.waitForSelector("#rows .row");
    step("white paper: linked from the site, ten languages, fits a phone");

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
    assert((await text("#lNetHint")).includes("Local test chain") && (await text("#lNetHint")).includes("mUSD"), "the form says which network and currency the coin gets");
    // links that are not what they claim are refused before anything is sent
    await type("#l-x", "https://evil.example/yourcoin"); await click("#launchBtn");
    await page.waitForFunction(() => document.querySelector("#lErr").textContent.includes("X link is not valid"));
    await type("#l-x", "x.com/e2ecoin");
    await type("#l-website", "javascript:alert(1)"); await click("#launchBtn");
    await page.waitForFunction(() => document.querySelector("#lErr").textContent.includes("Website link is not valid"));
    await type("#l-website", "https://e2ecoin.example");
    await type("#l-telegram", "https://t.me/e2ecoin");
    await type("#lDesc", "A coin launched by the browser test.");
    await (await page.$("#lImgFile")).uploadFile(makePng());
    await page.waitForSelector("#lImgPrev img");
    await hush(); await click("#launchBtn");
    await toast("is live"); await settle();
    await page.waitForFunction(() => { const h = document.querySelector("#v-coin h1"); return h && h.textContent === "E2E Coin"; });
    const count = Number(await factory.coinCount());
    const coinAddr = await factory.coins(count - 1), marketAddr = await factory.marketOf(coinAddr);
    const coin = new ethers.Contract(coinAddr, art("Coin"), provider), market = new ethers.Contract(marketAddr, art("CoinMarket"), provider);
    assert.equal(await market.creator(), account);
    assert.equal(await coin.balanceOf(account), 0n, "the creator gets no coins");
    step("launching a coin creates it on chain with no coins for the creator");

    // 3b. Picture, description and links are stored with the coin and shown on its page.
    const meta = JSON.parse(await coin.metadataURI());
    assert.equal(meta.description, "A coin launched by the browser test.");
    assert.equal(meta.x, "https://x.com/e2ecoin");
    assert.equal(meta.telegram, "https://t.me/e2ecoin");
    assert.equal(meta.website, "https://e2ecoin.example/");
    assert(/^data:image\/(webp|jpeg);base64,/.test(meta.image) && meta.image.length < 9500, "the photo was shrunk to a small picture: " + meta.image.length + " chars");
    assert.equal(await page.$eval(".chead .ava img", (el) => el.getAttribute("src")), meta.image);
    assert.equal(await text("#cDesc"), "A coin launched by the browser test.");
    const hrefs = await page.$$eval("#cLinks a", (els) => els.map((a) => a.getAttribute("href") + "|" + a.getAttribute("rel")));
    assert.deepEqual(hrefs, ["https://x.com/e2ecoin|noopener noreferrer nofollow", "https://t.me/e2ecoin|noopener noreferrer nofollow", "https://e2ecoin.example/|noopener noreferrer nofollow"]);
    step("picture upload, description and social links are saved with the coin and shown (photo " + meta.image.length + " chars)");

    // 3c. A coin launched outside the app with hostile details cannot inject anything into the page.
    const attacker = await provider.getSigner(accounts[8]);
    const evil = JSON.stringify({ description: '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>', image: "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9IndpbmRvdy5fX3B3bmVkPTEiLz4=", x: "javascript:window.__pwned=1", telegram: "https://t.me.evil.example/x", website: "http://insecure.example" });
    await (await factory.connect(attacker).createCoin("<b id=inj>Evil</b><script>", "EVIL", evil)).wait();
    const evilCoin = await factory.coins(Number(await factory.coinCount()) - 1);
    await page.goto(APP + "#coin-" + evilCoin, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => { const h = document.querySelector("#v-coin h1"); return h && h.textContent.includes("Evil"); });
    assert.equal(await page.evaluate(() => window.__pwned), undefined, "hostile coin details must not run");
    assert.equal(await page.$("#v-coin h1 b"), null, "the name is shown as text, not as markup");
    assert.equal(await page.$("#cLinks"), null, "bad links are dropped");
    assert.equal(await page.$(".chead .ava img"), null, "an SVG picture is refused");
    assert((await text("#cDesc")).includes("<img src=x"), "the description is shown as plain text");
    await page.goto(APP + "#board", { waitUntil: "networkidle0" });
    await page.waitForSelector("#rows .row");
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
    await page.goto(APP + "#coin-" + coinAddr, { waitUntil: "networkidle0" });
    await page.waitForFunction(() => { const h = document.querySelector("#v-coin h1"); return h && h.textContent === "E2E Coin"; });
    await click("#walletBtn");
    await page.waitForFunction(() => document.querySelector("#walletTxt").textContent.includes("0x"));
    await settle();
    step("hostile coin details from another launcher are shown as plain text and cannot inject anything");

    // 4. Buy with the stablecoin: $1,000 buys 9.5M coins.
    await type("#buyAmt", "1000"); await quoteReady();
    assert((await text("#quote")).includes("9.50M E2E"), "quote should show 9.50M: " + (await text("#quote")));
    await hush(); await click("#goBtn"); await toast("Bought"); await settle();
    assert(near(await coin.balanceOf(account), (95n * M) / 10n, 10n ** 13n), "should hold 9.5M coins");
    // this wallet launched the coin, so the creator's 1% of its own trade ($10) came straight back with it
    assert(near(await stable.balanceOf(account), 9010n * 10n ** 6n, 10n), "should have paid $1,000 and received the $10 creator fee");
    assert.equal(await market.creatorFees(), 0n, "the fee was paid out by the trade");
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
    const creatorCut = ((held5 / 2n) * 100n) / 100n / 10n ** 18n; // and the creator's 1%, which is this same wallet
    assert(near(got, expectNet + creatorCut, 5n), `sale should pay about ${expectNet} plus the creator fee ${creatorCut}, paid ${got}`);
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

    // 8. Creator fees: every trade paid them out as it happened. Nothing waits and there is nothing to press.
    const sum = (evs) => evs.reduce((t, e) => t + e.args.amount, 0n);
    const paidToCreator = await market.queryFilter(market.filters.CreatorFeesClaimed());
    assert(paidToCreator.length >= 2 && sum(paidToCreator) > 0n, "each trade paid the creator");
    assert(paidToCreator.every((e) => e.args.creator.toLowerCase() === account.toLowerCase()), "only the creator was paid");
    assert.equal(await market.creatorFees(), 0n);
    assert.equal(await page.$eval("[data-act=claimCreator]", (b) => b.disabled), true, "the Pay button has nothing to pay");
    step("creator fees were paid to the creator by the trades themselves");

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
    await page.goto(APP + "#coin-" + dep.coins[1], { waitUntil: "networkidle0" });
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
    const swept = sum(await kMarket.queryFilter(kMarket.filters.PlatformFeesSwept())) + sum(await market.queryFilter(market.filters.PlatformFeesSwept()));
    assert(swept > 0n, "the trades paid the launchpad");
    assert.equal(await kMarket.platformFees(), 0n);
    assert((await stable.balanceOf(platform)) >= swept, "the money is in the platform wallet");
    assert.equal(await page.$eval("[data-act=sweepPlatform]", (b) => b.disabled), true, "the Pay button has nothing to pay");
    step("launchpad fees were paid to the platform wallet by the trades themselves");

    // 12. The new coin is on the board.
    await click("[data-act=nav][data-v=board]");
    await page.waitForFunction(() => document.querySelector("#rows").textContent.includes("E2E Coin"));
    await page.screenshot({ path: path.join(__dirname, "board.png"), fullPage: true });
    await page.goto(APP + "#coin-" + coinAddr, { waitUntil: "networkidle0" });
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
    const kitFactory = await text("#aFactoryOut");
    const kitObj = JSON.parse(kitSnippet.split("window.JISR_DEPLOYMENTS =")[1].replace(/;\s*$/, ""));
    assert.equal(kitObj["31337"].factory, dep.factory, "the factory already linked is kept");
    assert.deepEqual(kitObj["31337"].extraFactories, [kitFactory], "the new one is added beside it as another currency");
    assert.equal(kitObj["31337"].faucet, true, "the test kit snippet turns the faucet on");
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

    // 16a. Two currencies on one network: the site offers each factory separately, with its own coins.
    const both = await page.$eval("#aOut", (el) => el.value);
    const bothObj = JSON.parse(both.split("window.JISR_DEPLOYMENTS =")[1].replace(/;\s*$/, ""));
    assert.equal(bothObj["31337"].factory, dep.factory);
    assert.deepEqual(bothObj["31337"].extraFactories, [realFactory]);
    fs.writeFileSync(DEPLOYMENTS, both);
    await page.goto(APP + "#board", { waitUntil: "networkidle0" });
    await page.waitForSelector("#rows .row");
    assert.equal(await page.$$eval("#netSel option", (o) => o.length), 2, "both factories are offered in the menu");
    assert((await text("#rows")).includes("Camel Cash"), "the first currency shows its own coins");
    await page.select("#netSel", "31337:1");
    await page.waitForFunction(() => document.querySelector("#rows").textContent.includes("No coins yet"));
    assert((await text("#foot")).includes(realFactory));
    step("two currencies on one network: each factory is offered separately with its own coins");

    // 16b. Markets: every coin with its chart, its trades and its holders, read from the chain with no wallet.
    {
      await page.goto(WEB + "/markets.html", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#rows .mk-row", { timeout: 60000 });
      const listed = await page.$$eval("#rows .mk-row .nm b", (b) => b.map((x) => x.textContent));
      assert(listed.includes("Camel Cash"), "the markets page lists the coins: " + listed.join(", "));
      assert.equal(await page.$eval("#detail", (d) => d.hidden), true, "on a phone the list comes first");
      // open the coin that has been traded the most in the steps above
      await page.evaluate(() => { const M = window.JISR_MARKETS; M.pick(M.state.coins.slice().sort((a, b) => b.sold - a.sold)[0].id, true); });
      await page.waitForFunction(() => { const s = window.JISR_MARKETS.state, d = s.cur && s.cache[s.cur.id]; return !!d; }, { timeout: 60000 });
      await sleep(300);
      const mk = await page.evaluate(() => {
        const s = window.JISR_MARKETS.state, c = s.cur, d = s.cache[c.id];
        return { failed: !!d.failed, trades: d.trades.length, priced: d.trades.every((t) => t.price >= c.sale * 0.999 && t.t > 0), last: d.trades.length ? d.trades[d.trades.length - 1].price : 0, price: c.price, floor: c.floor,
          holders: d.holders ? d.holders.length : -1, canvas: !!document.querySelector("#chart canvas"), rows: document.querySelectorAll("#pane tbody tr").length,
          stats: document.querySelector("#dStats").textContent, fits: document.documentElement.scrollWidth <= document.documentElement.clientWidth, hash: location.hash };
      });
      assert.equal(mk.failed, false, "the coin's history was read");
      assert(mk.trades > 0 && mk.rows === Math.min(mk.trades, 200), "its trades are listed: " + JSON.stringify(mk));
      assert(mk.priced, "every trade has a time and a price at or above the sale price");
      assert(mk.canvas, "the chart is drawn");
      assert(mk.stats.includes("Reserve") && mk.stats.includes("covered"), "the stats show the reserve and what it covers: " + mk.stats);
      assert(mk.fits, "the markets page fits a phone screen");
      assert(mk.hash.startsWith("#e/31337/"), "the coin has its own address: " + mk.hash);
      if (process.env.MK_SHOT) {
        await page.screenshot({ path: "/tmp/mk-phone.png", fullPage: true });
        await page.setViewport({ width: 1320, height: 900 }); await sleep(900);
        await page.screenshot({ path: "/tmp/mk-desk.png" });
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 }); await sleep(500);
      }
      await page.click('.mk-tabs [data-tab="holders"]');
      assert((await page.$$eval("#pane tbody tr", (r) => r.length)) > 1, "the holders are listed, with the unsold coins in the launchpad");
      assert((await text("#pane")).includes("held by the launchpad"));
      await page.click('.mk-tabs [data-tab="checks"]');
      const checks = await text("#pane");
      assert(checks.includes("The reserve covers every coin at the floor") && !checks.includes("FAIL"), "the checks pass: " + checks);
      await page.click("#back");
      assert.equal(await page.$eval("#detail", (d) => d.hidden), true, "back to the list");
      step("markets: every coin is listed, and a coin shows its chart, trades, holders and checks from the chain");
    }

    // 15b. A limited mobile wallet: no gas estimates, and no transactions without a recipient.
    // The deploy page goes through the standard CREATE2 deployer and the public endpoint, and still finishes.
    await provider.send("hardhat_setCode", ["0x4e59b44847b379578588920cA78FbF26c0B4956C", "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3"]);
    await page.goto(WEB + "/admin.html", { waitUntil: "networkidle0" });
    await page.evaluate(() => localStorage.setItem("e2e.limitedWallet", "1"));
    await click("#aConnect"); await aStatus("المحفظة مرتبطة");
    await click("#aTestKitStock"); await aStatus("تم نشر العدّة التجريبية");
    const limFactory = await text("#aFactoryOut");
    const lim = new ethers.Contract(limFactory, facAbi, provider);
    assert.equal(await lim.owner(), account, "deployed through the CREATE2 deployer, the owner is still the wallet");
    assert.equal(await lim.saleMarketCap(), 400n * 10n ** 18n);
    assert.notEqual(await lim.router(), ethers.ZeroAddress);
    // a reload keeps the result, so the address is not lost
    await page.goto(WEB + "/admin.html", { waitUntil: "networkidle0" });
    await click("#aConnect"); await aStatus("آخر نشر من هذا الجهاز محفوظ");
    assert.equal(await text("#aFactoryOut"), limFactory);
    // a wallet that has not allowed the account on this network: the page says what to do and offers a fresh connection
    await page.evaluate(() => localStorage.setItem("e2e.limitedWallet", "noperm"));
    assert.equal(await page.$eval("#aReconnect", (el) => el.hidden), true);
    await click("#aTestKit"); await aStatus("لم تسمح لهذا الموقع");
    assert.equal(await page.$eval("#aReconnect", (el) => el.hidden), false, "the reconnect button appears");
    await page.evaluate(() => { localStorage.removeItem("e2e.limitedWallet"); localStorage.removeItem("jisr.lastDeploy"); });
    step("deploy page: a limited mobile wallet still deploys, and a reload keeps the result");

    // 16b. A factory priced in a stock token, with no swap router: deploy it, link it, launch and buy with it.
    await page.goto(WEB + "/admin.html", { waitUntil: "networkidle0" });
    await click("#aConnect"); await aStatus("المحفظة مرتبطة");
    await type("#aStable", dep.stock); await type("#aRouter", ""); await type("#aCap", "400");
    await click("#aCheck"); await aStatus("العناوين سليمة");
    const stockCheck = await text("#aCheckOut");
    assert(stockCheck.includes("mTSLA") && stockCheck.includes("ليست عملة مستقرة") && stockCheck.includes("بدون"), "the check explains a non-dollar reserve and the missing router: " + stockCheck);
    await click("#aDeploy"); await aStatus("تم نشر المصنع");
    const stockFactory = await text("#aFactoryOut");
    const stockF = new ethers.Contract(stockFactory, facAbi, provider);
    assert.equal(await stockF.saleMarketCap(), 400n * 10n ** 18n);
    assert.equal(await stockF.router(), ethers.ZeroAddress);
    fs.writeFileSync(DEPLOYMENTS, await page.$eval("#aOut", (el) => el.value));
    const stockToken = new ethers.Contract(dep.stock, require(path.join(ROOT, "artifacts/contracts/mocks/MockStable.sol/MockStable.json")).abi, await provider.getSigner(accounts[0]));
    await (await stockToken.mint(account, 1000n * 10n ** 18n)).wait();
    await page.goto(APP + "#board", { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelectorAll("#netSel option").length === 3);
    await page.select("#netSel", "31337:2");
    await page.waitForFunction(() => document.querySelector("#specPrice").textContent.includes("mTSLA"));
    assert.equal(await text("#specPrice"), "Fixed, 400 mTSLA market cap");
    assert.equal(await text("#specPay"), "mTSLA", "no native currency without a router");
    await click("#walletBtn");
    await page.waitForFunction(() => document.querySelector("#walletTxt").textContent.includes("0x"));
    await click("#nav-launch");
    assert((await text("#lNetHint")).includes("not a dollar stablecoin"));
    await type("#lName", "Stock Coin"); await type("#lTicker", "STK");
    await hush(); await click("#launchBtn"); await toast("is live"); await settle();
    assert.equal(await page.$("[data-act=payWith][data-v=native]"), null, "the native option is hidden");
    await type("#buyAmt", "4"); await quoteReady();
    const stockQuote = await text("#quote");
    assert(stockQuote.includes("9.50M STK") && stockQuote.includes("mTSLA") && !stockQuote.includes("$"), "quotes are in the stock token: " + stockQuote);
    await hush(); await click("#goBtn"); await toast("Bought"); await settle();
    const stockMarket = new ethers.Contract(await stockF.marketOf(await stockF.coins(0)), art("CoinMarket"), provider);
    assert(near(await stockMarket.floorReserve(), 388n * 10n ** 16n, 10n ** 10n), "4 mTSLA in: 3.8 for coins plus 0.08 kept, held as mTSLA");
    await page.screenshot({ path: path.join(__dirname, "stock.png"), fullPage: true });
    step("a factory priced in a stock token with no router: deploys, links, launches and trades in that token");

    // 16. Paste the snippet into deployments.js and the public site is linked to the new factory.
    fs.writeFileSync(DEPLOYMENTS, "window.JISR_DEPLOYMENTS = " + JSON.stringify({ 31337: { factory: dep.factory, faucet: true } }) + ";\n");
    await page.goto(WEB + "/admin.html", { waitUntil: "networkidle0" });
    await click("#aConnect"); await aStatus("المحفظة مرتبطة");
    await type("#aStable", dep.stable); await type("#aRouter", dep.router);
    await click("#aCheck"); await aStatus("العناوين سليمة");
    await click("#aDeploy"); await aStatus("تم نشر المصنع");
    const realFactory2 = await text("#aFactoryOut");
    await click("#aReplace");
    const snippet = await page.$eval("#aOut", (el) => el.value);
    const replaced = JSON.parse(snippet.split("window.JISR_DEPLOYMENTS =")[1].replace(/;\s*$/, ""));
    assert.equal(replaced["31337"].factory, realFactory2, "ticking replace makes the new factory the linked one");
    assert.equal(replaced["31337"].extraFactories, undefined);
    fs.writeFileSync(DEPLOYMENTS, snippet);
    await page.goto(APP + "#board", { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.querySelector("#rows").textContent.includes("No coins yet"));
    assert((await text("#foot")).includes(realFactory2), "the site now points at the new factory");
    await click("#walletBtn");
    await page.waitForFunction(() => document.querySelector("#walletTxt").textContent.includes("0x"));
    await click("#nav-launch");
    await type("#lName", "Linked Coin"); await type("#lTicker", "LINK2");
    await hush(); await click("#launchBtn"); await toast("is live"); await settle();
    const real2 = new ethers.Contract(realFactory2, facAbi, provider);
    assert.equal(Number(await real2.coinCount()), 1);
    await type("#buyAmt", "100"); await quoteReady();
    await hush(); await click("#goBtn"); await toast("Bought"); await settle();
    const linkedMarket = new ethers.Contract(await real2.marketOf(await real2.coins(0)), art("CoinMarket"), provider);
    assert.equal(await linkedMarket.floorReserve(), 97n * 10n ** 6n);
    await page.goto(WEB + "/admin.html", { waitUntil: "networkidle0" });
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(__dirname, "admin.png"), fullPage: true });
    step("linking: the pasted snippet points the site at the new factory, and launching and buying work there");

    // 18. Sell on this network and receive on another, through Circle's bridge (stand-ins for Circle's contracts and API).
    const deployer = await provider.getSigner(accounts[0]);
    const mock = (n) => { const a = require(path.join(ROOT, "artifacts", "contracts", "mocks", n + ".sol", n + ".json")); return new ethers.ContractFactory(a.abi, a.bytecode, deployer); };
    const messenger = await (await mock("MockMessenger").deploy()).waitForDeployment();
    const transmitter = await (await mock("MockTransmitter").deploy()).waitForDeployment();
    const linked = JSON.parse(snippet.slice(snippet.indexOf("{"), snippet.lastIndexOf("}") + 1));
    Object.assign(linked[31337], { cctp: 0, cctpEnv: { messenger: messenger.target, transmitter: transmitter.target, api: "https://iris.test" } });
    fs.writeFileSync(DEPLOYMENTS, "window.JISR_DEPLOYMENTS = " + JSON.stringify(linked, null, 2) + ";\n");
    // the deploy page publishes the helper beside the factory and adds it to the linking text
    await page.goto(WEB + "/admin.html", { waitUntil: "networkidle0" });
    await click("#aConnect"); await aStatus("المحفظة مرتبطة");
    await type("#aBrFactory", realFactory2); await type("#aBrMessenger", messenger.target);
    await click("#aBrDeploy"); await aStatus("تم نشر عقد البيع عبر الشبكات");
    const withBridge = await page.$eval("#aOut", (el) => el.value);
    const linked2 = JSON.parse(withBridge.slice(withBridge.indexOf("{"), withBridge.lastIndexOf("}") + 1));
    const sellerAddr = linked2[31337].bridges[realFactory2];
    assert(ethers.isAddress(sellerAddr), "the linking text names the helper for this factory");
    assert.deepEqual([linked2[31337].factory, linked2[31337].extraFactories, linked2[31337].cctp], [linked[31337].factory, linked[31337].extraFactories, 0], "the factories already linked are unchanged");
    const sellerC = new ethers.Contract(sellerAddr, ["function factory() view returns (address)", "function messenger() view returns (address)"], provider);
    assert.deepEqual([await sellerC.factory(), await sellerC.messenger()], [realFactory2, messenger.target]);
    fs.writeFileSync(DEPLOYMENTS, withBridge);

    // Circle's API, answered locally
    const iris = { forward: true, msgs: {}, feeUrls: [] };
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const u = req.url();
      if (!u.startsWith("https://iris.test/")) return req.continue();
      const json = (status, body) => req.respond({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
      if (u.includes("/v2/burn/USDC/fees/")) {
        iris.feeUrls.push(u);
        const fwd = iris.forward ? { forwardFee: { low: 56035, med: 57543, high: 59052 } } : {};
        return json(200, [Object.assign({ finalityThreshold: 1000, minimumFee: 1.3 }, fwd), Object.assign({ finalityThreshold: 2000, minimumFee: 0 }, fwd)]);
      }
      if (u.includes("/v2/messages/")) {
        const m = iris.msgs[new URL(u).searchParams.get("transactionHash")];
        return m ? json(200, { messages: [m] }) : json(404, { code: 404, message: "not found" });
      }
      return json(404, {});
    });
    const openLinkedCoin = async () => {
      await page.goto("about:blank"); // a full reload, so the page starts with no remembered fees
      await page.goto(APP + "#board", { waitUntil: "networkidle0" });
      await click("#walletBtn");
      await page.waitForFunction(() => document.querySelector("#walletTxt").textContent.includes("0x"));
      await click("#rows .row"); await page.waitForSelector("#goBtn"); await settle();
      await click("[data-act=tab][data-v=sell]");
    };
    const lastXfer = () => page.evaluate(() => JSON.parse(localStorage.getItem("jisr.xfers"))[0]);
    const poll = async () => { await page.evaluate(() => window.JISR_APP.pollXfers()); await sleep(300); };
    const messengerC = new ethers.Contract(messenger.target, mock("MockMessenger").interface, provider);
    const pad32 = (a) => ethers.zeroPadValue(a, 32);

    await openLinkedCoin();
    await page.waitForSelector("[data-act=recvOn][data-v='84532']");
    assert.equal(await page.$("[data-act=recvOn][data-v='11155111']"), null, "a network with the same Circle number as this one is not offered");
    await click("[data-act=recvOn][data-v='84532']");
    assert.equal(await page.$("[data-act=recvIn]"), null, "across networks the payout is always the reserve dollar");
    await type("#sellAmt", "500000"); await quoteReady("You receive on Base Sepolia");
    const bq = await text("#quote");
    assert(bq.includes("Transfer fee (Circle), up to") && bq.includes("0.06 mUSD") && bq.includes("about 47.44 mUSD") && bq.includes("Circle delivers it there"), "bridge quote: " + bq);
    await hush(); await click("#goBtn"); await toast("on its way to Base Sepolia"); await settle();
    let burn = await messengerC.burns(0);
    // 500,000 coins x $0.0001 = $50, less 5% = $47.50; Circle's cap = 0.057543 delivery + 0.013% of the amount, rounded up
    assert.deepEqual([burn.from, burn.amount, burn.destinationDomain, burn.mintRecipient, burn.destinationCaller, burn.maxFee, burn.minFinalityThreshold, burn.withHook, burn.hookData].map(String),
      [sellerAddr, 47500000n, 6n, pad32(account), ethers.ZeroHash, 57543n + 6175n, 1000n, true, "0x636374702d666f72776172640000000000000000000000000000000000000000"].map(String));
    assert(iris.feeUrls.every((u) => u.endsWith("/v2/burn/USDC/fees/0/6?forward=true")), "fees are asked for this route: " + iris.feeUrls[0]);
    assert.equal(await linkedMarket.floorReserve(), 97n * 10n ** 6n - 49n * 10n ** 6n, "the reserve paid out as in any sale: $50 less the 2% it keeps");
    let x = await lastXfer();
    assert((await text("#xfers")).includes("Waiting for Circle"), "the transfer is listed as waiting");
    iris.msgs[x.hash] = { message: "0x", attestation: "PENDING", status: "pending_confirmations" };
    await poll(); assert((await text("#xfers")).includes("Waiting for Circle"));
    iris.msgs[x.hash] = { message: "0x1234", attestation: "0xabcd", status: "complete" };
    await poll(); assert((await text("#xfers")).includes("Circle is delivering it on Base Sepolia"), "confirmed but not yet delivered: no claim button for a delivery Circle owes");
    assert.equal(await page.$("[data-act=claimXfer]"), null);
    iris.msgs[x.hash] = { message: "0x1234", attestation: "0xabcd", status: "complete", forwardState: "CONFIRMED", forwardTxHash: "0x" + "ab".repeat(32) };
    await poll();
    const done = await text("#xfers");
    assert(done.includes("Delivered on Base Sepolia") && done.includes("about 47.44 mUSD"), "delivered: " + done);
    assert((await page.$eval("#xfers a[href*='sepolia.basescan.org/tx/0xabab']", (el) => el.textContent)) === "View");
    await click("[data-act=hideXfer]");
    assert.equal(await page.$eval("#xfers", (el) => el.hidden), true);
    step("cross-network sale: sold here, Circle asked to deliver on another network, progress shown until delivered");

    // the same sale where Circle offers no delivery: the seller claims on the other network from the page
    iris.forward = false;
    await openLinkedCoin();
    await click("[data-act=recvOn][data-v='84532']");
    await type("#sellAmt", "200000"); await quoteReady("You receive on Base Sepolia");
    assert((await text("#quote")).includes("you claim it from this page"));
    await hush(); await click("#goBtn"); await toast("on its way to Base Sepolia"); await settle();
    burn = await messengerC.burns(1);
    assert.deepEqual([burn.amount, burn.maxFee, burn.withHook, burn.hookData].map(String), [19000000n, 2470n, false, "0x"].map(String));
    x = await lastXfer();
    iris.msgs[x.hash] = { message: "0x5678", attestation: "0xef01", status: "complete" };
    await poll();
    await hush(); await click("[data-act=claimXfer]"); await toast("Claimed on Base Sepolia"); await settle();
    const transmitterC = new ethers.Contract(transmitter.target, mock("MockTransmitter").interface, provider);
    assert.equal(await transmitterC.received(), 1n);
    assert.equal(await transmitterC.used(ethers.keccak256("0x5678")), true, "the claim carried Circle's message");
    assert((await text("#xfers")).includes("Delivered on Base Sepolia"));
    // the page is still trading on its own network afterwards
    await click("[data-act=recvOn][data-v='']");
    await type("#sellAmt", "1000"); await quoteReady("You receive");
    await hush(); await click("#goBtn"); await toast("Sold"); await settle();
    await page.setRequestInterception(false);
    step("cross-network sale without delivery: the seller claims on the other network, then keeps trading here");

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
