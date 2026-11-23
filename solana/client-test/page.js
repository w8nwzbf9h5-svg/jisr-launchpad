// Opens the real Solana page in a browser against a local Solana node, with a stand-in for the
// Phantom wallet, and walks through setup, test dollars, a launch, a buy, a sale and the fee payouts.
// Run by .github/workflows/solana.yml after the program is built. Needs PROGRAM_ID and a fresh local node.
const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const puppeteer = require("puppeteer-core");
const web3 = require("@solana/web3.js");
const J = require("../../web/solana/jisr-solana.js");

const WEB = path.join(__dirname, "..", "..", "web");
const RPC = process.env.RPC_URL || "http://127.0.0.1:8899";
const programId = new web3.PublicKey(process.env.PROGRAM_ID);
const conn = new web3.Connection(RPC, "confirmed");
const seed = Uint8Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 255); // the stand-in wallet's key
const wallet = web3.Keypair.fromSeed(seed);
let steps = 0;
const step = (name) => { steps++; console.log("  ok  " + name); };
const types = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };

(async () => {
  for (let i = 0; ; i++) { try { await conn.getVersion(); break; } catch (e) { if (i > 60) throw new Error("the local Solana node did not start"); await new Promise((r) => setTimeout(r, 1000)); } }
  const sig = await conn.requestAirdrop(wallet.publicKey, 20 * web3.LAMPORTS_PER_SOL);
  const bh = await conn.getLatestBlockhash();
  await conn.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, "confirmed");

  const server = http.createServer((req, res) => {
    let f = path.join(WEB, decodeURIComponent(req.url.split("?")[0]));
    if (f.endsWith(path.sep)) f = path.join(f, "index.html");
    fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end(); } else { res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); res.end(data); } });
  }).listen(4196);
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.setViewport({ width: 393, height: 852, isMobile: true });
    // the page's settings, pointed at the local node
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (new URL(req.url()).pathname.endsWith("/solana/config.js")) {
        return req.respond({ status: 200, contentType: "application/javascript", body: "window.JISR_SOLANA = " + JSON.stringify({ name: "Local Solana node", rpcUrl: RPC, explorer: "https://explorer.solana.com", clusterParam: "?cluster=custom", programId: programId.toBase58() }) + ";" });
      }
      req.continue();
    });
    // a stand-in for Phantom: it signs with the test key and, like the real wallet, never sends anything itself
    await page.evaluateOnNewDocument((seedBytes) => {
      let kp = null;
      const key = () => kp || (kp = window.solanaWeb3.Keypair.fromSeed(Uint8Array.from(seedBytes)));
      window.phantom = { solana: { isPhantom: true, connect: async () => ({ publicKey: key().publicKey }), signTransaction: async (tx) => { tx.partialSign(key()); return tx; }, on() {} } };
    }, Array.from(seed));

    const text = (sel) => page.$eval(sel, (el) => el.textContent);
    const click = (sel) => page.$eval(sel, (el) => el.click());
    const has = (sel, t) => page.waitForFunction((s, x) => { const el = document.querySelector(s); return el && !el.hidden && el.textContent.includes(x); }, { timeout: 60000 }, sel, t);
    const toast = (t) => has("#toast", t);
    const idle = () => page.waitForFunction(() => !document.body.classList.contains("busy"), { timeout: 60000 });
    const fill = async (sel, v) => { await page.focus(sel); await page.$eval(sel, (el) => { el.value = ""; }); await page.type(sel, v); };

    // 1. one-time setup from the page
    await page.goto("http://localhost:4196/solana.html", { waitUntil: "networkidle2" });
    await has("#v-setup", "One-time setup");
    await click("[data-act=connect]");
    await has("#walletTxt", "…");
    assert.equal(await page.$eval("[data-act=init]", (el) => el.disabled), true, "the launchpad cannot start before its currency exists");
    await click("[data-act=mkStable]"); await toast("The test dollar exists now"); await idle();
    await has("#v-setup", "Ready");
    await click("[data-act=init]"); await toast("The launchpad is started"); await idle();
    await has("#rows", "No coins yet");
    const cfg = await J.getConfig(conn, programId);
    assert.deepEqual([cfg.admin.toBase58(), cfg.platformWallet.toBase58(), cfg.stableMint.toBase58()], [wallet.publicKey.toBase58(), wallet.publicKey.toBase58(), J.TEST_DOLLAR.mintKey().publicKey.toBase58()]);
    step("setup from the page: test dollar created, launchpad started with the connected wallet as admin");

    // 2. test dollars
    await click("[data-act=faucet]"); await toast("10,000 test dollars"); await idle();
    await has("#walletTxt", "$10,000.00");
    step("test dollars: 10,000 arrive in the wallet");

    // 3. launch a coin with a description and links
    await click("nav [data-v=launch]");
    await fill("#lName", "Camel Cash"); await fill("#lTicker", "camel");
    await fill("#lImg", "example.org/camel.png"); await fill("#lDesc", "A coin for the caravan. <b>not bold</b>");
    await fill("#l-x", "https://x.com/camelcash"); await fill("#l-telegram", "t.me/camelcash"); await fill("#l-website", "https://camel.example");
    await click("[data-act=launch]"); await toast("$CAMEL is live"); await idle();
    await has("#v-coin", "Camel Cash");
    const coinHtml = await page.$eval("#v-coin", (el) => el.innerHTML);
    assert(coinHtml.includes("A coin for the caravan. &lt;b&gt;not bold&lt;/b&gt;"), "the description is shown as text, never as markup");
    assert.deepEqual(await page.$$eval("#v-coin .about a.chip", (as) => as.map((a) => a.getAttribute("href"))), ["https://x.com/camelcash", "https://t.me/camelcash", "https://camel.example"]);
    assert.equal(await page.$eval("#v-coin .chead img", (el) => el.getAttribute("src")), "https://example.org/camel.png");
    const [m0] = await J.getMarkets(conn, programId, 1n, 1);
    assert.deepEqual([m0.name, m0.symbol, m0.creator.toBase58()], ["Camel Cash", "CAMEL", wallet.publicKey.toBase58()]);
    step("launch from the page: the coin is on the network with its picture, description and links");

    // 4. buy: $1,000 for 9.5M coins
    await fill("#buyAmt", "1000");
    await has("#quote", "9.50M");
    assert((await text("#quote")).includes("$1,000.00") && (await text("#quote")).includes("$50.00"), "quote: " + (await text("#quote")));
    await click("#goBtn"); await toast("Bought 9.50M $CAMEL"); await idle();
    await has("#walletTxt", "$9,000.00");
    await has("#v-coin .stats", "9.50M");
    step("buy from the page: $1,000 buys 9.5M coins");

    // 5. sell everything back: $902.50
    await click("[data-act=tab][data-v=sell]"); await click("[data-act=sellMax]");
    await has("#quote", "$902.50");
    await click("#goBtn"); await toast("Sold 9.50M $CAMEL"); await idle();
    await has("#walletTxt", "$9,902.50");
    step("sell from the page: the 9.5M coins return $902.50");

    // 6. fee payouts
    await has("#v-coin", "$19.50"); // creator: 1% of $1,000 and of $950
    await click("[data-act=payCreator]"); await toast("The creator was paid"); await idle();
    await has("#walletTxt", "$9,922.00");
    await click("[data-act=payPlatform]"); await toast("The launchpad was paid"); await idle();
    await has("#walletTxt", "$9,961.00");
    const m1 = await J.getMarket(conn, programId, m0.coinMint);
    assert.deepEqual([m1.floorOut, m1.curveOut, m1.creatorFees, m1.platformFees, m1.floorReserve].map(String), ["0", "0", "0", "0", "39000000"], "all coins are back, fees paid out, and the reserve kept its 2% of both trades");
    step("fees from the page: creator and launchpad paid; the reserve keeps its share");

    // 7. the wallet limit in the quote, the board, and the page itself
    await click("[data-act=tab][data-v=buy]");
    await fill("#buyAmt", "5000");
    await has("#quote", "Limited to the 2.5%");
    assert((await text("#quote")).includes("25.00M"));
    await click("nav [data-v=board]");
    await has("#rows", "Camel Cash");
    assert.equal(await page.$$eval("#rows .row", (r) => r.length), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "the page fits a phone screen");
    assert.deepEqual(errors, [], "the page threw errors: " + errors.join(" | "));
    step("limit shown before buying; the board lists the coin; no page errors on a phone-sized screen");

    console.log("\n  " + steps + " page steps passed against the program " + programId.toBase58());
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
