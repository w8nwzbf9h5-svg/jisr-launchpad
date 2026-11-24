// Drives the real program on a local Solana node through the same client file the web page uses
// (web/solana/jisr-solana.js), and checks every result against the page's own price math.
// Run by .github/workflows/solana.yml. Needs: a local node with the program loaded, and PROGRAM_ID.
const assert = require("assert");
const web3 = require("@solana/web3.js");
const J = require("../../web/solana/jisr-solana.js");
const { Connection, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL } = web3;

const programId = new PublicKey(process.env.PROGRAM_ID);
const conn = new Connection(process.env.RPC_URL || "http://127.0.0.1:8899", "confirmed");
const U = 1000000n, M = 1000000n * J.COIN; // one test dollar; one million coins
let steps = 0;
const step = (name) => { steps++; console.log("  ok  " + name); };

async function send(ixs, payer, extraSigners) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = payer.publicKey;
  const bh = await conn.getLatestBlockhash();
  tx.recentBlockhash = bh.blockhash;
  tx.sign(payer, ...(extraSigners || []));
  const sig = await conn.sendRawTransaction(tx.serialize());
  const res = await conn.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, "confirmed");
  if (res.value.err) throw new Error("transaction failed: " + JSON.stringify(res.value.err));
  return sig;
}
async function fails(promise, what) {
  try { await promise; } catch (e) { return String(e.message || e); }
  throw new Error("expected a failure: " + what);
}
async function fund(kp, sol) {
  const sig = await conn.requestAirdrop(kp.publicKey, sol * LAMPORTS_PER_SOL);
  const bh = await conn.getLatestBlockhash();
  await conn.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, "confirmed");
}
const dollars = (kp, amount) => send(J.testDollarFaucetIxs(kp.publicKey, kp.publicKey, amount), kp, [J.TEST_DOLLAR.faucetKey()]);
const stableMint = J.TEST_DOLLAR.mintKey().publicKey;
const bal = (kp, coinMint) => J.getBalances(conn, kp.publicKey, stableMint, coinMint);
const market = (coinMint) => J.getMarket(conn, programId, coinMint);
// A market account's money fields, for comparing with what the page's math predicts.
const state = (m) => [m.floorOut, m.curveOut, m.floorReserve, m.premiumReserve, m.creatorFees, m.platformFees, m.floorPrice, m.graduated].map(String);
function afterBuy(m, q) {
  const n = Object.assign({}, m, { floorOut: m.floorOut + q.fromFloor, curveOut: m.curveOut + q.fromCurve, floorReserve: m.floorReserve + q.floorPart + q.communityFee,
    premiumReserve: m.premiumReserve + q.premiumPart, creatorFees: m.creatorFees + q.creatorFee, platformFees: m.platformFees + q.platformFee });
  if (!n.graduated && n.floorOut === J.SALE_SUPPLY) n.graduated = true;
  return raise(n);
}
function afterSell(m, q) {
  return raise(Object.assign({}, m, { floorOut: m.floorOut - q.fromFloor, curveOut: m.curveOut - q.fromCurve, floorReserve: m.floorReserve - q.floorPart + q.communityFee,
    premiumReserve: m.premiumReserve - q.premiumPart, creatorFees: m.creatorFees + q.creatorFee, platformFees: m.platformFees + q.platformFee }));
}
function raise(n) {
  if (!n.graduated) return n;
  const out = n.floorOut + n.curveOut, coins = out > J.SALE_SUPPLY ? out : J.SALE_SUPPLY, price = n.floorReserve * J.PRICE_SCALE / coins;
  if (price > n.floorPrice) n.floorPrice = price;
  return n;
}

