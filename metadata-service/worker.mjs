// Jisr metadata service for Solana.
//
// Wallets and explorers show a token's picture by opening the link in its Metaplex metadata and
// reading a small JSON file there. For a Jisr coin that link is  <this service>/<market address>.
// This service answers it: it reads the coin's market account from Solana and returns the name,
// ticker, description, picture and links the creator entered at launch.
//
// It holds no keys and stores nothing. Everything it returns is public data from the chain.
// It runs as a Cloudflare Worker, or anywhere else that has fetch, Request and Response.
//
// Settings (environment variables):
//   RPC_URL     a Solana RPC address for the network the launchpad is on
//   PROGRAM_ID  the Jisr program's address
//   SITE_URL    the Solana page, e.g. https://example.com/solana.html  (used for the "website" link back)
//
// Deploying it and pointing the launchpad at it: see metadata-service/README.md.

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MARKET = [219, 190, 213, 55, 0, 227, 198, 154]; // first 8 bytes of every market account

function base58(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b === 0) out = "1" + out; else break; }
  return out;
}
const json = (status, body, cache) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": cache || "no-store" }
});
const https = (v) => (typeof v === "string" && /^https:\/\/[^\s"'<>]+$/i.test(v) ? v : "");

/* The coin's details as the launch page packs them: {"d": description, "i": picture, "x", "t", "w"}. An
   older or hand-made coin may hold a bare link or nothing. Same reading rules as the page (unpackMeta). */
export function details(text) {
  let o = null;
  try { o = JSON.parse(text); } catch (_) { o = null; }
  if (!o || typeof o !== "object") return { description: "", image: https(text), x: "", telegram: "", website: "" };
  return { description: typeof o.d === "string" ? o.d.slice(0, 300) : "", image: https(o.i), x: https(o.x), telegram: https(o.t), website: https(o.w) };
}

/* A market account: 8 bytes kind, creator 32, coin mint 32, then 130 bytes of numbers and flags, then
   three texts (name, ticker, details), each a 4-byte length followed by UTF-8. */
function readMarket(data) {
  if (data.length < 174 || !MARKET.every((b, i) => data[i] === b)) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength), dec = new TextDecoder();
  let o = 162;
  const text = () => { const n = view.getUint32(o, true); if (o + 4 + n > data.length) throw new Error("bad text length"); const t = dec.decode(data.subarray(o + 4, o + 4 + n)); o += 4 + n; return t; };
  return { coinMint: base58(data.subarray(40, 72)), name: text(), symbol: text(), details: details(text()) };
}

export async function handle(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") return json(405, { error: "GET only" });
  const last = new URL(request.url).pathname.split("/").filter(Boolean).pop() || "";
  const address = last.replace(/\.json$/i, "");
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return json(400, { error: "The address of a coin's market is expected at the end of the link." });
  if (!env || !env.RPC_URL || !env.PROGRAM_ID) return json(500, { error: "This service is not set up: RPC_URL and PROGRAM_ID are missing." });

  let account;
  try {
    const r = await fetch(env.RPC_URL, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [address, { encoding: "base64", commitment: "confirmed" }] })
    });
    const body = await r.json();
    if (body.error) throw new Error(body.error.message || "RPC error");
    account = body.result && body.result.value;
  } catch (e) {
    return json(502, { error: "The Solana network did not answer. Try again." });
  }
  if (!account || account.owner !== env.PROGRAM_ID) return json(404, { error: "This is not a coin of this launchpad." });

  let m = null;
  try { m = readMarket(Uint8Array.from(atob(account.data[0]), (c) => c.charCodeAt(0))); } catch (_) { m = null; }
  if (!m) return json(404, { error: "This is not a coin of this launchpad." });

  // a coin's name, ticker and details are written once at launch and never change, so the answer can be kept for a day
  return json(200, build(m, env.SITE_URL), "public, max-age=86400");
}

/* What a wallet is given for one coin. `m` is { coinMint, name, symbol, details } with details as returned by details(). */
export function build(m, siteUrl) {
  const page = siteUrl ? String(siteUrl).split("#")[0] + "#coin/" + m.coinMint : "";
  const out = { name: m.name, symbol: m.symbol, description: m.details.description, image: m.details.image, external_url: m.details.website || page };
  const ext = {};
  if (m.details.website) ext.website = m.details.website;
  if (m.details.x) ext.twitter = m.details.x;
  if (m.details.telegram) ext.telegram = m.details.telegram;
  if (page) ext.launchpad = page;
  if (Object.keys(ext).length) out.extensions = ext;
  return out;
}

export default { fetch: (request, env) => handle(request, env) };
