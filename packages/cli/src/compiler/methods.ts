/**
 * Method extraction
 */

import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

const traverse = (traverseModule as any).default || traverseModule;

export async function generateMethodsHeader(jsFile: string, outputDir: string): Promise<void> {
  const jsCode = fs.readFileSync(jsFile, 'utf-8');

  fs.writeFileSync(path.join(outputDir, 'bundle.js'), jsCode, 'utf-8');

  const registrySnapshot = await tryLoadMethodRegistry(jsFile);
  const methodSet = new Set<string>();

  if (registrySnapshot) {
    Object.values(registrySnapshot.logic).forEach(entry => {
      entry.methods.forEach(method => methodSet.add(method));
      if (entry.init) {
        methodSet.add(entry.init);
      }
    });
    registrySnapshot.functions.forEach(fn => methodSet.add(fn));
    methodSet.add('__calimero_sync_next');
    methodSet.add('__calimero_register_merge');
    emitHeaders(outputDir, Array.from(methodSet).sort());
    return;
  }

  const ast = parse(jsCode, {
    sourceType: 'module',
    plugins: ['classProperties', 'typescript'],
  });

  const exportedNames = new Set<string>();
  const functionDeclarations = new Set<string>();
  const classMethods = new Set<string>();

  traverse(ast, {
    FunctionDeclaration(nodePath: any) {
      const name = nodePath.node.id?.name;
      if (name && !name.startsWith('_') && !/^[A-Z]/.test(name) && name !== 'constructor') {
        functionDeclarations.add(name);
      }
    },
    ClassMethod(nodePath: any) {
      const name = nodePath.node.key?.name;
      const isStatic = nodePath.node.static === true;
      if (
        name &&
        !name.startsWith('_') &&
        !/^[A-Z]/.test(name) &&
        name !== 'constructor' &&
        !isStatic
      ) {
        classMethods.add(name);
      }
    },
    ExportNamedDeclaration(nodePath: any) {
      if (nodePath.node.declaration && nodePath.node.declaration.type === 'FunctionDeclaration') {
        const name = nodePath.node.declaration.id?.name;
        if (name) {
          exportedNames.add(name);
          functionDeclarations.add(name);
        }
      }
      if (nodePath.node.specifiers) {
        nodePath.node.specifiers.forEach((spec: any) => {
          if (spec.exported && spec.exported.name) {
            exportedNames.add(spec.exported.name);
          }
        });
      }
    },
  });

  exportedNames.forEach(name => {
    if (functionDeclarations.has(name)) {
      methodSet.add(name);
    }
  });

  classMethods.forEach(name => {
    methodSet.add(name);
  });

  methodSet.add('__calimero_sync_next');
  methodSet.add('__calimero_register_merge');

  emitHeaders(outputDir, Array.from(methodSet).sort());
}

interface MethodRegistrySnapshot {
  logic: Record<string, { methods: string[]; init?: string }>;
  functions: string[];
}

async function tryLoadMethodRegistry(jsFile: string): Promise<MethodRegistrySnapshot | null> {
  try {
    const fileUrl = pathToFileURL(path.resolve(jsFile));
    const cacheBustingUrl = new URL(fileUrl.href);
    cacheBustingUrl.searchParams.set('registry', Date.now().toString(36));

    const previousEnv = (globalThis as any).env;
    const previousRegistry = (globalThis as any).__CALIMERO_METHOD_REGISTRY__;

    (globalThis as any).env = createEnvStub();
    delete (globalThis as any).__CALIMERO_METHOD_REGISTRY__;

    await import(cacheBustingUrl.href);

    const snapshot = (globalThis as any).__CALIMERO_METHOD_REGISTRY__ ?? null;

    if (previousEnv === undefined) {
      delete (globalThis as any).env;
    } else {
      (globalThis as any).env = previousEnv;
    }

    if (previousRegistry === undefined) {
      delete (globalThis as any).__CALIMERO_METHOD_REGISTRY__;
    } else {
      (globalThis as any).__CALIMERO_METHOD_REGISTRY__ = previousRegistry;
    }

    return snapshot;
  } catch {
    return null;
  }
}

function emitHeaders(outputDir: string, methods: string[]): void {
  const uniqueMethods = Array.from(new Set(methods));

  const methodMacroLines = uniqueMethods.map(method => `DEFINE_CALIMERO_METHOD(${method})`);

  const cSourceLines = [
    '// Auto-generated method exports',
    `// Found ${uniqueMethods.length} methods`,
    '// Note: This file is #included in builder.c',
    '',
    ...methodMacroLines,
    '',
  ];

  const outputFile = path.join(outputDir, 'methods.c');
  fs.writeFileSync(outputFile, cSourceLines.join('\n'));

  const headerFile = path.join(outputDir, 'methods.h');
  const headerContentLines = [
    '#ifndef METHODS_H',
    '#define METHODS_H',
    '// Method names for export (used by wasm.ts)',
    ...uniqueMethods.map(m => `#define EXPORT_METHOD_${m.toUpperCase()} 1`),
    ...methodMacroLines,
    '#endif // METHODS_H',
    '',
  ];
  fs.writeFileSync(headerFile, headerContentLines.join('\n'));

  if (uniqueMethods.length > 0) {
    console.log(`Extracted ${uniqueMethods.length} methods: ${uniqueMethods.join(', ')}`);
  } else {
    console.warn('Warning: No methods found to export');
  }
}

function createEnvStub(): Record<string, (...args: any[]) => any> {
  const noOp = () => undefined;
  const zero = () => 0;
  const bigZero = () => 0n;

  return {
    panic_utf8: () => {
      throw new Error('panic_utf8 called during method registry extraction');
    },
    value_return: noOp,
    log_utf8: noOp,
    context_id: noOp,
    executor_id: noOp,
    storage_read: zero,
    storage_write: noOp,
    storage_remove: zero,
    register_len: zero,
    read_register: noOp,
    commit: noOp,
    time_now: noOp,
    blob_create: bigZero,
    blob_open: bigZero,
    blob_read: bigZero,
    blob_write: bigZero,
    blob_close: zero,
  };
}
