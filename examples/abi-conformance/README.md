# ABI Conformance Example

This example application is used to test and verify ABI (Application Binary Interface) generation for the Calimero JavaScript SDK. It serves as a comprehensive test case that covers various TypeScript patterns, CRDT types, methods, and events.

## Purpose

This example is similar to the [Rust abi_conformance app](https://github.com/calimero-network/core/tree/master/apps/abi_conformance) and is used to:

1. Generate ABI manifests from TypeScript source code
2. Verify ABI generation correctness
3. Compare generated ABI with expected output (golden file)
4. Ensure ABI compatibility with the Rust SDK format

## Structure

- `src/index.ts` - Main source file with State, Logic, Events, and various types
- `abi.expected.json` - Expected ABI output (golden file) for comparison
- `package.json` - Package configuration
- `tsconfig.json` - TypeScript configuration

## Building

```bash
pnpm install
pnpm build
```

This will generate:

- `build/service.wasm` - Compiled WebAssembly
- `build/abi.json` - Generated ABI manifest

## Verification

The ABI verification script (`scripts/verify-abi.sh`) uses this example to:

1. Generate ABI from `src/index.ts`
2. Compare with `abi.expected.json`
3. Run spot checks to validate ABI structure

## Features Tested

- State classes with various field types
- Logic classes with @Init and @View methods
- Event classes
- CRDT types (Counter, UnorderedMap, Vector, LwwRegister)
- Type definitions (interfaces, type aliases)
- Method parameters and return types
- Optional/nullable types
