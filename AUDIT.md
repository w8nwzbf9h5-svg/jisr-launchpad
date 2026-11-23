# Jisr: package for a security review

This file is for an outside reviewer. It says what to review, what the code promises, who can do
what, what was already checked and how, and what is known to be weak. It is written by the builders.
**It is not an audit, and no independent audit has been done yet.**

The plain-language description of the product is in [WHITEPAPER.md](WHITEPAPER.md).

## 1. What to review

| Part | File | Lines | What it does |
|---|---|---|---|
| EVM | `contracts/CoinMarket.sol` | 396 | Sells a coin and buys it back. Holds the coin's reserve. The core. |
| EVM | `contracts/LaunchpadFactory.sol` | 103 | Launches coins from two fixed templates. Holds the platform wallet setting. |
| EVM | `contracts/Coin.sol` | 40 | Fixed-supply ERC-20 with a 2.5% wallet limit. |
| EVM | `contracts/periphery/BridgeSeller.sol` | 151 | Optional helper: sell a coin and send the USDC to another network with Circle CCTP V2. |
| Solana | `solana/crates/jisr-math/src/lib.rs` | about 270 without tests | Pricing, fees and reserve accounting. No dependencies. |
| Solana | `solana/programs/jisr/src/lib.rs` | about 530 | The program: accounts, checks and token transfers around the math. |

Out of scope: `contracts/mocks/*` (test stand-ins), the web pages under `web/` (they hold no keys and
no funds; a reviewer may still want to look at how they build transactions: `web/app.js`,
`web/wallet.js`, `web/solana/jisr-solana.js`).

Versions: Solidity 0.8.26, OpenZeppelin Contracts 5.1 (`Initializable`, `ReentrancyGuard`,
`SafeERC20`, `Math`, `Clones`, `Ownable2Step`, `ERC20Upgradeable`), Anchor 0.31.1 with the
`init-if-needed` feature, SPL Token (the original token program only).

## 2. The model in one page

Every coin has a supply of 1,000,000,000 and is created together with its own market. The market
holds the whole supply and the whole reserve. The reserve is one token, set when the launchpad is
deployed: normally a dollar stablecoin.

- The first 800M coins are sold at one fixed price (`salePrice`). On the standard setup this is
  $0.0001 a coin, a $100,000 market cap.
- The last 200M are sold above the floor on a curve. With `s` curve coins outstanding the market
  holds a premium of `salePrice * s^2 / (200M - s)`. The curve stops at 190M.
- Every coin that leaves the market puts one floor price into `floorReserve`. A coin sold back takes
  one floor price out. So the floor reserve can always buy back every outstanding coin at the floor price.
- Every trade pays a 5% fee: 1% to the coin's creator, 2% to the launchpad's platform wallet, 2% stays
  in the floor reserve.
- "Graduation" is the moment the 800M sell out. From then on the floor price is raised to
  `floorReserve / max(outstanding, 800M)` whenever that is higher. It is never lowered.
- One wallet may hold at most 2.5% of supply (25M coins).

Reference case used in every test suite: $1,000 buys 9,500,000 coins; selling them returns $902.50.

## 3. Who can do what

| Who | EVM | Solana |
|---|---|---|
| Factory owner / program admin | Change the platform wallet. Hand the role on (two steps). **Nothing else.** | Same. |
| Platform wallet | Receives the 2% fee when anyone calls `sweepPlatformFees`. | Same (`sweep_platform_fees`). |
| Coin creator | Receives the 1% fee when anyone calls `claimCreatorFees`. Gets no coins and no rights. | Same. |
| Anyone | Launch a coin, buy, sell, trigger fee payouts, call `reinforce`. | Same. |
| Nobody | Withdraw a reserve, pause, upgrade, mint, freeze, blacklist, change fees or prices. | Same, **provided the program's upgrade authority has been removed**. |

Things a reviewer should try to break:

- EVM markets and coins are EIP-1167 clones of templates deployed by the factory's constructor. The
  templates call `_disableInitializers()`. Clones are initialized in the transaction that creates them.
- On Solana each market is a program-derived address. Its two token accounts are its associated token
  accounts. The coin's mint authority is removed inside `create_coin`; there is never a freeze authority.
- On Solana, "nobody can change the rules" holds only after the upgrade authority is removed. The
  deployment script does that as its last step and checks it (section 6, S2).

## 4. What must always be true

