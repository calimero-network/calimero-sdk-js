#!/bin/bash

# Build script for kv-store-with-user-and-frozen-storage example

set -e

echo "Building kv-store-with-user-and-frozen-storage example..."

pnpm build

echo "✅ Build complete: build/service.wasm"

