# Jisr Launchpad

A launchpad for meme coins where every coin is sold at one fixed price, and every coin sold puts its
floor price into a reserve that nobody can withdraw. Any holder can sell back to that reserve at the
floor price at any time.

**Public test:** https://w8nwzbf9h5-svg.github.io/jisr-launchpad/

> Test networks only. The coins and the money there have no value. The contracts have not had an
> independent security audit, and nothing is deployed on a real network.

## What makes it different

| | |
|---|---|
| One price for everyone | The first 800 million coins of every coin cost the same for every buyer, the creator included. No cheap early round. |
| A floor that is paid for | The reserve always holds enough to buy back every coin in circulation at the floor price. |
| A floor that rises | Once the sale has sold out, 2% of every trade stays in the reserve and the floor is raised to match. It is never lowered. |
| Nobody holds the keys | Reserves have no owner, no pause and no withdrawal. On Solana the program itself cannot be changed. |
| No free coins | The creator receives none. A wallet may hold 2.5% of a coin at most. |
| Fees | 5% of each trade: 1% to the coin's creator, 2% to the launchpad, 2% into the coin's reserve. Paid out automatically. |

Worked example: $1,000 buys 9,500,000 coins; selling them straight back returns $902.50.

## See it work

- **[Home page](https://w8nwzbf9h5-svg.github.io/jisr-launchpad/)**: operate the model yourself, and watch your browser read the proof from the chain.
- **[Launchpad on Solana devnet](https://w8nwzbf9h5-svg.github.io/jisr-launchpad/solana.html)** (Phantom).
- **[Launchpad on Ethereum Sepolia](https://w8nwzbf9h5-svg.github.io/jisr-launchpad/app.html)** (MetaMask).
- **[White paper](https://w8nwzbf9h5-svg.github.io/jisr-launchpad/whitepaper.html)**, with figures, in ten languages:
  [English](WHITEPAPER.md) · [العربية](WHITEPAPER-AR.md) · [中文](WHITEPAPER-ZH.md) · [Español](WHITEPAPER-ES.md) · [हिन्दी](WHITEPAPER-HI.md) · [Français](WHITEPAPER-FR.md) · [Русский](WHITEPAPER-RU.md) · [Português](WHITEPAPER-PT.md) · [Türkçe](WHITEPAPER-TR.md) · [Bahasa Indonesia](WHITEPAPER-ID.md)

## Where it runs today

| Network | Address | State |
|---|---|---|
| Solana devnet | program `5cbX2QdxMq948ySWxF6yHruKFtpp5Kf8WGA1wb3BaKC8` | Final: its upgrade authority is removed |
| Ethereum Sepolia | factory `0x4e34BD62B8245Fa7841061eeFa010fF054FA9d06` | Current build: fees are paid out with every trade |

## Status

| | |
|---|---|
| Ethereum-family contracts | Built. 47 contract tests and 25 browser test steps. |
| Solana program | Built. Tested on every change against a local node and the real Metaplex program. |
| Selling to another network | Built with Circle's CCTP. Tested against stand-ins, not yet on Circle's live test bridge. |
| Independent security audit | **Not done.** |
| Real networks | **Nothing deployed.** |

## Documents

| Document | For |
|---|---|
| [White paper](WHITEPAPER.md) | Everyone: how a coin works, who controls what, the risks |
| [AUDIT.md](AUDIT.md) | A security reviewer: scope, rules that must always hold, known weak points |
| [GO-LIVE.md](GO-LIVE.md) | What must happen before real money, and how each deployment is done |
| [docs/DEVELOPER.md](docs/DEVELOPER.md) | People working on the code |
| [DEPLOY-AR.md](DEPLOY-AR.md) | دليل النشر من المحفظة بالعربية |

## Rights

Copyright © 2026 Jisr Launchpad. **All rights reserved.** This repository is published so that the
code can be read and verified. It is not open source: copying, modifying, deploying or reusing any
part of it needs written permission. See [LICENSE](LICENSE).