| # | Statement | Where it is tested |
|---|---|---|
| I1 | The market's reserve-token balance is at least `floorReserve + premiumReserve + creatorFees + platformFees`. | `test/market.test.js` "stays fully covered through random trading"; `jisr-math` `stays_covered_through_random_trading_and_everyone_can_exit`; `solana/client-test/run.js` step 6 |
| I2 | `floorReserve >= ceil(outstanding * floorPrice)`: every outstanding coin can be sold back at the floor price. | same tests |
| I3 | `floorPrice` never decreases. | same tests |
| I4 | After any sequence of trades every holder can sell everything, and those sales succeed. | "lets every holder exit at the end" (EVM, math, Solana integration) |
| I5 | A group of wallets trading among themselves cannot end with more reserve tokens than they started with. | "an attacker with 12 wallets cannot extract value" during the sale and after graduation; `jisr-math` `an_attacker_with_many_wallets_cannot_extract_value` |
| I6 | Reserve tokens leave a market only to a seller (by formula), to the creator (the 1%), to the platform wallet (the 2%). | "exposes no function that could move or freeze the reserve"; "pays fees only to the creator and to the platform wallet"; Solana `full_lifecycle_of_a_coin` |
| I7 | Coin supply is fixed at creation and cannot grow. | launch tests on both sides |
| I8 | All rounding favours the reserve: buys round up, sells round down. | random-trading tests compare against exact expectations |
| I9 | The same inputs give the same numbers on EVM, in `jisr-math`, and in the page's JavaScript. | `solana/client-test/run.js` compares the program's state with the page's math after each of 40 random trades; the EVM browser tests compare the page's quote with the contract |

Numeric ranges. EVM: prices are reserve base units per whole coin scaled by 1e18; all products go
through OpenZeppelin `Math.mulDiv`. Solana: amounts are `u64`, prices `u128`, intermediate products
`u128` with checked arithmetic; `extreme_sizes_do_not_overflow` covers the corners.

## 5. What the system depends on

- **The reserve token.** It must be a plain token: no fee on transfer, no rebasing, no holder
  restrictions. A fee-on-transfer token makes buys revert (`ShortPayment`). The issuer of a
  stablecoin such as USDC or USDT can freeze an address; if it froze a market, that market's funds
  would be stuck. Nothing in the code can prevent that.
- **The swap router (EVM, optional).** A Uniswap V2 style router used only by `buyWithNative` and
  `sellForNative`. The market trusts it to deliver the stablecoin it was asked for; the amount
  received is measured and a short delivery reverts. Deadlines on the native paths are enforced by
  the router, not by the market.
- **Circle CCTP V2 (BridgeSeller only).** The helper hands USDC to Circle's `TokenMessengerV2`.
  Delivery on the other network depends on Circle. The markets do not depend on the helper.
- **Solana token program.** Only the original SPL Token program is supported. Token-2022 stablecoins
  cannot be used as the reserve.

## 6. Findings of the builders' own review

### Fixed

**S1. A token account created in advance could block every future launch (Solana). Fixed.**
`create_coin` created the market's stablecoin account with Anchor's plain `init`. The address of that
account is known before the coin exists (coin numbers are sequential), and on Solana anyone may
create an associated token account for any owner. A stranger could create the account for the next
coin number, `create_coin` would then fail for that number, and because numbers never skip, no coin
could be launched again. Cost to the attacker: about 0.002 SOL. No funds were at risk; the
launchpad would have stopped accepting new coins for good.
Confirmed: with the earlier rule, the new test fails inside the associated-token program with
"Provided owner is not allowed".
Fix: the account is now accepted if it already exists (`init_if_needed`); its mint, owner and address
are still checked, so it can only be the market's own account. Anything it already holds can only
become floor reserve through `reinforce`.
Tests: Rust `a_vault_made_in_advance_cannot_block_a_launch`; client test step 7.
The devnet deployment (`7cu1YmBA3D1asv1fUijaoZ5FqodZrW9JhbWdPCXGGSkU`) is the earlier build. It was
deployed as final and still has this fault. It holds test money only.

### Handled by procedure, not by code

