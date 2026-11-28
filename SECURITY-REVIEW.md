# Landing Pad: internal security review, November 2026

> **This is an internal review, not an independent audit.** It was done by the project's own side,
> with free tools and a line-by-line read of the code. It does not replace a review by an outside
> security firm, and nobody should treat it as one. [AUDIT.md](AUDIT.md) is the package prepared for
> that outside review.

| | |
|---|---|
| Date | 28 November 2026 |
| Commit reviewed | `eae20c0` (branch `main`) |
| Fixes | branch `security-review-2026-11` |
| Code in scope | about 1,200 lines (comments, blank lines and tests not counted) |

## 1. Scope

| Part | File | Code lines |
|---|---|---|
| EVM | `contracts/CoinMarket.sol` | 324 |
| EVM | `contracts/periphery/BridgeSeller.sol` | 108 |
| EVM | `contracts/LaunchpadFactory.sol` | 64 |
| EVM | `contracts/Coin.sol` | 27 |
| Solana | `solana/programs/jisr/src/lib.rs` | 488 |
| Solana | `solana/crates/jisr-math/src/lib.rs` (without its tests) | 191 |

Out of scope: the web pages, the metadata service, test stand-ins under `contracts/mocks/`, and the
deployment scripts (read only where a finding depends on them).

## 2. Method

1. **Automated tools, all free:**
   - Slither 0.11.6 on the Solidity contracts (dependencies and mocks excluded).
   - `cargo clippy` on the Solana program and the math crate.
   - `cargo audit` on the Solana dependency tree (728 crates), and `npm audit` on the EVM tooling.
2. **Manual review** of every in-scope line, against the promises in [AUDIT.md](AUDIT.md) §4 (I1 to I11)
   and the questions in §9: reserve coverage, rounding, the floor-raising rule, fee payouts,
   reentrancy, account validation on Solana, PDA and associated-account pre-creation, upgrade and
   admin powers.
3. **Tests:** the existing suites were run, and a test was added for each fix.

Not done here: Sec3's X-ray scanner for Solana could not be run in this environment. It is free and
open source and is designed to run in GitHub Actions; adding it to `.github/workflows/solana.yml` is
recommended (R3).

### How the checks were done, in plain words

**Step 1: scanners.** The tools read the code and flag known dangerous patterns, such as a contract
that can be re-entered in the middle of a payment, an address that is never checked, or a library with
a published flaw. Every warning was then read by hand and either fixed or explained in section 4.

**Step 2: trying to break each promise.** The launchpad makes a few promises to its users. Each one was
turned into a question, and the code was read line by line looking for a way to make the answer "yes":

| Promise | Question asked | Result |
|---|---|---|
| The reserve can always buy back every coin at the floor price | Can any series of buys, sells, fee payouts or gifts leave the reserve short? | No: every trade's bookkeeping balances, and every rounding goes the reserve's way |
| The floor price never falls and cannot be gamed | Can someone buy, gift money to the reserve to lift the floor, then sell at a profit? | No: the most they can win back is what they gave, before the 5% fee on the sale |
| Small traders cannot be drained | Can thousands of tiny trades pull out rounding dust? | No: each tiny trade leaves a little extra in the reserve |
| Nobody controls the money | Can the admin, the creator, or anyone else move reserve money or change prices? | No: the admin can only change the wallet that receives the 2% platform fee |
| Launches cannot be blocked | Can someone prepare accounts in advance to stop the next coin from launching? | No: every such account is checked or accepted safely (see AUDIT.md, S1) |
| Every Solana account is the right one | Can a trade be sent with a fake vault, a fake market or someone else's account? | No: every account is tied to the market by its address, its owner or its token |

**Step 3: tests.** All existing test suites were run. For every fix, a new test was written that fails
without the fix and passes with it.

## 3. Summary

**No critical or high-severity issue was found.** No path was found that lets anyone take reserve
money, break the floor coverage (I1, I2), lower the floor price (I3), or stop holders from selling (I4).
The checks that matter for a launchpad are in place on both chains: no admin power over reserves, no
mint after launch, no freeze authority, rounding in favour of the reserve, reentrancy guards on every
EVM entry point, and full account checks on every Solana instruction.

