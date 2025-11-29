# State Schema Conformance Example

This example application is used to test and verify state schema generation for the Calimero JavaScript SDK. It serves as a comprehensive test case that covers various state field types and CRDT collections.

## Purpose

This example is similar to the [Rust state-schema-conformance app](https://github.com/calimero-network/core/tree/master/apps/state-schema-conformance) and is used to:

1. Generate state schema from TypeScript source code (extracting `state_root` and `types` from ABI)
2. Verify state schema generation correctness
3. Compare generated state schema with expected output (golden file)
4. Ensure state schema compatibility with the Rust SDK format

## Structure

- `src/index.ts` - Main source file with State, Logic, and various types
- `state-schema.expected.json` - Expected state schema output (golden file) for comparison
- `verify-state-schema.sh` - Verification script that extracts and compares state schema
- `package.json` - Package configuration
- `tsconfig.json` - TypeScript configuration

## Building

```bash
pnpm install
pnpm build
```

This will generate:

- `build/service.wasm` - Compiled WebAssembly
- `build/abi.json` - Generated ABI manifest (contains full ABI with methods, events, types)
- `build/state-schema.json` - State schema (contains only state_root and types)
- `build/schema.json` - JSON Schema for ABI validation

## Verification

The state schema verification script (`verify-state-schema.sh`) uses this example to:

1. Build the service and generate both `abi.json` and `state-schema.json`
2. Verify that `build/state-schema.json` exists
3. Compare `build/state-schema.json` with `state-schema.expected.json`
4. Validate state schema structure

## Features Tested

- State classes with various field types
- CRDT collections (Counter, UnorderedMap, Vector, LwwRegister, UnorderedSet)
- Nested collections (maps of maps, lists of lists, maps of lists, lists of maps)
- Record types with CRDT fields
- Variant types wrapped in LwwRegister
- Newtype bytes (Uint8Array)
- Scalar types wrapped in LwwRegister

## State Schema Format

The state schema is a subset of the ABI manifest containing only:

- `state_root`: The root state type name
- `types`: Type definitions used by the state (including nested types)

Methods and events are excluded from the state schema.
