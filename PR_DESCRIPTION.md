## Overview

This PR implements ABI-aware Borsh serialization throughout the JavaScript SDK runtime, ensuring full compatibility with Rust services. All public APIs (methods, events, state) now use ABI-aware serialization based on the embedded ABI manifest.

## Changes

### Core Infrastructure

- ✅ ABI-aware Borsh serialization/deserialization (`packages/sdk/src/utils/abi-serialize.ts`)
- ✅ Helper functions for ABI access and type resolution (`packages/sdk/src/abi/helpers.ts`)
- ✅ Full Borsh encoding/decoding support (scalars, options, vectors, maps, sets, records, variants)
- ✅ Enhanced Borsh decoder with support for signed integers, options, vectors, maps, sets

### Runtime Integration

- ✅ Method dispatch uses ABI-aware deserialization (required)
- ✅ Return values use ABI-aware serialization (required)
- ✅ Event emission uses ABI-aware serialization (required)
- ✅ State persistence uses ABI-aware serialization (required)

### Breaking Changes

- ⚠️ **ABI manifest is now required** - no fallbacks to legacy serialization
- ⚠️ All public APIs throw errors if ABI is missing
- ⚠️ Legacy serialization removed from public APIs (kept only for internal CRDT operations)

## Technical Details

### Serialization Format

- State values are serialized using ABI-aware Borsh format (Rust-compatible)
- Format: `[version: u8=1][state: borsh][collections: legacy][metadata: legacy]`
- Collections and metadata still use legacy format (JS-specific CRDT snapshots)

### Error Handling

- Clear error messages when ABI is missing or invalid
- Method/event not found errors with helpful context
- Format version validation for state persistence

## Testing

- ✅ Counter example builds successfully with ABI-aware serialization
- ✅ ABI is correctly embedded in JavaScript bundles and WASM files
- ✅ Formatting and linting pass
- ✅ All unused imports removed

## Related PRs

- #21 - Core ABI Generation Infrastructure
- #23 - ABI Embedding (Rollup + WASM)

## Migration Notes

**No code changes required** - Existing services will automatically use ABI-aware serialization when rebuilt with the latest CLI. The ABI is automatically generated and embedded during the build process.

**Breaking Change**: Services must be rebuilt with the latest CLI to ensure ABI is embedded. Services without ABI will fail at runtime with clear error messages.

## Files Changed

- `packages/sdk/src/utils/abi-serialize.ts` - Core ABI-aware serialization
- `packages/sdk/src/abi/helpers.ts` - ABI helper functions
- `packages/sdk/src/borsh/decoder.ts` - Enhanced Borsh decoder
- `packages/sdk/src/runtime/dispatcher.ts` - Method dispatch with ABI
- `packages/sdk/src/env/api.ts` - Return value serialization with ABI
- `packages/sdk/src/events/emitter.ts` - Event serialization with ABI
- `packages/sdk/src/runtime/root.ts` - State persistence with ABI

## Commits

1. `feat: add ABI-aware Borsh serialization infrastructure`
2. `feat: integrate ABI-aware serialization into runtime`
3. `feat: update state persistence to use ABI-aware serialization`
4. `feat: make ABI required, remove legacy fallbacks`
5. `fix: remove unused imports and functions`
