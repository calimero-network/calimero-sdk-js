#!/bin/bash

# Install build dependencies
# QuickJS, WASI-SDK, Binaryen

set -e

echo "🔧 Installing Calimero SDK build dependencies..."
echo ""

PLATFORM=$(uname -s)
ARCH=$(uname -m)

echo "Platform: $PLATFORM"
echo "Architecture: $ARCH"
echo ""

# Determine system
if [ "$PLATFORM" = "Darwin" ]; then
  SYS_NAME="macOS"
  SYS_NAME_LOWER="macos"
elif [ "$PLATFORM" = "Linux" ]; then
  SYS_NAME="Linux"
  SYS_NAME_LOWER="linux"
else
  echo "❌ Unsupported platform: $PLATFORM"
  exit 1
fi

# Determine arch
if [ "$ARCH" = "x86_64" ]; then
  ARCH_NAME="X64"
elif [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
  ARCH_NAME="arm64"
else
  echo "❌ Unsupported architecture: $ARCH"
  exit 1
fi

# Create deps directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPS_DIR="$SCRIPT_DIR/../src/deps"

echo "📁 Creating deps directory: $DEPS_DIR"
rm -rf "$DEPS_DIR"
mkdir -p "$DEPS_DIR"
cd "$DEPS_DIR"

# ===========================
# Install QuickJS
# ===========================

echo ""
echo "📦 Installing QuickJS v0.1.3..."

QUICKJS_VERSION="0.1.3"
QUICKJS_TAG="v${QUICKJS_VERSION}"
QJSC_BINARY="qjsc-${SYS_NAME}-${ARCH_NAME}"

# Download qjsc binary
echo "  Downloading qjsc binary..."
curl -L -o qjsc "https://github.com/near/quickjs/releases/download/${QUICKJS_TAG}/${QJSC_BINARY}"
chmod +x qjsc

# Download QuickJS source
echo "  Downloading QuickJS source..."
curl -L -o quickjs.tar.gz "https://github.com/near/quickjs/archive/refs/tags/${QUICKJS_TAG}.tar.gz"

mkdir -p quickjs
tar xzf quickjs.tar.gz --strip-components=1 -C quickjs
rm quickjs.tar.gz

echo "  ✅ QuickJS installed"

# ===========================
# Install WASI-SDK
# ===========================

echo ""
echo "📦 Installing WASI-SDK v11..."

WASI_VERSION="11.0"
WASI_TAR="wasi-sdk-${WASI_VERSION}-${SYS_NAME_LOWER}.tar.gz"

echo "  Downloading WASI-SDK..."
curl -L -o wasi-sdk.tar.gz "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-11/${WASI_TAR}"

mkdir -p wasi-sdk
tar xzf wasi-sdk.tar.gz --strip-components=1 -C wasi-sdk
rm wasi-sdk.tar.gz

echo "  ✅ WASI-SDK installed"

# ===========================
# Install Binaryen
# ===========================

echo ""
echo "📦 Installing Binaryen v0.1.16..."

BINARYEN_VERSION="0.1.16"
BINARYEN_TAG="v${BINARYEN_VERSION}"
BINARYEN_TAR="binaryen-${SYS_NAME}-${ARCH_NAME}.tar.gz"

echo "  Downloading Binaryen..."
curl -L -o binaryen.tar.gz "https://github.com/ailisp/binaryen/releases/download/${BINARYEN_TAG}/${BINARYEN_TAR}"

mkdir -p binaryen
tar xzf binaryen.tar.gz -C binaryen
rm binaryen.tar.gz

echo "  ✅ Binaryen installed"

# ===========================
# Verification
# ===========================

echo ""
echo "🔍 Verifying installation..."

if [ -f "qjsc" ] && [ -x "qjsc" ]; then
  echo "  ✅ qjsc binary ready"
else
  echo "  ❌ qjsc not found"
  exit 1
fi

if [ -f "wasi-sdk/bin/clang" ]; then
  echo "  ✅ WASI-SDK clang ready"
else
  echo "  ❌ WASI-SDK clang not found"
  exit 1
fi

if [ -d "binaryen" ]; then
  echo "  ✅ Binaryen tools ready"
else
  echo "  ❌ Binaryen not found"
  exit 1
fi

echo ""
echo "════════════════════════════════════════"
echo "✅ All dependencies installed successfully!"
echo "════════════════════════════════════════"
echo ""
echo "You can now build contracts with:"
echo "  calimero-sdk build src/app.ts"
echo ""

