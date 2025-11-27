# @calimero-network/calimero-cli-js

CLI build tools for compiling Calimero applications to WebAssembly.

## Installation

```bash
npm install -g @calimero-network/calimero-cli-js
# or
pnpm add -g @calimero-network/calimero-cli-js
```

## Automatic Installation

Build dependencies (QuickJS, WASI-SDK, Binaryen) are **automatically installed** when you install the package via npm/pnpm. The `postinstall` script will download:

- QuickJS v0.1.3 (~10MB)
- WASI-SDK v11 (~150MB)
- Binaryen tools (~5MB)

**No manual setup required!** The dependencies will be installed in the package's `deps` directory.

### Manual Installation (if needed)

If automatic installation fails, you can manually run:

```bash
cd node_modules/@calimero-network/calimero-cli-js
pnpm install-deps
# or
npm run install-deps
```

## Usage

### Build a Service

```bash
calimero-sdk build src/app.ts -o build/service.wasm
```

### Options

- `--verbose` - Show detailed build output
- `--no-optimize` - Skip WASM optimization

## Build Pipeline

```
TypeScript/JavaScript
        ↓
   [Rollup] Bundle
        ↓
   [QuickJS] Compile to C
        ↓
   [Clang] Compile to WASM
        ↓
   [Optimize] Final WASM
```

## Troubleshooting

### "QuickJS compiler not found"

Run the dependency installer:

```bash
pnpm install-deps
```

### "WASI-SDK not found"

Same fix - run:

```bash
pnpm install-deps
```

## Documentation

See the [main repository documentation](../../README.md) for complete guides.

## License

Apache-2.0
