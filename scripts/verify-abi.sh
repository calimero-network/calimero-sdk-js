#!/usr/bin/env bash

set -euo pipefail

# Get root directory
ROOT="${ROOT:-$(git rev-parse --show-toplevel)}"
cd "$ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 ABI Verification Script"
echo "=========================="
echo ""

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}⚠ Warning: jq not found. Installing...${NC}"
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo apt-get update && sudo apt-get install -y jq
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        brew install jq || echo -e "${RED}❌ Please install jq manually: brew install jq${NC}"
    else
        echo -e "${RED}❌ Please install jq manually${NC}"
        exit 1
    fi
fi

# Check if Node.js and pnpm are available
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Error: Node.js not found${NC}"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}❌ Error: pnpm not found${NC}"
    exit 1
fi

# Build packages if needed
if [ ! -d "packages/cli/lib" ] || [ ! -d "packages/sdk/lib" ]; then
    echo "📦 Building packages..."
    pnpm build || {
        echo -e "${RED}❌ Build failed${NC}"
        exit 1
    }
fi

# Generate ABI from conformance example
CONFORMANCE_SOURCE="examples/abi-conformance/src/index.ts"
OUTPUT_DIR="/tmp/abi_conformance_output"
EXPECTED_FILE="examples/abi-conformance/abi.expected.json"
OUTPUT_FILE="$OUTPUT_DIR/abi.json"

echo "📝 Generating ABI from conformance example..."
mkdir -p "$OUTPUT_DIR"

# Use Node.js script to generate ABI
node scripts/generate-abi.js "$CONFORMANCE_SOURCE" "$OUTPUT_FILE" || {
    echo -e "${RED}❌ Failed to generate ABI${NC}"
    exit 1
}

# Check if expected file exists
if [ ! -f "$EXPECTED_FILE" ]; then
    echo -e "${YELLOW}⚠ Expected file not found: $EXPECTED_FILE${NC}"
    echo "Creating initial expected file from generated ABI..."
    mkdir -p "$(dirname "$EXPECTED_FILE")"
    cp "$OUTPUT_FILE" "$EXPECTED_FILE"
    echo -e "${GREEN}✓ Created expected file. Please review and commit it.${NC}"
    exit 0
fi

# Format both files for comparison
echo "🔧 Formatting files for comparison..."
jq . "$OUTPUT_FILE" > "/tmp/abi_conformance.formatted.json" || {
    echo -e "${RED}❌ Failed to format generated ABI${NC}"
    exit 1
}

jq . "$EXPECTED_FILE" > "/tmp/abi_expected.formatted.json" || {
    echo -e "${RED}❌ Failed to format expected ABI${NC}"
    exit 1
}

# Compare with golden file
echo "🔍 Comparing with golden file..."
if ! diff -u "/tmp/abi_expected.formatted.json" "/tmp/abi_conformance.formatted.json"; then
    echo -e "${RED}❌ ERROR: ABI output differs from golden file${NC}"
    echo ""
    echo "Generated ABI saved to: $OUTPUT_FILE"
    echo "Expected ABI: $EXPECTED_FILE"
    exit 1
fi

echo -e "${GREEN}✓ ABI matches golden file${NC}"

# Spot checks with jq
echo ""
echo "🔍 Running jq spot checks..."

# Check schema_version
SCHEMA_VERSION=$(jq -r '.schema_version' "$OUTPUT_FILE")
if [ "$SCHEMA_VERSION" != "wasm-abi/1" ]; then
    echo -e "${RED}❌ ERROR: Invalid schema_version: $SCHEMA_VERSION (expected: wasm-abi/1)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ schema_version is correct${NC}"

# Check required fields exist
for field in types methods events; do
    if ! jq -e ".$field" "$OUTPUT_FILE" >/dev/null 2>&1; then
        echo -e "${RED}❌ ERROR: Missing required field: $field${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✓ All required fields present${NC}"

# Check types is an object
TYPES_TYPE=$(jq -r '.types | type' "$OUTPUT_FILE")
if [ "$TYPES_TYPE" != "object" ]; then
    echo -e "${RED}❌ ERROR: 'types' must be an object, got: $TYPES_TYPE${NC}"
    exit 1
fi
echo -e "${GREEN}✓ types is an object${NC}"

# Check methods is an array
METHODS_TYPE=$(jq -r '.methods | type' "$OUTPUT_FILE")
if [ "$METHODS_TYPE" != "array" ]; then
    echo -e "${RED}❌ ERROR: 'methods' must be an array, got: $METHODS_TYPE${NC}"
    exit 1
fi
echo -e "${GREEN}✓ methods is an array${NC}"

# Check events is an array
EVENTS_TYPE=$(jq -r '.events | type' "$OUTPUT_FILE")
if [ "$EVENTS_TYPE" != "array" ]; then
    echo -e "${RED}❌ ERROR: 'events' must be an array, got: $EVENTS_TYPE${NC}"
    exit 1
fi
echo -e "${GREEN}✓ events is an array${NC}"

