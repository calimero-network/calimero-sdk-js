#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include <stdlib.h>
#ifdef CONFIG_BIGNUM
#define JS_GetBigInt quickjs_decl_JS_GetBigInt
#endif
#include "quickjs.h"
#include "quickjs-libc-min.h"  // ADDED: For js_std_loop and module helpers (matching NEAR SDK!)
#include "libbf.h"
#include "code.h"
#include "abi.h"  // ABI manifest embedded as byte array

static void log_c_string(const char *msg);

// ------------------------------------------------------------------
// QuickJS libc stubs required by qjsc-generated code
// ------------------------------------------------------------------
int js_std_d_print(JSContext *ctx, const char *message, size_t length) {
  (void)ctx;

  if (!message) {
    log_c_string("[quickjs] js_std_d_print(null)");
    return 0;
  }

  size_t safe_len = length;
  if (safe_len == (size_t)-1) {
    safe_len = strlen(message);
  }

  char buffer[512];
  size_t copy_len = safe_len;
  if (copy_len >= sizeof(buffer)) {
    copy_len = sizeof(buffer) - 1;
  }

  memcpy(buffer, message, copy_len);
  buffer[copy_len] = '\0';

  log_c_string(buffer);
  return 0;
}

#ifdef CONFIG_BIGNUM
#undef JS_GetBigInt
static inline bf_t *calimero_get_bigint(JSValueConst val) {
  JSBigFloat *p = JS_VALUE_GET_PTR(val);
  return &p->num;
}

bf_t *JS_GetBigInt(JSValueConst val) {
  return calimero_get_bigint(val);
}

bf_t *quickjs_inline_JS_GetBigInt(JSValueConst val) {
  return calimero_get_bigint(val);
}
#endif

void calimero_js_sentinel(void) __attribute__((constructor));
void calimero_js_sentinel(void) {
  fprintf(stderr, "[sentinel] quickjs module constructor\n");
  fflush(stderr);
}

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
extern void input(uint64_t register_id);
extern uint64_t register_len(uint64_t register_id);  // Returns PtrSizedInt (u64)
extern uint32_t read_register(uint64_t register_id, uint64_t buffer_ptr);  // Returns Bool (u32)
extern void context_id(uint64_t register_id);
extern void executor_id(uint64_t register_id);
extern void emit(uint64_t event_ptr);
extern void emit_with_handler(uint64_t event_ptr, uint64_t handler_buffer_ptr);
extern void xcall(uint64_t xcall_ptr);
extern uint32_t storage_read(uint64_t key_buffer_ptr, uint64_t register_id);  // Returns Bool (u32)
extern uint32_t storage_write(uint64_t key_buffer_ptr, uint64_t value_buffer_ptr, uint64_t register_id);  // Returns Bool (u32)
extern uint32_t storage_remove(uint64_t key_buffer_ptr, uint64_t register_id);  // Returns Bool (u32)
extern int32_t js_crdt_map_new(uint64_t register_id);
extern int32_t js_crdt_map_get(uint64_t map_id_buffer_ptr, uint64_t key_buffer_ptr, uint64_t register_id);
extern int32_t js_crdt_map_insert(uint64_t map_id_buffer_ptr, uint64_t key_buffer_ptr, uint64_t value_buffer_ptr, uint64_t register_id);
extern int32_t js_crdt_map_remove(uint64_t map_id_buffer_ptr, uint64_t key_buffer_ptr, uint64_t register_id);
extern int32_t js_crdt_map_contains(uint64_t map_id_buffer_ptr, uint64_t key_buffer_ptr);
extern int32_t js_crdt_map_iter(uint64_t map_id_buffer_ptr, uint64_t register_id);
extern int32_t js_crdt_vector_new(uint64_t register_id);
extern int32_t js_crdt_vector_len(uint64_t vector_id_buffer_ptr, uint64_t register_id);
extern int32_t js_crdt_vector_push(uint64_t vector_id_buffer_ptr, uint64_t value_buffer_ptr);
extern int32_t js_crdt_vector_get(uint64_t vector_id_buffer_ptr, uint64_t index, uint64_t register_id);
extern int32_t js_crdt_vector_pop(uint64_t vector_id_buffer_ptr, uint64_t register_id);
extern int32_t js_crdt_set_new(uint64_t register_id);
extern int32_t js_crdt_set_insert(uint64_t set_id_buffer_ptr, uint64_t value_buffer_ptr);
extern int32_t js_crdt_set_contains(uint64_t set_id_buffer_ptr, uint64_t value_buffer_ptr);
extern int32_t js_crdt_set_remove(uint64_t set_id_buffer_ptr, uint64_t value_buffer_ptr);
extern int32_t js_crdt_set_len(uint64_t set_id_buffer_ptr, uint64_t register_id);
extern int32_t js_crdt_set_iter(uint64_t set_id_buffer_ptr, uint64_t register_id);
extern int32_t js_crdt_set_clear(uint64_t set_id_buffer_ptr);
extern int32_t js_crdt_lww_new(uint64_t register_id);
extern int32_t js_crdt_lww_set(uint64_t register_id_buffer_ptr, uint64_t value_buffer_ptr, uint32_t has_value);
extern int32_t js_crdt_lww_get(uint64_t register_id_buffer_ptr, uint64_t register_id);
extern int32_t js_crdt_lww_timestamp(uint64_t register_id_buffer_ptr, uint64_t register_id);
extern int32_t js_crdt_counter_new(uint64_t register_id);
extern int32_t js_crdt_counter_increment(uint64_t counter_id_buffer_ptr);
extern int32_t js_crdt_counter_value(uint64_t counter_id_buffer_ptr, uint64_t register_id);
extern int32_t js_crdt_counter_get_executor_count(uint64_t counter_id_buffer_ptr, uint64_t executor_buffer_ptr, uint32_t has_executor, uint64_t register_id);
extern int32_t js_user_storage_new(uint64_t register_id);
extern int32_t js_user_storage_insert(uint64_t storage_id_buffer_ptr, uint64_t value_buffer_ptr, uint64_t register_id);
extern int32_t js_user_storage_get(uint64_t storage_id_buffer_ptr, uint64_t register_id);
extern int32_t js_user_storage_get_for_user(uint64_t storage_id_buffer_ptr, uint64_t user_key_buffer_ptr, uint64_t register_id);
extern int32_t js_user_storage_remove(uint64_t storage_id_buffer_ptr, uint64_t register_id);
extern int32_t js_user_storage_contains(uint64_t storage_id_buffer_ptr);
extern int32_t js_user_storage_contains_user(uint64_t storage_id_buffer_ptr, uint64_t user_key_buffer_ptr);
extern int32_t js_frozen_storage_new(uint64_t register_id);
extern int32_t js_frozen_storage_add(uint64_t storage_id_buffer_ptr, uint64_t value_buffer_ptr, uint64_t register_id);
extern int32_t js_frozen_storage_get(uint64_t storage_id_buffer_ptr, uint64_t hash_buffer_ptr, uint64_t register_id);
extern int32_t js_frozen_storage_contains(uint64_t storage_id_buffer_ptr, uint64_t hash_buffer_ptr);
extern void commit(uint64_t root_hash_buffer_ptr, uint64_t artifact_buffer_ptr);
extern void persist_root_state(uint64_t doc_buffer_ptr, uint64_t created_at, uint64_t updated_at);
extern int32_t read_root_state(uint64_t register_id);
extern void apply_storage_delta(uint64_t delta_buffer_ptr);
extern int32_t flush_delta(void);
extern void time_now(uint64_t buffer_ptr);
extern void random_bytes(uint64_t buffer_ptr);
extern void value_return(uint64_t value_ptr);
extern uint64_t blob_create(void);  // Returns PtrSizedInt (u64)
extern uint64_t blob_open(uint64_t blob_id_buffer_ptr);  // Returns PtrSizedInt (u64)
extern uint64_t blob_read(uint64_t fd, uint64_t buffer_ptr);  // Returns PtrSizedInt (u64)
extern uint64_t blob_write(uint64_t fd, uint64_t data_buffer_ptr);  // Returns PtrSizedInt (u64)
extern uint32_t blob_close(uint64_t fd, uint64_t blob_id_buffer_ptr);  // Returns Bool (u32)
extern uint32_t blob_announce_to_context(uint64_t blob_id_buffer_ptr, uint64_t context_id_buffer_ptr);  // Returns Bool (u32)
extern uint32_t ed25519_verify(uint64_t signature_buffer_ptr, uint64_t public_key_buffer_ptr, uint64_t message_buffer_ptr);  // Returns Bool (u32)

// Buffer descriptor struct - MUST match calimero-sys Slice<'a, u8>
// #[repr(C)] struct with ptr: u64, len: u64, _phantom: PhantomData (zero-sized)
// Use natural C alignment, not packed
typedef struct {
  uint64_t ptr;
  uint64_t len;
} CalimeroBuffer;

static int js_to_i64(JSContext *ctx, JSValueConst value, int64_t *out) {
  if (JS_IsBigInt(ctx, value)) {
    return JS_ToBigInt64(ctx, out, value);
  }
  return JS_ToInt64(ctx, out, value);
}

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

typedef struct {
  CalimeroBuffer context_id;
  CalimeroBuffer function;
  CalimeroBuffer params;
} CalimeroXCall;

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

