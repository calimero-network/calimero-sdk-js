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
  
  uint8_t *ptr = JS_GetArrayBuffer(ctx, len, buffer);
  JS_FreeValue(ctx, buffer);
  
  return ptr ? ptr + offset : NULL;
}

#endif
