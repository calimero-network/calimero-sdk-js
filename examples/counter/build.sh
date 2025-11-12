#!/bin/bash

# Build script for counter example

set -e

echo "Building counter example..."

pnpm build

echo "✅ Build complete: build/service.wasm"

