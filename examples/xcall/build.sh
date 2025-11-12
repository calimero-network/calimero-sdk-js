#!/bin/bash

set -e

echo "Building xcall example..."

if [ ! -d node_modules ]; then
  pnpm install --no-frozen-lockfile
fi

pnpm build

echo "✅ Build complete: build/service.wasm"

