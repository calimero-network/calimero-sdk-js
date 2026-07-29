#!/bin/bash

# Build script for the authored-collections example

set -e

echo "Building authored-collections example..."

pnpm build:manual

echo "✅ Build complete: build/service.wasm"
