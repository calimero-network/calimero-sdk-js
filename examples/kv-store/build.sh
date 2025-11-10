#!/bin/bash

# Build script for kv-store example

set -e

echo "Building kv-store example..."

pnpm build

echo "✅ Build complete: build/service.wasm"

