/**
 * Calimero Contract Builder
 *
 * C glue code that:
 * 1. Initializes QuickJS runtime
 * 2. Loads contract bytecode
 * 3. Registers Calimero host functions
 * 4. Exports contract methods as WASM functions
 */

#include <string.h>
#include "quickjs.h"
#include "quickjs-libc-min.h"  // ADDED: For js_std_loop and module helpers (matching NEAR SDK!)
#include "libbf.h"
#include "code.h"
#include "methods.h"

// ===========================
// QuickJS Context Setup
// ===========================

// Note: js_module_set_import_meta and js_std_loop are now provided by quickjs-libc-min.c
#define FALSE 0
#define TRUE 1

// Not static - needed by methods.c
JSContext *JS_NewCustomContext(JSRuntime *rt) {
  JSContext *ctx = JS_NewContextRaw(rt);
  if (!ctx) return NULL;
  
  JS_AddIntrinsicBaseObjects(ctx);
  JS_AddIntrinsicDate(ctx);
  JS_AddIntrinsicEval(ctx);
  JS_AddIntrinsicStringNormalize(ctx);
  JS_AddIntrinsicRegExp(ctx);
  JS_AddIntrinsicJSON(ctx);
  JS_AddIntrinsicProxy(ctx);
  JS_AddIntrinsicMapSet(ctx);
  JS_AddIntrinsicTypedArrays(ctx);
  JS_AddIntrinsicPromise(ctx);
  JS_AddIntrinsicBigInt(ctx);
  
  return ctx;
}

// ===========================
// Calimero Host Functions
// ===========================

// Import host functions from Calimero runtime
// All functions that take buffers expect a pointer (u64) to a Buffer struct
// Buffer struct layout (16 bytes): [ptr: u64][len: u64]
extern void panic_utf8(uint64_t buffer_ptr, uint64_t location_ptr) __attribute__((noreturn));
extern void log_utf8(uint64_t buffer_ptr);
extern uint64_t register_len(uint64_t register_id);  // Returns PtrSizedInt (u64)
extern uint32_t read_register(uint64_t register_id, uint64_t buffer_ptr);  // Returns Bool (u32)
extern void context_id(uint64_t register_id);
extern void executor_id(uint64_t register_id);
extern void emit(uint64_t event_ptr);
extern void emit_with_handler(uint64_t event_ptr, uint64_t handler_buffer_ptr);
extern uint32_t storage_read(uint64_t key_buffer_ptr, uint64_t register_id);  // Returns Bool (u32)
extern uint32_t storage_write(uint64_t key_buffer_ptr, uint64_t value_buffer_ptr, uint64_t register_id);  // Returns Bool (u32)
extern uint32_t storage_remove(uint64_t key_buffer_ptr, uint64_t register_id);  // Returns Bool (u32)
extern void commit(uint64_t root_hash_buffer_ptr, uint64_t artifact_buffer_ptr);
extern void time_now(uint64_t buffer_ptr);
extern uint64_t blob_create(void);  // Returns PtrSizedInt (u64)
extern uint64_t blob_open(uint64_t blob_id_buffer_ptr);  // Returns PtrSizedInt (u64)
extern uint64_t blob_read(uint64_t fd, uint64_t buffer_ptr);  // Returns PtrSizedInt (u64)
extern uint64_t blob_write(uint64_t fd, uint64_t data_buffer_ptr);  // Returns PtrSizedInt (u64)
extern uint32_t blob_close(uint64_t fd, uint64_t blob_id_buffer_ptr);  // Returns Bool (u32)

// Buffer descriptor struct - MUST match calimero-sys Slice<'a, u8>
// #[repr(C)] struct with ptr: u64, len: u64, _phantom: PhantomData (zero-sized)
// Use natural C alignment, not packed
typedef struct {
  uint64_t ptr;
  uint64_t len;
} CalimeroBuffer;

// Event descriptor struct
typedef struct {
  uint64_t kind_ptr;
  uint64_t kind_len;
  uint64_t data_ptr;
  uint64_t data_len;
} CalimeroEvent;

// Location struct - MUST match calimero-sys Location<'a>
// struct with file: Buffer<'a>, line: u32, column: u32
// Use natural C alignment to match Rust's repr(C)
typedef struct {
  uint64_t file_ptr;
  uint64_t file_len;
  uint32_t line;
  uint32_t column;
} CalimeroLocation;