| ID | Severity | Title | Status |
|---|---|---|---|
| M-1 | Medium | Solana `initialize` can be sent by anyone, first come | Handled by the deploy script; on-chain check recommended for the main-network build |
| L-1 | Low | BridgeSeller: USDC sent to it directly stays there for good | **Fixed** |
| L-2 | Low | Solana `set_platform_wallet` accepts the empty address | **Fixed** |
| L-3 | Low | EVM: a trader can delay a fee payout by sending a trade with little gas | Accepted (no money lost) |
| L-4 | Low | A coin's creator fee wallet can never change | Accepted (design) |
| I-1 | Info | Slither reentrancy warnings on `CoinMarket` | False positives |
| I-2 | Info | Dependency advisories | Not reachable on-chain |
| I-3 | Info | A test that did not check what it claimed | **Fixed** |
| I-4 | Info | Out-of-date comment on Solana `initialize` | **Fixed** |
| I-5 | Info | Solana `buy` and `sell` take no deadline | Accepted |

## 4. Findings

### M-1. Solana `initialize` can be sent by anyone, first come

`initialize` records the stablecoin, the platform wallet and the admin, and it has no access check.
Whoever sends it first after deployment decides those settings. This is AUDIT.md item S2.

Impact: a stranger who wins the race could set their own platform wallet and admin. Reserves are
not at risk either way; the 2% launchpad fee and the admin role are.

Current handling: `scripts/solana-deploy.sh` deploys the program still upgradeable, sends
`initialize`, reads every setting back, and only then removes the upgrade authority; if the settings
are not ours it closes the program. The devnet program `5cbX2QdxMq948ySWxF6yHruKFtpp5Kf8WGA1wb3BaKC8`
was set up this way and is final.

Recommendation (R1), before the main-network deployment: require the signer of `initialize` to be the
program's upgrade authority, by passing the program and its `ProgramData` account and checking
`program_data.upgrade_authority_address == Some(admin.key())`. This was not changed in this review,
because the in-process test harness and the local page set-up both call `initialize` without an
upgradeable deployment and would need to change with it.

### L-1. BridgeSeller: USDC sent to it directly stays there for good — Fixed

`BridgeSeller` hands the bridge exactly what each sale paid, and it had a `flush` for stray *coins*,
but nothing for stray *USDC*. USDC sent to it by mistake could never leave. Nobody could take it, but
it was lost.

Fix: new `flushStable(coin)`. Anyone may call it; it moves any USDC held by the helper into that coin's
market and calls `reinforce`, so it can only enlarge that coin's floor reserve. Nobody is paid.
Test: "anyone can move USDC sent to it straight into the coin's floor reserve, and nobody is paid for it".

### L-2. Solana `set_platform_wallet` accepts the empty address — Fixed

The admin could set the platform wallet to `11111111111111111111111111111111`, which can own no
token account; every market's 2% fee would wait until it was changed back. The EVM factory already
refuses the zero address.

Fix: `set_platform_wallet` now refuses the empty address with the new error `EmptyAddress`, added
last so existing error codes keep their numbers. Test: added to `full_lifecycle_of_a_coin`.

### L-3. EVM: a trader can delay a fee payout by sending a trade with little gas

`_payFees` gives each payout at most 200,000 gas. Under EIP-150 a call receives at most 63/64 of
the gas left, so a trader who sends just enough gas can make the payout run out of gas while the trade
itself completes. The fee is then kept in `creatorFees` / `platformFees` and is paid by the next trade
or by `claimCreatorFees` / `sweepPlatformFees`, which anyone may call. No money is lost and the trader
gains nothing. Accepted.

### L-4. A coin's creator fee wallet can never change

The creator is fixed at launch on both chains. If that wallet is later blocked by the stablecoin's
issuer, or its key is lost, or (on EVM) it is a contract that cannot receive the token, the 1% fees of
that coin stay in its market for good. They stay counted as owed, so they never reach the floor
reserve either. This is the price of having no admin over markets. Accepted; worth stating on the
launch page.