static void log_c_string(const char *msg) {
  if (!msg) {
    return;
  }

  size_t len = strlen(msg);
  CalimeroBuffer buf = make_buffer(msg, len);
  log_utf8((uint64_t)&buf);
}

static void calimero_log_exception(JSContext *ctx, JSValue exception, const char *stage) {
  if (stage) {
    char header[256];
    snprintf(header, sizeof(header), "[quickjs] exception stage=%s", stage);
    log_c_string(header);
  }

  if (JS_IsUndefined(exception)) {
    log_c_string("[quickjs] exception: <undefined>");
    return;
  }

  if (JS_IsNull(exception)) {
    log_c_string("[quickjs] exception: <null>");
    return;
  }

  int tag = JS_VALUE_GET_TAG(exception);
  char tag_line[128];
  snprintf(tag_line, sizeof(tag_line), "[quickjs] exception tag=%d", tag);
  log_c_string(tag_line);

  const char *message = JS_ToCString(ctx, exception);
  if (message) {
    char line[512];
    snprintf(line, sizeof(line), "[quickjs] exception: %s", message);
    log_c_string(line);
    JS_FreeCString(ctx, message);
  } else {
    log_c_string("[quickjs] exception: <non-string value>");
  }

  if (JS_IsObject(exception)) {
    JSValue message_prop = JS_GetPropertyStr(ctx, exception, "message");
    if (!JS_IsException(message_prop) && !JS_IsUndefined(message_prop) && !JS_IsNull(message_prop)) {
      const char *message_prop_str = JS_ToCString(ctx, message_prop);
      if (message_prop_str) {
        char msg_prop_line[512];
        snprintf(msg_prop_line, sizeof(msg_prop_line), "[quickjs] exception.message: %s", message_prop_str);
        log_c_string(msg_prop_line);
        JS_FreeCString(ctx, message_prop_str);
      }
    }
    JS_FreeValue(ctx, message_prop);
  }

  if (JS_IsObject(exception)) {
    JSValue stack = JS_GetPropertyStr(ctx, exception, "stack");
    if (!JS_IsException(stack) && !JS_IsUndefined(stack) && !JS_IsNull(stack)) {
      const char *stack_str = JS_ToCString(ctx, stack);
      if (stack_str) {
        char stack_line[1024];
        snprintf(stack_line, sizeof(stack_line), "[quickjs] stack: %s", stack_str);
        log_c_string(stack_line);
        JS_FreeCString(ctx, stack_str);
      }
    } else if (JS_IsException(stack)) {
      JSValue stack_exc = JS_GetException(ctx);
      const char *stack_exc_str = JS_ToCString(ctx, stack_exc);
      if (stack_exc_str) {
        char stack_err[512];
        snprintf(stack_err, sizeof(stack_err), "[quickjs] stack retrieval error: %s", stack_exc_str);
        log_c_string(stack_err);
        JS_FreeCString(ctx, stack_exc_str);
      }
      JS_FreeValue(ctx, stack_exc);
    }
    JS_FreeValue(ctx, stack);
  }
}

static void log_js_exception(JSContext *ctx, JSValue exception) {
  if (JS_IsUndefined(exception) || JS_IsNull(exception)) {
    return;
  }

  const char *message = JS_ToCString(ctx, exception);
  if (message) {
    log_c_string(message);
    JS_FreeCString(ctx, message);
  }

  JSValue stack = JS_GetPropertyStr(ctx, exception, "stack");
  if (!JS_IsException(stack)) {
    if (!JS_IsUndefined(stack) && !JS_IsNull(stack)) {
      const char *stack_str = JS_ToCString(ctx, stack);
      if (stack_str) {
        log_c_string(stack_str);
        JS_FreeCString(ctx, stack_str);
      }
    }
    JS_FreeValue(ctx, stack);
  } else {
    JSValue stack_exception = JS_GetException(ctx);
    if (!JS_IsUndefined(stack_exception) && !JS_IsNull(stack_exception)) {
      const char *stack_msg = JS_ToCString(ctx, stack_exception);
      if (stack_msg) {
        log_c_string(stack_msg);
        JS_FreeCString(ctx, stack_msg);
      }
    }
    JS_FreeValue(ctx, stack_exception);
  }
}

static void calimero_value_return_bytes(const uint8_t *data, size_t len) {
  struct {
    uint64_t discriminant;
    CalimeroBuffer buffer;
  } value_ret;

  value_ret.discriminant = 0;
  value_ret.buffer.ptr = (uint64_t)data;
  value_ret.buffer.len = (uint64_t)len;

  value_return((uint64_t)&value_ret);
}

static void calimero_panic_bytes(const uint8_t *message_ptr, size_t message_len) {
  static const char *file_str = "<js>";

  CalimeroBuffer message_buf = make_buffer(message_ptr, message_len);
  CalimeroBuffer file_buf = make_buffer(file_str, strlen(file_str));

  CalimeroLocation location = {
    .file_ptr = (uint64_t)file_buf.ptr,
    .file_len = (uint64_t)file_buf.len,
    .line = 0,
    .column = 0
  };

  panic_utf8((uint64_t)&message_buf, (uint64_t)&location);
  __builtin_unreachable();
}

static void calimero_panic_c_string(const char *message) {
  log_c_string(message);
  calimero_panic_bytes((const uint8_t *)message, strlen(message));
}

static void calimero_panic_with_exception(JSContext *ctx, JSValue exception) {
  JSValue message_val = JS_GetPropertyStr(ctx, exception, "message");
  JSValue stack_val = JS_GetPropertyStr(ctx, exception, "stack");

  size_t message_len = 0;
  const char *message_c = NULL;
  if (!JS_IsUndefined(message_val) && !JS_IsNull(message_val)) {
    message_c = JS_ToCStringLen(ctx, &message_len, message_val);
  }

  size_t stack_len = 0;
  const char *stack_c = NULL;
  if (!JS_IsUndefined(stack_val) && !JS_IsNull(stack_val)) {
    stack_c = JS_ToCStringLen(ctx, &stack_len, stack_val);
  }

  const char *fallback = "Uncaught exception";
  const char *message_only = message_c ? message_c : fallback;

  log_c_string("QuickJS exception raised");
  if (message_only) {
    log_c_string(message_only);
  }
  if (stack_c && stack_len > 0) {
    log_c_string(stack_c);
  }

  char *combined = NULL;
  if (stack_c && stack_len > 0) {
    size_t total_len = message_len + 1 + stack_len;
    combined = (char *)malloc(total_len + 1);
    if (combined) {
      memcpy(combined, message_only, message_len);
      combined[message_len] = '\n';
      memcpy(combined + message_len + 1, stack_c, stack_len);
      combined[total_len] = '\0';
      calimero_panic_c_string(combined);
    }
  }

  calimero_panic_c_string(message_only);
}
// ===========================
// Host Function Wrappers
// ===========================

static JSValue js_panic_utf8(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t message_len = 0;
  uint8_t *message_ptr = JSValueToUint8Array(ctx, argv[0], &message_len);
  if (message_ptr) {
    CalimeroBuffer log_buf = make_buffer(message_ptr, message_len);
    log_utf8((uint64_t)&log_buf);
    calimero_panic_bytes(message_ptr, message_len);
    return JS_EXCEPTION;
  }

  const char *message_c = JS_ToCString(ctx, argv[0]);
  if (!message_c) {
    return JS_EXCEPTION;
  }

  calimero_panic_c_string(message_c);
  JS_FreeCString(ctx, message_c);
  return JS_EXCEPTION;
}

static JSValue js_value_return(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "value_return expects at least one argument");
  }

  size_t value_len = 0;
  uint8_t *value_ptr = JSValueToUint8Array(ctx, argv[0], &value_len);

  if (!value_ptr) {
    JSValue json_value = JS_JSONStringify(ctx, argv[0], JS_UNDEFINED, JS_UNDEFINED);
    if (JS_IsException(json_value)) {
      return JS_EXCEPTION;
    }

    size_t json_len = 0;
    const char *json_cstr = NULL;

    if (JS_IsUndefined(json_value)) {
      static const char null_literal[] = "null";
      calimero_value_return_bytes((const uint8_t *)null_literal, sizeof(null_literal) - 1);
    } else {
      json_cstr = JS_ToCStringLen(ctx, &json_len, json_value);
      if (!json_cstr) {
        JS_FreeValue(ctx, json_value);
        return JS_EXCEPTION;
      }
      calimero_value_return_bytes((const uint8_t *)json_cstr, json_len);
      JS_FreeCString(ctx, json_cstr);
    }

    JS_FreeValue(ctx, json_value);
    return JS_UNDEFINED;
  }

  calimero_value_return_bytes(value_ptr, value_len);
  return JS_UNDEFINED;
}

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

