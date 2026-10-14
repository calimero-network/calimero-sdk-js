#include <stdio.h>
#include <string.h>

#include "quickjs.h"
#include "typed_array_view.h"

static int failures = 0;

static void expect(int ok, const char *src, const char *what) {
  if (!ok) {
    fprintf(stderr, "FAIL: %s: %s\n", src, what);
    failures++;
  }
}

// The view's source bytes are 0, 1, 2, ..., so byte i of the view must equal first + i.
static void check_view(JSContext *ctx, const char *src, size_t want_len, uint8_t first) {
  JSValue view = JS_Eval(ctx, src, strlen(src), "<test>", JS_EVAL_TYPE_GLOBAL);
  expect(!JS_IsException(view), src, "view evaluates");

  size_t len = 0;
  uint8_t *ptr = JSValueToUint8Array(ctx, view, &len);
  expect(ptr != NULL, src, "returns a pointer");
  expect(len == want_len, src, "length is the view's byte length");
  if (ptr && len == want_len && want_len > 0) {
    expect(ptr[0] == first && ptr[want_len - 1] == first + want_len - 1, src,
           "pointer starts at the view offset");
  }
  JS_FreeValue(ctx, view);
}

int main(void) {
  JSRuntime *rt = JS_NewRuntime();
  JSContext *ctx = JS_NewContext(rt);

  check_view(ctx, "new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).subarray(4, 7)", 3, 4);
  check_view(ctx,
             "new Uint32Array(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])"
             ".buffer, 4, 2)",
             8, 4);
  check_view(ctx, "new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).subarray(10, 10)", 0, 0);

  JS_FreeContext(ctx);
  JS_FreeRuntime(rt);
  if (failures == 0) {
    printf("typed_array_view_test: ok\n");
  }
  return failures ? 1 : 0;
}
