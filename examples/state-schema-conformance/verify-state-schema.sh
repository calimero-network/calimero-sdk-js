#!/usr/bin/env bash
set -euo pipefail

# Verify state schema extraction from ABI

ROOT="${ROOT:-$(git rev-parse --show-toplevel)}"
cd "$ROOT/examples/state-schema-conformance"

echo "=== State Schema Conformance Test ==="
echo ""

# Build the app (or use existing ABI if build fails at methods step)
echo "1. Building state-schema-conformance..."
pnpm install
# Try to build, but continue if it fails at methods step (we only need ABI)
pnpm build || {
  if [ -f "build/abi.json" ]; then
    echo "⚠️  Build failed at methods step, but ABI was generated - continuing..."
  else
    echo "ERROR: Build failed and ABI not found"
    exit 1
  fi
}

# Check build-time generated files
echo ""
echo "2. Checking build-time generated files..."
ABI_FILE="build/abi.json"
STATE_SCHEMA_FILE="build/state-schema.json"

if [ ! -f "$ABI_FILE" ]; then
    echo "ERROR: ABI file not found at $ABI_FILE"
    exit 1
fi

if [ ! -f "$STATE_SCHEMA_FILE" ]; then
    echo "ERROR: State schema file not found at $STATE_SCHEMA_FILE"
    exit 1
fi

echo "✅ Found both abi.json and state-schema.json"

# Compare state-schema.json with expected
echo ""
echo "3. Comparing state-schema.json with expected..."
EXPECTED="state-schema.expected.json"

if [ ! -f "$EXPECTED" ]; then
    echo "WARNING: Expected state schema not found, creating from build output..."
    cp "$STATE_SCHEMA_FILE" "$EXPECTED"
    echo "✅ Created expected state schema file"
else
    # Compare build-time with expected
    if ! diff -u "$EXPECTED" "$STATE_SCHEMA_FILE" > /tmp/build-time-diff.txt; then
        echo "ERROR: Build-time state schema differs from expected:"
        cat /tmp/build-time-diff.txt
        exit 1
    fi
    echo "✅ State schema matches expected"
fi

echo ""
echo "=== All tests passed! ==="

