#!/bin/bash

set -e

echo "Building blobs example..."

if [ ! -d node_modules ]; then
  pnpm install --no-frozen-lockfile
fi

pnpm build

echo "✅ Build complete: build/contract.wasm"

