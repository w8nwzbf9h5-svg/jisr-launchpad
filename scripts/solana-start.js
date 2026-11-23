// Starts a freshly deployed Jisr program on Solana and hands the admin role on.
// Run by scripts/solana-deploy.sh, between deploying the program and making it final.
//
//   RPC_URL=... PROGRAM_ID=... node scripts/solana-start.js <deployer key file> <stablecoin mint> <platform wallet> <admin wallet>
//
// What it does, in order:
//   1. checks that the stablecoin is a token the program supports;
//   2. sends `initialize` from the deployer key, which records the stablecoin and the platform wallet;
//   3. reads the settings back and compares every field with what was asked for;
//   4. names <admin wallet> as the next admin. That wallet takes over when it accepts on the Solana page.
//
// `initialize` can be sent by anyone, once. If somebody else sent it first, the settings read back in
// step 3 are not ours and this script stops with exit code 3. The caller must then take the program
// down instead of making it final. Running this script twice with the same arguments is safe.
const fs = require("fs");
const web3 = require("@solana/web3.js");
const J = require("../web/solana/jisr-solana.js");

const [keyFile, stableArg, platformArg, adminArg] = process.argv.slice(2);
if (!keyFile || !stableArg || !platformArg || !adminArg || !process.env.PROGRAM_ID || !process.env.RPC_URL) {
  console.error("usage: RPC_URL=... PROGRAM_ID=... node scripts/solana-start.js <deployer key file> <stablecoin mint> <platform wallet> <admin wallet>");
  process.exit(2);
}
const key = (text, what) => { try { return new web3.PublicKey(text); } catch (_) { console.error(what + " is not a Solana address: " + text); process.exit(2); } };
const programId = key(process.env.PROGRAM_ID, "PROGRAM_ID");
const stableMint = key(stableArg, "The stablecoin mint");
const platformWallet = key(platformArg, "The platform wallet");
const adminWallet = key(adminArg, "The admin wallet");
for (const [k, what] of [[platformWallet, "platform wallet"], [adminWallet, "admin wallet"]]) {
  if (!web3.PublicKey.isOnCurve(k.toBytes())) { console.error("The " + what + " must be a wallet address, not a token account or a program: " + k.toBase58()); process.exit(2); }
}
const deployer = web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyFile, "utf8"))));
const conn = new web3.Connection(process.env.RPC_URL, "confirmed");
const priority = Number(process.env.PRIORITY || 0); // micro-lamports per compute unit, for a busy network

async function send(ixs) {
  for (let attempt = 1; ; attempt++) {
    try {
      const tx = new web3.Transaction();
      if (priority > 0) tx.add(web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priority }));
      tx.add(...ixs);
      tx.feePayer = deployer.publicKey;
      const bh = await conn.getLatestBlockhash();
      tx.recentBlockhash = bh.blockhash;
      tx.sign(deployer);
      const sig = await conn.sendRawTransaction(tx.serialize());
      const res = await conn.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, "confirmed");
      if (res.value.err) throw new Error("transaction failed: " + JSON.stringify(res.value.err));
      return sig;
    } catch (e) {
      // a program error will not go away by trying again; a network hiccup or an expired request might
      if (attempt >= 4 || /custom program error|"Custom"|InstructionError|already in use/i.test(String(e.message || e))) throw e;
      console.log("  trying again (" + attempt + "): " + String(e.message || e).split("\n")[0]);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
const same = (a, b) => a.toBase58() === b.toBase58();

(async () => {
  const mint = J.decodeMint(await conn.getAccountInfo(stableMint));
  if (!mint) { console.error("The stablecoin mint " + stableMint.toBase58() + " does not exist on this network, or is not a standard SPL token."); process.exit(2); }
  console.log("Program " + programId.toBase58() + ", stablecoin " + stableMint.toBase58() + " (" + mint.decimals + " decimals)");

  let cfg = await J.getConfig(conn, programId);
  if (!cfg) {
    try { console.log("initialize: " + (await send([J.initializeIx(programId, deployer.publicKey, stableMint, platformWallet)]))); }
    catch (e) { console.log("initialize did not go through: " + String(e.message || e).split("\n")[0]); }
    cfg = await J.getConfig(conn, programId);
  }
  if (!cfg) { console.error("The program could not be started."); process.exit(1); }

  // Every field must be ours. After the hand-over the admin is the admin wallet, which is also fine.
  const adminOk = same(cfg.admin, deployer.publicKey) || same(cfg.admin, adminWallet);
  const expectedPrice = J.PRICE_SCALE * 10n ** BigInt(mint.decimals) / (10000n * J.COIN);
  if (!adminOk || !same(cfg.platformWallet, platformWallet) || !same(cfg.stableMint, stableMint) || cfg.salePrice !== expectedPrice) {
    console.error("The program was started with settings that are not ours. Somebody else may have started it first.");
    console.error("  admin " + cfg.admin.toBase58() + ", platform wallet " + cfg.platformWallet.toBase58() + ", stablecoin " + cfg.stableMint.toBase58());
    process.exit(3);
  }

  if (!same(cfg.admin, adminWallet) && !same(cfg.pendingAdmin, adminWallet)) {
    console.log("propose_admin: " + (await send([J.proposeAdminIx(programId, deployer.publicKey, adminWallet)])));
    cfg = await J.getConfig(conn, programId);
    if (!same(cfg.pendingAdmin, adminWallet)) { console.error("Naming the next admin did not take effect."); process.exit(1); }
  }
  console.log(JSON.stringify({ programId: programId.toBase58(), admin: cfg.admin.toBase58(), nextAdmin: same(cfg.admin, adminWallet) ? null : cfg.pendingAdmin.toBase58(),
    platformWallet: cfg.platformWallet.toBase58(), stableMint: cfg.stableMint.toBase58(), salePrice: String(cfg.salePrice) }));
})().catch((e) => { console.error(e); process.exit(1); });
