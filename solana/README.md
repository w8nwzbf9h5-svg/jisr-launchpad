# Jisr launchpad for Solana

The Solana side of the launchpad. Same rules as the EVM contracts.

Status: the program is written and its instructions run correctly against the real SPL Token program in an in-process test bank. **It has not been compiled to on-chain bytecode, deployed, or audited**, and the web app does not talk to Solana yet.

| Folder | What it is |
|---|---|
| `crates/jisr-math` | Pricing, fees and reserve accounting. Pure Rust, no dependencies. 7 tests |
| `programs/jisr` | The Anchor program. 2 integration tests |

## Who controls what

- A coin's two vaults (its coins, its stablecoin reserve) belong to the coin's `Market` account, a program-derived address with no private key. Stablecoins leave only to a seller by formula, to the creator (1%) and to the platform wallet (2%). No instruction withdraws anything else.
- A coin's mint authority is removed in the instruction that creates it. It never has a freeze authority. Supply is fixed at 1 billion.
- The admin in `Config` can change the platform wallet and hand the admin role on, in two steps. Nothing else.
- **The upgrade authority.** A Solana program can be replaced by whoever holds its upgrade authority. For "nobody can change the rules" to be true, remove the upgrade authority after deployment (`solana program set-upgrade-authority <PROGRAM_ID> --final`). After that nobody can patch a bug either, so do it only after the audit.

## Differences from the EVM version

- **Paying with SOL** is composed by the app: a swap from SOL to the stablecoin and the `buy` instruction go in one transaction, so both succeed or neither does. The program itself only touches the stablecoin.
- **The 2.5% wallet limit** is checked when buying, on the buyer's associated token account. Plain SPL tokens cannot block transfers between wallets, so a holder can receive more than 2.5% by transfer. On every chain the limit is per address in any case.
- **Coin name and ticker** are stored in the `Market` account. Wallets will not show them until token metadata is added (see below).

## Run the tests

```
cargo test -p jisr-math
cargo test -p jisr --test integration
```

The math tests cover the fixed price ($1,000 in, $902.50 out), graduation, the rising floor, 20 seeded runs of 3,000 random trades each with the reserve checked after every step, and a 12-wallet attacker who never profits. The integration tests create coins, buy, sell, hit the wallet limit and the price limits, pay fees to the right wallets only, refuse the wrong ones, change the platform wallet, hand over the admin role, sell out a sale across 32 wallets, trade above the floor, absorb a gift into the reserve, and exit everyone.

## Before this can go live

1. Build with the Anchor toolchain (`anchor build`). This has not been done here; it produces the on-chain bytecode and may ask for small changes (stack size, compute budget).
2. Replace the placeholder program id: `anchor keys sync`.
3. Run on a local validator and on devnet. Send `initialize` in the same transaction as the deployment, so nobody else can call it first; check `Config.admin` afterwards.
4. Add token metadata (name, ticker, picture) so wallets display the coin.
5. Add Solana to the web app: wallet connection, the instructions, and the SOL swap.
6. Independent audit, then remove the upgrade authority.

## Built and tested in CI

The workflow `.github/workflows/solana.yml` runs on every change under `solana/` or `web/solana/`:

1. builds the program for deployment (`anchor build`, Anchor 0.31.1) and runs the Rust tests above;
2. starts a local Solana node with the program and runs `client-test/run.js`: the same client file the web page uses (`web/solana/jisr-solana.js`) sets the program up, launches coins, trades through the sale and the curve, and checks every result against the page's own price math, to the last unit;
3. starts a fresh node and runs `client-test/page.js`: a real browser opens `web/solana.html` with a stand-in for the Phantom wallet and walks through setup, test dollars, a launch, a buy, a sale and the fee payouts.

Each run attaches `jisr-solana-program`: `jisr.so` (the deployable program, about 350 KB) and `jisr.json` (its interface file).

## The web page

`web/solana.html` is the Solana side of the site: board, coin page, launch form, buy and sell, fee payouts, and a one-time setup card. It asks the visitor's Phantom wallet to sign and sends through its own connection, so the wallet's network setting does not matter. Coin details (description, picture link, X, Telegram, website) are stored with the coin in up to 400 bytes.

On test networks the reserve currency is a test dollar that anyone can mint from the page. Its two keys are derived from fixed public phrases in `jisr-solana.js`; they are not secrets and guard nothing of value.

## Deploying to devnet

**Deployed:** `7cu1YmBA3D1asv1fUijaoZ5FqodZrW9JhbWdPCXGGSkU` on devnet, as final (Solana Explorer shows it as executable and not upgradeable). The site's Solana page points at it.

To deploy another copy:

`.github/workflows/solana-devnet.yml` deploys the program to devnet as **final** (it can never be changed) at a new address. It pays from the devnet deployer address, whose key is public on purpose (`scripts/devnet-deployer.js`):

```
BoQdaWDQ79SWtoarTiptPk7MMjVYy8NeXsb8z7vN2Y5K
```

1. Send about 5 devnet SOL to that address from https://faucet.solana.com.
2. Start the workflow (change `solana/deploy-devnet.txt`, or use the Actions tab).
3. Put the program address it reports into `web/solana/config.js`, `declare_id!` in `programs/jisr/src/lib.rs` and `Anchor.toml`.
4. Open `solana.html`, connect Phantom, and do the one-time setup. The wallet that does it becomes the admin and the platform wallet.

Devnet only. For a real network, `initialize` must be sent together with the deployment so nobody else can call it first, the reserve must be a real stablecoin, and the program needs an independent audit first.
