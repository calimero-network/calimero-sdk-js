#!/bin/bash

# Build script for curb example

set -e

echo "Building curb example..."

rm -rf build && pnpm build:manual

echo "✅ Build complete: build/contract.wasm"