// Wrapper: read_root_state
static JSValue js_read_root_state(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int64_t register_id;
  JS_ToInt64(ctx, &register_id, argv[0]);

  int32_t result = read_root_state((uint64_t)register_id);
  return JS_NewInt32(ctx, result);
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

static JSValue js_env_crdt_map_new(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 1) {
    JS_ThrowTypeError(ctx, "js_crdt_map_new expects register id");
    return JS_EXCEPTION;
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[0], &register_id)) {
    return JS_EXCEPTION;
  }
  int32_t status = js_crdt_map_new((uint64_t)register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_map_get(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 3) {
    JS_ThrowTypeError(ctx, "js_crdt_map_get expects mapId, key and register id");
    return JS_EXCEPTION;
  }
  size_t map_id_len;
  uint8_t *map_id_ptr = JSValueToUint8Array(ctx, argv[0], &map_id_len);
  if (!map_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_map_get: mapId must be Uint8Array");
    return JS_EXCEPTION;
  }
  size_t key_len;
  uint8_t *key_ptr = JSValueToUint8Array(ctx, argv[1], &key_len);
  if (!key_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_map_get: key must be Uint8Array");
    return JS_EXCEPTION;
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[2], &register_id)) {
    return JS_EXCEPTION;
  }
  CalimeroBuffer map_id_buf = make_buffer(map_id_ptr, map_id_len);
  CalimeroBuffer key_buf = make_buffer(key_ptr, key_len);
  int32_t status = js_crdt_map_get((uint64_t)&map_id_buf, (uint64_t)&key_buf, (uint64_t)register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_map_insert(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 4) {
    JS_ThrowTypeError(ctx, "js_crdt_map_insert expects mapId, key, value and register id");
    return JS_EXCEPTION;
  }
  size_t map_id_len;
  uint8_t *map_id_ptr = JSValueToUint8Array(ctx, argv[0], &map_id_len);
  if (!map_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_map_insert: mapId must be Uint8Array");
    return JS_EXCEPTION;
  }
  size_t key_len;
  uint8_t *key_ptr = JSValueToUint8Array(ctx, argv[1], &key_len);
  if (!key_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_map_insert: key must be Uint8Array");
    return JS_EXCEPTION;
  }
  size_t value_len;
  uint8_t *value_ptr = JSValueToUint8Array(ctx, argv[2], &value_len);
  if (!value_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_map_insert: value must be Uint8Array");
    return JS_EXCEPTION;
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[3], &register_id)) {
    return JS_EXCEPTION;
  }
  CalimeroBuffer map_id_buf = make_buffer(map_id_ptr, map_id_len);
  CalimeroBuffer key_buf = make_buffer(key_ptr, key_len);
  CalimeroBuffer value_buf = make_buffer(value_ptr, value_len);
  int32_t status = js_crdt_map_insert((uint64_t)&map_id_buf, (uint64_t)&key_buf, (uint64_t)&value_buf, (uint64_t)register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_map_remove(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 3) {
    JS_ThrowTypeError(ctx, "js_crdt_map_remove expects mapId, key and register id");
    return JS_EXCEPTION;
  }
  size_t map_id_len;
  uint8_t *map_id_ptr = JSValueToUint8Array(ctx, argv[0], &map_id_len);
  if (!map_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_map_remove: mapId must be Uint8Array");
    return JS_EXCEPTION;
  }
  size_t key_len;
  uint8_t *key_ptr = JSValueToUint8Array(ctx, argv[1], &key_len);
  if (!key_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_map_remove: key must be Uint8Array");
    return JS_EXCEPTION;
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[2], &register_id)) {
    return JS_EXCEPTION;
  }
  CalimeroBuffer map_id_buf = make_buffer(map_id_ptr, map_id_len);
  CalimeroBuffer key_buf = make_buffer(key_ptr, key_len);
  int32_t status = js_crdt_map_remove((uint64_t)&map_id_buf, (uint64_t)&key_buf, (uint64_t)register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_map_contains(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 2) {
    JS_ThrowTypeError(ctx, "js_crdt_map_contains expects mapId and key");
    return JS_EXCEPTION;
  }
  size_t map_id_len;
  uint8_t *map_id_ptr = JSValueToUint8Array(ctx, argv[0], &map_id_len);
  if (!map_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_map_contains: mapId must be Uint8Array");
    return JS_EXCEPTION;
  }
  size_t key_len;
  uint8_t *key_ptr = JSValueToUint8Array(ctx, argv[1], &key_len);
  if (!key_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_map_contains: key must be Uint8Array");
    return JS_EXCEPTION;
  }
  CalimeroBuffer map_id_buf = make_buffer(map_id_ptr, map_id_len);
  CalimeroBuffer key_buf = make_buffer(key_ptr, key_len);
  int32_t status = js_crdt_map_contains((uint64_t)&map_id_buf, (uint64_t)&key_buf);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_map_iter(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 2) {
    JS_ThrowTypeError(ctx, "js_crdt_map_iter expects mapId and register id");
    return JS_EXCEPTION;
  }

  size_t map_id_len;
  uint8_t *map_id_ptr = JSValueToUint8Array(ctx, argv[0], &map_id_len);
  if (!map_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_map_iter: mapId must be Uint8Array");
    return JS_EXCEPTION;
  }

  int64_t register_id;
  if (js_to_i64(ctx, argv[1], &register_id)) {
    return JS_EXCEPTION;
  }

  CalimeroBuffer map_id_buf = make_buffer(map_id_ptr, map_id_len);
  int32_t status = js_crdt_map_iter((uint64_t)&map_id_buf, (uint64_t)register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_vector_new(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 1) {
    JS_ThrowTypeError(ctx, "js_crdt_vector_new expects register id");
    return JS_EXCEPTION;
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[0], &register_id)) {
    return JS_EXCEPTION;
  }
  int32_t status = js_crdt_vector_new((uint64_t)register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_vector_len(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 2) {
    JS_ThrowTypeError(ctx, "js_crdt_vector_len expects vectorId and register id");
    return JS_EXCEPTION;
  }
  size_t vector_id_len;
  uint8_t *vector_id_ptr = JSValueToUint8Array(ctx, argv[0], &vector_id_len);
  if (!vector_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_vector_len: vectorId must be Uint8Array");
    return JS_EXCEPTION;
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[1], &register_id)) {
    return JS_EXCEPTION;
  }
  CalimeroBuffer vector_id_buf = make_buffer(vector_id_ptr, vector_id_len);
  int32_t status = js_crdt_vector_len((uint64_t)&vector_id_buf, (uint64_t)register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_vector_push(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 2) {
    JS_ThrowTypeError(ctx, "js_crdt_vector_push expects vectorId and value");
    return JS_EXCEPTION;
  }
  size_t vector_id_len;
  uint8_t *vector_id_ptr = JSValueToUint8Array(ctx, argv[0], &vector_id_len);
  if (!vector_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_vector_push: vectorId must be Uint8Array");
    return JS_EXCEPTION;
  }
  size_t value_len;
  uint8_t *value_ptr = JSValueToUint8Array(ctx, argv[1], &value_len);
  if (!value_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_vector_push: value must be Uint8Array");
    return JS_EXCEPTION;
  }
  CalimeroBuffer vector_id_buf = make_buffer(vector_id_ptr, vector_id_len);
  CalimeroBuffer value_buf = make_buffer(value_ptr, value_len);
  int32_t status = js_crdt_vector_push((uint64_t)&vector_id_buf, (uint64_t)&value_buf);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_vector_get(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 3) {
    JS_ThrowTypeError(ctx, "js_crdt_vector_get expects vectorId, index and register id");
    return JS_EXCEPTION;
  }
  size_t vector_id_len;
  uint8_t *vector_id_ptr = JSValueToUint8Array(ctx, argv[0], &vector_id_len);
  if (!vector_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_vector_get: vectorId must be Uint8Array");
    return JS_EXCEPTION;
  }
  uint64_t index;
  if (JS_ToIndex(ctx, &index, argv[1])) {
    return JS_EXCEPTION;
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[2], &register_id)) {
    return JS_EXCEPTION;
  }
  CalimeroBuffer vector_id_buf = make_buffer(vector_id_ptr, vector_id_len);
  int32_t status = js_crdt_vector_get((uint64_t)&vector_id_buf, index, (uint64_t)register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_vector_pop(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 2) {
    JS_ThrowTypeError(ctx, "js_crdt_vector_pop expects vectorId and register id");
    return JS_EXCEPTION;
  }
  size_t vector_id_len;
  uint8_t *vector_id_ptr = JSValueToUint8Array(ctx, argv[0], &vector_id_len);
  if (!vector_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_vector_pop: vectorId must be Uint8Array");
    return JS_EXCEPTION;
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[1], &register_id)) {
    return JS_EXCEPTION;
  }
  CalimeroBuffer vector_id_buf = make_buffer(vector_id_ptr, vector_id_len);
  int32_t status = js_crdt_vector_pop((uint64_t)&vector_id_buf, (uint64_t)register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_set_new(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 1) {
    JS_ThrowTypeError(ctx, "js_crdt_set_new expects register id");
    return JS_EXCEPTION;
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[0], &register_id)) {
    return JS_EXCEPTION;
  }
  int32_t status = js_crdt_set_new((uint64_t)register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_set_insert(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 2) {
    JS_ThrowTypeError(ctx, "js_crdt_set_insert expects setId and value");
    return JS_EXCEPTION;
  }
  size_t set_id_len;
  uint8_t *set_id_ptr = JSValueToUint8Array(ctx, argv[0], &set_id_len);
  if (!set_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_set_insert: setId must be Uint8Array");
    return JS_EXCEPTION;
  }
  size_t value_len;
  uint8_t *value_ptr = JSValueToUint8Array(ctx, argv[1], &value_len);
  if (!value_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_set_insert: value must be Uint8Array");
    return JS_EXCEPTION;
  }
  CalimeroBuffer set_id_buf = make_buffer(set_id_ptr, set_id_len);
  CalimeroBuffer value_buf = make_buffer(value_ptr, value_len);
  int32_t status = js_crdt_set_insert((uint64_t)&set_id_buf, (uint64_t)&value_buf);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_set_contains(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 2) {
    JS_ThrowTypeError(ctx, "js_crdt_set_contains expects setId and value");
    return JS_EXCEPTION;
  }
  size_t set_id_len;
  uint8_t *set_id_ptr = JSValueToUint8Array(ctx, argv[0], &set_id_len);
  if (!set_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_set_contains: setId must be Uint8Array");
    return JS_EXCEPTION;
  }
  size_t value_len;
  uint8_t *value_ptr = JSValueToUint8Array(ctx, argv[1], &value_len);
  if (!value_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_set_contains: value must be Uint8Array");
    return JS_EXCEPTION;
  }
  CalimeroBuffer set_id_buf = make_buffer(set_id_ptr, set_id_len);
  CalimeroBuffer value_buf = make_buffer(value_ptr, value_len);
  int32_t status = js_crdt_set_contains((uint64_t)&set_id_buf, (uint64_t)&value_buf);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_set_remove(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 2) {
    JS_ThrowTypeError(ctx, "js_crdt_set_remove expects setId and value");
    return JS_EXCEPTION;
  }
  size_t set_id_len;
  uint8_t *set_id_ptr = JSValueToUint8Array(ctx, argv[0], &set_id_len);
  if (!set_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_set_remove: setId must be Uint8Array");
    return JS_EXCEPTION;
  }
  size_t value_len;
  uint8_t *value_ptr = JSValueToUint8Array(ctx, argv[1], &value_len);
  if (!value_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_set_remove: value must be Uint8Array");
    return JS_EXCEPTION;
  }
  CalimeroBuffer set_id_buf = make_buffer(set_id_ptr, set_id_len);
  CalimeroBuffer value_buf = make_buffer(value_ptr, value_len);
  int32_t status = js_crdt_set_remove((uint64_t)&set_id_buf, (uint64_t)&value_buf);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_set_len(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 2) {
    JS_ThrowTypeError(ctx, "js_crdt_set_len expects setId and register id");
    return JS_EXCEPTION;
  }
  size_t set_id_len;
  uint8_t *set_id_ptr = JSValueToUint8Array(ctx, argv[0], &set_id_len);
  if (!set_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_set_len: setId must be Uint8Array");
    return JS_EXCEPTION;
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[1], &register_id)) {
    return JS_EXCEPTION;
  }
  CalimeroBuffer set_id_buf = make_buffer(set_id_ptr, set_id_len);
  int32_t status = js_crdt_set_len((uint64_t)&set_id_buf, (uint64_t)register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_set_iter(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 2) {
    JS_ThrowTypeError(ctx, "js_crdt_set_iter expects setId and register id");
    return JS_EXCEPTION;
  }

  size_t set_id_len;
  uint8_t *set_id_ptr = JSValueToUint8Array(ctx, argv[0], &set_id_len);
  if (!set_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_set_iter: setId must be Uint8Array");
    return JS_EXCEPTION;
  }

  int64_t register_id;
  if (js_to_i64(ctx, argv[1], &register_id)) {
    return JS_EXCEPTION;
  }

  CalimeroBuffer set_id_buf = make_buffer(set_id_ptr, set_id_len);
  int32_t status = js_crdt_set_iter((uint64_t)&set_id_buf, (uint64_t)register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_set_clear(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 1) {
    JS_ThrowTypeError(ctx, "js_crdt_set_clear expects setId");
    return JS_EXCEPTION;
  }
  size_t set_id_len;
  uint8_t *set_id_ptr = JSValueToUint8Array(ctx, argv[0], &set_id_len);
  if (!set_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_set_clear: setId must be Uint8Array");
    return JS_EXCEPTION;
  }
  CalimeroBuffer set_id_buf = make_buffer(set_id_ptr, set_id_len);
  int32_t status = js_crdt_set_clear((uint64_t)&set_id_buf);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_lww_new(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 1) {
    JS_ThrowTypeError(ctx, "js_crdt_lww_new expects register id");
    return JS_EXCEPTION;
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[0], &register_id)) {
    return JS_EXCEPTION;
  }
  int32_t status = js_crdt_lww_new((uint64_t)register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_lww_set(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 2) {
    JS_ThrowTypeError(ctx, "js_crdt_lww_set expects registerId and value");
    return JS_EXCEPTION;
  }
  size_t register_id_len;
  uint8_t *register_id_ptr = JSValueToUint8Array(ctx, argv[0], &register_id_len);
  if (!register_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_lww_set: registerId must be Uint8Array");
    return JS_EXCEPTION;
  }
  uint32_t has_value = 0;
  CalimeroBuffer value_buf = make_buffer(NULL, 0);
  if (!JS_IsNull(argv[1]) && !JS_IsUndefined(argv[1])) {
    size_t value_len;
    uint8_t *value_ptr = JSValueToUint8Array(ctx, argv[1], &value_len);
    if (!value_ptr) {
      JS_ThrowTypeError(ctx, "js_crdt_lww_set: value must be Uint8Array or null");
      return JS_EXCEPTION;
    }
    value_buf = make_buffer(value_ptr, value_len);
    has_value = 1;
  }
  CalimeroBuffer register_id_buf = make_buffer(register_id_ptr, register_id_len);
  int32_t status = js_crdt_lww_set((uint64_t)&register_id_buf, (uint64_t)&value_buf, has_value);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_lww_get(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 2) {
    JS_ThrowTypeError(ctx, "js_crdt_lww_get expects registerId and destination register id");
    return JS_EXCEPTION;
  }
  size_t register_id_len;
  uint8_t *register_id_ptr = JSValueToUint8Array(ctx, argv[0], &register_id_len);
  if (!register_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_lww_get: registerId must be Uint8Array");
    return JS_EXCEPTION;
  }
  int64_t dest_register_id;
  if (js_to_i64(ctx, argv[1], &dest_register_id)) {
    return JS_EXCEPTION;
  }
  CalimeroBuffer register_id_buf = make_buffer(register_id_ptr, register_id_len);
  int32_t status = js_crdt_lww_get((uint64_t)&register_id_buf, (uint64_t)dest_register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_lww_timestamp(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 2) {
    JS_ThrowTypeError(ctx, "js_crdt_lww_timestamp expects registerId and destination register id");
    return JS_EXCEPTION;
  }
  size_t register_id_len;
  uint8_t *register_id_ptr = JSValueToUint8Array(ctx, argv[0], &register_id_len);
  if (!register_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_lww_timestamp: registerId must be Uint8Array");
    return JS_EXCEPTION;
  }
  int64_t dest_register_id;
  if (js_to_i64(ctx, argv[1], &dest_register_id)) {
    return JS_EXCEPTION;
  }
  CalimeroBuffer register_id_buf = make_buffer(register_id_ptr, register_id_len);
  int32_t status = js_crdt_lww_timestamp((uint64_t)&register_id_buf, (uint64_t)dest_register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_counter_new(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 1) {
    JS_ThrowTypeError(ctx, "js_crdt_counter_new expects register id");
    return JS_EXCEPTION;
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[0], &register_id)) {
    return JS_EXCEPTION;
  }
  int32_t status = js_crdt_counter_new((uint64_t)register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_counter_increment(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 1) {
    JS_ThrowTypeError(ctx, "js_crdt_counter_increment expects counter id");
    return JS_EXCEPTION;
  }
  size_t counter_id_len;
  uint8_t *counter_id_ptr = JSValueToUint8Array(ctx, argv[0], &counter_id_len);
  if (!counter_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_counter_increment: counterId must be Uint8Array");
    return JS_EXCEPTION;
  }
  CalimeroBuffer counter_id_buf = make_buffer(counter_id_ptr, counter_id_len);
  int32_t status = js_crdt_counter_increment((uint64_t)&counter_id_buf);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_counter_value(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 2) {
    JS_ThrowTypeError(ctx, "js_crdt_counter_value expects counterId and register id");
    return JS_EXCEPTION;
  }
  size_t counter_id_len;
  uint8_t *counter_id_ptr = JSValueToUint8Array(ctx, argv[0], &counter_id_len);
  if (!counter_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_counter_value: counterId must be Uint8Array");
    return JS_EXCEPTION;
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[1], &register_id)) {
    return JS_EXCEPTION;
  }
  CalimeroBuffer counter_id_buf = make_buffer(counter_id_ptr, counter_id_len);
  int32_t status = js_crdt_counter_value((uint64_t)&counter_id_buf, (uint64_t)register_id);
  return JS_NewInt32(ctx, status);
}

static JSValue js_env_crdt_counter_get_executor_count(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 2) {
    JS_ThrowTypeError(ctx, "js_crdt_counter_get_executor_count expects counterId and register id");
    return JS_EXCEPTION;
  }
  size_t counter_id_len;
  uint8_t *counter_id_ptr = JSValueToUint8Array(ctx, argv[0], &counter_id_len);
  if (!counter_id_ptr) {
    JS_ThrowTypeError(ctx, "js_crdt_counter_get_executor_count: counterId must be Uint8Array");
    return JS_EXCEPTION;
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[1], &register_id)) {
    return JS_EXCEPTION;
  }
  uint32_t has_executor = 0;
  CalimeroBuffer executor_buf = make_buffer(NULL, 0);
  if (argc >= 3 && !JS_IsNull(argv[2]) && !JS_IsUndefined(argv[2])) {
    size_t executor_len;
    uint8_t *executor_ptr = JSValueToUint8Array(ctx, argv[2], &executor_len);
    if (!executor_ptr) {
      JS_ThrowTypeError(ctx, "js_crdt_counter_get_executor_count: executorId must be Uint8Array");
      return JS_EXCEPTION;
    }
    executor_buf = make_buffer(executor_ptr, executor_len);
    has_executor = 1;
  }
  CalimeroBuffer counter_id_buf = make_buffer(counter_id_ptr, counter_id_len);
  int32_t status = js_crdt_counter_get_executor_count(
    (uint64_t)&counter_id_buf,
    (uint64_t)&executor_buf,
    has_executor,
    (uint64_t)register_id
  );
  return JS_NewInt32(ctx, status);
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

// Wrapper: input
static JSValue js_input(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int64_t register_id = 0;
  if (argc > 0) {
    JS_ToInt64(ctx, &register_id, argv[0]);
  }
  input((uint64_t)register_id);
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

// Wrapper: xcall
static JSValue js_xcall(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;

  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "xcall expects contextId and function name bytes");
  }

  size_t context_len;
  uint8_t *context_ptr = JSValueToUint8Array(ctx, argv[0], &context_len);
  if (!context_ptr) {
    return JS_EXCEPTION;
  }
  if (context_len != 32) {
    return JS_ThrowRangeError(ctx, "contextId must be 32 bytes");
  }

  size_t function_len;
  uint8_t *function_ptr = JSValueToUint8Array(ctx, argv[1], &function_len);
  if (!function_ptr) {
    return JS_EXCEPTION;
  }

  size_t params_len = 0;
  uint8_t *params_ptr = NULL;
  if (argc >= 3 && !JS_IsUndefined(argv[2]) && !JS_IsNull(argv[2])) {
    params_ptr = JSValueToUint8Array(ctx, argv[2], &params_len);
    if (!params_ptr) {
      return JS_EXCEPTION;
    }
  }

  CalimeroXCall call = {
    .context_id = make_buffer(context_ptr, context_len),
    .function = make_buffer(function_ptr, function_len),
    .params = make_buffer(params_ptr, params_len)
  };

  xcall((uint64_t)&call);
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

// Wrapper: persist_root_state
static JSValue js_persist_root_state(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;

  if (argc < 3) {
    return JS_ThrowTypeError(ctx, "persist_root_state expects 3 arguments");
  }

  size_t doc_len;
  uint8_t *doc_ptr = JSValueToUint8Array(ctx, argv[0], &doc_len);
  if (!doc_ptr) {
    return JS_EXCEPTION;
  }

  int64_t created_at = 0;
  int64_t updated_at = 0;

  if (JS_ToInt64(ctx, &created_at, argv[1]) < 0) {
    return JS_EXCEPTION;
  }

  if (JS_ToInt64(ctx, &updated_at, argv[2]) < 0) {
    return JS_EXCEPTION;
  }

  CalimeroBuffer doc_buf = make_buffer(doc_ptr, doc_len);
  persist_root_state((uint64_t)&doc_buf, (uint64_t)created_at, (uint64_t)updated_at);
  return JS_UNDEFINED;
}

// Wrapper: apply_storage_delta
static JSValue js_apply_storage_delta(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;

  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "apply_storage_delta expects a single Uint8Array argument");
  }

  size_t delta_len;
  uint8_t *delta_ptr = JSValueToUint8Array(ctx, argv[0], &delta_len);
  if (!delta_ptr) {
    return JS_EXCEPTION;
  }

  CalimeroBuffer delta_buf = make_buffer(delta_ptr, delta_len);
  apply_storage_delta((uint64_t)&delta_buf);
  return JS_UNDEFINED;
}

