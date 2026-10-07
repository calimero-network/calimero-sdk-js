#!/bin/bash

# Wraps every built example wasm in a dev-signed bundle beside it (build/<name>.mpk),
# the form the example workflows install. Needs `cargo mero` on PATH.

set -euo pipefail
cd "$(dirname "$0")/.."

for wasm in examples/*/build/*.wasm; do
  example=$(basename "$(dirname "$(dirname "$wasm")")")
  node scripts/make-bundle.js "$wasm" "${wasm%.wasm}.mpk" 1.0.0 "com.calimero.js-$example" "$example"
done
