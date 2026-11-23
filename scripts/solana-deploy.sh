#!/usr/bin/env bash
# Deploys the Jisr program to a Solana network, starts it, and makes it final.
# Used by .github/workflows/solana-mainnet.yml for the real network, and rehearsed against a local
# node on every change by .github/workflows/solana.yml, so these exact commands are tested.
#
# Needs in the environment:
#   RPC_URL          the network
#   DEPLOYER_KEY     key file that pays for the deployment
#   PROGRAM_KEY      key file of the program's address (the program must have been built for it)
#   PROGRAM_SO       the built program
#   STABLE_MINT      the stablecoin every coin is priced and reserved in
#   PLATFORM_WALLET  receives the launchpad's 2% fee
#   ADMIN_WALLET     becomes the admin once it accepts on the Solana page
# Optional:
#   PRIORITY         extra fee, in micro-lamports per compute unit, to get through a busy network
#
# Order matters:
#   1. deploy, still changeable;
#   2. start the program and read its settings back (scripts/solana-start.js);
#   3. only if the settings are ours: remove the upgrade authority, so nobody can ever change the program.
# The program's one-time setup can be sent by anyone. If somebody else sends it first, step 2 fails,
# the program is taken down, its SOL comes back to the deployer, and nothing was made final.
set -euo pipefail
: "${RPC_URL:?}" "${DEPLOYER_KEY:?}" "${PROGRAM_KEY:?}" "${PROGRAM_SO:?}" "${STABLE_MINT:?}" "${PLATFORM_WALLET:?}" "${ADMIN_WALLET:?}"
here="$(cd "$(dirname "$0")" && pwd)"
PROGRAM_ID="$(solana address -k "$PROGRAM_KEY")"
DEPLOYER="$(solana address -k "$DEPLOYER_KEY")"
echo "Deploying $PROGRAM_ID from $DEPLOYER"

fee=()
if [ -n "${PRIORITY:-}" ] && [ "${PRIORITY}" != "0" ]; then fee=(--with-compute-unit-price "$PRIORITY"); fi

echo "--- 1. deploy (still changeable)"
solana program deploy "$PROGRAM_SO" --program-id "$PROGRAM_KEY" -k "$DEPLOYER_KEY" -u "$RPC_URL" --max-sign-attempts 60 "${fee[@]}"

echo "--- 2. start the program and check its settings"
if ! RPC_URL="$RPC_URL" PROGRAM_ID="$PROGRAM_ID" PRIORITY="${PRIORITY:-0}" node "$here/solana-start.js" "$DEPLOYER_KEY" "$STABLE_MINT" "$PLATFORM_WALLET" "$ADMIN_WALLET"; then
  echo "The program could not be started with our settings. Taking it down; its SOL returns to $DEPLOYER."
  solana program close "$PROGRAM_ID" -k "$DEPLOYER_KEY" -u "$RPC_URL" --bypass-warning || echo "Closing failed. The program is still changeable by $DEPLOYER; close it by hand to recover its SOL."
  exit 1
fi

echo "--- 3. make the program final"
solana program set-upgrade-authority "$PROGRAM_ID" --final -k "$DEPLOYER_KEY" -u "$RPC_URL"
solana program show "$PROGRAM_ID" -u "$RPC_URL" -k "$DEPLOYER_KEY" | tee /tmp/jisr-program-show.txt
if ! grep -qi "Authority: none" /tmp/jisr-program-show.txt; then
  echo "The program still has an upgrade authority. It is NOT final."
  exit 1
fi
echo "JISR_PROGRAM_ID=$PROGRAM_ID"