// Wrapper: flush_delta
static JSValue js_flush_delta(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  (void)argc;
  (void)argv;
  int32_t emitted = flush_delta();
  return JS_NewInt32(ctx, emitted);
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

// Wrapper: random_bytes
static JSValue js_random_bytes(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  size_t buf_len;
  uint8_t *buf_ptr = JSValueToUint8Array(ctx, argv[0], &buf_len);
  if (!buf_ptr) return JS_EXCEPTION;

  CalimeroBuffer buf = make_buffer(buf_ptr, buf_len);
  random_bytes((uint64_t)&buf);
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

// Wrapper: blob_announce_to_context
static JSValue js_blob_announce_to_context(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "blob_announce_to_context expects blobId and contextId");
  }

  size_t blob_id_len;
  uint8_t *blob_id_ptr = JSValueToUint8Array(ctx, argv[0], &blob_id_len);
  if (!blob_id_ptr) {
    return JS_EXCEPTION;
  }
  if (blob_id_len != 32) {
    return JS_ThrowRangeError(ctx, "blobId must be 32 bytes");
  }

  size_t context_id_len;
  uint8_t *context_id_ptr = JSValueToUint8Array(ctx, argv[1], &context_id_len);
  if (!context_id_ptr) {
    return JS_EXCEPTION;
  }
  if (context_id_len != 32) {
    return JS_ThrowRangeError(ctx, "contextId must be 32 bytes");
  }

  CalimeroBuffer blob_id_buf = make_buffer(blob_id_ptr, blob_id_len);
  CalimeroBuffer context_id_buf = make_buffer(context_id_ptr, context_id_len);

  uint32_t result = blob_announce_to_context((uint64_t)&blob_id_buf, (uint64_t)&context_id_buf);
  return JS_NewUint32(ctx, result);
}