// Helper to create a Buffer descriptor on the stack
static inline CalimeroBuffer make_buffer(const void *ptr, size_t len) {
  CalimeroBuffer buf = { (uint64_t)ptr, (uint64_t)len };
  return buf;
}

// Helper: Convert JSValue (Uint8Array) to C pointer
static uint8_t* JSValueToUint8Array(JSContext *ctx, JSValue val, size_t *len) {
  JSValue buffer;
  size_t offset, bytes_per_element;
  
  buffer = JS_GetTypedArrayBuffer(ctx, val, &offset, len, &bytes_per_element);
  if (JS_IsException(buffer)) {
    *len = 0;
    return NULL;
  }
  
  uint8_t *ptr = JS_GetArrayBuffer(ctx, len, buffer);
  JS_FreeValue(ctx, buffer);
  
  return ptr ? ptr + offset : NULL;
}

// ===========================
// Host Function Wrappers
// ===========================

// Wrapper: log_utf8
static JSValue js_log_utf8(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t len;
  uint8_t *ptr = JSValueToUint8Array(ctx, argv[0], &len);
  if (!ptr) return JS_EXCEPTION;
  
  CalimeroBuffer buf = make_buffer(ptr, len);
  log_utf8((uint64_t)&buf);
  return JS_UNDEFINED;
}

// Wrapper: storage_read
static JSValue js_storage_read(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t key_len;
  uint8_t *key_ptr = JSValueToUint8Array(ctx, argv[0], &key_len);
  if (!key_ptr) return JS_EXCEPTION;
  
  int64_t register_id;
  JS_ToInt64(ctx, &register_id, argv[1]);
  
  CalimeroBuffer key_buf = make_buffer(key_ptr, key_len);
  uint32_t result = storage_read((uint64_t)&key_buf, (uint64_t)register_id);
  return JS_NewUint32(ctx, result);
}

// Wrapper: storage_write
static JSValue js_storage_write(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t key_len, value_len;
  uint8_t *key_ptr = JSValueToUint8Array(ctx, argv[0], &key_len);
  uint8_t *value_ptr = JSValueToUint8Array(ctx, argv[1], &value_len);
  if (!key_ptr || !value_ptr) return JS_EXCEPTION;
  
  int64_t register_id;
  JS_ToInt64(ctx, &register_id, argv[2]);
  
  CalimeroBuffer key_buf = make_buffer(key_ptr, key_len);
  CalimeroBuffer value_buf = make_buffer(value_ptr, value_len);
  uint32_t result = storage_write((uint64_t)&key_buf, (uint64_t)&value_buf, (uint64_t)register_id);
  return JS_NewUint32(ctx, result);
}

// Wrapper: storage_remove
static JSValue js_storage_remove(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t key_len;
  uint8_t *key_ptr = JSValueToUint8Array(ctx, argv[0], &key_len);
  if (!key_ptr) return JS_EXCEPTION;
  
  int64_t register_id;
  JS_ToInt64(ctx, &register_id, argv[1]);
  
  CalimeroBuffer key_buf = make_buffer(key_ptr, key_len);
  uint32_t result = storage_remove((uint64_t)&key_buf, (uint64_t)register_id);
  return JS_NewUint32(ctx, result);
}

// Wrapper: context_id
static JSValue js_context_id(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int64_t register_id;
  JS_ToInt64(ctx, &register_id, argv[0]);
  context_id((uint64_t)register_id);
  return JS_UNDEFINED;
}

// Wrapper: executor_id
static JSValue js_executor_id(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int64_t register_id;
  JS_ToInt64(ctx, &register_id, argv[0]);
  executor_id((uint64_t)register_id);
  return JS_UNDEFINED;
}

// Wrapper: register_len
static JSValue js_register_len(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int64_t register_id;
  JS_ToInt64(ctx, &register_id, argv[0]);
  uint64_t len = register_len((uint64_t)register_id);
  return JS_NewBigInt64(ctx, len);
}

// Wrapper: read_register
static JSValue js_read_register(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int64_t register_id;
  JS_ToInt64(ctx, &register_id, argv[0]);
  
  size_t buf_len;
  uint8_t *buf_ptr = JSValueToUint8Array(ctx, argv[1], &buf_len);
  if (!buf_ptr) return JS_EXCEPTION;
  
  CalimeroBuffer buf = make_buffer(buf_ptr, buf_len);
  uint32_t result = read_register((uint64_t)register_id, (uint64_t)&buf);
  return JS_NewUint32(ctx, result);
}