(async () => {
  for (let i = 0; ; i++) { try { await conn.getVersion(); break; } catch (e) { if (i > 60) throw new Error("the local Solana node did not start"); await new Promise((r) => setTimeout(r, 1000)); } }
  const admin = Keypair.generate(), platform = Keypair.generate(), creator = Keypair.generate(), alice = Keypair.generate(), bob = Keypair.generate();
  for (const k of [admin, creator, alice, bob]) await fund(k, 50);

  // 1. the test dollar and one-time setup
  assert.equal(await J.getConfig(conn, programId), null, "nothing is set up before initialize");
  const rent = await conn.getMinimumBalanceForRentExemption(82);
  await send(J.createTestDollarIxs(admin.publicKey, rent), admin, [J.TEST_DOLLAR.mintKey()]);
  const mintInfo = J.decodeMint(await conn.getAccountInfo(stableMint));
  assert.deepEqual([mintInfo.decimals, mintInfo.authority.toBase58()], [6, J.TEST_DOLLAR.faucetKey().publicKey.toBase58()]);
  await send([J.initializeIx(programId, admin.publicKey, stableMint, platform.publicKey)], admin);
  let cfg = await J.getConfig(conn, programId);
  assert.deepEqual([cfg.admin.toBase58(), cfg.platformWallet.toBase58(), cfg.stableMint.toBase58(), cfg.coinCount, cfg.salePrice].map(String),
    [admin.publicKey.toBase58(), platform.publicKey.toBase58(), stableMint.toBase58(), 0n, J.PRICE_SCALE / (10000n)].map(String), "config as written; the price is $0.0001 a coin");
  await fails(send([J.initializeIx(programId, alice.publicKey, stableMint, alice.publicKey)], alice), "a second initialize");
  step("setup: test dollar created, program initialized once, config reads back");

  // 2. launch a coin with details
  const details = J.packMeta({ description: "The first coin on the local node.", image: "https://example.org/camel.png", x: "https://x.com/camel", telegram: "https://t.me/camel", website: "https://camel.example" });
  assert(J.byteLength(details) <= J.MAX_URI_BYTES);
  const service = "https://meta.example", site = "https://site.example/solana.html";
  const link = J.metadataUri(service + "/", J.marketAddress(programId, J.coinMintAddress(programId, cfg.coinCount)));
  const creatorSol = await conn.getBalance(creator.publicKey);
  const made = J.createCoinIxs(programId, creator.publicKey, stableMint, cfg.coinCount, "Camel Cash", "HUMP", details, link);
  await send(made.ixs, creator);
  const launchCost = (creatorSol - (await conn.getBalance(creator.publicKey))) / LAMPORTS_PER_SOL;
  console.log("      launching a coin cost the creator " + launchCost.toFixed(4) + " SOL");
  assert(launchCost < 0.04, "the page tells creators a launch costs about 0.03 SOL");
  cfg = await J.getConfig(conn, programId);
  assert.equal(cfg.coinCount, 1n);
  const [listed] = await J.getMarkets(conn, programId, cfg.coinCount, 10);
  assert.deepEqual([listed.name, listed.symbol, listed.uri, listed.creator.toBase58(), listed.coinMint.toBase58(), listed.address.toBase58(), listed.index].map(String),
    ["Camel Cash", "HUMP", details, creator.publicKey.toBase58(), made.coinMint.toBase58(), made.market.toBase58(), 0n].map(String));
  assert.deepEqual(J.unpackMeta(listed.uri), { description: "The first coin on the local node.", image: "https://example.org/camel.png", x: "https://x.com/camel", telegram: "https://t.me/camel", website: "https://camel.example" });
  const coin = made.coinMint;
  const coinMintInfo = J.decodeMint(await conn.getAccountInfo(coin));
  assert.deepEqual([coinMintInfo.decimals, coinMintInfo.supply, coinMintInfo.authority], [6, J.TOTAL_SUPPLY, null], "the whole supply exists and nobody can mint more");
  assert.equal(J.tokenAmount(await conn.getAccountInfo(J.ata(made.market, coin))), J.TOTAL_SUPPLY, "every coin starts in the market; the creator has none");
  await fails(send(J.createCoinIxs(programId, creator.publicKey, stableMint, 1n, "Too Long", "LONG", "x".repeat(401), "").ixs, creator), "details over 400 bytes");
  await fails(send(J.createCoinIxs(programId, creator.publicKey, stableMint, 1n, "Long Link", "LINK", "", "https://meta.example/" + "x".repeat(180)).ixs, creator), "a metadata link over 200 bytes");
  await fails(send(J.createCoinIxs(programId, creator.publicKey, stableMint, 1n, "No Meta", "NOMETA", "").ixs, creator), "a launch without the metadata accounts");
  // what wallets and explorers show: written by the real Metaplex program, once, and unchangeable
  assert.equal(link, service + "/" + made.market.toBase58() + ".json");
  const md = J.decodeMetadata(await conn.getAccountInfo(made.metadata));
  assert(md, "the coin has a Metaplex metadata account");
  assert.deepEqual([md.name, md.symbol, md.uri, md.mint.toBase58(), md.updateAuthority.toBase58(), md.isMutable, md.sellerFee, md.hasCreators],
    ["Camel Cash", "HUMP", link, coin.toBase58(), made.market.toBase58(), false, 0, false], "name, ticker and link as given; only the market, which has no key, is its authority; it cannot be edited");
  // the metadata service answers that link from the chain alone
  const { handle } = await import("../../metadata-service/worker.mjs");
  const svcEnv = { RPC_URL: conn.rpcEndpoint, PROGRAM_ID: programId.toBase58(), SITE_URL: site };
  let res = await handle(new Request(md.uri), svcEnv);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { name: "Camel Cash", symbol: "HUMP", description: "The first coin on the local node.", image: "https://example.org/camel.png", external_url: "https://camel.example",
    extensions: { website: "https://camel.example", twitter: "https://x.com/camel", telegram: "https://t.me/camel", launchpad: site + "#coin/" + coin.toBase58() } });
  res = await handle(new Request(service + "/" + J.configAddress(programId).toBase58()), svcEnv);
  assert.equal(res.status, 404, "an account of the program that is not a market gets no answer");
  res = await handle(new Request(service + "/" + creator.publicKey.toBase58()), svcEnv);
  assert.equal(res.status, 404, "a wallet address gets no answer");
  step("launch: coin created with its details, listed, whole supply in the market; wallet metadata written and unchangeable; the metadata service answers its link");

  // 3. the white paper example: $1,000 buys 9.5M coins; selling them returns $902.50
  await dollars(alice, 5000n * U);
  let m = await market(coin);
  let q = J.quoteBuy(m, 9500000n * J.COIN);
  assert.equal(q.total, 1000n * U);
  await send(J.buyIxs(programId, alice.publicKey, stableMint, coin, 9500000n * J.COIN, q.total), alice);
  let b = await bal(alice, coin);
  assert.deepEqual([b.stable, b.coin], [4000n * U, 9500000n * J.COIN]);
  let predicted = afterBuy(m, q); m = await market(coin);
  assert.deepEqual(state(m), state(predicted), "the market after the buy is what the page's math says");
  await fails(send(J.buyIxs(programId, alice.publicKey, stableMint, coin, M, J.quoteBuy(m, M).total - 1n), alice), "paying less than the price");
  q = J.quoteSell(m, 9500000n * J.COIN);
  assert.equal(q.net, 902500000n);
  await fails(send(J.sellIxs(programId, alice.publicKey, stableMint, coin, 9500000n * J.COIN, q.net + 1n), alice), "asking for more than the sale returns");
  await send(J.sellIxs(programId, alice.publicKey, stableMint, coin, 9500000n * J.COIN, q.net), alice);
  b = await bal(alice, coin);
  assert.deepEqual([b.stable, b.coin], [4000n * U + 902500000n, 0n]);
  predicted = afterSell(m, q); m = await market(coin);
  assert.deepEqual(state(m), state(predicted));
  step("trade: $1,000 buys 9.5M coins and sells back for $902.50, to the cent");

  // 4. fees are paid out only to the creator and the platform wallet, whoever sends the transaction
  const creatorDue = m.creatorFees, platformDue = m.platformFees;
  assert(creatorDue > 0n && platformDue === creatorDue * 2n);
  await send(J.claimCreatorFeesIxs(programId, bob.publicKey, stableMint, coin, creator.publicKey), bob);
  await send(J.sweepPlatformFeesIxs(programId, bob.publicKey, stableMint, coin, platform.publicKey), bob);
  assert.equal((await bal(creator)).stable, creatorDue);
  assert.equal((await bal(platform)).stable, platformDue);
  assert.equal((await bal(bob)).stable, 0n, "the sender of the payout gets nothing");
  await fails(send(J.sweepPlatformFeesIxs(programId, bob.publicKey, stableMint, coin, bob.publicKey), bob), "sweeping to a wallet that is not the platform wallet");
  await fails(send(J.claimCreatorFeesIxs(programId, bob.publicKey, stableMint, coin, bob.publicKey), bob), "claiming creator fees to someone else");
  // the admin can change the platform wallet, and nobody else can
  await fails(send([J.setPlatformWalletIx(programId, alice.publicKey, alice.publicKey)], alice), "a stranger changing the platform wallet");
  await send([J.setPlatformWalletIx(programId, admin.publicKey, bob.publicKey)], admin);
  assert.equal((await J.getConfig(conn, programId)).platformWallet.toBase58(), bob.publicKey.toBase58());
  await send([J.setPlatformWalletIx(programId, admin.publicKey, platform.publicKey)], admin);
  // handing the admin role on: the admin names the next one, and only that wallet can accept
  await fails(send([J.proposeAdminIx(programId, alice.publicKey, alice.publicKey)], alice), "a stranger naming the next admin");
  await send([J.proposeAdminIx(programId, admin.publicKey, bob.publicKey)], admin);
  cfg = await J.getConfig(conn, programId);
  assert.deepEqual([cfg.admin.toBase58(), cfg.pendingAdmin.toBase58()], [admin.publicKey.toBase58(), bob.publicKey.toBase58()], "naming the next admin changes nothing until they accept");
  await fails(send([J.acceptAdminIx(programId, alice.publicKey)], alice), "a wallet that was not named accepting the admin role");
  await send([J.acceptAdminIx(programId, bob.publicKey)], bob);
  cfg = await J.getConfig(conn, programId);
  assert.deepEqual([cfg.admin.toBase58(), cfg.pendingAdmin.toBase58()], [bob.publicKey.toBase58(), web3.PublicKey.default.toBase58()]);
  await fails(send([J.setPlatformWalletIx(programId, admin.publicKey, admin.publicKey)], admin), "the old admin changing the platform wallet");
  await send([J.proposeAdminIx(programId, bob.publicKey, admin.publicKey)], bob);
  await send([J.acceptAdminIx(programId, admin.publicKey)], admin);
  step("fees: paid to the creator and the platform wallet only; the admin alone changes the platform wallet and hands the role on in two steps");

  // 5. the 2.5% wallet limit
  await dollars(alice, 10000n * U);
  m = await market(coin);
  await send(J.buyIxs(programId, alice.publicKey, stableMint, coin, J.MAX_WALLET, J.quoteBuy(m, J.MAX_WALLET).total), alice);
  m = await market(coin);
  await fails(send(J.buyIxs(programId, alice.publicKey, stableMint, coin, 1n, J.quoteBuy(m, 1n).total), alice), "one coin over the wallet limit");
  assert.equal(J.coinsForBudget(m, 100n * U, J.MAX_WALLET), 0n, "the page offers nothing more to a full wallet");
  step("limit: a wallet holds 25M coins and not one more");

  // 6. sell out the sale, graduate, and trade on the curve; every step must match the page's math
  const crowd = [];
  for (let i = 0; i < 31; i++) crowd.push(Keypair.generate());
  for (let i = 0; i < crowd.length; i += 8) await Promise.all(crowd.slice(i, i + 8).map(async (k) => { await fund(k, 2); await dollars(k, 60000n * U); }));
  for (const k of crowd) {
    m = await market(coin);
    q = J.quoteBuy(m, J.MAX_WALLET);
    await send(J.buyIxs(programId, k.publicKey, stableMint, coin, J.MAX_WALLET, q.total), k);
    predicted = afterBuy(m, q);
  }
  m = await market(coin);
  assert.deepEqual(state(m), state(predicted));
  assert.equal(m.graduated, true, "32 full wallets is the whole sale");
  assert(m.floorPrice > m.salePrice, "the floor rose at graduation");
  assert.equal(J.currentPrice(m), m.floorPrice);
  await fund(bob, 2); await dollars(bob, 500000n * U);
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return BigInt(seed) % BigInt(n); };
  const traders = [bob].concat(crowd.slice(0, 6));
  for (let i = 0; i < 40; i++) {
    const who = traders[Number(rnd(traders.length))];
    m = await market(coin);
    const held = (await bal(who, coin)).coin, before = (await bal(who, coin)).stable;
    if (rnd(2) === 0n && held < J.MAX_WALLET) {
      const want = 1n + rnd((J.MAX_WALLET - held) / 2n + 1n);
      q = J.quoteBuy(m, want);
      if (q.total > before) continue;
      await send(J.buyIxs(programId, who.publicKey, stableMint, coin, want, q.total), who);
      assert.equal(before - (await bal(who, coin)).stable, q.total, "a buy costs exactly the quoted amount");
      predicted = afterBuy(m, q);
    } else if (held > 0n) {
      const give = 1n + rnd(held);
      q = J.quoteSell(m, give);
      await send(J.sellIxs(programId, who.publicKey, stableMint, coin, give, q.net), who);
      assert.equal((await bal(who, coin)).stable - before, q.net, "a sale pays exactly the quoted amount");
      predicted = afterSell(m, q);
    } else continue;
    m = await market(coin);
    assert.deepEqual(state(m), state(predicted), "market state after random trade " + i);
    const vault = J.tokenAmount(await conn.getAccountInfo(J.ata(m.address, stableMint)));
    assert(vault >= m.floorReserve + m.premiumReserve + m.creatorFees + m.platformFees, "the vault holds everything the market owes");
    assert(m.floorReserve * J.PRICE_SCALE >= (m.floorOut + m.curveOut) * m.floorPrice, "the floor reserve covers every coin outside the market");
  }
  assert(m.curveOut > 0n || m.floorOut < J.SALE_SUPPLY, "the random trading moved the market");
  step("curve: sale sold out, graduated, and 40 random trades each matched the page's math exactly");

  // 7. a second coin: listing order and independent markets
  cfg = await J.getConfig(conn, programId);
  // a coin launched with no wallet metadata: the Metaplex program is not called, and the coin is a normal coin
  const bare = J.createCoinIxs(programId, alice.publicKey, stableMint, cfg.coinCount, "Bare Coin", "BARE", "", null);
  await send(bare.ixs, alice);
  assert.equal(await conn.getAccountInfo(bare.metadata), null, "no metadata account was made");
  assert.deepEqual([J.decodeMint(await conn.getAccountInfo(bare.coinMint)).authority, (await market(bare.coinMint)).symbol], [null, "BARE"]);
  cfg = await J.getConfig(conn, programId);
  const second = J.createCoinIxs(programId, alice.publicKey, stableMint, cfg.coinCount, "Second Coin", "TWO", "", "");
  // a stranger creates the new market's stablecoin account first and puts $3 in it; the launch must still work
  await send(J.testDollarFaucetIxs(bob.publicKey, second.market, 3n * U), bob, [J.TEST_DOLLAR.faucetKey()]);
  await send(second.ixs, alice);
  assert.equal(J.tokenAmount(await conn.getAccountInfo(J.ata(second.market, stableMint))), 3n * U);
  await send([J.reinforceIx(programId, stableMint, second.coinMint)], bob);
  assert.equal((await market(second.coinMint)).floorReserve, 3n * U, "money sent to a market outside a trade can only become floor reserve");
  const list = await J.getMarkets(conn, programId, 3n, 10);
  assert.deepEqual(list.map((x) => x.symbol), ["TWO", "BARE", "HUMP"], "newest first");
  assert.deepEqual(state(list[0]).slice(0, 6), ["0", "0", "3000000", "0", "0", "0"]);
  const md2 = J.decodeMetadata(await conn.getAccountInfo(second.metadata));
  assert.deepEqual([md2.name, md2.symbol, md2.uri, md2.isMutable], ["Second Coin", "TWO", "", false], "a coin with no metadata service still has its name and ticker for wallets");
  step("listing: a second coin appears first; an account made for it in advance cannot block its launch");

  console.log("\n  " + steps + " client steps passed against the program " + programId.toBase58());
})().catch((e) => { console.error(e); process.exit(1); });
