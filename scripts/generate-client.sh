#!/bin/bash

# Script to generate TypeScript client from ABI using abi-codegen
# Usage: ./scripts/generate-client.sh <abi-json-path> <output-dir> [client-name]
#
# This is a wrapper script that calls the JavaScript implementation
# which filters out Rust-specific fields (state_root, is_init, is_view)
# before passing to abi-codegen.

set -e

# Call the JavaScript implementation
node "$(dirname "$0")/generate-client.js" "$@"