// Wrapper: emit
static JSValue js_emit(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t kind_len, data_len;
  uint8_t *kind_ptr = JSValueToUint8Array(ctx, argv[0], &kind_len);
  uint8_t *data_ptr = JSValueToUint8Array(ctx, argv[1], &data_len);
  if (!kind_ptr || !data_ptr) return JS_EXCEPTION;
  
  CalimeroEvent event = {
    .kind_ptr = (uint64_t)kind_ptr,
    .kind_len = (uint64_t)kind_len,
    .data_ptr = (uint64_t)data_ptr,
    .data_len = (uint64_t)data_len
  };
  emit((uint64_t)&event);
  return JS_UNDEFINED;
}

// Wrapper: emit_with_handler
static JSValue js_emit_with_handler(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t kind_len, data_len, handler_len;
  uint8_t *kind_ptr = JSValueToUint8Array(ctx, argv[0], &kind_len);
  uint8_t *data_ptr = JSValueToUint8Array(ctx, argv[1], &data_len);
  uint8_t *handler_ptr = JSValueToUint8Array(ctx, argv[2], &handler_len);
  if (!kind_ptr || !data_ptr || !handler_ptr) return JS_EXCEPTION;
  
  CalimeroEvent event = {
    .kind_ptr = (uint64_t)kind_ptr,
    .kind_len = (uint64_t)kind_len,
    .data_ptr = (uint64_t)data_ptr,
    .data_len = (uint64_t)data_len
  };
  CalimeroBuffer handler_buf = make_buffer(handler_ptr, handler_len);
  emit_with_handler((uint64_t)&event, (uint64_t)&handler_buf);
  return JS_UNDEFINED;
}

// Wrapper: commit
static JSValue js_commit(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t root_len, artifact_len;
  uint8_t *root_ptr = JSValueToUint8Array(ctx, argv[0], &root_len);
  uint8_t *artifact_ptr = JSValueToUint8Array(ctx, argv[1], &artifact_len);
  if (!root_ptr || !artifact_ptr) return JS_EXCEPTION;
  
  CalimeroBuffer root_buf = make_buffer(root_ptr, root_len);
  CalimeroBuffer artifact_buf = make_buffer(artifact_ptr, artifact_len);
  commit((uint64_t)&root_buf, (uint64_t)&artifact_buf);
  return JS_UNDEFINED;
}

// Wrapper: time_now
static JSValue js_time_now(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t buf_len;
  uint8_t *buf_ptr = JSValueToUint8Array(ctx, argv[0], &buf_len);
  if (!buf_ptr || buf_len < 8) return JS_EXCEPTION;
  
  CalimeroBuffer buf = make_buffer(buf_ptr, buf_len);
  time_now((uint64_t)&buf);
  return JS_UNDEFINED;
}

// Wrapper: blob_create
static JSValue js_blob_create(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  uint64_t fd = blob_create();
  return JS_NewBigInt64(ctx, fd);
}

// Wrapper: blob_open
static JSValue js_blob_open(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t blob_id_len;
  uint8_t *blob_id_ptr = JSValueToUint8Array(ctx, argv[0], &blob_id_len);
  if (!blob_id_ptr || blob_id_len != 32) return JS_EXCEPTION;
  
  CalimeroBuffer blob_id_buf = make_buffer(blob_id_ptr, blob_id_len);
  uint64_t fd = blob_open((uint64_t)&blob_id_buf);
  return JS_NewBigInt64(ctx, fd);
}

// Wrapper: blob_read
static JSValue js_blob_read(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int64_t fd;
  JS_ToInt64(ctx, &fd, argv[0]);
  
  size_t buf_len;
  uint8_t *buf_ptr = JSValueToUint8Array(ctx, argv[1], &buf_len);
  if (!buf_ptr) return JS_EXCEPTION;
  
  CalimeroBuffer buf = make_buffer(buf_ptr, buf_len);
  uint64_t bytes_read = blob_read((uint64_t)fd, (uint64_t)&buf);
  return JS_NewBigInt64(ctx, bytes_read);
}

