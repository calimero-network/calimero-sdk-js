# @calimero/cli

CLI build tools for compiling Calimero applications to WebAssembly.

## Installation

```bash
npm install -g @calimero/cli
# or
pnpm add -g @calimero/cli
```

## First Time Setup

Install build dependencies (QuickJS, WASI-SDK, Binaryen):

```bash
cd packages/cli
pnpm install-deps
```

This will download:
- QuickJS v0.1.3 (~10MB)
- WASI-SDK v11 (~150MB)
- Binaryen tools (~5MB)

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
