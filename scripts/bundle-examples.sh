#!/bin/bash

# Wraps every built example wasm in a dev-signed bundle beside it (build/<name>.mpk),
# the form the example workflows install. Needs `cargo mero` on PATH.

set -euo pipefail
shopt -s nullglob
cd "$(dirname "$0")/.."

wasms=(examples/*/build/*.wasm)
if [ ${#wasms[@]} -eq 0 ]; then
  echo "No examples/*/build/*.wasm found; build the examples first." >&2
  exit 1
fi

for wasm in "${wasms[@]}"; do
  example=$(basename "$(dirname "$(dirname "$wasm")")")
  node scripts/make-bundle.js "$wasm" "${wasm%.wasm}.mpk" 1.0.0 "com.calimero.js-$example" "$example"
done
