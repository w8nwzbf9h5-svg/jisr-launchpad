// Rehearses the real-network deployment against a local Solana node, with the same script the
// real deployment uses (scripts/solana-deploy.sh): deploy, start, hand the admin role on, make final.
// Then it checks the result from the outside and uses the deployed program.
// Run by .github/workflows/solana.yml. Needs a fresh local node WITHOUT the program, and:
//   PROGRAM_KEY  key file of the program's address (the program was built for it)
//   PROGRAM_SO   the built program
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const web3 = require("@solana/web3.js");
const J = require("../../web/solana/jisr-solana.js");

const RPC = process.env.RPC_URL || "http://127.0.0.1:8899";
const conn = new web3.Connection(RPC, "confirmed");
const ROOT = path.join(__dirname, "..", "..");
const U = 1000000n;
let steps = 0;
const step = (name) => { steps++; console.log("  ok  " + name); };

async function fund(key, sol) {
  const sig = await conn.requestAirdrop(key, sol * web3.LAMPORTS_PER_SOL);
  const bh = await conn.getLatestBlockhash();
  await conn.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, "confirmed");
}
async function send(ixs, payer, extra) {
  const tx = new web3.Transaction().add(...ixs);
  tx.feePayer = payer.publicKey;
  const bh = await conn.getLatestBlockhash();
  tx.recentBlockhash = bh.blockhash;
  tx.sign(payer, ...(extra || []));
  const sig = await conn.sendRawTransaction(tx.serialize());
  const res = await conn.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, "confirmed");
  if (res.value.err) throw new Error("transaction failed: " + JSON.stringify(res.value.err));
}
/* The upgrade authority, read from the network: null when the program is final. */
async function upgradeAuthority(programId) {
  const loader = new web3.PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
  const [dataAddress] = web3.PublicKey.findProgramAddressSync([programId.toBytes()], loader);
  const info = await conn.getAccountInfo(dataAddress);
  assert(info && info.owner.equals(loader), "the program's data account exists");
  // layout: 4 bytes kind (3 = program data), 8 bytes slot, 1 byte "has authority", 32 bytes authority
  assert.equal(info.data.readUInt32LE(0), 3);
  return info.data[12] === 1 ? new web3.PublicKey(info.data.subarray(13, 45)) : null;
}
function deploy(env) {
  const r = spawnSync("bash", [path.join(ROOT, "scripts", "solana-deploy.sh")], { env: Object.assign({}, process.env, env), encoding: "utf8" });
  process.stdout.write(r.stdout.replace(/^/gm, "      "));
  if (r.stderr) process.stdout.write(r.stderr.replace(/^/gm, "      "));
  return r;
}

