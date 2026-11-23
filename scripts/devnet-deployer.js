// Prints the devnet deployer address, or writes its key file for the Solana tools.
//   node scripts/devnet-deployer.js            -> the address
//   node scripts/devnet-deployer.js <file>     -> also writes the key file
//
// This key is public on purpose. It is made from the fixed phrase below, so the deployment job can
// use an address that anyone may fund with free devnet SOL, without a secret having to be stored
// anywhere. It is used on devnet only, to pay for deploying the program. The program is deployed as
// final, so this key has no power over it afterwards. Never send anything of value to this address.
const crypto = require("crypto");
const fs = require("fs");

const seed = crypto.createHash("sha256").update("jisr launchpad devnet deployer v1 (public on purpose)").digest();
const priv = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), format: "der", type: "pkcs8" });
const pub = crypto.createPublicKey(priv).export({ type: "spki", format: "der" }).subarray(-32);

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes) {
  let n = BigInt("0x" + Buffer.from(bytes).toString("hex")), out = "";
  while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b === 0) out = "1" + out; else break; }
  return out;
}
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify([...seed, ...pub]));
console.log(base58(pub));
