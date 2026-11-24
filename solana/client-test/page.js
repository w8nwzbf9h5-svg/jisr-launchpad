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
  // the visitor's wallet starts with nothing; only the public fee-helper address has SOL, as on devnet after a deployment
  const helperSeed = "064291e20f163c014a27b8e346d730d9d73d4d8c55365839b7b563c6f602c19f";
  const helper = web3.Keypair.fromSeed(Uint8Array.from(helperSeed.match(/../g).map((b) => parseInt(b, 16))));
  const fund = async (key, sol) => {
    const sig = await conn.requestAirdrop(key, sol * web3.LAMPORTS_PER_SOL);
    const bh = await conn.getLatestBlockhash();
    await conn.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, "confirmed");
  };
  await fund(helper.publicKey, 3);
  // a node that has only just started can answer oddly; wait until it has finalized a block before the page uses it
  for (let i = 0; i < 90 && (await conn.getSlot("finalized")) < 1; i++) await new Promise((r) => setTimeout(r, 1000));
  // sign and send from this script, for the steps a second wallet has to take
  const sendAs = async (kp, ixs, extra) => {
    const tx = new web3.Transaction().add(...ixs);
    tx.feePayer = kp.publicKey;
    const bh = await conn.getLatestBlockhash();
    tx.recentBlockhash = bh.blockhash;
    tx.sign(kp, ...(extra || []));
    const sig = await conn.sendRawTransaction(tx.serialize());
    const res = await conn.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, "confirmed");
    if (res.value.err) throw new Error("transaction failed: " + JSON.stringify(res.value.err));
  };

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
    const settings = { name: "Local Solana node", rpcUrl: RPC, explorer: "https://explorer.solana.com", clusterParam: "?cluster=custom", programId: programId.toBase58(), feeHelperSeed: helperSeed, metadataBase: "https://meta.example" };
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (new URL(req.url()).pathname.endsWith("/solana/config.js")) {
        return req.respond({ status: 200, contentType: "application/javascript", body: "window.JISR_SOLANA = " + JSON.stringify(settings) + ";" });
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
    const has = async (sel, t, ms) => {
      try { await page.waitForFunction((s, x) => { const el = document.querySelector(s); return el && !el.hidden && el.textContent.includes(x); }, { timeout: ms || 60000 }, sel, t); }
      catch (e) {
        const seen = await page.evaluate((s) => { const el = document.querySelector(s), to = document.querySelector("#toast"); return { there: el ? el.textContent.slice(0, 300) : null, toast: to ? (to.hidden ? "(hidden) " : "") + to.textContent : null }; }, sel);
        throw new Error('waited for "' + t + '" in ' + sel + " but saw: " + JSON.stringify(seen) + " page errors: " + errors.join(" | "));
      }
    };
    const toast = (t) => has("#toast", t);
    const idle = () => page.waitForFunction(() => !document.body.classList.contains("busy"), { timeout: 60000 });
    // The first request a page sends to a fresh node has failed once in CI for a reason the log did not show.
    // Press again, at most twice, and print what the page said, so a real fault still fails and is visible.
    const pressUntil = async (sel, t) => {
      for (let i = 0; ; i++) {
        await click(sel);
        try { await has("#toast", t, 25000); return; }
        catch (e) { if (i >= 2) throw e; console.log("  again: " + e.message); await idle(); }
      }
    };
    const fill = async (sel, v) => { await page.focus(sel); await page.$eval(sel, (el) => { el.value = ""; }); await page.type(sel, v); };

    // 1. one-time setup from the page
    await page.goto("http://localhost:4196/solana.html", { waitUntil: "networkidle2" });
    await has("#v-setup", "One-time setup");
    await click("[data-act=connect]");
    await has("#walletTxt", "…");
    // with no SOL the wallet cannot pay a fee: the page says so plainly and offers a little SOL
    assert.equal(await conn.getBalance(wallet.publicKey), 0);
    await pressUntil("[data-act=mkStable]", "Your wallet has no SOL"); await idle();
    await has("#stripTxt", "Get SOL for fees");
    await click("[data-act=solFaucet]"); await toast("0.2 SOL added to your wallet"); await idle();
    assert.equal(await conn.getBalance(wallet.publicKey), 200000000);
    assert.equal(await page.$("[data-act=solFaucet]"), null, "the offer goes away once the wallet can pay fees");
    assert.equal(await page.$eval("[data-act=init]", (el) => el.disabled), true, "the launchpad cannot start before its currency exists");
    await click("[data-act=mkStable]"); await toast("The test dollar exists now"); await idle();
    await has("#v-setup", "Ready");
    await click("[data-act=init]"); await toast("The launchpad is started"); await idle();
    await has("#rows", "No coins yet");
    await has("#adminBox", "Your wallet is the admin");
    const cfg = await J.getConfig(conn, programId);
    assert.deepEqual([cfg.admin.toBase58(), cfg.platformWallet.toBase58(), cfg.stableMint.toBase58()], [wallet.publicKey.toBase58(), wallet.publicKey.toBase58(), J.TEST_DOLLAR.mintKey().publicKey.toBase58()]);
    step("setup from the page: an empty wallet gets fee money, the test dollar is created, the launchpad starts with that wallet as admin");

    // 2. test dollars
    await click("[data-act=faucet]"); await toast("10,000 test dollars"); await idle();
    await has("#walletTxt", "$10.0K");
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
    const md = J.decodeMetadata(await conn.getAccountInfo(J.metadataAddress(m0.coinMint)));
    assert.deepEqual([md.name, md.symbol, md.uri, md.isMutable], ["Camel Cash", "CAMEL", "https://meta.example/" + m0.address.toBase58(), false], "what wallets will show: the name, the ticker and the link to the metadata service");
    step("launch from the page: the coin is on the network with its picture, description and links, and with its name for wallets");

    // 4. buy: $1,000 for 9.5M coins
    await fill("#buyAmt", "1000");
    await has("#quote", "9.50M");
    assert((await text("#quote")).includes("$1,000.00") && (await text("#quote")).includes("$50.00"), "quote: " + (await text("#quote")));
    await click("#goBtn"); await toast("Bought 9.50M $CAMEL"); await idle();
    // This wallet is also the coin's creator and the launchpad's wallet, so the fees of its own trade come
    // straight back in the same transaction: $10 for the creator and $20 for the launchpad.
    await has("#walletTxt", "$9,030.00");
    await has("#v-coin .stats", "9.50M");
    let paid = await J.getMarket(conn, programId, m0.coinMint);
    assert.deepEqual([paid.creatorFees, paid.platformFees, paid.floorReserve].map(String), ["0", "0", "970000000"], "the fees were paid out with the trade; the reserve holds the floor value and its 2%");
    assert.equal(await page.$("[data-act=payCreator]"), null, "nothing is left waiting, so there is nothing to press");
    step("buy from the page: $1,000 buys 9.5M coins, and the fees are paid out in the same transaction");

    // 5. sell everything back: $902.50
    await click("[data-act=tab][data-v=sell]"); await click("[data-act=sellMax]");
    await has("#quote", "$902.50");
    await click("#goBtn"); await toast("Sold 9.50M $CAMEL"); await idle();
    await has("#walletTxt", "$9,961.00"); // $902.50 for the coins, and this trade's fees: $9.50 and $19
    paid = await J.getMarket(conn, programId, m0.coinMint);
    assert.deepEqual([paid.floorOut, paid.curveOut, paid.creatorFees, paid.platformFees, paid.floorReserve].map(String), ["0", "0", "0", "0", "39000000"], "all coins are back, every fee is paid out, and the reserve kept its 2% of both trades");
    step("sell from the page: the 9.5M coins return $902.50, and the fees are paid out in the same transaction");

    // 6. fees from a trade made somewhere else wait in the market, and the Pay buttons pay them
    const trader = web3.Keypair.generate();
    await fund(trader.publicKey, 1);
    await sendAs(trader, J.testDollarFaucetIxs(trader.publicKey, trader.publicKey, 1000n * 1000000n), [J.TEST_DOLLAR.faucetKey()]);
    const q1 = J.quoteBuy(paid, 1000000n * J.COIN);
    await sendAs(trader, J.buyIxs(programId, trader.publicKey, cfg.stableMint, m0.coinMint, 1000000n * J.COIN, q1.total)); // no payouts added
    assert.deepEqual([q1.creatorFee, q1.platformFee].map(String), ["1052631", "2105263"]);
    await click("[data-act=refresh]");
    await has("#v-coin", "$1.05");
    await click("[data-act=payCreator]"); await toast("The creator was paid"); await idle();
    await click("[data-act=payPlatform]"); await toast("The launchpad was paid"); await idle();
    const m1 = await J.getMarket(conn, programId, m0.coinMint);
    assert.deepEqual([m1.creatorFees, m1.platformFees].map(String), ["0", "0"]);
    assert.equal((await J.getBalances(conn, wallet.publicKey, cfg.stableMint, null)).stable, 9961000000n + 1052631n + 2105263n, "both payouts reached the wallet, to the last unit");
    // the helper leaves a payout out when its wallet has no account to receive it, so a trade never fails or costs more because of a fee wallet
    const nobody = web3.Keypair.generate().publicKey;
    assert.equal((await J.readyPayoutIxs(conn, programId, cfg.stableMint, m0.coinMint, nobody, nobody, true, true)).length, 0);
    assert.equal((await J.readyPayoutIxs(conn, programId, cfg.stableMint, m0.coinMint, wallet.publicKey, nobody, true, true)).length, 1);
    assert.equal((await J.readyPayoutIxs(conn, programId, cfg.stableMint, m0.coinMint, wallet.publicKey, wallet.publicKey, true, false)).length, 1);
    assert.equal((await J.readyPayoutIxs(conn, programId, cfg.stableMint, m0.coinMint, wallet.publicKey, wallet.publicKey, true, true)).length, 2);
    step("fees from trades made elsewhere wait in the market; the Pay buttons pay them; a payout is skipped when its wallet cannot receive");

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

    // 8. the admin card: a wrong address is refused before the wallet is asked; the role moves only when the named wallet accepts
    const other = web3.Keypair.generate();
    await fund(other.publicKey, 1);
    await fill("#admNext", "not an address"); await click("[data-act=admNext]");
    await has("#admErr", "not a Solana address");
    await fill("#admNext", J.ata(wallet.publicKey, cfg.stableMint).toBase58()); await click("[data-act=admNext]");
    await has("#admErr", "not a wallet");
    await fill("#admNext", other.publicKey.toBase58()); await click("[data-act=admNext]"); await toast("can now accept the admin role"); await idle();
    await has("#adminBox", "Waiting for");
    let c2 = await J.getConfig(conn, programId);
    assert.deepEqual([c2.admin.toBase58(), c2.pendingAdmin.toBase58()], [wallet.publicKey.toBase58(), other.publicKey.toBase58()], "naming the next admin does not move the role");
    await sendAs(other, [J.acceptAdminIx(programId, other.publicKey)]);
    await click("[data-act=refresh]");
    await page.waitForFunction(() => document.querySelector("#adminBox").textContent === "", { timeout: 60000 });
    await sendAs(other, [J.proposeAdminIx(programId, other.publicKey, wallet.publicKey)]);
    await click("[data-act=refresh]");
    await has("#adminBox", "named the next admin");
    await click("[data-act=admAccept]"); await toast("Your wallet is now the admin"); await idle();
    await has("#adminBox", "Your wallet is the admin");
    await fill("#admWallet", other.publicKey.toBase58()); await click("[data-act=admWallet]"); await toast("The platform wallet is now"); await idle();
    c2 = await J.getConfig(conn, programId);
    assert.deepEqual([c2.admin.toBase58(), c2.pendingAdmin.toBase58(), c2.platformWallet.toBase58()], [wallet.publicKey.toBase58(), web3.PublicKey.default.toBase58(), other.publicKey.toBase58()]);
    assert.deepEqual(errors, [], "the page threw errors: " + errors.join(" | "));
    step("admin card: bad addresses refused, the role moves only when the named wallet accepts, the platform wallet changes");

    // 9. the same page set for the real network: no test money, no free SOL, no setup buttons
    Object.assign(settings, { name: "Solana", test: false });
    await page.goto("about:blank");
    await page.goto("http://localhost:4196/solana.html", { waitUntil: "networkidle2" });
    await has("#stripTxt", "Trades here use real USDC");
    await has("#rows", "Camel Cash");
    assert.equal(await text("#specPay"), "USDC");
    assert.equal(await page.$("[data-act=faucet]"), null, "no test dollars on the real network");
    assert.equal(await page.$("[data-act=solFaucet]"), null, "no free SOL on the real network");
    await click("#rows .row");
    await has("#trade", "USDC");
    assert(!(await text("#v-coin")).includes("test $"));
    assert.deepEqual(errors, [], "the page threw errors: " + errors.join(" | "));
    step("real-network mode: the page shows USDC and offers no test money, free SOL or setup");

    console.log("\n  " + steps + " page steps passed against the program " + programId.toBase58());
  } finally { await browser.close(); server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