(async () => {
  for (let i = 0; ; i++) { try { await conn.getVersion(); break; } catch (e) { if (i > 60) throw new Error("the local Solana node did not start"); await new Promise((r) => setTimeout(r, 1000)); } }
  const programKey = process.env.PROGRAM_KEY, programSo = process.env.PROGRAM_SO;
  const programId = web3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(programKey, "utf8")))).publicKey;
  const deployer = web3.Keypair.generate(), admin = web3.Keypair.generate(), platform = web3.Keypair.generate(), buyer = web3.Keypair.generate();
  const deployerFile = "/tmp/jisr-rehearsal-deployer.json";
  fs.writeFileSync(deployerFile, JSON.stringify(Array.from(deployer.secretKey)));
  await fund(deployer.publicKey, 20); await fund(admin.publicKey, 2); await fund(buyer.publicKey, 2);
  // the stablecoin of the rehearsal is the test dollar
  const stableMint = J.TEST_DOLLAR.mintKey().publicKey;
  await send(J.createTestDollarIxs(deployer.publicKey, await conn.getMinimumBalanceForRentExemption(82)), deployer, [J.TEST_DOLLAR.mintKey()]);
  const env = { RPC_URL: RPC, DEPLOYER_KEY: deployerFile, PROGRAM_KEY: programKey, PROGRAM_SO: programSo, STABLE_MINT: stableMint.toBase58(), PLATFORM_WALLET: platform.publicKey.toBase58(), ADMIN_WALLET: admin.publicKey.toBase58() };

  // 1. wrong inputs stop before anything is deployed
  const startOnly = (args, extraEnv) => spawnSync("node", [path.join(ROOT, "scripts", "solana-start.js")].concat(args), { env: Object.assign({}, process.env, { RPC_URL: RPC, PROGRAM_ID: programId.toBase58() }, extraEnv || {}), encoding: "utf8" });
  let r = startOnly([deployerFile, stableMint.toBase58(), J.ata(platform.publicKey, stableMint).toBase58(), admin.publicKey.toBase58()]);
  assert.equal(r.status, 2, "a platform wallet that is not a wallet is refused: " + r.stderr);
  r = startOnly([deployerFile, web3.Keypair.generate().publicKey.toBase58(), platform.publicKey.toBase58(), admin.publicKey.toBase58()]);
  assert.equal(r.status, 2, "a stablecoin that does not exist is refused: " + r.stderr);
  assert.equal(await conn.getAccountInfo(programId), null, "nothing was deployed");
  step("wrong inputs are refused before anything is sent");

  // 2. the deployment script: deploy, start, hand over, final
  r = deploy(env);
  assert.equal(r.status, 0, "the deployment script failed");
  assert(r.stdout.includes("JISR_PROGRAM_ID=" + programId.toBase58()));
  const info = await conn.getAccountInfo(programId);
  assert(info && info.executable, "the program is on the network");
  assert.equal(await upgradeAuthority(programId), null, "the program is final: it has no upgrade authority");
  let cfg = await J.getConfig(conn, programId);
  assert.deepEqual([cfg.admin, cfg.pendingAdmin, cfg.platformWallet, cfg.stableMint].map((k) => k.toBase58()),
    [deployer.publicKey, admin.publicKey, platform.publicKey, stableMint].map((k) => k.toBase58()), "started with the settings that were asked for; the admin wallet is named next");
  step("deployment script: program deployed, started with our settings, admin named, upgrade authority removed");

  // 3. the admin wallet accepts; the deployer key has no power left
  await send([J.acceptAdminIx(programId, admin.publicKey)], admin);
  cfg = await J.getConfig(conn, programId);
  assert.equal(cfg.admin.toBase58(), admin.publicKey.toBase58());
  let refused = false;
  try { await send([J.setPlatformWalletIx(programId, deployer.publicKey, deployer.publicKey)], deployer); } catch (_) { refused = true; }
  assert(refused, "after the hand-over the deployer key cannot change the platform wallet");
  step("hand-over: the admin wallet accepts, and the deployer key can no longer change anything");

  // 4. the deployed program works: launch, buy $1,000, sell back for $902.50, pay the platform wallet
  const made = J.createCoinIxs(programId, buyer.publicKey, stableMint, 0n, "Rehearsal Coin", "REH", "");
  await send(made.ixs, buyer);
  await send(J.testDollarFaucetIxs(buyer.publicKey, buyer.publicKey, 5000n * U), buyer, [J.TEST_DOLLAR.faucetKey()]);
  await send(J.buyIxs(programId, buyer.publicKey, stableMint, made.coinMint, 9500000n * J.COIN, 1000n * U), buyer);
  await send(J.sellIxs(programId, buyer.publicKey, stableMint, made.coinMint, 9500000n * J.COIN, 902500000n), buyer);
  assert.equal((await J.getBalances(conn, buyer.publicKey, stableMint, made.coinMint)).stable, 4000n * U + 902500000n);
  await send(J.sweepPlatformFeesIxs(programId, buyer.publicKey, stableMint, made.coinMint, platform.publicKey), buyer);
  assert.equal((await J.getBalances(conn, platform.publicKey, stableMint, null)).stable, 39n * U, "2% of $1,000 and of $950");
  step("the deployed program trades: $1,000 in, $902.50 back, the platform wallet paid");

  // 5. running the start step again is harmless, and settings that are not ours are noticed
  r = startOnly([deployerFile, stableMint.toBase58(), platform.publicKey.toBase58(), admin.publicKey.toBase58()]);
  assert.equal(r.status, 0, "a second run with the same settings changes nothing: " + r.stderr);
  assert.equal((await J.getConfig(conn, programId)).pendingAdmin.toBase58(), web3.PublicKey.default.toBase58());
  r = startOnly([deployerFile, stableMint.toBase58(), buyer.publicKey.toBase58(), admin.publicKey.toBase58()]);
  assert.equal(r.status, 3, "a program started with other settings is reported, so it is never made final by mistake: " + r.stderr);
  step("the start step is safe to repeat and reports a program that was started with other settings");

  fs.unlinkSync(deployerFile);
  console.log("\n  " + steps + " rehearsal steps passed for the program " + programId.toBase58());
})().catch((e) => { console.error(e); process.exit(1); });
