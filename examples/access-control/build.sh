#!/bin/bash

# Build script for access-control example

set -e

echo "Building access-control example..."

pnpm build:manual

echo "✅ Build complete: build/service.wasm"