// Wrapper: blob_write
static JSValue js_blob_write(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int64_t fd;
  JS_ToInt64(ctx, &fd, argv[0]);
  
  size_t data_len;
  uint8_t *data_ptr = JSValueToUint8Array(ctx, argv[1], &data_len);
  if (!data_ptr) return JS_EXCEPTION;
  
  CalimeroBuffer data_buf = make_buffer(data_ptr, data_len);
  uint64_t bytes_written = blob_write((uint64_t)fd, (uint64_t)&data_buf);
  return JS_NewBigInt64(ctx, bytes_written);
}

// Wrapper: blob_close
static JSValue js_blob_close(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int64_t fd;
  JS_ToInt64(ctx, &fd, argv[0]);
  
  size_t buf_len;
  uint8_t *buf_ptr = JSValueToUint8Array(ctx, argv[1], &buf_len);
  if (!buf_ptr || buf_len < 32) return JS_EXCEPTION;
  
  CalimeroBuffer buf = make_buffer(buf_ptr, buf_len);
  uint32_t result = blob_close((uint64_t)fd, (uint64_t)&buf);
  return JS_NewUint32(ctx, result);
}

// ===========================
// Register Host Functions
// ===========================

// Not static - needed by methods.c
void js_add_calimero_host_functions(JSContext *ctx) {
  JSValue global = JS_GetGlobalObject(ctx);
  JSValue env = JS_NewObject(ctx);
  
  // Logging
  JS_SetPropertyStr(ctx, env, "log_utf8", JS_NewCFunction(ctx, js_log_utf8, "log_utf8", 1));
  
  // Storage
  JS_SetPropertyStr(ctx, env, "storage_read", JS_NewCFunction(ctx, js_storage_read, "storage_read", 2));
  JS_SetPropertyStr(ctx, env, "storage_write", JS_NewCFunction(ctx, js_storage_write, "storage_write", 3));
  JS_SetPropertyStr(ctx, env, "storage_remove", JS_NewCFunction(ctx, js_storage_remove, "storage_remove", 2));
  
  // Context
  JS_SetPropertyStr(ctx, env, "context_id", JS_NewCFunction(ctx, js_context_id, "context_id", 1));
  JS_SetPropertyStr(ctx, env, "executor_id", JS_NewCFunction(ctx, js_executor_id, "executor_id", 1));
  
  // Registers
  JS_SetPropertyStr(ctx, env, "register_len", JS_NewCFunction(ctx, js_register_len, "register_len", 1));
  JS_SetPropertyStr(ctx, env, "read_register", JS_NewCFunction(ctx, js_read_register, "read_register", 2));
  
  // Events
  JS_SetPropertyStr(ctx, env, "emit", JS_NewCFunction(ctx, js_emit, "emit", 2));
  JS_SetPropertyStr(ctx, env, "emit_with_handler", JS_NewCFunction(ctx, js_emit_with_handler, "emit_with_handler", 3));
  
  // Delta
  JS_SetPropertyStr(ctx, env, "commit", JS_NewCFunction(ctx, js_commit, "commit", 2));
  
  // Time
  JS_SetPropertyStr(ctx, env, "time_now", JS_NewCFunction(ctx, js_time_now, "time_now", 1));
  
  // Blobs
  JS_SetPropertyStr(ctx, env, "blob_create", JS_NewCFunction(ctx, js_blob_create, "blob_create", 0));
  JS_SetPropertyStr(ctx, env, "blob_open", JS_NewCFunction(ctx, js_blob_open, "blob_open", 1));
  JS_SetPropertyStr(ctx, env, "blob_read", JS_NewCFunction(ctx, js_blob_read, "blob_read", 2));
  JS_SetPropertyStr(ctx, env, "blob_write", JS_NewCFunction(ctx, js_blob_write, "blob_write", 2));
  JS_SetPropertyStr(ctx, env, "blob_close", JS_NewCFunction(ctx, js_blob_close, "blob_close", 2));
  
  // Set global env object
  JS_SetPropertyStr(ctx, global, "env", env);
  JS_FreeValue(ctx, global);
}

// WASI entry point stub (empty - we don't use WASI)
// This prevents WASI runtime initialization which causes imports
void _start() {}

// Include generated method exports directly (includes full C code, not just declarations)
#include "methods.c"

