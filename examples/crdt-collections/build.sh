#!/bin/bash

# Build script for the CRDT collections example

set -e

echo "Building crdt-collections example..."

pnpm build:manual

echo "✅ Build complete: build/service.wasm"
