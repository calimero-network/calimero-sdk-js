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

  // Generate full inline functions using stack-allocated Buffer structs
  const generateMethod = (methodName: string) => `
__attribute__((used))
__attribute__((visibility("default")))
__attribute__((export_name("${methodName}")))
void ${methodName}() {
  JSRuntime *rt = JS_NewRuntime();
  JSContext *ctx = JS_NewCustomContext(rt);
  js_add_calimero_host_functions(ctx);
  
  JSValue mod_obj = JS_ReadObject(ctx, code, code_size, JS_READ_OBJ_BYTECODE);
  // Don't check for exceptions - let it continue
  
  JS_ResolveModule(ctx, mod_obj);
  // Don't check for errors - let it continue
  
  js_module_set_import_meta(ctx, mod_obj, FALSE, FALSE);
  
  JSValue fun_obj = JS_GetProperty(ctx, mod_obj, JS_NewAtom(ctx, "${methodName}"));
  JSValue result = JS_Call(ctx, fun_obj, mod_obj, 0, NULL);
  
  // Free values
  JS_FreeValue(ctx, fun_obj);
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

${uniqueMethods.map(generateMethod).join('\n')}
`;

  const outputFile = path.join(outputDir, 'methods.c');
  fs.writeFileSync(outputFile, cSource);
  
  // Also create empty methods.h for compatibility
  const headerFile = path.join(outputDir, 'methods.h');
  fs.writeFileSync(headerFile, `
#ifndef METHODS_H
#define METHODS_H
// Method implementations are in methods.c
#endif // METHODS_H
`);
  
  if (uniqueMethods.length > 0) {
    console.log(`Extracted ${uniqueMethods.length} methods: ${uniqueMethods.join(', ')}`);
  } else {
    console.warn('Warning: No methods found to export');
  }
}