// Wrapper: js_user_storage_new
static JSValue js_env_user_storage_new(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "js_user_storage_new expects register_id");
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[0], &register_id) < 0) {
    return JS_EXCEPTION;
  }
  int32_t result = js_user_storage_new((uint64_t)register_id);
  return JS_NewInt32(ctx, result);
}

// Wrapper: js_user_storage_insert
static JSValue js_env_user_storage_insert(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (argc < 3) {
    return JS_ThrowTypeError(ctx, "js_user_storage_insert expects storageId, value, and register_id");
  }
  size_t storage_id_len;
  uint8_t *storage_id_ptr = JSValueToUint8Array(ctx, argv[0], &storage_id_len);
  if (!storage_id_ptr || storage_id_len != 32) {
    return JS_ThrowRangeError(ctx, "storageId must be 32 bytes");
  }
  size_t value_len;
  uint8_t *value_ptr = JSValueToUint8Array(ctx, argv[1], &value_len);
  if (!value_ptr) {
    return JS_EXCEPTION;
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[2], &register_id) < 0) {
    return JS_EXCEPTION;
  }
  CalimeroBuffer storage_id_buf = make_buffer(storage_id_ptr, storage_id_len);
  CalimeroBuffer value_buf = make_buffer(value_ptr, value_len);
  int32_t result = js_user_storage_insert((uint64_t)&storage_id_buf, (uint64_t)&value_buf, (uint64_t)register_id);
  return JS_NewInt32(ctx, result);
}

// Wrapper: js_user_storage_get
static JSValue js_env_user_storage_get(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "js_user_storage_get expects storageId and register_id");
  }
  size_t storage_id_len;
  uint8_t *storage_id_ptr = JSValueToUint8Array(ctx, argv[0], &storage_id_len);
  if (!storage_id_ptr || storage_id_len != 32) {
    return JS_ThrowRangeError(ctx, "storageId must be 32 bytes");
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[1], &register_id) < 0) {
    return JS_EXCEPTION;
  }
  CalimeroBuffer storage_id_buf = make_buffer(storage_id_ptr, storage_id_len);
  int32_t result = js_user_storage_get((uint64_t)&storage_id_buf, (uint64_t)register_id);
  return JS_NewInt32(ctx, result);
}

// Wrapper: js_user_storage_get_for_user
static JSValue js_env_user_storage_get_for_user(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (argc < 3) {
    return JS_ThrowTypeError(ctx, "js_user_storage_get_for_user expects storageId, userKey, and register_id");
  }
  size_t storage_id_len;
  uint8_t *storage_id_ptr = JSValueToUint8Array(ctx, argv[0], &storage_id_len);
  if (!storage_id_ptr || storage_id_len != 32) {
    return JS_ThrowRangeError(ctx, "storageId must be 32 bytes");
  }
  size_t user_key_len;
  uint8_t *user_key_ptr = JSValueToUint8Array(ctx, argv[1], &user_key_len);
  if (!user_key_ptr || user_key_len != 32) {
    return JS_ThrowRangeError(ctx, "userKey must be 32 bytes");
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[2], &register_id) < 0) {
    return JS_EXCEPTION;
  }
  CalimeroBuffer storage_id_buf = make_buffer(storage_id_ptr, storage_id_len);
  CalimeroBuffer user_key_buf = make_buffer(user_key_ptr, user_key_len);
  int32_t result = js_user_storage_get_for_user((uint64_t)&storage_id_buf, (uint64_t)&user_key_buf, (uint64_t)register_id);
  return JS_NewInt32(ctx, result);
}