**S2. The Solana program's one-time setup can be sent by anyone (first come).**
`initialize` records the stablecoin, the platform wallet and the admin, and has no access check.
Whoever sends it first decides those settings. A deployment is many transactions, so `initialize`
cannot be in the same transaction as the deployment.
Handling: `scripts/solana-deploy.sh` deploys the program still changeable, sends `initialize`,
reads the settings back and compares every field, and only then removes the upgrade authority. If the
settings are not ours the program is closed and its SOL returns to the deployer. A stranger can make a
deployment fail (cost to us: transaction fees) but cannot get wrong settings made permanent.
The script is rehearsed against a local node on every change (`solana/client-test/rehearsal.js`).
A reviewer may prefer a check in the program itself (only the upgrade authority may call
`initialize`). We would welcome that recommendation.

### Known limits of the design

**L1. The 2.5% wallet limit is a speed bump, not a wall.** One person can use many wallets. On EVM
the limit applies to every transfer, so a contract that needs to hold more than 25M coins (a DEX
pool, an exchange wallet) cannot. On Solana SPL tokens cannot restrict transfers, so the limit is
checked only when buying, on the buyer's associated token account.

**L2. Coins on Solana carry no Metaplex metadata.** The name, ticker and details are stored in the
market account, and the Jisr page shows them. Wallets and explorers that read Metaplex metadata will
show an unnamed token. Adding it means a change to `create_coin` and a hosted metadata file per coin.
Recommended before a real-network launch; not done.

**L3. Coin details are written by the creator and checked by nobody.** The pages show them as text
(never as markup), force `https` on links and pictures, and label them as unverified. A picture
link lets the picture's host see that someone opened the coin's page.

**L4. Launching is cheap and unlimited.** Anyone can launch any number of coins with any name,
including names that imitate other coins. The pages list the newest 60.

**L5. On the curve, a trader can be front-run.** Above the floor the price moves with each trade.
The buyer's `maxStableIn` and the seller's `minStableOut` bound the damage; the pages set them 1%
from the quote. The 5% fee each way makes a sandwich unprofitable unless the price moves more than
about 10%.

**L6. Two launches in the same moment on Solana.** Coin numbers are sequential, so two `create_coin`
transactions that read the same number cannot both succeed. The second fails and has to be sent again.

**L7. BridgeSeller trusts its caller's bridge parameters.** `maxFee`, the destination and the
recipient come from the seller. A wrong recipient on the other network cannot be undone.

### Not yet exercised

- The cross-network sale has run only against test stand-ins of Circle's contracts, not against
  Circle's live test bridge.
- Nothing has run on a real network.
- The "take the program down" branch of the Solana deployment script (taken when `initialize` was
  sent by a stranger) has not been run end to end. If it fails, the program is still changeable by the
  deployer key and can be closed by hand.

## 7. Tests and how to run them

| Suite | Count | Command |
|---|---|---|
| EVM contracts (Hardhat) | 44 | `npm test` |
| EVM pages in a real browser against a local chain | 24 steps | `npm run e2e` |
| Solana pricing (`jisr-math`) | 7 | `cd solana && cargo test -p jisr-math` |
| Solana program, in-process | 3 | `cd solana && cargo test -p jisr --release` |
| Solana program through the page's client file, local node | 7 steps | `.github/workflows/solana.yml` |
| Solana page in a real browser, local node | 9 steps | same workflow |
| Solana real-network deployment rehearsal, local node | 5 steps | same workflow |

The Solana program is built and tested in GitHub Actions (`.github/workflows/solana.yml`); the built
program is attached to each run.

## 8. Where it runs today (test money only)

| Network | Address |
|---|---|
| Sepolia (Ethereum test network) | factory `0x5E603f7Fc12D8C2744c9117a43f5021c7dEb5647` |
| Solana devnet | program `7cu1YmBA3D1asv1fUijaoZ5FqodZrW9JhbWdPCXGGSkU` (final; earlier build, see S1) |

## 9. Questions we would like a reviewer to answer

1. Can any sequence of buys, sells, fee payouts and `reinforce` calls break I1 or I2, on either side?
2. Is the floor-raising rule (`floorReserve / max(outstanding, 800M)`) safe against manipulation by
   someone who buys, donates through `reinforce`, and sells?
3. Is the rounding consistent enough that no dust can be extracted by repeating tiny trades?
4. EVM: is the native-currency path safe with a hostile or broken router? With a reserve token that
   has callbacks?
5. Solana: are the account checks in every instruction complete? Is `init_if_needed` on the vault
   safe as used? Should `initialize` be restricted in the program (S2)?
6. BridgeSeller: can coins or USDC be left in it, taken from it, or can it be used to block a seller?
