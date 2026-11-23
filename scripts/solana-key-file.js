// Writes a Solana key file for the command-line tools from a secret, and prints the wallet's address.
//   SOLANA_KEY=<secret> node scripts/solana-key-file.js <file>
// The secret may be either form a wallet gives you:
//   - a list of 64 numbers in square brackets (a Solana key file's content), or
//   - one long word of letters and digits (what Phantom shows under "Export private key").
// The secret is read from the environment so that it never appears in a command line or a log.
// Only the address is printed.
const fs = require("fs");
const web3 = require("@solana/web3.js");

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function fromBase58(text) {
  let n = 0n;
  for (const ch of text) { const i = ALPHABET.indexOf(ch); if (i < 0) throw new Error("not base58"); n = n * 58n + BigInt(i); }
  let hex = n.toString(16); if (hex.length % 2) hex = "0" + hex;
  const body = n === 0n ? [] : Array.from(Buffer.from(hex, "hex"));
  let zeros = 0; for (const ch of text) { if (ch === "1") zeros++; else break; }
  return Uint8Array.from(new Array(zeros).fill(0).concat(body));
}
function parse(secret) {
  const t = String(secret || "").trim();
  if (!t) throw new Error("the secret is empty");
  let bytes;
  if (t.startsWith("[")) bytes = Uint8Array.from(JSON.parse(t)); else bytes = fromBase58(t);
  if (bytes.length === 64) return web3.Keypair.fromSecretKey(bytes); // checks that the two halves belong together
  if (bytes.length === 32) return web3.Keypair.fromSeed(bytes);
  throw new Error("expected 64 or 32 bytes, got " + bytes.length);
}
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error("usage: SOLANA_KEY=<secret> node scripts/solana-key-file.js <file>"); process.exit(2); }
  let kp;
  try { kp = parse(process.env.SOLANA_KEY); } catch (e) { console.error("The deployer secret could not be read: " + e.message + ". It must be a Solana private key: 64 numbers in square brackets, or the word Phantom shows under Export private key."); process.exit(2); }
  fs.writeFileSync(file, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  console.log(kp.publicKey.toBase58());
}
module.exports = { parse };
