/* Jisr on Solana: everything the page needs to read the program and build its transactions.
   No DOM and no wallet code here, so the same file runs in the browser and in the automated test
   that drives a real local Solana node (solana/client-test/run.js).
   Amounts are BigInt in base units: a coin has 6 decimals; the stablecoin has its own. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("@solana/web3.js"));
  else root.JisrSolana = factory(root.solanaWeb3);
})(typeof self !== "undefined" ? self : this, function (web3) {
  "use strict";
  const { PublicKey, TransactionInstruction, SystemProgram, Keypair, ComputeBudgetProgram } = web3;

  const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  /* Metaplex Token Metadata: where wallets and explorers read a token's name, ticker and picture link. */
  const METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
  const MAX_METADATA_URI = 200;
  const enc = new TextEncoder(), dec = new TextDecoder();

  /* ---------- the model, as in solana/crates/jisr-math (every formula and rounding is the same) ---------- */
  const COIN = 1000000n, COIN_DECIMALS = 6;
  const TOTAL_SUPPLY = 1000000000n * COIN, SALE_SUPPLY = 800000000n * COIN, CURVE_SUPPLY = 200000000n * COIN;
  const CURVE_MAX = 190000000n * COIN, MAX_WALLET = 25000000n * COIN;
  const BPS = 10000n, FEE_BPS = 500n, CREATOR_BPS = 100n, PLATFORM_BPS = 200n, PRICE_SCALE = 10n ** 18n;
  const U64_MAX = 2n ** 64n - 1n;
  const mulDiv = (a, b, d, up) => { const p = a * b, q = p / d; return up && p % d !== 0n ? q + 1n : q; };
  const u64 = (v) => { if (v < 0n || v > U64_MAX) throw new Error("Overflow"); return v; };
  const floorValue = (m, coins, up) => u64(mulDiv(coins, m.floorPrice, PRICE_SCALE, up));
  const premium = (m, s, up) => s === 0n ? 0n : u64(mulDiv(mulDiv(s, s, CURVE_SUPPLY - s, up), m.salePrice, PRICE_SCALE, up));
  const outstanding = (m) => m.floorOut + m.curveOut;

  function currentPrice(m) {
    if (m.curveOut === 0n) return m.floorPrice;
    const left = CURVE_SUPPLY - m.curveOut;
    const scaled = mulDiv(mulDiv(m.salePrice, CURVE_SUPPLY, left, false), CURVE_SUPPLY, left, false);
    return m.floorPrice + scaled - m.salePrice;
  }
  function quoteBuy(m, coinsOut) {
    if (coinsOut <= 0n) throw new Error("ZeroAmount");
    const room = SALE_SUPPLY - m.floorOut, fromFloor = coinsOut < room ? coinsOut : room, fromCurve = coinsOut - fromFloor;
    const newCurve = m.curveOut + fromCurve;
    if (newCurve > CURVE_MAX) throw new Error("SoldOut");
    const floorPart = floorValue(m, coinsOut, true);
    const premiumPart = fromCurve > 0n ? premium(m, newCurve, true) - premium(m, m.curveOut, false) : 0n;
    const base = floorPart + premiumPart;
    const total = u64(mulDiv(base, BPS, BPS - FEE_BPS, true));
    const creatorFee = total * CREATOR_BPS / BPS, platformFee = total * PLATFORM_BPS / BPS;
    return { fromFloor, fromCurve, floorPart, premiumPart, total, creatorFee, platformFee, communityFee: total - base - creatorFee - platformFee, fee: total - base };
  }
  function quoteSell(m, coinsIn) {
    if (coinsIn <= 0n) throw new Error("ZeroAmount");
    const fromCurve = coinsIn < m.curveOut ? coinsIn : m.curveOut, fromFloor = coinsIn - fromCurve;
    if (fromFloor > m.floorOut) throw new Error("NotOutstanding");
    const floorPart = floorValue(m, coinsIn, false);
    let premiumPart = 0n;
    if (fromCurve > 0n) {
      const high = premium(m, m.curveOut, false), low = premium(m, m.curveOut - fromCurve, true);
      premiumPart = high > low ? high - low : 0n;
      if (premiumPart > m.premiumReserve) premiumPart = m.premiumReserve;
    }
    const gross = floorPart + premiumPart;
    const creatorFee = gross * CREATOR_BPS / BPS, platformFee = gross * PLATFORM_BPS / BPS, communityFee = gross * (FEE_BPS - CREATOR_BPS - PLATFORM_BPS) / BPS;
    return { fromCurve, fromFloor, floorPart, premiumPart, gross, creatorFee, platformFee, communityFee, fee: creatorFee + platformFee + communityFee, net: gross - creatorFee - platformFee - communityFee };
  }
  /* The most coins a budget buys, and the most a wallet holding `held` may still take. Whole base units. */
  function coinsForBudget(m, budget, held) {
    let hi = MAX_WALLET - (held || 0n);
    const left = SALE_SUPPLY - m.floorOut + CURVE_MAX - m.curveOut;
    if (left < hi) hi = left;
    if (hi <= 0n || budget <= 0n) return 0n;
    if (quoteBuy(m, hi).total <= budget) return hi;
    let lo = 0n;
    while (hi - lo > 1n) { const mid = (lo + hi) / 2n; if (quoteBuy(m, mid).total <= budget) lo = mid; else hi = mid; }
    return lo;
  }
  /* What the whole supply is worth at a price, in stablecoin base units. */
  const marketCap = (price) => price * TOTAL_SUPPLY / PRICE_SCALE;

  /* ---------- addresses ---------- */
  const pda = (seeds, programId) => PublicKey.findProgramAddressSync(seeds, programId)[0];
  const le8 = (v) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(v), true); return b; };
  const configAddress = (programId) => pda([enc.encode("config")], programId);
  const coinMintAddress = (programId, index) => pda([enc.encode("coin"), le8(index)], programId);
  const marketAddress = (programId, coinMint) => pda([enc.encode("market"), coinMint.toBytes()], programId);
  const metadataAddress = (coinMint) => pda([enc.encode("metadata"), METADATA_PROGRAM.toBytes(), coinMint.toBytes()], METADATA_PROGRAM);
  /* The link written into a coin's wallet metadata: the metadata address, then the market's address and
     ".json". Whatever answers there returns the coin's name, picture and links: either files published
     with the site (scripts/build-metadata.js) or the small service in metadata-service/worker.mjs.
     With no address the link is empty, and wallets show the name and ticker without a picture. */
  const metadataUri = (base, market) => base ? String(base).replace(/\/+$/, "") + "/" + market.toBase58() + ".json" : "";
  /* A wallet's one standard token account for a mint. `owner` may be a program address (the market's vaults). */
  const ata = (owner, mint) => pda([owner.toBytes(), TOKEN_PROGRAM.toBytes(), mint.toBytes()], ATA_PROGRAM);

  /* ---------- reading accounts ---------- */
  const DISC = {
    initialize: [175, 175, 109, 31, 13, 152, 155, 237], set_platform_wallet: [148, 153, 158, 72, 12, 69, 43, 12],
    propose_admin: [121, 214, 199, 212, 87, 39, 117, 234], accept_admin: [112, 42, 45, 90, 116, 181, 13, 170],
    create_coin: [208, 85, 34, 37, 235, 182, 111, 78], buy: [102, 6, 61, 18, 1, 218, 235, 234], sell: [51, 230, 133, 164, 1, 127, 131, 173],
    claim_creator_fees: [0, 23, 125, 234, 156, 118, 134, 89], sweep_platform_fees: [190, 168, 25, 182, 75, 123, 135, 189], reinforce: [254, 170, 163, 213, 240, 38, 189, 205],
    Config: [155, 12, 170, 224, 30, 250, 204, 130], Market: [219, 190, 213, 55, 0, 227, 198, 154]
  };
  function reader(data, name) {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data), view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (u8.length < 8 || !DISC[name].every((b, i) => u8[i] === b)) throw new Error("Not a " + name + " account");
    let o = 8;
    const r = {
      key: () => { const k = new PublicKey(u8.slice(o, o + 32)); o += 32; return k; },
      u8: () => u8[o++],
      u64: () => { const v = view.getBigUint64(o, true); o += 8; return v; },
      u128: () => { const lo = view.getBigUint64(o, true), hi = view.getBigUint64(o + 8, true); o += 16; return (hi << 64n) | lo; },
      str: () => { const n = view.getUint32(o, true); o += 4; if (o + n > u8.length) throw new Error("Bad text length"); const s = dec.decode(u8.slice(o, o + n)); o += n; return s; }
    };
    return r;
  }
  function decodeConfig(data) {
    const r = reader(data, "Config");
    return { admin: r.key(), pendingAdmin: r.key(), platformWallet: r.key(), stableMint: r.key(), salePrice: r.u128(), coinCount: r.u64(), bump: r.u8() };
  }
  function decodeMarket(data) {
    const r = reader(data, "Market");
    return {
      creator: r.key(), coinMint: r.key(), index: r.u64(), salePrice: r.u128(), floorPrice: r.u128(), floorOut: r.u64(), curveOut: r.u64(),
      floorReserve: r.u64(), premiumReserve: r.u64(), creatorFees: r.u64(), platformFees: r.u64(), graduated: r.u8() !== 0, bump: r.u8(),
      name: r.str(), symbol: r.str(), uri: r.str()
    };
  }
  /* Token account: the amount is the 8 bytes at offset 64. A missing account holds nothing. */
  const tokenAmount = (info) => info && info.data && info.data.length >= 72 ? new DataView(info.data.buffer, info.data.byteOffset, info.data.byteLength).getBigUint64(64, true) : 0n;
  /* Mint: decimals is the byte at offset 44; the mint authority is at 4..36 when the 4 bytes before it are 1. */
  function decodeMint(info) {
    if (!info || !info.data || info.data.length < 82 || !info.owner.equals(TOKEN_PROGRAM)) return null;
    const d = info.data, v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    return { authority: v.getUint32(0, true) === 1 ? new PublicKey(d.slice(4, 36)) : null, decimals: d[44], supply: v.getBigUint64(36, true) };
  }

  /* A coin's Metaplex metadata account: what wallets show. Null if the account is missing or is not one. */
  function decodeMetadata(info) {
    if (!info || !info.owner.equals(METADATA_PROGRAM) || info.data.length < 80 || info.data[0] !== 4) return null;
    const d = info.data, v = new DataView(d.buffer, d.byteOffset, d.byteLength);
    let o = 65;
    const str = () => { const n = v.getUint32(o, true); const t = dec.decode(d.slice(o + 4, o + 4 + n)); o += 4 + n; return t.replace(/\0+$/, ""); };
    const name = str(), symbol = str(), uri = str(), sellerFee = v.getUint16(o, true), hasCreators = d[o + 2] !== 0;
    // with no creators the next two bytes are "primary sale happened" and "is mutable"
    return { updateAuthority: new PublicKey(d.slice(1, 33)), mint: new PublicKey(d.slice(33, 65)), name, symbol, uri, sellerFee, hasCreators, isMutable: hasCreators ? null : d[o + 4] !== 0 };
  }

  async function getConfig(conn, programId) {
    const info = await conn.getAccountInfo(configAddress(programId));
    return info ? decodeConfig(info.data) : null;
  }
  /* Markets by coin number, newest first: `count` coins ending at number `upTo` (exclusive). */
  async function getMarkets(conn, programId, upTo, count) {
    const idx = [];
    for (let i = Number(upTo) - 1; i >= 0 && idx.length < count; i--) idx.push(i);
    const addrs = idx.map((i) => marketAddress(programId, coinMintAddress(programId, i)));
    const out = [];
    for (let k = 0; k < addrs.length; k += 100) {
      const infos = await conn.getMultipleAccountsInfo(addrs.slice(k, k + 100));
      infos.forEach((info, j) => { if (info) { const m = decodeMarket(info.data); m.address = addrs[k + j]; out.push(m); } });
    }
    return out;
  }
  async function getMarket(conn, programId, coinMint) {
    const address = marketAddress(programId, coinMint), info = await conn.getAccountInfo(address);
    if (!info) return null;
    const m = decodeMarket(info.data); m.address = address; return m;
  }
  /* A wallet's balances of the stablecoin and of one coin (either may be absent). */
  async function getBalances(conn, owner, stableMint, coinMint) {
    const keys = [ata(owner, stableMint)].concat(coinMint ? [ata(owner, coinMint)] : []);
    const infos = await conn.getMultipleAccountsInfo(keys);
    return { stable: tokenAmount(infos[0]), coin: coinMint ? tokenAmount(infos[1]) : 0n };
  }

  /* ---------- building instructions ---------- */
  const meta = (pubkey, isWritable, isSigner) => ({ pubkey, isWritable: !!isWritable, isSigner: !!isSigner });
  function bytes(parts) {
    let n = 0; for (const p of parts) n += p.length;
    const out = new Uint8Array(n); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  const text = (s) => { const b = enc.encode(s), l = new Uint8Array(4); new DataView(l.buffer).setUint32(0, b.length, true); return bytes([l, b]); };
  const ix = (programId, name, keys, args) => new TransactionInstruction({ programId, keys, data: bytes([Uint8Array.from(DISC[name])].concat(args || [])) });

  /* Create the wallet's token account for a mint if it does not exist yet. Safe to include every time. */
  const ensureAtaIx = (payer, owner, mint) => new TransactionInstruction({
    programId: ATA_PROGRAM, data: Uint8Array.from([1]),
    keys: [meta(payer, true, true), meta(ata(owner, mint), true), meta(owner), meta(mint), meta(SystemProgram.programId), meta(TOKEN_PROGRAM)]
  });

  function initializeIx(programId, admin, stableMint, platformWallet) {
    return ix(programId, "initialize", [meta(admin, true, true), meta(configAddress(programId), true), meta(stableMint), meta(SystemProgram.programId)], [platformWallet.toBytes()]);
  }
  function setPlatformWalletIx(programId, admin, newWallet) {
    return ix(programId, "set_platform_wallet", [meta(admin, false, true), meta(configAddress(programId), true)], [newWallet.toBytes()]);
  }
  /* Handing the admin role on takes two steps: the admin names the next one, and that wallet accepts. */
  function proposeAdminIx(programId, admin, newAdmin) {
    return ix(programId, "propose_admin", [meta(admin, false, true), meta(configAddress(programId), true)], [newAdmin.toBytes()]);
  }
  function acceptAdminIx(programId, newAdmin) {
    return ix(programId, "accept_admin", [meta(newAdmin, false, true), meta(configAddress(programId), true)]);
  }
  /* Launch coin number `index` (the config's current coin count). Returns the instructions and the new addresses.
     `metadataLink` is the link for the coin's wallet metadata (see metadataUri); "" writes the name and ticker
     with no link; null writes no wallet metadata at all, so the Metaplex program is not called.
     Leave it out (undefined) only for the first devnet build, which had no such step and takes one argument less. */
  function createCoinIxs(programId, creator, stableMint, index, name, symbol, uri, metadataLink) {
    const coinMint = coinMintAddress(programId, index), market = marketAddress(programId, coinMint), withMeta = metadataLink !== undefined;
    return {
      coinMint, market, metadata: metadataAddress(coinMint),
      ixs: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
        ix(programId, "create_coin", [
          meta(creator, true, true), meta(configAddress(programId), true), meta(stableMint), meta(coinMint, true), meta(market, true),
          meta(ata(market, coinMint), true), meta(ata(market, stableMint), true), meta(TOKEN_PROGRAM), meta(ATA_PROGRAM), meta(SystemProgram.programId)
        ].concat(withMeta ? [meta(metadataAddress(coinMint), true), meta(METADATA_PROGRAM)] : []),
        [text(name), text(symbol), text(uri)].concat(!withMeta ? [] : metadataLink === null ? [Uint8Array.from([0])] : [Uint8Array.from([1]), text(metadataLink)]))
      ]
    };
  }
  /* Buy exactly `coinsOut`, paying at most `maxStableIn`. Includes creating the buyer's coin account. */
  function buyIxs(programId, buyer, stableMint, coinMint, coinsOut, maxStableIn) {
    const market = marketAddress(programId, coinMint);
    return [
      ensureAtaIx(buyer, buyer, coinMint),
      ix(programId, "buy", [
        meta(buyer, false, true), meta(configAddress(programId)), meta(market, true), meta(ata(market, coinMint), true), meta(ata(market, stableMint), true),
        meta(ata(buyer, stableMint), true), meta(ata(buyer, coinMint), true), meta(TOKEN_PROGRAM)
      ], [le8(coinsOut), le8(maxStableIn)])
    ];
  }
  /* Sell `coinsIn` for at least `minStableOut`, paid to the seller's own stablecoin account (created if missing). */
  function sellIxs(programId, seller, stableMint, coinMint, coinsIn, minStableOut) {
    const market = marketAddress(programId, coinMint);
    return [
      ensureAtaIx(seller, seller, stableMint),
      ix(programId, "sell", [
        meta(seller, false, true), meta(configAddress(programId)), meta(market, true), meta(ata(market, coinMint), true), meta(ata(market, stableMint), true),
        meta(ata(seller, coinMint), true), meta(ata(seller, stableMint), true), meta(TOKEN_PROGRAM)
      ], [le8(coinsIn), le8(minStableOut)])
    ];
  }
  /* Pay the creator's fees to the creator, or the launchpad's fees to the platform wallet. Anyone may send these. */
  function payoutIxs(programId, payer, stableMint, coinMint, name, receiver) {
    const market = marketAddress(programId, coinMint);
    return [
      ensureAtaIx(payer, receiver, stableMint),
      ix(programId, name, [meta(configAddress(programId)), meta(market, true), meta(ata(market, stableMint), true), meta(ata(receiver, stableMint), true), meta(TOKEN_PROGRAM)])
    ];
  }
  const claimCreatorFeesIxs = (programId, payer, stableMint, coinMint, creator) => payoutIxs(programId, payer, stableMint, coinMint, "claim_creator_fees", creator);
  const sweepPlatformFeesIxs = (programId, payer, stableMint, coinMint, platformWallet) => payoutIxs(programId, payer, stableMint, coinMint, "sweep_platform_fees", platformWallet);
  /* Fee payouts to add to a trade, so that fees go out whenever anyone trades instead of waiting for
     someone to press Pay. Returns the payout instructions, for the creator and for the launchpad, that are
     certain to go through:
       - the trade itself earns that receiver a fee (`creatorDue`, `platformDue`), so there is something to pay;
       - the receiver's stablecoin account exists, is a token account, and is not frozen.
     Anything else is left out. A trade must never fail, or cost the trader more, because of a fee wallet:
     fees that are not paid out here stay in the coin's market, and the Pay buttons still work. */
  async function readyPayoutIxs(conn, programId, stableMint, coinMint, creator, platformWallet, creatorDue, platformDue) {
    const infos = await conn.getMultipleAccountsInfo([ata(creator, stableMint), ata(platformWallet, stableMint)]);
    // a token account is 165 bytes; byte 108 is its state: 1 in use, 2 frozen
    const ready = (info) => !!info && info.owner.equals(TOKEN_PROGRAM) && info.data.length >= 165 && info.data[108] === 1;
    const out = [];
    if (creatorDue && ready(infos[0])) out.push(payoutIxs(programId, creator, stableMint, coinMint, "claim_creator_fees", creator)[1]);
    if (platformDue && ready(infos[1])) out.push(payoutIxs(programId, platformWallet, stableMint, coinMint, "sweep_platform_fees", platformWallet)[1]);
    return out;
  }
  function reinforceIx(programId, stableMint, coinMint) {
    const market = marketAddress(programId, coinMint);
    return ix(programId, "reinforce", [meta(configAddress(programId)), meta(market, true), meta(ata(market, stableMint))]);
  }

  /* ---------- the test dollar (test networks only) ----------
     A token anyone can mint, for trying the launchpad with money that has no value. Its two keys are
     made from the fixed public phrases below on purpose: they are not secrets and guard nothing. */
  const TEST_DOLLAR = {
    decimals: 6,
    mintKey: () => Keypair.fromSeed(enc.encode("jisr-devnet-test-dollar-mint-001")),
    faucetKey: () => Keypair.fromSeed(enc.encode("jisr-devnet-test-dollar-faucet-1"))
  };
  /* Create the test dollar. Signers: the payer and TEST_DOLLAR.mintKey(). `rent` is the rent-exempt minimum for 82 bytes. */
  function createTestDollarIxs(payer, rent) {
    const mint = TEST_DOLLAR.mintKey().publicKey, authority = TEST_DOLLAR.faucetKey().publicKey;
    return [
      SystemProgram.createAccount({ fromPubkey: payer, newAccountPubkey: mint, lamports: rent, space: 82, programId: TOKEN_PROGRAM }),
      // InitializeMint2: decimals, mint authority, no freeze authority
      new TransactionInstruction({ programId: TOKEN_PROGRAM, keys: [meta(mint, true)], data: bytes([Uint8Array.from([20, TEST_DOLLAR.decimals]), authority.toBytes(), Uint8Array.from([0])]) })
    ];
  }
  /* Give `owner` some test dollars. Signers: the payer and TEST_DOLLAR.faucetKey(). */
  function testDollarFaucetIxs(payer, owner, amount) {
    const mint = TEST_DOLLAR.mintKey().publicKey, authority = TEST_DOLLAR.faucetKey().publicKey;
    return [
      ensureAtaIx(payer, owner, mint),
      new TransactionInstruction({ programId: TOKEN_PROGRAM, keys: [meta(mint, true), meta(ata(owner, mint), true), meta(authority, false, true)], data: bytes([Uint8Array.from([7]), le8(amount)]) })
    ];
  }

  /* ---------- coin details ----------
     The program keeps up to 400 bytes of text per coin. The page stores a small JSON there:
     d = description, i = picture link, x / t / w = X, Telegram and website links. Read as untrusted text. */
  function packMeta(m) {
    const o = {};
    if (m.description) o.d = String(m.description);
    if (m.image) o.i = String(m.image);
    if (m.x) o.x = String(m.x);
    if (m.telegram) o.t = String(m.telegram);
    if (m.website) o.w = String(m.website);
    return Object.keys(o).length ? JSON.stringify(o) : "";
  }
  function unpackMeta(uri) {
    const link = (v) => typeof v === "string" && /^https:\/\/[^\s"'<>]{3,300}$/.test(v) ? v : "";
    let o = null;
    try { o = JSON.parse(uri); } catch (_) { /* not JSON: treat as a bare link */ }
    if (!o || typeof o !== "object") return { description: "", image: link(uri), x: "", telegram: "", website: "" };
    return { description: typeof o.d === "string" ? o.d.slice(0, 300) : "", image: link(o.i), x: link(o.x), telegram: link(o.t), website: link(o.w) };
  }
  const byteLength = (s) => enc.encode(s).length;

  return {
    TOKEN_PROGRAM, ATA_PROGRAM, METADATA_PROGRAM, MAX_METADATA_URI, COIN, COIN_DECIMALS, TOTAL_SUPPLY, SALE_SUPPLY, CURVE_SUPPLY, CURVE_MAX, MAX_WALLET, PRICE_SCALE, MAX_URI_BYTES: 400,
    quoteBuy, quoteSell, coinsForBudget, currentPrice, marketCap, outstanding,
    configAddress, coinMintAddress, marketAddress, metadataAddress, metadataUri, ata,
    decodeConfig, decodeMarket, decodeMint, decodeMetadata, tokenAmount, getConfig, getMarkets, getMarket, getBalances,
    ensureAtaIx, initializeIx, setPlatformWalletIx, proposeAdminIx, acceptAdminIx, createCoinIxs, buyIxs, sellIxs, claimCreatorFeesIxs, sweepPlatformFeesIxs, readyPayoutIxs, reinforceIx,
    TEST_DOLLAR, createTestDollarIxs, testDollarFaucetIxs, packMeta, unpackMeta, byteLength
  };
});