// Wrapper: js_user_storage_remove
static JSValue js_env_user_storage_remove(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "js_user_storage_remove expects storageId and register_id");
  }
  size_t storage_id_len;
  uint8_t *storage_id_ptr = JSValueToUint8Array(ctx, argv[0], &storage_id_len);
  if (!storage_id_ptr || storage_id_len != 32) {
    return JS_ThrowRangeError(ctx, "storageId must be 32 bytes");
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[1], &register_id) < 0) {
    return JS_EXCEPTION;
  }
  CalimeroBuffer storage_id_buf = make_buffer(storage_id_ptr, storage_id_len);
  int32_t result = js_user_storage_remove((uint64_t)&storage_id_buf, (uint64_t)register_id);
  return JS_NewInt32(ctx, result);
}

// Wrapper: js_user_storage_contains
static JSValue js_env_user_storage_contains(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "js_user_storage_contains expects storageId");
  }
  size_t storage_id_len;
  uint8_t *storage_id_ptr = JSValueToUint8Array(ctx, argv[0], &storage_id_len);
  if (!storage_id_ptr || storage_id_len != 32) {
    return JS_ThrowRangeError(ctx, "storageId must be 32 bytes");
  }
  CalimeroBuffer storage_id_buf = make_buffer(storage_id_ptr, storage_id_len);
  int32_t result = js_user_storage_contains((uint64_t)&storage_id_buf);
  return JS_NewInt32(ctx, result);
}

// Wrapper: js_user_storage_contains_user
static JSValue js_env_user_storage_contains_user(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "js_user_storage_contains_user expects storageId and userKey");
  }
  size_t storage_id_len;
  uint8_t *storage_id_ptr = JSValueToUint8Array(ctx, argv[0], &storage_id_len);
  if (!storage_id_ptr || storage_id_len != 32) {
    return JS_ThrowRangeError(ctx, "storageId must be 32 bytes");
  }
  size_t user_key_len;
  uint8_t *user_key_ptr = JSValueToUint8Array(ctx, argv[1], &user_key_len);
  if (!user_key_ptr || user_key_len != 32) {
    return JS_ThrowRangeError(ctx, "userKey must be 32 bytes");
  }
  CalimeroBuffer storage_id_buf = make_buffer(storage_id_ptr, storage_id_len);
  CalimeroBuffer user_key_buf = make_buffer(user_key_ptr, user_key_len);
  int32_t result = js_user_storage_contains_user((uint64_t)&storage_id_buf, (uint64_t)&user_key_buf);
  return JS_NewInt32(ctx, result);
}

// Wrapper: js_frozen_storage_new
static JSValue js_env_frozen_storage_new(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (argc < 1) {
    return JS_ThrowTypeError(ctx, "js_frozen_storage_new expects register_id");
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[0], &register_id) < 0) {
    return JS_EXCEPTION;
  }
  int32_t result = js_frozen_storage_new((uint64_t)register_id);
  return JS_NewInt32(ctx, result);
}

// Wrapper: js_frozen_storage_add
static JSValue js_env_frozen_storage_add(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (argc < 3) {
    return JS_ThrowTypeError(ctx, "js_frozen_storage_add expects storageId, value, and register_id");
  }
  size_t storage_id_len;
  uint8_t *storage_id_ptr = JSValueToUint8Array(ctx, argv[0], &storage_id_len);
  if (!storage_id_ptr || storage_id_len != 32) {
    return JS_ThrowRangeError(ctx, "storageId must be 32 bytes");
  }
  size_t value_len;
  uint8_t *value_ptr = JSValueToUint8Array(ctx, argv[1], &value_len);
  if (!value_ptr) {
    return JS_EXCEPTION;
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[2], &register_id) < 0) {
    return JS_EXCEPTION;
  }
  CalimeroBuffer storage_id_buf = make_buffer(storage_id_ptr, storage_id_len);
  CalimeroBuffer value_buf = make_buffer(value_ptr, value_len);
  int32_t result = js_frozen_storage_add((uint64_t)&storage_id_buf, (uint64_t)&value_buf, (uint64_t)register_id);
  return JS_NewInt32(ctx, result);
}

// Wrapper: js_frozen_storage_get
static JSValue js_env_frozen_storage_get(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (argc < 3) {
    return JS_ThrowTypeError(ctx, "js_frozen_storage_get expects storageId, hash, and register_id");
  }
  size_t storage_id_len;
  uint8_t *storage_id_ptr = JSValueToUint8Array(ctx, argv[0], &storage_id_len);
  if (!storage_id_ptr || storage_id_len != 32) {
    return JS_ThrowRangeError(ctx, "storageId must be 32 bytes");
  }
  size_t hash_len;
  uint8_t *hash_ptr = JSValueToUint8Array(ctx, argv[1], &hash_len);
  if (!hash_ptr || hash_len != 32) {
    return JS_ThrowRangeError(ctx, "hash must be 32 bytes");
  }
  int64_t register_id;
  if (js_to_i64(ctx, argv[2], &register_id) < 0) {
    return JS_EXCEPTION;
  }
  CalimeroBuffer storage_id_buf = make_buffer(storage_id_ptr, storage_id_len);
  CalimeroBuffer hash_buf = make_buffer(hash_ptr, hash_len);
  int32_t result = js_frozen_storage_get((uint64_t)&storage_id_buf, (uint64_t)&hash_buf, (uint64_t)register_id);
  return JS_NewInt32(ctx, result);
}

// Wrapper: js_frozen_storage_contains
static JSValue js_env_frozen_storage_contains(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  (void)this_val;
  if (argc < 2) {
    return JS_ThrowTypeError(ctx, "js_frozen_storage_contains expects storageId and hash");
  }
  size_t storage_id_len;
  uint8_t *storage_id_ptr = JSValueToUint8Array(ctx, argv[0], &storage_id_len);
  if (!storage_id_ptr || storage_id_len != 32) {
    return JS_ThrowRangeError(ctx, "storageId must be 32 bytes");
  }
  size_t hash_len;
  uint8_t *hash_ptr = JSValueToUint8Array(ctx, argv[1], &hash_len);
  if (!hash_ptr || hash_len != 32) {
    return JS_ThrowRangeError(ctx, "hash must be 32 bytes");
  }
  CalimeroBuffer storage_id_buf = make_buffer(storage_id_ptr, storage_id_len);
  CalimeroBuffer hash_buf = make_buffer(hash_ptr, hash_len);
  int32_t result = js_frozen_storage_contains((uint64_t)&storage_id_buf, (uint64_t)&hash_buf);
  return JS_NewInt32(ctx, result);
}

// Wrapper: ed25519_verify
static JSValue js_ed25519_verify(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  if (argc < 3) {
    return JS_ThrowTypeError(ctx, "ed25519_verify expects signature, public_key, and message");
  }

  size_t signature_len;
  uint8_t *signature_ptr = JSValueToUint8Array(ctx, argv[0], &signature_len);
  if (!signature_ptr) {
    return JS_ThrowTypeError(ctx, "ed25519_verify: signature must be Uint8Array");
  }
  if (signature_len != 64) {
    return JS_ThrowRangeError(ctx, "ed25519_verify: signature must be 64 bytes");
  }

  size_t public_key_len;
  uint8_t *public_key_ptr = JSValueToUint8Array(ctx, argv[1], &public_key_len);
  if (!public_key_ptr) {
    return JS_ThrowTypeError(ctx, "ed25519_verify: public_key must be Uint8Array");
  }
  if (public_key_len != 32) {
    return JS_ThrowRangeError(ctx, "ed25519_verify: public_key must be 32 bytes");
  }

  size_t message_len;
  uint8_t *message_ptr = JSValueToUint8Array(ctx, argv[2], &message_len);
  if (!message_ptr) {
    return JS_ThrowTypeError(ctx, "ed25519_verify: message must be Uint8Array");
  }

  CalimeroBuffer signature_buf = make_buffer(signature_ptr, signature_len);
  CalimeroBuffer public_key_buf = make_buffer(public_key_ptr, public_key_len);
  CalimeroBuffer message_buf = make_buffer(message_ptr, message_len);

  uint32_t result = ed25519_verify((uint64_t)&signature_buf, (uint64_t)&public_key_buf, (uint64_t)&message_buf);
  return JS_NewBool(ctx, result);
}

// ===========================
// Register Host Functions
// ===========================