### I-1. Slither reentrancy warnings on `CoinMarket` — false positives

Slither reports `reentrancy-eth`, `reentrancy-no-eth`, `reentrancy-balance` and `reentrancy-benign`
on `buyWithNative`, `sellForNative` and `_payFees`. Every external entry point of `CoinMarket` is
`nonReentrant`; the router is fixed at deployment and trusted for delivery, and the amount it delivers
is measured. No cross-function reentrancy path exists. The `incorrect-equality` and
`missing-zero-check` reports were checked and are not issues (for example the creator is always
`msg.sender` of `createCoin`).

### I-2. Dependency advisories — not reachable on-chain

- `cargo audit` lists advisories in `curve25519-dalek` 3.2, `ed25519-dalek` 1.0, `libsecp256k1`,
  `rand` and `bincode`, which reach the program through `anchor-lang` / `solana-program` 0.31, and
  several more (`rustls`, `rustls-webpki` and others) that come only from the test tools. None of them
  is reachable inside the deployed program: it holds no secrets and makes no network connections.
  Updating will come with the next Anchor release.
- `npm audit` findings are all in development tools (Hardhat, Puppeteer); none ships in a contract.
  OpenZeppelin Contracts 5.1.0 has no open advisory affecting the parts used.

### I-3. A test that did not check what it claimed — Fixed

In `test/bridge.test.js` the line `await expect(c.seller.flush(c.usdc.target), "UnknownCoin")` asserted
nothing. It now uses the file's `reverts` helper, so it fails if the call does not revert.

### I-4. Out-of-date comment on Solana `initialize` — Fixed

The comment said to send `initialize` in the same transaction as the deployment, which is not
possible. It now describes what the deployment script actually does.

### I-5. Solana `buy` and `sell` take no deadline

On EVM, trades carry a deadline. On Solana a transaction expires with its blockhash (about a minute),
and `max_stable_in` / `min_stable_out` bound the price. Accepted.

## 5. Checked and found sound

- **Reserve coverage (I1, I2).** Buy and sell bookkeeping balance exactly; every rounding goes the
  reserve's way (buys round up, sells round down, curve premium ceil on the way in and floor on the way
  out, capped by `premiumReserve`).
- **Floor-raising rule (Q2).** A donation through `reinforce` lifts the floor by at most
  `donation / max(outstanding, 800M)` per coin, so the donor can win back at most what was donated,
  before paying 5% on the sale. Not profitable.
- **Dust (Q3).** The smallest buy costs at least 2 base units of stablecoin; the smallest sell can pay 0.
  Repeating tiny trades only adds to the reserve.
- **Solana accounts (Q5).** Every account is tied by seeds, `has_one`, mint/authority or associated-
  address constraints. A seller naming the market's own vault as recipient only gifts the reserve.
  Pre-funding the coin, market or metadata addresses with lamports cannot block a launch (Anchor's
  `init` and Metaplex both handle it), and the stablecoin vault accepts a pre-created account (S1).
- **No admin over money.** The EVM factory owner and the Solana admin can only change the platform
  wallet and hand on the role.

## 6. Recommendations

- **R1.** Restrict Solana `initialize` to the upgrade authority before the main-network deployment (M-1).
- **R2.** Keep an outside audit as the goal before real money is used. AUDIT.md is ready for it.
- **R3.** Add Sec3 X-ray (free, open source) to the Solana workflow so every change is scanned.
- **R4.** During the public test, invite testers to report bugs on the test networks, with public credit.

## 7. Test results

| Suite | Result |
|---|---|
| EVM contracts (Hardhat) | 48 passing (47 before, plus the new `flushStable` test) |
| Solana math (`jisr-math`) | 7 passing |
| Solana program, in-process, client, page and deployment rehearsal | all passing in GitHub Actions on the fixes branch ([run](https://github.com/w8nwzbf9h5-svg/jisr-launchpad/actions/runs/46131884335)) |

The fixes are on branch `security-review-2026-11` and are not deployed. The test-network contracts
keep running the reviewed code; the fixes go out with the next deployment.