# Check state_root exists and is in types
STATE_ROOT=$(jq -r '.state_root // empty' "$OUTPUT_FILE")
if [ -n "$STATE_ROOT" ]; then
    if ! jq -e ".types[\"$STATE_ROOT\"]" "$OUTPUT_FILE" >/dev/null 2>&1; then
        echo -e "${RED}❌ ERROR: state_root '$STATE_ROOT' not found in types${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ state_root '$STATE_ROOT' exists in types${NC}"
fi

# Check that state_root type is a record
if [ -n "$STATE_ROOT" ]; then
    STATE_ROOT_KIND=$(jq -r ".types[\"$STATE_ROOT\"].kind" "$OUTPUT_FILE")
    if [ "$STATE_ROOT_KIND" != "record" ]; then
        echo -e "${RED}❌ ERROR: state_root type must be 'record', got: $STATE_ROOT_KIND${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ state_root type is a record${NC}"
fi

# Check that @Init method is marked correctly
if jq -e '.methods[] | select(.name=="init")' "$OUTPUT_FILE" >/dev/null 2>&1; then
    INIT_IS_INIT=$(jq -r '.methods[] | select(.name=="init") | .is_init // false' "$OUTPUT_FILE")
    if [ "$INIT_IS_INIT" != "true" ]; then
        echo -e "${RED}❌ ERROR: init method missing is_init=true${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ init method has is_init=true${NC}"
fi

# Check that @View methods are marked correctly
VIEW_METHODS=$(jq -r '.methods[] | select(.is_view==true) | .name' "$OUTPUT_FILE" || true)
if [ -n "$VIEW_METHODS" ]; then
    echo -e "${GREEN}✓ Found view methods: $(echo "$VIEW_METHODS" | tr '\n' ' ')${NC}"
fi

# Check events structure (Rust format: events have name and optionally payload)
EVENTS_COUNT=$(jq '.events | length' "$OUTPUT_FILE")
if [ "$EVENTS_COUNT" -gt 0 ]; then
    for i in $(seq 0 $((EVENTS_COUNT - 1))); do
        EVENT_NAME=$(jq -r ".events[$i].name" "$OUTPUT_FILE")
        if [ -z "$EVENT_NAME" ]; then
            echo -e "${RED}❌ ERROR: Event at index $i missing 'name' property${NC}"
            exit 1
        fi
        # Rust format: events can have just name, or name + payload
        # payload can be a type reference or a type definition
        if jq -e ".events[$i].payload" "$OUTPUT_FILE" >/dev/null 2>&1; then
            PAYLOAD_TYPE=$(jq -r ".events[$i].payload | type" "$OUTPUT_FILE")
            if [ "$PAYLOAD_TYPE" != "object" ] && [ "$PAYLOAD_TYPE" != "null" ]; then
                echo -e "${RED}❌ ERROR: Event '$EVENT_NAME' payload must be an object or null, got: $PAYLOAD_TYPE${NC}"
                exit 1
            fi
        fi
    done
    echo -e "${GREEN}✓ All events have valid structure (name + optional payload)${NC}"
fi

# Check that Counter type maps to u64
if jq -e '.types.ConformanceState.fields[] | select(.name=="counter")' "$OUTPUT_FILE" >/dev/null 2>&1; then
    COUNTER_TYPE=$(jq -r '.types.ConformanceState.fields[] | select(.name=="counter") | .type.scalar' "$OUTPUT_FILE")
    if [ "$COUNTER_TYPE" != "u64" ]; then
        echo -e "${YELLOW}⚠ Warning: Counter type is '$COUNTER_TYPE', expected 'u64'${NC}"
    else
        echo -e "${GREEN}✓ Counter type correctly maps to u64${NC}"
    fi
fi

# Check that UnorderedMap has correct structure
if jq -e '.types.ConformanceState.fields[] | select(.name=="stringMap")' "$OUTPUT_FILE" >/dev/null 2>&1; then
    MAP_KIND=$(jq -r '.types.ConformanceState.fields[] | select(.name=="stringMap") | .type.kind' "$OUTPUT_FILE")
    if [ "$MAP_KIND" != "map" ]; then
        echo -e "${RED}❌ ERROR: stringMap type must be 'map', got: $MAP_KIND${NC}"
        exit 1
    fi
    MAP_KEY=$(jq -r '.types.ConformanceState.fields[] | select(.name=="stringMap") | .type.key.scalar' "$OUTPUT_FILE")
    if [ "$MAP_KEY" != "string" ]; then
        echo -e "${RED}❌ ERROR: Map key must be 'string', got: $MAP_KEY${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ UnorderedMap has correct structure${NC}"
fi

# Check that Vector has correct structure
if jq -e '.types.ConformanceState.fields[] | select(.name=="items")' "$OUTPUT_FILE" >/dev/null 2>&1; then
    VECTOR_KIND=$(jq -r '.types.ConformanceState.fields[] | select(.name=="items") | .type.kind' "$OUTPUT_FILE")
    if [ "$VECTOR_KIND" != "vector" ]; then
        echo -e "${RED}❌ ERROR: items type must be 'vector', got: $VECTOR_KIND${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Vector has correct structure${NC}"
fi

echo ""
echo -e "${GREEN}✅ ABI verify: OK${NC}"
echo ""
echo "Generated ABI: $OUTPUT_FILE"
echo "Expected ABI: $EXPECTED_FILE"

