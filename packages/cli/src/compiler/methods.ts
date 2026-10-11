/**
 * Method extraction
 */

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

const INTERNAL_EXPORTS = [
  '__calimero_sync_next',
  '__calimero_register_merge',
  '__calimero_merge_root_state',
];

export interface MethodRegistrySnapshot {
  logic: Record<string, { methods: string[]; init?: string }>;
  functions: string[];
}

export async function generateMethodsHeader(
  jsFile: string,
  outputDir: string,
  abiMethods: string[]
): Promise<void> {
  const jsCode = fs.readFileSync(jsFile, 'utf-8');

  fs.writeFileSync(path.join(outputDir, 'bundle.js'), jsCode, 'utf-8');

  emitHeaders(outputDir, exportedMethods(await loadMethodRegistry(jsFile), abiMethods));
}

/**
 * The wasm exports for a bundle: what its method registry holds, plus the
 * runtime's internal exports. Refuses a registry that differs from the ABI methods.
 */
export function exportedMethods(
  registry: MethodRegistrySnapshot | null,
  abiMethods: string[]
): string[] {
  if (!registry) {
    throw new Error('The bundle registered no method registry; is the @Logic class imported?');
  }
  const entryPoints = new Set<string>();
  Object.values(registry.logic).forEach(entry => {
    entry.methods.forEach(method => entryPoints.add(method));
    if (entry.init) {
      entryPoints.add(entry.init);
    }
  });
  registry.functions.forEach(fn => entryPoints.add(fn));
  if (entryPoints.size === 0) {
    throw new Error(
      'The method registry holds no logic methods or initializer; nothing would be callable'
    );
  }
  const abi = new Set(abiMethods);
  const unlisted = [...entryPoints].filter(name => !abi.has(name));
  const unregistered = abiMethods.filter(name => !entryPoints.has(name));
  if (unlisted.length > 0 || unregistered.length > 0) {
    throw new Error(
      `The runtime registry and the ABI disagree: registered but not in the ABI [${unlisted.join(', ')}], ` +
        `in the ABI but not registered [${unregistered.join(', ')}]`
    );
  }
  return [...INTERNAL_EXPORTS, ...entryPoints].sort();
}

async function loadMethodRegistry(jsFile: string): Promise<MethodRegistrySnapshot | null> {
  const fileUrl = pathToFileURL(path.resolve(jsFile));
  const cacheBustingUrl = new URL(fileUrl.href);
  cacheBustingUrl.searchParams.set('registry', Date.now().toString(36));

  const previousEnv = (globalThis as any).env;
  const previousRegistry = (globalThis as any).__CALIMERO_METHOD_REGISTRY__;

  (globalThis as any).env = createEnvStub();
  delete (globalThis as any).__CALIMERO_METHOD_REGISTRY__;

  try {
    await import(cacheBustingUrl.href);
    return (globalThis as any).__CALIMERO_METHOD_REGISTRY__ ?? null;
  } finally {
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
  }
}

function emitHeaders(outputDir: string, methods: string[]): void {
  // Filter and ensure all methods are strings
  const uniqueMethods = Array.from(
    new Set(methods.filter(m => typeof m === 'string' && m.length > 0))
  );

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

  console.log(`Extracted ${uniqueMethods.length} methods: ${uniqueMethods.join(', ')}`);
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
