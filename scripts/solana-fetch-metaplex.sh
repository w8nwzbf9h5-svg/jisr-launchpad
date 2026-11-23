#!/usr/bin/env bash
# Fetches the Metaplex Token Metadata program, as deployed on Solana, for the tests.
# The Jisr program calls it when a coin is launched, so the tests run against the real thing:
# the in-process Rust tests load it from tests/fixtures/, and the local test node is started with it.
# The file is not kept in this repository; it is the program anyone can read from the network.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../solana/programs/jisr/tests/fixtures/mpl_token_metadata.so"
id="metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
mkdir -p "$(dirname "$out")"
if [ -s "$out" ]; then echo "Metaplex program already here: $(wc -c < "$out") bytes"; exit 0; fi
for url in https://api.mainnet-beta.solana.com https://api.devnet.solana.com; do
  for attempt in 1 2 3; do
    if solana program dump -u "$url" "$id" "$out" && [ -s "$out" ]; then
      echo "Fetched the Metaplex program from $url: $(wc -c < "$out") bytes"
      exit 0
    fi
    rm -f "$out"
    sleep 5
  done
done
echo "Could not fetch the Metaplex program from the network." >&2
exit 1
