#!/bin/bash

# Build and run the host-native tests for builder/ helpers against deps/quickjs.
# Requires deps from install-deps.sh.

set -e

CLI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUICKJS_DIR="$CLI_DIR/deps/quickjs"
OUT_DIR="$(mktemp -d)"
trap 'rm -rf "$OUT_DIR"' EXIT

# No CONFIG_BIGNUM: quickjs.h declares JS_GetBigInt inline and only builder.c defines it.
cc -O0 -g -w -DCONFIG_VERSION='"test"' -D_GNU_SOURCE \
  -I"$QUICKJS_DIR" -I"$CLI_DIR/builder" \
  "$CLI_DIR/builder/typed_array_view_test.c" \
  "$QUICKJS_DIR/quickjs.c" "$QUICKJS_DIR/libregexp.c" "$QUICKJS_DIR/libunicode.c" \
  "$QUICKJS_DIR/cutils.c" \
  -lm -lpthread -o "$OUT_DIR/typed_array_view_test"

"$OUT_DIR/typed_array_view_test"