// Not static - needed by methods.c
void js_add_calimero_host_functions(JSContext *ctx) {
  JSValue global = JS_GetGlobalObject(ctx);
  JSValue env = JS_NewObject(ctx);
  
  // Panic
  JS_SetPropertyStr(ctx, env, "panic_utf8", JS_NewCFunction(ctx, js_panic_utf8, "panic_utf8", 1));

  // Logging
  JS_SetPropertyStr(ctx, env, "log_utf8", JS_NewCFunction(ctx, js_log_utf8, "log_utf8", 1));
  JS_SetPropertyStr(ctx, env, "value_return", JS_NewCFunction(ctx, js_value_return, "value_return", 1));
  
  // Storage
  JS_SetPropertyStr(ctx, env, "storage_read", JS_NewCFunction(ctx, js_storage_read, "storage_read", 2));
  JS_SetPropertyStr(ctx, env, "storage_write", JS_NewCFunction(ctx, js_storage_write, "storage_write", 3));
  JS_SetPropertyStr(ctx, env, "storage_remove", JS_NewCFunction(ctx, js_storage_remove, "storage_remove", 2));
  JS_SetPropertyStr(ctx, env, "js_crdt_map_new", JS_NewCFunction(ctx, js_env_crdt_map_new, "js_crdt_map_new", 1));
  JS_SetPropertyStr(ctx, env, "js_crdt_map_get", JS_NewCFunction(ctx, js_env_crdt_map_get, "js_crdt_map_get", 3));
  JS_SetPropertyStr(ctx, env, "js_crdt_map_insert", JS_NewCFunction(ctx, js_env_crdt_map_insert, "js_crdt_map_insert", 4));
  JS_SetPropertyStr(ctx, env, "js_crdt_map_remove", JS_NewCFunction(ctx, js_env_crdt_map_remove, "js_crdt_map_remove", 3));
  JS_SetPropertyStr(ctx, env, "js_crdt_map_contains", JS_NewCFunction(ctx, js_env_crdt_map_contains, "js_crdt_map_contains", 2));
  JS_SetPropertyStr(ctx, env, "js_crdt_map_iter", JS_NewCFunction(ctx, js_env_crdt_map_iter, "js_crdt_map_iter", 2));
  JS_SetPropertyStr(ctx, env, "js_crdt_vector_new", JS_NewCFunction(ctx, js_env_crdt_vector_new, "js_crdt_vector_new", 1));
  JS_SetPropertyStr(ctx, env, "js_crdt_vector_len", JS_NewCFunction(ctx, js_env_crdt_vector_len, "js_crdt_vector_len", 2));
  JS_SetPropertyStr(ctx, env, "js_crdt_vector_push", JS_NewCFunction(ctx, js_env_crdt_vector_push, "js_crdt_vector_push", 2));
  JS_SetPropertyStr(ctx, env, "js_crdt_vector_get", JS_NewCFunction(ctx, js_env_crdt_vector_get, "js_crdt_vector_get", 3));
  JS_SetPropertyStr(ctx, env, "js_crdt_vector_pop", JS_NewCFunction(ctx, js_env_crdt_vector_pop, "js_crdt_vector_pop", 2));
  JS_SetPropertyStr(ctx, env, "js_crdt_set_new", JS_NewCFunction(ctx, js_env_crdt_set_new, "js_crdt_set_new", 1));
  JS_SetPropertyStr(ctx, env, "js_crdt_set_insert", JS_NewCFunction(ctx, js_env_crdt_set_insert, "js_crdt_set_insert", 2));
  JS_SetPropertyStr(ctx, env, "js_crdt_set_contains", JS_NewCFunction(ctx, js_env_crdt_set_contains, "js_crdt_set_contains", 2));
  JS_SetPropertyStr(ctx, env, "js_crdt_set_remove", JS_NewCFunction(ctx, js_env_crdt_set_remove, "js_crdt_set_remove", 2));
  JS_SetPropertyStr(ctx, env, "js_crdt_set_len", JS_NewCFunction(ctx, js_env_crdt_set_len, "js_crdt_set_len", 2));
  JS_SetPropertyStr(ctx, env, "js_crdt_set_iter", JS_NewCFunction(ctx, js_env_crdt_set_iter, "js_crdt_set_iter", 2));
  JS_SetPropertyStr(ctx, env, "js_crdt_set_clear", JS_NewCFunction(ctx, js_env_crdt_set_clear, "js_crdt_set_clear", 1));
  JS_SetPropertyStr(ctx, env, "js_crdt_lww_new", JS_NewCFunction(ctx, js_env_crdt_lww_new, "js_crdt_lww_new", 1));
  JS_SetPropertyStr(ctx, env, "js_crdt_lww_set", JS_NewCFunction(ctx, js_env_crdt_lww_set, "js_crdt_lww_set", 2));
  JS_SetPropertyStr(ctx, env, "js_crdt_lww_get", JS_NewCFunction(ctx, js_env_crdt_lww_get, "js_crdt_lww_get", 2));
  JS_SetPropertyStr(ctx, env, "js_crdt_lww_timestamp", JS_NewCFunction(ctx, js_env_crdt_lww_timestamp, "js_crdt_lww_timestamp", 2));
  JS_SetPropertyStr(ctx, env, "js_crdt_counter_new", JS_NewCFunction(ctx, js_env_crdt_counter_new, "js_crdt_counter_new", 1));
  JS_SetPropertyStr(ctx, env, "js_crdt_counter_increment", JS_NewCFunction(ctx, js_env_crdt_counter_increment, "js_crdt_counter_increment", 1));
  JS_SetPropertyStr(ctx, env, "js_crdt_counter_value", JS_NewCFunction(ctx, js_env_crdt_counter_value, "js_crdt_counter_value", 2));
  JS_SetPropertyStr(ctx, env, "js_crdt_counter_get_executor_count", JS_NewCFunction(ctx, js_env_crdt_counter_get_executor_count, "js_crdt_counter_get_executor_count", 3));
  JS_SetPropertyStr(ctx, env, "js_user_storage_new", JS_NewCFunction(ctx, js_env_user_storage_new, "js_user_storage_new", 1));
  JS_SetPropertyStr(ctx, env, "js_user_storage_insert", JS_NewCFunction(ctx, js_env_user_storage_insert, "js_user_storage_insert", 3));
  JS_SetPropertyStr(ctx, env, "js_user_storage_get", JS_NewCFunction(ctx, js_env_user_storage_get, "js_user_storage_get", 2));
  JS_SetPropertyStr(ctx, env, "js_user_storage_get_for_user", JS_NewCFunction(ctx, js_env_user_storage_get_for_user, "js_user_storage_get_for_user", 3));
  JS_SetPropertyStr(ctx, env, "js_user_storage_remove", JS_NewCFunction(ctx, js_env_user_storage_remove, "js_user_storage_remove", 2));
  JS_SetPropertyStr(ctx, env, "js_user_storage_contains", JS_NewCFunction(ctx, js_env_user_storage_contains, "js_user_storage_contains", 1));
  JS_SetPropertyStr(ctx, env, "js_user_storage_contains_user", JS_NewCFunction(ctx, js_env_user_storage_contains_user, "js_user_storage_contains_user", 2));
  JS_SetPropertyStr(ctx, env, "js_frozen_storage_new", JS_NewCFunction(ctx, js_env_frozen_storage_new, "js_frozen_storage_new", 1));
  JS_SetPropertyStr(ctx, env, "js_frozen_storage_add", JS_NewCFunction(ctx, js_env_frozen_storage_add, "js_frozen_storage_add", 3));
  JS_SetPropertyStr(ctx, env, "js_frozen_storage_get", JS_NewCFunction(ctx, js_env_frozen_storage_get, "js_frozen_storage_get", 3));
  JS_SetPropertyStr(ctx, env, "js_frozen_storage_contains", JS_NewCFunction(ctx, js_env_frozen_storage_contains, "js_frozen_storage_contains", 2));
  
  // Context
  JS_SetPropertyStr(ctx, env, "context_id", JS_NewCFunction(ctx, js_context_id, "context_id", 1));
  JS_SetPropertyStr(ctx, env, "executor_id", JS_NewCFunction(ctx, js_executor_id, "executor_id", 1));
  
  // Registers
  JS_SetPropertyStr(ctx, env, "input", JS_NewCFunction(ctx, js_input, "input", 1));
  JS_SetPropertyStr(ctx, env, "register_len", JS_NewCFunction(ctx, js_register_len, "register_len", 1));
  JS_SetPropertyStr(ctx, env, "read_register", JS_NewCFunction(ctx, js_read_register, "read_register", 2));
  
  // Events
  JS_SetPropertyStr(ctx, env, "emit", JS_NewCFunction(ctx, js_emit, "emit", 2));
  JS_SetPropertyStr(ctx, env, "emit_with_handler", JS_NewCFunction(ctx, js_emit_with_handler, "emit_with_handler", 3));
  JS_SetPropertyStr(ctx, env, "xcall", JS_NewCFunction(ctx, js_xcall, "xcall", 3));
  
  // Delta
  JS_SetPropertyStr(ctx, env, "commit", JS_NewCFunction(ctx, js_commit, "commit", 2));
  JS_SetPropertyStr(ctx, env, "persist_root_state", JS_NewCFunction(ctx, js_persist_root_state, "persist_root_state", 3));
  JS_SetPropertyStr(ctx, env, "apply_storage_delta", JS_NewCFunction(ctx, js_apply_storage_delta, "apply_storage_delta", 1));
  JS_SetPropertyStr(ctx, env, "read_root_state", JS_NewCFunction(ctx, js_read_root_state, "read_root_state", 1));
  JS_SetPropertyStr(ctx, env, "flush_delta", JS_NewCFunction(ctx, js_flush_delta, "flush_delta", 0));
  
  // Time
  JS_SetPropertyStr(ctx, env, "time_now", JS_NewCFunction(ctx, js_time_now, "time_now", 1));
  JS_SetPropertyStr(ctx, env, "random_bytes", JS_NewCFunction(ctx, js_random_bytes, "random_bytes", 1));
  
  // Blobs
  JS_SetPropertyStr(ctx, env, "blob_create", JS_NewCFunction(ctx, js_blob_create, "blob_create", 0));
  JS_SetPropertyStr(ctx, env, "blob_open", JS_NewCFunction(ctx, js_blob_open, "blob_open", 1));
  JS_SetPropertyStr(ctx, env, "blob_read", JS_NewCFunction(ctx, js_blob_read, "blob_read", 2));
  JS_SetPropertyStr(ctx, env, "blob_write", JS_NewCFunction(ctx, js_blob_write, "blob_write", 2));
  JS_SetPropertyStr(ctx, env, "blob_close", JS_NewCFunction(ctx, js_blob_close, "blob_close", 2));
  JS_SetPropertyStr(ctx, env, "blob_announce_to_context", JS_NewCFunction(ctx, js_blob_announce_to_context, "blob_announce_to_context", 2));
  
  // Crypto
  JS_SetPropertyStr(ctx, env, "ed25519_verify", JS_NewCFunction(ctx, js_ed25519_verify, "ed25519_verify", 3));
  
  // Set global env object
  JS_SetPropertyStr(ctx, global, "env", env);
  JS_FreeValue(ctx, global);
}

