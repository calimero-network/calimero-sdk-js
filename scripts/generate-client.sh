#!/bin/bash

# Script to generate TypeScript client from ABI using abi-codegen
# Usage: ./scripts/generate-client.sh <abi-json-path> <output-dir> [client-name]
#
# Note: This script filters out Rust-specific fields (state_root, is_init, is_view)
# from the ABI before passing it to abi-codegen, while keeping the original abi.json intact.

set -e

ABI_FILE="${1:-build/abi.json}"
OUTPUT_DIR="${2:-build/generated}"
CLIENT_NAME="${3:-}"

if [ ! -f "$ABI_FILE" ]; then
  echo "❌ Error: ABI file not found: $ABI_FILE"
  echo ""
  echo "Usage: $0 <abi-json-path> <output-dir> [client-name]"
  echo ""
  echo "Example:"
  echo "  $0 examples/counter/build/abi.json examples/counter/build/generated CounterClient"
  exit 1
fi

echo "📦 Generating TypeScript client from ABI..."
echo "   Input:  $ABI_FILE"
echo "   Output: $OUTPUT_DIR"

# Create a temporary filtered ABI file for codegen (removes Rust-specific fields)
# The original abi.json remains unchanged with all Rust fields
TEMP_ABI=$(mktemp)
trap "rm -f $TEMP_ABI" EXIT

# Filter out Rust-specific fields: state_root, is_init, is_view
jq 'del(.state_root) | .methods |= map(del(.is_init, .is_view))' "$ABI_FILE" > "$TEMP_ABI"

if [ -n "$CLIENT_NAME" ]; then
  npx @calimero-network/abi-codegen -i "$TEMP_ABI" -o "$OUTPUT_DIR" --client-name "$CLIENT_NAME"
else
  npx @calimero-network/abi-codegen -i "$TEMP_ABI" -o "$OUTPUT_DIR"
fi

echo ""
echo "✅ Client generation completed!"
echo "   Generated files are in: $OUTPUT_DIR"

