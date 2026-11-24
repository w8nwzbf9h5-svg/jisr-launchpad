# Metadata service for Solana coins

Wallets such as Phantom show a token's **name and ticker** from its on-chain metadata, and its
**picture** from a small file that the metadata links to. The Jisr program writes the name, the
ticker and that link when a coin is launched, and nobody can change them afterwards.

This folder is the service that answers the link. It is one file, `worker.mjs`. It holds no keys and
stores nothing: for each request it reads the coin's market account from Solana and returns what the
creator entered at launch.

## Two ways to answer the link

| | How | When a new coin's picture appears |
|---|---|---|
| Files published with the site | `scripts/build-metadata.js` reads every coin from the chain and writes `meta/<market address>.json` whenever the site is published. Nothing to set up. **The public test uses this.** | At the next publish: on the next change to the site, or when someone presses "Run workflow" on *Publish site* in the Actions tab. |
| This service | One file on Cloudflare (below). It reads the chain on each request. | At once. |

Both return exactly the same content. Whichever is used, its address is written into every coin at
launch and can never be changed, so for real coins it must be an address that will never move.

## What happens without either

Coins still launch and trade. Wallets show the name and the ticker, with no picture.

## Why it must be set up before real coins are launched

The link is written into each coin once, at launch, and can never be changed. A coin launched before
the service's address is in the page's settings has an empty link for good. Decide the address first.
Use an address you control and will keep (your own domain is best).

## Setting it up on Cloudflare (free plan is enough)

1. Create a Cloudflare account. In the dashboard: Workers & Pages, Create, Worker. Give it a name.
2. Replace the sample code with the content of `worker.mjs`. Deploy.
3. In the Worker's Settings, Variables, add:
   - `RPC_URL`: your Solana RPC address for the network the launchpad is on
   - `PROGRAM_ID`: the Jisr program's address
   - `SITE_URL`: the address of the Solana page, for example `https://your-domain/solana.html`
4. Optional: under Triggers, add a custom domain, for example `meta.your-domain`.
5. Put the service's address in `web/solana/config.js` as `metadataBase` for that network,
   for example `metadataBase: "https://meta.your-domain"`.

Check it: open `<service address>/<a market address>` in a browser. It shows the coin's name, ticker,
description and picture link.

## What it returns

```json
{
  "name": "Camel Cash",
  "symbol": "HUMP",
  "description": "…",
  "image": "https://…/picture.png",
  "external_url": "https://…",
  "extensions": { "website": "…", "twitter": "…", "telegram": "…", "launchpad": "…" }
}
```

Everything in it was written by the coin's creator and is checked by nobody. Links and pictures are
passed through only if they start with `https://`.
