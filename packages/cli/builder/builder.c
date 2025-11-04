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
#include "quickjs/quickjs-libc-min.h"
#include "quickjs/libbf.h"
#include "code.h"

// ===========================
// QuickJS Context Setup
// ===========================

static JSContext *JS_NewCustomContext(JSRuntime *rt) {
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
extern void panic_utf8(uint64_t len, uint64_t ptr);
extern void log_utf8(uint64_t len, uint64_t ptr);
extern uint64_t register_len(uint64_t register_id);
extern void read_register(uint64_t register_id, uint64_t ptr);
extern void context_id(uint64_t register_id);
extern void executor_id(uint64_t register_id);
extern void emit(uint64_t kind_len, uint64_t kind_ptr, uint64_t data_len, uint64_t data_ptr);
extern void emit_with_handler(uint64_t kind_len, uint64_t kind_ptr, uint64_t data_len, uint64_t data_ptr, uint64_t handler_len, uint64_t handler_ptr);
extern uint64_t storage_read(uint64_t key_len, uint64_t key_ptr, uint64_t register_id);
extern uint64_t storage_write(uint64_t key_len, uint64_t key_ptr, uint64_t value_len, uint64_t value_ptr, uint64_t register_id);
extern uint64_t storage_remove(uint64_t key_len, uint64_t key_ptr, uint64_t register_id);
extern void commit(uint64_t root_len, uint64_t root_ptr, uint64_t artifact_len, uint64_t artifact_ptr);
extern void time_now(uint64_t ptr);
extern uint64_t blob_create(void);
extern uint64_t blob_open(uint64_t blob_id_len, uint64_t blob_id_ptr);
extern uint64_t blob_read(uint64_t fd, uint64_t buf_len, uint64_t buf_ptr);
extern uint64_t blob_write(uint64_t fd, uint64_t data_len, uint64_t data_ptr);
extern uint64_t blob_close(uint64_t fd, uint64_t blob_id_buf_ptr);

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
  
  log_utf8(len, (uint64_t)ptr);
  return JS_UNDEFINED;
}

// Wrapper: storage_read
static JSValue js_storage_read(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t key_len;
  uint8_t *key_ptr = JSValueToUint8Array(ctx, argv[0], &key_len);
  if (!key_ptr) return JS_EXCEPTION;
  
  int64_t register_id;
  JS_ToInt64(ctx, &register_id, argv[1]);
  
  uint64_t result = storage_read(key_len, (uint64_t)key_ptr, (uint64_t)register_id);
  return JS_NewBigInt64(ctx, result);
}

// Wrapper: storage_write
static JSValue js_storage_write(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t key_len, value_len;
  uint8_t *key_ptr = JSValueToUint8Array(ctx, argv[0], &key_len);
  uint8_t *value_ptr = JSValueToUint8Array(ctx, argv[1], &value_len);
  if (!key_ptr || !value_ptr) return JS_EXCEPTION;
  
  int64_t register_id;
  JS_ToInt64(ctx, &register_id, argv[2]);
  
  uint64_t result = storage_write(key_len, (uint64_t)key_ptr, value_len, (uint64_t)value_ptr, (uint64_t)register_id);
  return JS_NewBigInt64(ctx, result);
}

// Wrapper: storage_remove
static JSValue js_storage_remove(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t key_len;
  uint8_t *key_ptr = JSValueToUint8Array(ctx, argv[0], &key_len);
  if (!key_ptr) return JS_EXCEPTION;
  
  int64_t register_id;
  JS_ToInt64(ctx, &register_id, argv[1]);
  
  uint64_t result = storage_remove(key_len, (uint64_t)key_ptr, (uint64_t)register_id);
  return JS_NewBigInt64(ctx, result);
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
  
  read_register((uint64_t)register_id, (uint64_t)buf_ptr);
  return JS_TRUE;
}

// Wrapper: emit
static JSValue js_emit(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t kind_len, data_len;
  uint8_t *kind_ptr = JSValueToUint8Array(ctx, argv[0], &kind_len);
  uint8_t *data_ptr = JSValueToUint8Array(ctx, argv[1], &data_len);
  if (!kind_ptr || !data_ptr) return JS_EXCEPTION;
  
  emit(kind_len, (uint64_t)kind_ptr, data_len, (uint64_t)data_ptr);
  return JS_UNDEFINED;
}

