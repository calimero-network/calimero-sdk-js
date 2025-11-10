#!/bin/bash

# Build script for counter example

set -e

echo "Building counter example..."

rm -rf build && pnpm build:manual

echo "✅ Build complete: build/contract.wasm"