// WASI entry point stub (empty - we don't use WASI)
// This prevents WASI runtime initialization which causes imports
void _start() {}

#define DEFINE_CALIMERO_METHOD(name) \
__attribute__((used)) \
__attribute__((visibility("default"))) \
__attribute__((export_name(#name))) \
void calimero_method_##name() { \
  char log_buf[256]; \
  snprintf(log_buf, sizeof(log_buf), "[wrapper] %s: start", #name); \
  log_c_string(log_buf); \
  JSRuntime *rt = JS_NewRuntime(); \
  if (!rt) { \
    snprintf(log_buf, sizeof(log_buf), "[wrapper] %s: JS_NewRuntime failed", #name); \
    log_c_string(log_buf); \
    return; \
  } \
  JSContext *ctx = JS_NewCustomContext(rt); \
  if (!ctx) { \
    snprintf(log_buf, sizeof(log_buf), "[wrapper] %s: JS_NewCustomContext failed", #name); \
    log_c_string(log_buf); \
    JS_FreeRuntime(rt); \
    return; \
  } \
\
  js_add_calimero_host_functions(ctx); \
  snprintf(log_buf, sizeof(log_buf), "[wrapper] %s: host functions wired", #name); \
  log_c_string(log_buf); \
 \
  /* Inject ABI manifest as global variable (required) */ \
  /* Inject as string - let JavaScript parse it to avoid memory issues with large JSON */ \
  if (calimero_abi_json_len == 0) { \
    snprintf(log_buf, sizeof(log_buf), "[wrapper] %s: ABI manifest is required but not found", #name); \
    log_c_string(log_buf); \
    calimero_panic_c_string("ABI manifest is required but not embedded in WASM"); \
  } \
  JSValue abi_string = JS_NewStringLen(ctx, (const char *)calimero_abi_json, calimero_abi_json_len); \
  if (JS_IsException(abi_string)) { \
    snprintf(log_buf, sizeof(log_buf), "[wrapper] %s: JS_NewStringLen (ABI) exception", #name); \
    log_c_string(log_buf); \
    JSValue abi_exception = JS_GetException(ctx); \
    calimero_log_exception(ctx, abi_exception, "ABI string creation"); \
    calimero_panic_with_exception(ctx, abi_exception); \
    JS_FreeValue(ctx, abi_exception); \
    JS_FreeContext(ctx); \
    JS_FreeRuntime(rt); \
    __builtin_unreachable(); \
  } \
  /* Set as string - JavaScript code will parse it if needed */ \
  /* Note: JS_SetPropertyStr consumes the value reference, so we don't free abi_string */ \
  JSValue global_obj = JS_GetGlobalObject(ctx); \
  JS_SetPropertyStr(ctx, global_obj, "__CALIMERO_ABI_MANIFEST__", abi_string); \
  JS_FreeValue(ctx, global_obj); \
  snprintf(log_buf, sizeof(log_buf), "[wrapper] %s: storage wasm and ABI injected", #name); \
  log_c_string(log_buf); \
\
  JSValue mod_obj = js_load_module_binary(ctx, code, code_size); \
  if (JS_IsException(mod_obj)) { \
    snprintf(log_buf, sizeof(log_buf), "[wrapper] %s: js_load_module_binary exception", #name); \
    log_c_string(log_buf); \
    JSValue load_exception = JS_GetException(ctx); \
    calimero_log_exception(ctx, load_exception, "module load"); \
    calimero_panic_with_exception(ctx, load_exception); \
    JS_FreeValue(ctx, load_exception); \
    JS_FreeContext(ctx); \
    JS_FreeRuntime(rt); \
    __builtin_unreachable(); \
  } \
  snprintf(log_buf, sizeof(log_buf), "[wrapper] %s: module loaded", #name); \
  log_c_string(log_buf); \
\
  JSAtom method_atom = JS_NewAtom(ctx, #name); \
  JSValue fun_obj = JS_GetProperty(ctx, mod_obj, method_atom); \
  if (JS_IsUndefined(fun_obj)) { \
    snprintf(log_buf, sizeof(log_buf), "[wrapper] %s: method undefined on module, trying global", #name); \
    log_c_string(log_buf); \
    JS_FreeValue(ctx, fun_obj); \
    JSValue global_lookup = JS_GetGlobalObject(ctx); \
    fun_obj = JS_GetProperty(ctx, global_lookup, method_atom); \
    JS_FreeValue(ctx, global_lookup); \
  } \
  JS_FreeAtom(ctx, method_atom); \
  if (JS_IsException(fun_obj)) { \
    snprintf(log_buf, sizeof(log_buf), "[wrapper] %s: JS_GetProperty exception", #name); \
    log_c_string(log_buf); \
    JSValue prop_exception = JS_GetException(ctx); \
    calimero_log_exception(ctx, prop_exception, "method lookup"); \
    calimero_panic_with_exception(ctx, prop_exception); \
    JS_FreeValue(ctx, prop_exception); \
    JS_FreeValue(ctx, mod_obj); \
    __builtin_unreachable(); \
  } \
\
  if (!JS_IsFunction(ctx, fun_obj)) { \
    snprintf(log_buf, sizeof(log_buf), "[wrapper] %s: resolved value not callable", #name); \
    log_c_string(log_buf); \
    JS_FreeValue(ctx, fun_obj); \
    JS_FreeValue(ctx, mod_obj); \
    calimero_panic_c_string("Resolved export is not callable"); \
  } \
\
  fprintf(stderr, "[dispatcher][builder] calling %s\n", #name); \
  fflush(stderr); \
  log_c_string("[dispatcher][builder] calling " #name); \
  JSValue result = JS_Call(ctx, fun_obj, mod_obj, 0, NULL); \
  if (JS_IsException(result)) { \
    snprintf(log_buf, sizeof(log_buf), "[wrapper] %s: JS_Call threw", #name); \
    log_c_string(log_buf); \
    JSValue call_exception = JS_GetException(ctx); \
    calimero_log_exception(ctx, call_exception, "method call"); \
    calimero_panic_with_exception(ctx, call_exception); \
    JS_FreeValue(ctx, result); \
    JS_FreeValue(ctx, fun_obj); \
    JS_FreeValue(ctx, mod_obj); \
    JS_FreeContext(ctx); \
    JS_FreeRuntime(rt); \
    __builtin_unreachable(); \
  } \
\
  fprintf(stderr, "[dispatcher][builder] completed %s\n", #name); \
  fflush(stderr); \
  log_c_string("[dispatcher][builder] completed " #name); \
  snprintf(log_buf, sizeof(log_buf), "[wrapper] %s: js_std_loop", #name); \
  log_c_string(log_buf); \
\
  JS_FreeValue(ctx, result); \
\
  JS_FreeValue(ctx, fun_obj); \
  JS_FreeValue(ctx, mod_obj); \
\
  js_std_loop(ctx); \
  snprintf(log_buf, sizeof(log_buf), "[wrapper] %s: cleanup", #name); \
  log_c_string(log_buf); \
\
  JS_FreeContext(ctx); \
  JS_FreeRuntime(rt); \
  snprintf(log_buf, sizeof(log_buf), "[wrapper] %s: done", #name); \
  log_c_string(log_buf); \
}

// ===========================
// ABI Access Functions
// ===========================

// Export functions to access ABI manifest from WASM
__attribute__((used))
__attribute__((visibility("default")))
__attribute__((export_name("get_abi_ptr")))
const char* get_abi_ptr(void) {
  return (const char*)calimero_abi_json;
}

__attribute__((used))
__attribute__((visibility("default")))
__attribute__((export_name("get_abi_len")))
uint32_t get_abi_len(void) {
  return calimero_abi_json_len;
}

__attribute__((used))
__attribute__((visibility("default")))
__attribute__((export_name("get_abi")))
void get_abi(uint64_t buffer_ptr) {
  // Copy ABI JSON to the provided buffer
  // buffer_ptr points to a Buffer struct: [ptr: u64][len: u64]
  CalimeroBuffer *buf = (CalimeroBuffer*)buffer_ptr;
  if (buf && buf->len >= calimero_abi_json_len) {
    memcpy((void*)buf->ptr, calimero_abi_json, calimero_abi_json_len);
    buf->len = calimero_abi_json_len;
  }
}

// Include generated method exports directly (expanded through DEFINE_CALIMERO_METHOD)
#include "methods.c"


