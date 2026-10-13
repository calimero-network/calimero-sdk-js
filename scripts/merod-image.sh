#!/bin/bash

# Builds the node image the example workflows run on and prints its tag: merod:edge
# fetching bundles from peers, since a dev-signed bundle is in no registry.

set -euo pipefail

base=ghcr.io/calimero-network/merod:edge
tag=merod:edge-dht

docker pull -q "$base" >/dev/null
printf 'FROM %s\nENV CALIMERO_REGISTRY_MODE=dht\n' "$base" | docker build -q -t "$tag" - >/dev/null
echo "$tag"
