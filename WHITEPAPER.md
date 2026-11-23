# Jisr Launchpad: White Paper

Version 0.1 · 22 November 2026 · Test network stage

Jisr (جسر, "bridge") is a launchpad for meme coins in which every coin has a price floor backed by money held in a contract that nobody can withdraw from. This paper describes how it works, what it protects against, what it does not, and what is built today.

## 1. The problem

Most meme coin launches end the same way. Early buyers and the creator hold coins that cost them almost nothing, and they sell into later buyers. On a classic bonding curve the money in the pool is only a fraction of the market value, so the price has nothing under it when selling starts. The usual defences (locks, vesting, sell taxes) depend on someone keeping a promise or on a rule that can be changed.

Jisr removes the cheap early coins and puts real money under every coin.

## 2. How a coin works

Every coin launched on Jisr has the same terms. The creator chooses only the name, the ticker, the picture, the description and the links.

| Term | Value |
|---|---|
| Total supply | 1,000,000,000 coins, created once |
| Sale | The first 800,000,000 coins at one fixed price |
| Sale price (dollar reserve) | $0.0001 per coin, a $100,000 market cap |
| Above the floor | The last 200,000,000 coins, priced on a rising curve |
| Trading fee | 5% of every buy and every sell |
| Wallet limit | 2.5% of supply (25,000,000 coins) per wallet |
| Coins given to the creator | None |

### 2.1 One price for everyone

The first 800 million coins are sold at the same price to everybody, the creator included. There is no cheap early round, so nobody holds coins that cost less than yours.

### 2.2 The covered floor

Each coin that leaves the market puts one floor price into the coin's **floor reserve**. The reserve therefore always holds enough to buy back every coin in circulation at the floor price. Any holder can sell back to the market at any time and receive the floor price, less the 5% fee.

Worked example with a dollar reserve:

| Step | Amount |
|---|---|
| You pay | $1,000.00 |
| Fee on the buy (5%) | $50.00 |
| Coins you receive | 9,500,000 |
| You sell all of them back at the floor | $950.00 before the fee |
| Fee on the sale (5%) | $47.50 |
| You receive | $902.50 |

A buy followed by a sale at the floor costs 9.75% in fees. That is the most a floor-price buyer can lose to the mechanism itself. The risks in section 6 are separate.

### 2.3 Graduation and the rising floor

When all 800 million sale coins have been sold, the coin has **graduated**. From then on, the 2% of every trade that stays in the reserve makes the reserve larger than it needs to be, and the floor price is raised to match:

> floor price = floor reserve ÷ the larger of (coins in circulation, 800,000,000)

The floor price is never lowered. At graduation the reserve holds about $81,684 for a $100,000 coin, so the floor starts about 2.1% above the sale price and climbs with trading volume.

### 2.4 Above the floor

The last 200 million coins cost the floor price plus a premium that grows as they sell out. The premium is held in a separate **premium reserve** and is paid back when coins are sold along the same line.

| Curve coins sold | Price of the next coin | Market value at that price |
|---|---|---|
| 0 | $0.0001 | $100,000 |
| 100,000,000 | about $0.0004 | about $400,000 |
| 150,000,000 | about $0.0016 | about $1,600,000 |
| 190,000,000 (the curve ends) | about $0.04 | about $40,000,000 |

The floor covers the floor price only. A buyer who pays a premium above the floor can lose that premium if others sell first.

### 2.5 Where the 5% goes

| Share | Goes to | Purpose |
|---|---|---|
| 1% | The coin's creator | Paid only when people trade the coin |
| 2% | The coin's floor reserve | Raises the floor for every holder after graduation |
| 2% | The launchpad's platform wallet | Runs the launchpad |

### 2.6 The wallet limit

No wallet can hold more than 2.5% of a coin's supply. This applies to every wallet, the creator's included. It limits how much one address can sell at once. It cannot stop one person from using several wallets: a blockchain cannot tell that two addresses belong to the same person.

## 3. Who controls what

| Thing | Who can move its funds or change it |
|---|---|
| A coin's reserves | Nobody. Money leaves only to a seller by the formula, to the creator as the 1% fee, or to the platform wallet as the 2% fee |
| A coin | Its holders only. No new coins, no pause, no blacklist, no fee switch |
| The platform wallet | The launchpad team. It receives the 2% fee |
| The factory owner | Can change which address is the platform wallet. Nothing else |

