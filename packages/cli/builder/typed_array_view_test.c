#include <stdio.h>
#include <string.h>

#include "quickjs.h"
#include "typed_array_view.h"

static int failures = 0;

static void expect(int ok, const char *what) {
  if (!ok) {
    fprintf(stderr, "FAIL: %s\n", what);
    failures++;
  }
}

int main(void) {
  JSRuntime *rt = JS_NewRuntime();
  JSContext *ctx = JS_NewContext(rt);
  const char *src = "new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]).subarray(4, 7)";
  JSValue view = JS_Eval(ctx, src, strlen(src), "<test>", JS_EVAL_TYPE_GLOBAL);
  expect(!JS_IsException(view), "subarray view evaluates");

  size_t len = 0;
  uint8_t *ptr = JSValueToUint8Array(ctx, view, &len);
  expect(ptr != NULL, "subarray view returns a pointer");
  expect(len == 3, "subarray view length is the view's byte length");
  expect(ptr && ptr[0] == 4 && ptr[2] == 6, "subarray view pointer starts at the view offset");

  JS_FreeValue(ctx, view);
  JS_FreeContext(ctx);
  JS_FreeRuntime(rt);
  if (failures == 0) {
    printf("typed_array_view_test: ok\n");
  }
  return failures ? 1 : 0;
}
