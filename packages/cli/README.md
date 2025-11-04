# @calimero/cli

CLI build tools for compiling Calimero applications to WebAssembly.

## Installation

```bash
npm install -g @calimero/cli
# or
pnpm add -g @calimero/cli
```

## Usage

### Build a Contract

```bash
calimero-sdk build src/app.ts -o build/contract.wasm
```

### Options

- `--verbose` - Show detailed build output
- `--optimize` - Run WASM optimization (default: true)

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

## Requirements

The CLI will automatically download required tools on installation:
- QuickJS v0.1.3
- WASI-SDK v11
- Binaryen tools

## Documentation

See the [main repository documentation](../../README.md) for complete guides.

## License

Apache-2.0