The coin and market contracts have no owner, no upgrade path, no pause and no withdrawal function. The creator has no special rights after launch. The test suite pins the full list of functions that can change state, so adding an admin function fails the build.

The cost of this design: if a bug is found after launch, nobody can pause or patch a live market.

## 4. For creators

- Launching costs one network transaction. There is no listing fee.
- The creator receives no coins. To hold the coin, the creator buys at the sale price like everyone else, within the same 2.5% limit.
- The creator earns 1% of every trade in the coin, claimable at any time.
- Nothing the creator buys is locked or vested, because the creator paid the same price as every other buyer.

## 5. Networks and currencies

- **Networks.** The contracts work on any EVM network: Ethereum, BNB Chain, Base, Arbitrum, Optimism, Polygon, Avalanche, Robinhood Chain and others. A coin lives on the network it was launched on.
- **Reserve currency.** Each launchpad deployment prices and backs its coins in one token: a dollar stablecoin (USDT or USDC), or another standard token such as a tokenized stock. With a stock token the floor is a number of shares, so its dollar value moves with the stock.
- **Paying with the network's own currency.** Where a swap router is connected, buyers can pay and be paid in ETH or BNB. The payment is converted on the way in and out; the reserve holds only the reserve token.
- **Receiving on another network.** On a launchpad backed by USDC, a seller can sell on the coin's network and receive the dollars on another network. The transfer goes through Circle's own USDC bridge (CCTP), and the launchpad holds nothing in between. Circle takes its own fee from the amount. This is not available on a launchpad backed by USDT or a stock token, or on BNB Chain and Robinhood Chain, which Circle's bridge does not serve.

## 6. Risks

Read this section before using the launchpad with anything of value.

- **Not audited.** The contracts have passed their own tests, including randomised trading and attack simulations. They have not been reviewed by an independent security auditor. A bug could lose funds.
- **No rescue.** Nobody can pause or fix a live market. This protects the reserve from people and removes the safety net against bugs.
- **Fees.** Buying and selling at the floor costs 9.75% in total.
- **Premium risk.** The floor protects the floor price. Money paid above the floor is not protected.
- **Reserve token risk.** A stablecoin can lose its peg, and its issuer can freeze an address. A stock token follows its stock and may restrict who can hold it. The contracts cannot defend against any of these.
- **Swap risk.** Paying in the network's own currency depends on the router and its liquidity, and can cost more than paying in the reserve token.
- **Bridge risk.** A sale paid out on another network depends on Circle's bridge to deliver the dollars there. If Circle is slow or stops, the delivery waits. The contracts cannot speed it up or reverse the sale.
- **Linked wallets.** The 2.5% limit is per address.
- **Coins sent to the market by plain transfer** instead of through a sale are lost to the sender.
- **The floor is a mechanism.** It is the amount the contract will pay, in the reserve token, for a coin. It is not a promise of profit and it is not insurance.

## 7. Status

| Part | State |
|---|---|
| EVM contracts | Built and tested (44 contract tests) |
| Web app and deploy page | Built and tested (24 browser tests), live |
| Test deployment | Live on the Sepolia test network, with test money that has no value |
| Independent security audit | Not done |
| Deployment on real networks | Not done. It follows the audit |
| Solana | Program and page built and tested together. Live on Solana devnet, a test network, with test money, and deployed so that it can never be changed. Not on the real network |
| Selling on one network and receiving on another (bridge) | Built and tested against stand-ins for Circle's contracts. Not yet run through Circle's live bridge |

Test deployment on Sepolia:

- Launchpad factory: `0x5E603f7Fc12D8C2744c9117a43f5021c7dEb5647`
- Solana devnet: `7cu1YmBA3D1asv1fUijaoZ5FqodZrW9JhbWdPCXGGSkU`
- Site: https://w8nwzbf9h5-svg.github.io/jisr-launchpad/
- Code: https://github.com/w8nwzbf9h5-svg/jisr-launchpad

## 8. Notice

This paper describes software. It is not an offer of any coin, and it is not financial advice. Coins launched on Jisr are created by their creators, not by the launchpad. Anyone using the launchpad is responsible for their own decisions.
