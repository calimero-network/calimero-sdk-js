#!/bin/bash

# Post-install script wrapper
# Tries to use compiled JS if available, otherwise falls back to shell script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPILED_SCRIPT="$CLI_DIR/lib/scripts/post-install.js"
SHELL_SCRIPT="$SCRIPT_DIR/install-deps.sh"

if [ -f "$COMPILED_SCRIPT" ]; then
  # Use compiled TypeScript version if available
  node "$COMPILED_SCRIPT"
else
  # Fall back to shell script (for CI/local dev before build)
  bash "$SHELL_SCRIPT"
fi

