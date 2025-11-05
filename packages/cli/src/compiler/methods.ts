/**
 * Method extraction
 *
 * Extracts contract methods from bundled JavaScript and generates methods.h
 */

import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as fs from 'fs';
import * as path from 'path';

// Handle CommonJS default export
const traverse = (traverseModule as any).default || traverseModule;

/**
 * Generates methods.h header file with exported contract methods
 *
 * @param jsFile - Path to bundled JavaScript
 * @param outputDir - Output directory for methods.h
 */
export async function generateMethodsHeader(
  jsFile: string,
  outputDir: string
): Promise<void> {
  const jsCode = fs.readFileSync(jsFile, 'utf-8');

  // Parse JavaScript to AST
  const ast = parse(jsCode, {
    sourceType: 'module',
    plugins: []
  });

  const methods: string[] = [];

  // After Rollup/Babel, classes are transformed using _createClass helper
  // Pattern: _createClass(ClassName, [{key: "methodName", value: function methodName() {...}}])
  // We need to find all _createClass calls and extract methods from Logic class
  
  let logicClassName: string | null = null;
  
  // First pass: find the Logic class name
  traverse(ast, {
    VariableDeclarator(nodePath: any) {
      const id = nodePath.node.id?.name;
      if (id && id.includes('Logic')) {
        logicClassName = id;
      }
    }
  });
  
  // Second pass: find _createClass calls and extract methods
  traverse(ast, {
    CallExpression(nodePath: any) {
      // Look for _createClass(SomeClass, [...methods...])
      if (nodePath.node.callee?.name === '_createClass') {
        const args = nodePath.node.arguments;
        if (args && args.length >= 2) {
          // Check if first argument references our Logic class
          const firstArg = args[0];
          let isLogicClass = false;
          
          // Check if it's the Logic class
          if (firstArg.type === 'Identifier' && firstArg.name === logicClassName) {
            isLogicClass = true;
          }
          
          if (isLogicClass) {
            // Second argument is the array of instance methods
            const methodsArray = args[1];
            if (methodsArray && methodsArray.type === 'ArrayExpression') {
              methodsArray.elements.forEach((element: any) => {
                if (element && element.type === 'ObjectExpression') {
                  const keyProp = element.properties.find((p: any) => 
                    p.key && (p.key.name === 'key' || p.key.value === 'key')
                  );
                  if (keyProp && keyProp.value) {
                    const methodName = keyProp.value.value || keyProp.value.name;
                    if (methodName && methodName !== 'constructor') {
                      methods.push(methodName);
                    }
                  }
                }
              });
            }
            
            // Third argument (if present) contains static methods
            if (args.length >= 3) {
              const staticMethodsArray = args[2];
              if (staticMethodsArray && staticMethodsArray.type === 'ArrayExpression') {
                staticMethodsArray.elements.forEach((element: any) => {
                  if (element && element.type === 'ObjectExpression') {
                    const keyProp = element.properties.find((p: any) => 
                      p.key && (p.key.name === 'key' || p.key.value === 'key')
                    );
                    if (keyProp && keyProp.value) {
                      const methodName = keyProp.value.value || keyProp.value.name;
                      if (methodName && methodName !== 'constructor') {
                        methods.push(methodName);
                      }
                    }
                  }
                });
              }
            }
          }
        }
      }
    }
  });

  // Remove duplicates
  const uniqueMethods = Array.from(new Set(methods));

  // logicClassName is already found above - use it for method generation
  if (!logicClassName) {
    logicClassName = 'CounterLogic'; // Default fallback
  }

  // Generate full inline functions that access methods via the Logic class
  const generateMethod = (methodName: string) => `
__attribute__((used))
__attribute__((visibility("default")))
__attribute__((export_name("${methodName}")))
void ${methodName}() {
  JSRuntime *rt = JS_NewRuntime();
  JSContext *ctx = JS_NewCustomContext(rt);
  js_add_calimero_host_functions(ctx);
  
  JSValue mod_obj = JS_ReadObject(ctx, code, code_size, JS_READ_OBJ_BYTECODE);
  if (JS_IsException(mod_obj)) {
    log_msg("Failed to load bytecode in ${methodName}");
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    return;
  }
  
  if (JS_ResolveModule(ctx, mod_obj) < 0) {
    log_msg("Failed to resolve module in ${methodName}");
    JS_FreeValue(ctx, mod_obj);
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    return;
  }
  
  js_module_set_import_meta(ctx, mod_obj, FALSE, FALSE);
  
  // Get the Logic class first
  JSValue class_obj = JS_GetProperty(ctx, mod_obj, JS_NewAtom(ctx, "${logicClassName}"));
  if (JS_IsUndefined(class_obj)) {
    log_msg("Class ${logicClassName} not found in ${methodName}");
    JS_FreeValue(ctx, mod_obj);
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    return;
  }
  
  JSValue fun_obj = JS_GetProperty(ctx, class_obj, JS_NewAtom(ctx, "${methodName}"));
  if (JS_IsUndefined(fun_obj) || !JS_IsFunction(ctx, fun_obj)) {
    log_msg("Method ${methodName} not found on class ${logicClassName}");
    JS_FreeValue(ctx, class_obj);
    JS_FreeValue(ctx, mod_obj);
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    return;
  }
  
  JSValue result = JS_Call(ctx, fun_obj, class_obj, 0, NULL);
  
  if (JS_IsException(result)) {
    log_msg("Exception in ${methodName}");
    JSValue exception = JS_GetException(ctx);
    // Try to get error message
    const char *str = JS_ToCString(ctx, exception);
    if (str) {
      log_msg(str);
      JS_FreeCString(ctx, str);
    }
    JS_FreeValue(ctx, exception);
  }
  
  // Free values
  JS_FreeValue(ctx, fun_obj);
  JS_FreeValue(ctx, class_obj);
  JS_FreeValue(ctx, result);
  JS_FreeValue(ctx, mod_obj);
  
  js_std_loop(ctx);
  JS_FreeContext(ctx);
  JS_FreeRuntime(rt);
}`;

  // Generate C source file with full inline functions
  const cSource = `
// Auto-generated method exports
// Found ${uniqueMethods.length} methods
// Note: This file is #included in builder.c

// Forward declarations
extern const uint8_t code[];
extern const uint32_t code_size;
extern JSContext *JS_NewCustomContext(JSRuntime *rt);
extern void js_add_calimero_host_functions(JSContext *ctx);
extern void panic_utf8(uint64_t msg_ptr, uint64_t loc_ptr) __attribute__((noreturn));
extern void log_utf8(uint64_t buffer_ptr);

#include <string.h>

// Helper to log a string message (CalimeroBuffer is already defined in builder.c)
static void log_msg(const char* msg) {
  struct {
    uint64_t ptr;
    uint64_t len;
  } buf;
  buf.ptr = (uint64_t)msg;
  buf.len = (uint64_t)strlen(msg);
  log_utf8((uint64_t)&buf);
}

${uniqueMethods.map(generateMethod).join('\n')}
`;

  const outputFile = path.join(outputDir, 'methods.c');
  fs.writeFileSync(outputFile, cSource);
  
  // Create methods.h with DEFINE_CALIMERO_METHOD macros for wasm.ts to find
  const headerFile = path.join(outputDir, 'methods.h');
  const headerContent = `
#ifndef METHODS_H
#define METHODS_H
// Method names for export (used by wasm.ts)
${uniqueMethods.map(m => `#define EXPORT_METHOD_${m.toUpperCase()} 1`).join('\n')}
${uniqueMethods.map(m => `DEFINE_CALIMERO_METHOD(${m})`).join('\n')}
#endif // METHODS_H
`;
  fs.writeFileSync(headerFile, headerContent);
  
  if (uniqueMethods.length > 0) {
    console.log(`Extracted ${uniqueMethods.length} methods: ${uniqueMethods.join(', ')}`);
  } else {
    console.warn('Warning: No methods found to export');
  }
}

