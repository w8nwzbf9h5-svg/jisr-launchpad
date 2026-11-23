# Jisr Launchpad

A launchpad for meme coins where every coin is sold at one fixed price and has a floor covered 100% by a reserve nobody can withdraw. This repository holds the smart contracts and the web app that talks to them. The same contracts deploy on any EVM network.

- **White paper:** [English](WHITEPAPER.md) · [العربية](WHITEPAPER-AR.md) · [中文](WHITEPAPER-ZH.md) · [Español](WHITEPAPER-ES.md) · [हिन्दी](WHITEPAPER-HI.md) · [Français](WHITEPAPER-FR.md) · [Русский](WHITEPAPER-RU.md) · [Português](WHITEPAPER-PT.md) · [Türkçe](WHITEPAPER-TR.md) · [Bahasa Indonesia](WHITEPAPER-ID.md) · [on the site](https://w8nwzbf9h5-svg.github.io/jisr-launchpad/whitepaper.html). English is the reference text.
- **Site:** https://w8nwzbf9h5-svg.github.io/jisr-launchpad/
- **Test deployment:** Sepolia test network, factory `0x5E603f7Fc12D8C2744c9117a43f5021c7dEb5647`. Test money only, no value.
- **Solana test deployment:** devnet, program `7cu1YmBA3D1asv1fUijaoZ5FqodZrW9JhbWdPCXGGSkU`, deployed as final. [Solana page](https://w8nwzbf9h5-svg.github.io/jisr-launchpad/solana.html). Test money only, no value.

Status: tested locally end to end and deployed on a test network. **Not audited and not deployed on any real network.** Do not put real money in before an independent security audit.

| Folder | What it is |
|---|---|
| `contracts/` | The three contracts, plus test-only mocks |
| `contracts/periphery/BridgeSeller.sol` | Optional helper beside a factory: sell a coin here and receive the USDC on another network through Circle's CCTP. No owner, holds nothing between transactions |
| `test/` | 44 contract tests |
| `web/` | The web app. Static files, no build step, no server |
| `e2e/` | A browser test (24 steps) that drives the web app against a local chain |
| `scripts/` | Deploy, local demo, local web server |
| `solana/` | The same launchpad as a Solana program (Anchor), with Rust tests, a client test and a browser test against a local node. `web/solana.html` is its page |
| `DEPLOY-AR.md` | Arabic guide: deploy from a wallet and link the site |
| `WHITEPAPER.md`, `WHITEPAPER-XX.md` | The white paper in ten languages. `npm run whitepaper` rebuilds `web/whitepaper.html` from them |

## What is here

| Contract | Job |
|---|---|
| `LaunchpadFactory` | Launches coins. Holds the one setting the team controls: the platform wallet. One factory per reserve currency per network. |
| `Coin` | The coin itself. 1 billion supply, minted once to its market. 2.5% wallet limit. |
| `CoinMarket` | Sells the coin, buys it back, and holds its stablecoin reserve. One per coin. |

## Who controls what

| Wallet or contract | Who can move its funds |
|---|---|
| A coin's reserve (`CoinMarket`) | Nobody. It pays sellers by formula, the creator his 1%, the platform wallet its 2%. Nothing else. |
| A coin (`Coin`) | Its holders only. No mint, no pause, no blacklist, no fee switch. |
| Platform wallet | The launchpad team. It receives the 2% fee. |
| Factory owner | Can change which address is the platform wallet. That is its only power. |

`CoinMarket` and `Coin` have no owner, no upgrade path and no withdrawal function. The test `No admin powers` pins the full list of state-changing functions, so adding one fails the build:

- `CoinMarket`: `buy`, `buyWithNative`, `sell`, `sellForNative`, `claimCreatorFees`, `sweepPlatformFees`, `reinforce`
- `Coin`: `transfer`, `transferFrom`, `approve`
- `LaunchpadFactory`: `createCoin`, `setPlatformWallet`, ownership transfer

Use a multisig as the factory owner and as the platform wallet.

## Networks and reserve currencies

- **Any EVM network.** The contracts use nothing network-specific. The web app names Ethereum, BNB Chain, Base, Arbitrum One, OP Mainnet, Polygon, Avalanche and Robinhood Chain in advance, plus their testnets; any other EVM network is described on the deploy page when you deploy there.
- **Reserve currency.** Each factory is deployed with one reserve token and one number: what the whole 1B supply is worth at the sale price, in that token. With a dollar stablecoin and 100,000 that is the $0.0001 sale price. With a tokenized stock, use the number of shares worth the market cap you want (400 shares of a $250 stock for about $100K). The floor is then a number of shares, so its dollar value moves with the stock. Tokens that charge a transfer fee, rebase, or restrict who may hold them are not supported.
- **Swap router is optional.** With a Uniswap V2 style router, buyers can pay and be paid in the network's own currency. Without one, trading is in the reserve token only.

Solana is a separate program (`solana/`). Other non-EVM networks would each need their own.

## How pricing works

Price is one line over the number of coins outstanding (coins held outside the market).

1. **The sale: the first 800M coins.** Each costs the floor price, $0.0001, a $100K market cap. Everybody pays the same, the creator included.
2. **Graduation.** The sale sells out. From then on the floor can rise.
3. **Above the floor: the last 200M coins.** Each costs the floor price plus a premium. The total premium held when `s` of them are out is `salePrice * s² / (200M − s)`. The curve stops at 190M.

Every coin that leaves the market puts one floor price into the **floor reserve**. So the reserve can always buy back every outstanding coin at the floor price. Premiums sit in a separate **premium reserve** and are paid back as the curve unwinds.

**Fees.** 5% of every buy and every sell: 1% to the creator, 2% to the platform wallet, 2% stays in the floor reserve.

**Rising floor.** After graduation, the 2% that stays makes the floor reserve bigger than it needs to be. After every trade the floor price is set to `floorReserve / max(outstanding, 800M)` if that is higher than the current floor. It is never lowered.

**Rounding** always favours the reserve.

Worked example, checked in the tests: buy with $1,000, receive 9.5M coins; sell them back at the floor, receive $902.50.

## Paying with ETH or BNB

`buyWithNative` and `sellForNative` swap through a Uniswap V2 style router on the way in and out. The reserve itself only ever holds the stablecoin. `msg.value` is the buyer's price limit and the unused part is refunded in the same transaction.

## Run it

```
npm install
npx hardhat test
```

35 tests. Each market test runs three times: with a 6-decimal stablecoin, an 18-decimal one, and a stock token with the supply priced at 400 shares. The suite includes:

- **Random trading.** About 450 random buys, sells and transfers across 57 wallets. After every step: the contract holds everything it owes, the floor reserve covers every coin, the floor has not fallen, the price is not under the floor. At the end every holder sells everything and every sale succeeds.
- **Attacks.** A 12-wallet attacker makes 260 seeded moves (size, dust, donations, shuffling coins between wallets) against other people's money, during the sale and after graduation. The attacker never ends with a profit, and every victim can still exit in full.

## Deploy

```
STABLE_ADDRESS=0x... PLATFORM_WALLET=0x... OWNER_ADDRESS=0x... \
ROUTER_ADDRESS=0x... SALE_MARKET_CAP=100000 \
DEPLOYER_KEY=0x... SEPOLIA_RPC_URL=https://... \
npx hardhat run scripts/deploy.js --network sepolia
```

The stablecoin, the router and the sale price are fixed for the life of a factory. Take each address from that project's official documentation and confirm it on a block explorer. Deploy to a testnet first.

Measured locally: factory deployment 3.63M gas, `createCoin` 548K, `buy` 231K, `sell` 105K.

## Known limits

- **No admin means no rescue.** If a bug is found after deployment, nobody can pause or patch a live market. That is the price of nobody being able to take the reserve. It is why the audit comes first.
- **The 2.5% limit is per address.** A chain cannot tell that two addresses belong to one person. Linked-wallet rules need an off-chain judge, which contradicts "no human in the loop", so they are not in the contracts.
- **Stablecoin risk.** The issuer of USDC or USDT can freeze an address, and a stablecoin can lose its peg. The contracts cannot defend against either.
- **Router risk.** Native-currency trades depend on the router and its liquidity. A sandwich attack can cost a native buyer up to the `msg.value` they send, so the app must send a tight amount.
- **Buyers above the floor can lose the premium.** The floor protects the floor price, not the price paid on the curve.
- **Coins sent directly to the market** (a plain transfer instead of `sell`) are lost to the sender. They stay counted and covered; nobody can claim them.
- **Money left after everyone exits.** The 2% kept from exit sales stays in the reserve. It lifts the floor for whoever buys next.

## The web app

`web/` is a static site: `index.html`, `app.js`, `styles.css`, the ethers library, and two small config files. It reads everything from the chain and keeps nothing on a server. Host the folder on any static host.

It does: connect a wallet, list coins, show a coin's price, floor and reserve cover, buy with the stablecoin or the native currency, sell into either, launch a coin, and pay out creator and launchpad fees.

**Coin details.** When launching, the creator picks the network and currency and can add a photo, a description and X, Telegram and website links. They are stored on-chain with the coin as a small JSON text, so there is no server and no upload service. A photo is shrunk in the browser to a small square first. Because anyone can launch a coin with any text, the app treats what it reads back as untrusted: text is escaped, pictures must be https links or small PNG/JPEG/WebP data, links must be https and on the expected site.

**Several currencies on one network.** Each factory prices coins in one stablecoin. To offer a second currency on a network, deploy a second factory; the deploy page adds it beside the first (`extraFactories` in `web/deployments.js`) and the app lists each as its own choice. Quotes are computed in the page with the same formulas as the contract; the browser test checks they match the contract to the last unit.

### Try it on your own computer

```
npm install
npm run chain          # terminal 1: a local test chain
npm run demo:deploy    # terminal 2: test stablecoin, test router, factory, two example coins
npm run web            # terminal 2: then open http://127.0.0.1:4173
```

In your wallet, add the network `http://127.0.0.1:8545` (chain id 31337) and import one of the test keys that `npm run chain` prints. Those keys are public test keys: never use them anywhere else. The page footer has a button for test money.

### Browser test

```
npm run e2e
```

Starts a local chain, deploys, serves the app, and drives it in headless Chrome with a stand-in wallet. 20 steps. They cover launching with a photo, description and social links, hostile coin details that must not inject anything into the page, trading, fees, and the deploy page (deploy the test kit, check and deploy with chosen addresses, change the platform wallet, offer two currencies on one network, deploy and trade a factory priced in a stock token with no router, paste the snippet and trade on the newly linked site). The trading steps: the board loads, the wallet connects, a coin is launched, bought with the stablecoin and with the native currency, sold into both, fees are paid out, the wallet limit trims a large buy, a graduated coin trades above its floor. After each step the test reads the chain and compares.

### Putting it on a testnet, then a mainnet

The owner does this from a browser, with no tools: see **`DEPLOY-AR.md`** (Arabic, step by step).

In short: upload `web/`, open `/admin.html` in a wallet browser, deploy from the wallet, paste the snippet the page gives you into `web/deployments.js`. The page deploys either a full test kit (testnets only) or the factory with real addresses, which it checks first: it reads the stablecoin's symbol and the router's live rate and refuses a wrong address before any transaction is sent. The same page lets the owner change the platform wallet.

`web/contracts.js` holds the compiled contracts the deploy page sends. Regenerate it with `npm run web:artifacts` whenever a contract changes.

Developers can deploy from the command line instead with `scripts/deploy.js` (see Deploy).

## On GitHub

- `.github/workflows/pages.yml` publishes `web/` as the site whenever something under `web/` changes on `main`. Turn GitHub Pages on once in the repository settings, with GitHub Actions as the source. Editing `web/deployments.js` in GitHub's own editor is then all it takes to link the site to a newly deployed factory.
- `.github/workflows/tests.yml` runs the contract tests and the Solana pricing tests on every push and pull request, and fails if `web/contracts.js` no longer matches the contracts.

## Launch checklist

- [ ] Independent security audit of the three contracts, and fixes re-tested
- [ ] Testnet deployment on Sepolia and BNB testnet, exercised by hand with real wallets
- [ ] Multisig set up for the factory owner and for the platform wallet
- [ ] Stablecoin and router chosen per chain, addresses confirmed from official sources
- [ ] Your own RPC provider for the web app
- [ ] Mainnet deployment, contracts verified on the block explorers
- [ ] Monitoring of reserve cover per coin

## Not built yet

- Solana: on-chain build, devnet run, token metadata, and web app support (the program and its tests are in `solana/`).
- Cross-chain payout (sell on one chain, receive on another).
- Everything in the launch checklist above.
