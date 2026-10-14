#ifndef CALIMERO_TYPED_ARRAY_VIEW_H
#define CALIMERO_TYPED_ARRAY_VIEW_H

#include "quickjs.h"

// Helper: Convert JSValue (Uint8Array) to C pointer
static inline uint8_t* JSValueToUint8Array(JSContext *ctx, JSValue val, size_t *len) {
  JSValue buffer;
  size_t offset, bytes_per_element;
  
  buffer = JS_GetTypedArrayBuffer(ctx, val, &offset, len, &bytes_per_element);
  if (JS_IsException(buffer)) {
    *len = 0;
    return NULL;
  }
  
  // Separate size so *len keeps the view's byte length, not the whole buffer's.
  size_t buffer_len;
  uint8_t *ptr = JS_GetArrayBuffer(ctx, &buffer_len, buffer);
  JS_FreeValue(ctx, buffer);

  if (!ptr || offset > buffer_len || *len > buffer_len - offset) {
    *len = 0;
    return NULL;
  }
  return ptr + offset;
}

#endif
