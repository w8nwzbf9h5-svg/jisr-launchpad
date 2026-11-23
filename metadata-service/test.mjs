// Checks the metadata service against a made-up market account, with the network stubbed out.
// Run: node metadata-service/test.mjs   (needs @solana/web3.js; the Solana workflow runs it)
import assert from "assert";
import { handle } from "./worker.mjs";
import { createRequire } from "module";
const require = createRequire(new URL("../", import.meta.url));
const web3 = require("@solana/web3.js");
const J = require("./web/solana/jisr-solana.js");
const program = web3.Keypair.generate().publicKey, mint = web3.Keypair.generate().publicKey;
const enc = new TextEncoder();
const str = (s) => { const b = enc.encode(s), l = Buffer.alloc(4); l.writeUInt32LE(b.length); return Buffer.concat([l, b]); };
const detailsText = J.packMeta({ description: "A coin <b>for</b> the caravan", image: "https://example.org/c.png", x: "https://x.com/c", telegram: "", website: "" });
const acct = Buffer.concat([Buffer.from([219, 190, 213, 55, 0, 227, 198, 154]), Buffer.alloc(32, 7), Buffer.from(mint.toBytes()), Buffer.alloc(8 + 16 + 16 + 48 + 2), str("Camel Cash"), str("HUMP"), str(detailsText)]);
// the page's own decoder reads the same bytes
const viaPage = J.decodeMarket(acct);
assert.deepEqual([viaPage.name, viaPage.symbol, viaPage.coinMint.toBase58()], ["Camel Cash", "HUMP", mint.toBase58()]);
let answer = { result: { value: { owner: program.toBase58(), data: [acct.toString("base64"), "base64"] } } };
globalThis.fetch = async () => ({ json: async () => answer });
const env = { RPC_URL: "http://rpc", PROGRAM_ID: program.toBase58(), SITE_URL: "https://site.example/solana.html" };
const market = web3.Keypair.generate().publicKey.toBase58();
let r = await handle(new Request("https://meta.example/" + market), env);
assert.equal(r.status, 200);
assert.deepEqual(await r.json(), { name: "Camel Cash", symbol: "HUMP", description: "A coin <b>for</b> the caravan", image: "https://example.org/c.png",
  external_url: "https://site.example/solana.html#coin/" + mint.toBase58(), extensions: { twitter: "https://x.com/c", launchpad: "https://site.example/solana.html#coin/" + mint.toBase58() } });
assert.equal(r.headers.get("access-control-allow-origin"), "*");
r = await handle(new Request("https://meta.example/v1/" + market + ".json"), env); assert.equal(r.status, 200);
answer = { result: { value: { owner: web3.Keypair.generate().publicKey.toBase58(), data: [acct.toString("base64"), "base64"] } } };
assert.equal((await handle(new Request("https://meta.example/" + market), env)).status, 404, "an account of another program");
answer = { result: { value: null } };
assert.equal((await handle(new Request("https://meta.example/" + market), env)).status, 404, "no such account");
answer = { result: { value: { owner: program.toBase58(), data: [Buffer.alloc(300).toString("base64"), "base64"] } } };
assert.equal((await handle(new Request("https://meta.example/" + market), env)).status, 404, "not a market account");
assert.equal((await handle(new Request("https://meta.example/hello"), env)).status, 400);
assert.equal((await handle(new Request("https://meta.example/" + market, { method: "POST" }), env)).status, 405);
globalThis.fetch = async () => { throw new Error("down"); };
assert.equal((await handle(new Request("https://meta.example/" + market), env)).status, 502);
assert.equal((await handle(new Request("https://meta.example/" + market), {})).status, 500);
console.log("metadata service: answers for a market, refuses everything else");
