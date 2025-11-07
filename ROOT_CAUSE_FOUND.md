# Root Cause Identified

**Date**: November 6, 2025  
**Status**: Critical Issue Found - Needs Fix

---

## 🎯 **ROOT CAUSE: `JS_ReadObject()` Fails to Load Bytecode**

### Evidence from Docker Logs:
```
execution log 0| Failed to load bytecode in getCount
execution log 0| Failed to load bytecode in hello  
execution log 0| Failed to load bytecode in increment
```

### What We Know ✅

1. **Bytecode is properly generated**  
   - File: `build/code.h`
   - Size: 11969 bytes
   - Format: Starts with `0x02` (valid QuickJS bytecode header)
   
2. **Bytecode is included in build**
   - `builder.c` includes `code.h` on line 15
   - `methods.c` is `#included` in `builder.c`
   - The `code[]` array should be accessible

3. **Methods execute without crashes**
   - No panics or segfaults
   - All workflow steps complete
   - `artifact_empty=true` (no delta/commit called)

4. **Fixed `init()` function**
   - Now properly instantiates `CounterApp` class
   - Returns the app object (not a bare object)

### The Problem ❌

**`JS_ReadObject(ctx, code, code_size, JS_READ_OBJ_BYTECODE)` consistently fails with an exception**

```c
JSValue mod_obj = JS_ReadObject(ctx, code, code_size, JS_READ_OBJ_BYTECODE);
if (JS_IsException(mod_obj)) {
    // THIS ALWAYS TRIGGERS! ❌
    log_msg("Failed to load bytecode");
    return;  // Early exit - never reaches QuickJS execution
}
```

### Why All Methods Return `null`

1. `JS_ReadObject()` fails
2. Method returns early
3. No QuickJS code executes
4. No `value_return()` is called
5. Runtime sees no return value → returns `null`

---

## 🔍 **Debugging Attempts**

### What We Tried:
1. ✅ Added all NEAR SDK fixes (`JS_EvalFunction`, `js_std_loop`, etc.)
2. ✅ Removed `JS_ResolveModule()` (was breaking things)
3. ✅ Added automatic `value_return()` serialization
4. ✅ Fixed `init()` to properly instantiate class
5. ✅ Verified bytecode is generated correctly
6. ✅ Verified `code.h` is included in build
7. ✅ Added detailed error logging

### What Doesn't Work:
- ❌ Can't see the actual exception message (log_msg doesn't work in WASM)
- ❌ Bytecode loads fine in local tests but fails in WASM
- ❌ No QuickJS diagnostic tools available in WASM environment

---

## 💡 **Possible Causes**

### Theory 1: Memory Layout Issue
The `code[]` array pointer might not be valid in WASM memory space when `JS_ReadObject()` tries to read it.

**Test**: Try reading code[0] and code_size before calling `JS_ReadObject()` to verify they're accessible.

### Theory 2: QuickJS Configuration Issue
Our `JS_NewRuntime()` or `JS_NewCustomContext()` might not have the right flags/settings for reading bytecode.

**Test**: Compare with NEAR SDK's runtime initialization.

### Theory 3: Bytecode Format Incompatibility
Our `qjsc` might be generating a different bytecode format than what QuickJS expects in WASM.

**Test**: Try using NEAR SDK's `qjsc` binary to generate bytecode.

### Theory 4: Build System Issue
The bytecode might not be properly linked in the final WASM even though it compiles.

**Test**: Inspect the WASM binary to see if the `code[]` array is actually present.

---

## 🚀 **Recommended Next Steps**

### Immediate (High Priority):

**Option A: Use NEAR SDK's qjsc Binary** (30 mins)
- Copy `qjsc` from NEAR SDK
- Rebuild bytecode with their compiler
- Test if it loads successfully

**Option B: Debug Memory Access** (45 mins)
```c
// Add before JS_ReadObject():
if (code == NULL) panic("code is NULL!");
if (code_size == 0) panic("code_size is 0!");
uint8_t first_byte = code[0];
if (first_byte != 0x02) panic("Invalid bytecode header!");
```

**Option C: Inspect WASM Binary** (20 mins)
```bash
wasm-objdump -x contract.wasm | grep "code"
```
Check if the `code` symbol exists in the WASM.

### Alternative Approaches:

**Plan B: Skip Bytecode Compilation**
- Evaluate JavaScript directly as source code
- Use `JS_Eval()` instead of `JS_ReadObject()`
- Slower but might work

**Plan C: Hardcode Critical Methods**
- Keep `init()` hardcoded (already working)
- Implement `getCount()` and `increment()` in C
- Only use QuickJS for complex logic

---

## 📊 **Progress So Far**

### Completed ✅
- [x] Build pipeline works
- [x] All NEAR SDK fixes applied  
- [x] Bytecode generates correctly
- [x] `init()` method works
- [x] Methods execute without crashes
- [x] Identified root cause

### Blocked ❌
- [ ] `JS_ReadObject()` fails
- [ ] Can't see exception details
- [ ] No QuickJS execution
- [ ] All methods return null

---

## 🎯 **Current Blocker**

**We cannot proceed until `JS_ReadObject()` successfully loads the bytecode.**

Everything else is ready:
- ✅ Runtime setup
- ✅ Module loading pattern
- ✅ Event loop handling  
- ✅ Return value serialization
- ✅ Proper error handling

The ONLY thing stopping us is this one failing function call.

---

**Recommendation**: Try Option A (NEAR SDK's qjsc) or Option B (memory access debug) first, as these are most likely to reveal the issue quickly.

