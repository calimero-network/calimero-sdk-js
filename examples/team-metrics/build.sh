#!/bin/bash

# Build script for team-metrics example

set -e

echo "Building team-metrics example..."

pnpm build

echo "✅ Build complete: build/contract.wasm"

