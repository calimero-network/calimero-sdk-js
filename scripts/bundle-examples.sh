#!/bin/bash

# Wraps every built example in a dev-signed bundle next to its wasm (build/service.mpk),
# the form the example workflows install. Needs `cargo mero` on PATH.

set -euo pipefail
cd "$(dirname "$0")/.."

for wasm in examples/*/build/service.wasm; do
  example=$(basename "$(dirname "$(dirname "$wasm")")")
  node scripts/make-bundle.js "$wasm" "${wasm%.wasm}.mpk" 1.0.0 "com.calimero.js-$example" "$example"
done
