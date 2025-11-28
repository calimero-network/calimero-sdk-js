# ABI Conformance Notes

This example is designed to match the Rust `abi_conformance` app structure and generate the same ABI.

## Current Status

The example includes:

- ✅ All types from Rust version (Person, Profile, Action, Status, etc.)
- ✅ All methods from Rust version (echo methods, optional methods, list/map methods, etc.)
- ✅ All events from Rust version
- ✅ State class matching `AbiState` structure

## Known Issues

1. **Variant Support**: TypeScript doesn't have native variants. The example uses class hierarchies to represent variants (Action, Status, ConformanceError). The emitter may need updates to detect and generate variant types correctly.

2. **ABI Format Differences**: The current emitter may generate ABI in a slightly different format than the Rust version:
   - Scalar types: Emitter uses `{ "kind": "scalar", "scalar": "u32" }` but Rust uses `{ "kind": "u32" }`
   - List types: Emitter uses `{ "kind": "vector", "inner": {...} }` but Rust uses `{ "kind": "list", "items": {...} }`
   - Map keys: Need to verify format matches

3. **Type Mappings**:
   - `number` maps to `f64` (should be `u32`/`i32` based on context)
   - `bigint` maps to `u64` (correct)
   - `Uint8Array` maps to `bytes` (may need size specification for fixed-size arrays)

## Next Steps

1. Update the emitter to match Rust ABI format exactly
2. Add variant detection for class hierarchies
3. Improve type inference (u32 vs f64, etc.)
4. Add support for fixed-size byte arrays (bytes[32], etc.)
5. Generate and verify the expected ABI file

## Testing

Run the verification script to generate ABI and compare:

```bash
./scripts/verify-abi.sh
```

This will:

1. Generate ABI from `src/index.ts`
2. Compare with `abi.expected.json`
3. Run spot checks
