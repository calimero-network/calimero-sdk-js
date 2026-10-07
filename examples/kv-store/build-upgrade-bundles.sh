#!/bin/bash

# Builds the two dev-signed bundles workflows/upgrade-to-handlers.yml upgrades between:
# v1 is the example with its @Handler() methods stripped, v2 is the example as written.
# Needs `cargo mero` on PATH.

set -euo pipefail
cd "$(dirname "$0")"

OUT=build/upgrade
rm -rf "$OUT"
mkdir -p "$OUT/src-v1"

sed -e '/^  @Handler()$/d' \
    -e '/^  emitWithHandler,$/d' \
    -e 's/^  Handler,$/  emit,/' \
    -e "s/emitWithHandler(\(new [A-Za-z]*([^)]*)\), '[A-Za-z]*')/emit(\1)/" \
    src/index.ts > "$OUT/src-v1/index.ts"

cat > "$OUT/src-v1/tsconfig.json" <<'JSON'
{ "extends": "../../../tsconfig.json", "compilerOptions": { "rootDir": ".", "outDir": "." }, "include": ["."], "exclude": [] }
JSON

pnpm exec calimero-sdk build "$OUT/src-v1/index.ts" -o "$OUT/v1/service.wasm"
pnpm exec calimero-sdk build src/index.ts -o "$OUT/v2/service.wasm"

node ../../scripts/check-abi-section.js "$OUT/v1/service.wasm"
node ../../scripts/check-abi-section.js "$OUT/v2/service.wasm" clearHandler insertHandler removeHandler updateHandler

for v in 1 2; do
  node ../../scripts/make-bundle.js "$OUT/v$v/service.wasm" "$OUT/kv-store-v$v.mpk" \
    "$v.0.0" com.calimero.js-kv-store "JS KV Store"
done
