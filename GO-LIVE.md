# Going live: the checklist

What has to happen, in order, before Landing Pad handles real money, and how each deployment is done.
The technical package for the security review is [AUDIT.md](AUDIT.md).

## Where things stand

| Item | State |
|---|---|
| EVM contracts | Built. 47 contract tests and 25 browser tests pass. Live on Sepolia (test network), current build: fees are paid out with every trade. |
| Solana program | Built. Tested in GitHub Actions on every change. Live on devnet (test network), current build, deployed as final. |
| Cross-network sale (Circle CCTP) | Built and tested against stand-ins. Not yet run on Circle's live test bridge. |
| Real-network deployment, EVM | Done from the deploy page with your own wallet. Ready. |
| Real-network deployment, Solana | A job you start by hand. The same script is rehearsed on a local node on every change. Ready. |
| Independent security audit | **Not done.** |
| Anything on a real network | **Nothing yet.** |

## 1. Before real money

1. **Finish the tests on the test networks.**
   - Sepolia, from MetaMask: take test dollars, launch a coin, buy, sell.
   - Cross-network sale on Circle's test bridge (needs a launchpad on a test network whose currency is test USDC).
2. **Independent security audit.** Send the reviewer this repository and point them at `AUDIT.md`.
   The contracts hold other people's money, and the Solana program cannot be changed after
   deployment, so a fault found later cannot be fixed in place.
3. **Fix what the audit finds**, run every test again, and deploy the fixed build to the test networks.
4. **Decide before deploying** (these cannot be changed afterwards, except the platform wallet):

   | Decision | Notes |
   |---|---|
   | Which networks first | Each network is its own launchpad with its own coins. |
   | Reserve currency on each network | USDC where the network has native USDC (needed for the cross-network sale). It is fixed for good on each launchpad. |
   | Platform wallet | Receives the 2% fee. It can be changed later by the admin. |
   | Admin wallet | The only power is changing the platform wallet. Keep it safe: whoever holds it can redirect future fees. |
   | Your own RPC provider | The public endpoints are rate-limited. The pages need one address per network. |
   | Address of the metadata service (Solana) | Wallets get a coin's picture through it. It is written into each coin at launch and can never be changed, so choose an address you will keep, ideally on your own domain, **before** any real coin is launched. See `metadata-service/README.md`. |

## 2. Deploying on an EVM network (Ethereum, Base, Arbitrum, BNB Chain and others)

You do this yourself from the deploy page, with your wallet. No key leaves your wallet.

1. Open `admin.html` in MetaMask's browser and connect.
2. Switch MetaMask to the network. The wallet needs that network's coin for fees.
3. In section 3 enter the reserve currency's address (native USDC for each network is listed in
   `web/config.js`; confirm it against the issuer's own site), your platform wallet, and the owner
   wallet. Leave the swap router empty unless you want people to pay with ETH or BNB. Press the
   check button: the page reads the token and shows what it found before anything is deployed.
4. Confirm the transactions. The page shows the new launchpad's address and a short text to paste.
5. Send that text to be put in `web/deployments.js`, together with the RPC address for that network.
   The site then shows the network.
6. For the cross-network sale, deploy the bridge helper from section 6 of the same page (USDC launchpads only).
7. Publish the contracts' source on the network's explorer, so anyone can read what is deployed.

The detailed Arabic walk-through is in [DEPLOY-AR.md](DEPLOY-AR.md).

## 3. Deploying on Solana

The program is deployed by a job in this repository that you start by hand. It needs a wallet key,
so it uses a **new wallet made only for this**, which is emptied afterwards.

**Cost:** about 5.2 SOL in the deployer wallet. About 2.5 SOL stays with the program for good. The rest comes back.

1. In Phantom, create a new wallet. Send it 5.2 SOL. Use it for nothing else.
2. In Phantom: Settings, Manage Accounts, that wallet, **Show Private Key**. Copy it.
3. On GitHub, in this repository: Settings, Secrets and variables, Actions, **New repository secret**.
   Name: `SOLANA_MAINNET_DEPLOYER`. Value: the private key. Save.
   Optional second secret `SOLANA_MAINNET_RPC`: the address of your RPC provider.
4. Actions tab, **Deploy Solana program to MAINNET (real money)**, Run workflow. Fill in:
   - the confirmation sentence `deploy to mainnet`;
   - your admin wallet (your main Phantom wallet);
   - your platform wallet;
   - the stablecoin (USDC is filled in).
5. The job builds the program for a new address, runs its tests, deploys it, starts it with your
   settings, names your admin wallet, and removes the upgrade authority. If anything does not read
   back exactly as asked, it takes the program down and returns the SOL. The run's summary shows the
   program's address.
6. Set up the metadata service (`metadata-service/README.md`) with the program's address, and put its
   address in `web/solana/config.js` as `mainnet.metadataBase`. Do this before the page is switched on:
   a coin launched without it has no picture in wallets, for good.
7. Put the program's address in `web/solana/config.js` (`mainnet.programId`) and the RPC address in `mainnet.rpcUrl`.
8. Open the Solana page with your admin wallet. The **Launchpad admin** card offers **Accept the admin role**. Accept.
9. Send what is left in the deployer wallet back to yourself, and delete the secret
   `SOLANA_MAINNET_DEPLOYER` on GitHub. After step 8 that key has no power over anything.

What the job cannot protect against: a private key pasted into GitHub is visible to anyone who can
administer this repository. That is why the wallet must be new, hold only the deployment money, and
be emptied in step 9.

## 4. After going live

- Fees are paid out automatically as coins trade: the creator's 1% to the creator, the launchpad's 2% to
  the platform wallet. On EVM every trade does it in the contract. On Solana every trade made on the
  page carries the payouts. A fee waits in the coin's market only when its wallet could not receive it;
  then anyone can press Pay, and the money goes only to the creator and to the platform wallet.
- On EVM this adds about 33,000 gas to each trade (roughly 30%). That is negligible on Base, Arbitrum
  and BNB Chain, and noticeable on Ethereum itself.
- The admin card on the Solana page, and the owner functions of the EVM factory, change the platform wallet.
- Nothing else can be changed. There is no pause and no emergency withdrawal. If a fault is found in a
  deployed launchpad, the only remedy is to stop listing it on the site, tell holders to sell back at
  the floor, and deploy a corrected launchpad.