// Wrapper: emit_with_handler
static JSValue js_emit_with_handler(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t kind_len, data_len, handler_len;
  uint8_t *kind_ptr = JSValueToUint8Array(ctx, argv[0], &kind_len);
  uint8_t *data_ptr = JSValueToUint8Array(ctx, argv[1], &data_len);
  uint8_t *handler_ptr = JSValueToUint8Array(ctx, argv[2], &handler_len);
  if (!kind_ptr || !data_ptr || !handler_ptr) return JS_EXCEPTION;
  
  emit_with_handler(kind_len, (uint64_t)kind_ptr, data_len, (uint64_t)data_ptr, handler_len, (uint64_t)handler_ptr);
  return JS_UNDEFINED;
}

// Wrapper: commit
static JSValue js_commit(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t root_len, artifact_len;
  uint8_t *root_ptr = JSValueToUint8Array(ctx, argv[0], &root_len);
  uint8_t *artifact_ptr = JSValueToUint8Array(ctx, argv[1], &artifact_len);
  if (!root_ptr || !artifact_ptr) return JS_EXCEPTION;
  
  commit(root_len, (uint64_t)root_ptr, artifact_len, (uint64_t)artifact_ptr);
  return JS_UNDEFINED;
}

// Wrapper: time_now
static JSValue js_time_now(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t buf_len;
  uint8_t *buf_ptr = JSValueToUint8Array(ctx, argv[0], &buf_len);
  if (!buf_ptr || buf_len < 8) return JS_EXCEPTION;
  
  time_now((uint64_t)buf_ptr);
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
  
  uint64_t fd = blob_open(blob_id_len, (uint64_t)blob_id_ptr);
  return JS_NewBigInt64(ctx, fd);
}

// Wrapper: blob_read
static JSValue js_blob_read(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int64_t fd;
  JS_ToInt64(ctx, &fd, argv[0]);
  
  size_t buf_len;
  uint8_t *buf_ptr = JSValueToUint8Array(ctx, argv[1], &buf_len);
  if (!buf_ptr) return JS_EXCEPTION;
  
  uint64_t bytes_read = blob_read((uint64_t)fd, buf_len, (uint64_t)buf_ptr);
  return JS_NewBigInt64(ctx, bytes_read);
}

// Wrapper: blob_write
static JSValue js_blob_write(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int64_t fd;
  JS_ToInt64(ctx, &fd, argv[0]);
  
  size_t data_len;
  uint8_t *data_ptr = JSValueToUint8Array(ctx, argv[1], &data_len);
  if (!data_ptr) return JS_EXCEPTION;
  
  uint64_t bytes_written = blob_write((uint64_t)fd, data_len, (uint64_t)data_ptr);
  return JS_NewBigInt64(ctx, bytes_written);
}

// Wrapper: blob_close
static JSValue js_blob_close(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int64_t fd;
  JS_ToInt64(ctx, &fd, argv[0]);
  
  size_t buf_len;
  uint8_t *buf_ptr = JSValueToUint8Array(ctx, argv[1], &buf_len);
  if (!buf_ptr || buf_len < 32) return JS_EXCEPTION;
  
  uint64_t result = blob_close((uint64_t)fd, (uint64_t)buf_ptr);
  return JS_NewBool(ctx, result);
}

// ===========================
// Register Host Functions
// ===========================

static void js_add_calimero_host_functions(JSContext *ctx) {
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

// ===========================
// Method Export Macro
// ===========================

#define DEFINE_CALIMERO_METHOD(name) \
  void name() __attribute__((export_name(#name))) { \
    JSRuntime *rt = JS_NewRuntime(); \
    JSContext *ctx = JS_NewCustomContext(rt); \
    js_add_calimero_host_functions(ctx); \
    \
    JSValue mod_obj = js_load_module_binary(ctx, code, code_size); \
    JSValue fun_obj = JS_GetProperty(ctx, mod_obj, JS_NewAtom(ctx, #name)); \
    JSValue result = JS_Call(ctx, fun_obj, mod_obj, 0, NULL); \
    \
    if (JS_IsException(result)) { \
      JSValue error = JS_GetException(ctx); \
      JSValue message = JS_GetPropertyStr(ctx, error, "message"); \
      JSValue stack = JS_GetPropertyStr(ctx, error, "stack"); \
      const char *msg = JS_ToCString(ctx, message); \
      const char *stk = JS_ToCString(ctx, stack); \
      \
      size_t total_len = strlen(msg) + strlen(stk) + 2; \
      char *error_msg = malloc(total_len); \
      snprintf(error_msg, total_len, "%s\n%s", msg, stk); \
      \
      panic_utf8(total_len - 1, (uint64_t)error_msg); \
    } \
    \
    js_std_loop(ctx); \
    JS_FreeContext(ctx); \
    JS_FreeRuntime(rt); \
  }

// Include generated method exports
#include "methods.h"

