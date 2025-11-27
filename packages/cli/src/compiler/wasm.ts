/**
 * WASM compiler
 *
 * Compiles C code to WebAssembly using Clang/WASI-SDK
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface WasmOptions {
  verbose: boolean;
  outputDir: string;
}

/**
 * Compiles C code to WebAssembly
 *
 * @param cCodePath - Path to C header file (code.h)
 * @param options - Compiler options
 * @returns Path to generated WASM file
 */
export async function compileToWasm(cCodePath: string, options: WasmOptions): Promise<string> {
  const wasiSdk = path.join(__dirname, '../../src/deps/wasi-sdk');
  const quickjsDir = path.join(__dirname, '../../src/deps/quickjs');
  const builderC = path.join(__dirname, '../../builder/builder.c');
  const outputFile = path.join(options.outputDir, 'service.wasm');

  // Check dependencies
  if (!fs.existsSync(wasiSdk)) {
    throw new Error('WASI-SDK not found. Please run: pnpm install');
  }

  if (!fs.existsSync(quickjsDir)) {
    throw new Error('QuickJS not found. Please run: pnpm install');
  }

  if (!fs.existsSync(builderC)) {
    throw new Error('builder.c not found');
  }

  // Source files to compile
  // Note: methods.c is #included in builder.c, not compiled separately
  // RE-ADDED: quickjs-libc-min.c (needed for js_std_loop and module helpers!)
  const sources = [
    builderC, // This includes methods.c
    path.join(quickjsDir, 'quickjs.c'),
    path.join(quickjsDir, 'libregexp.c'),
    path.join(quickjsDir, 'libunicode.c'),
    path.join(quickjsDir, 'cutils.c'),
    path.join(quickjsDir, 'quickjs-libc-min.c'), // RE-ADDED (matching NEAR SDK!)
    path.join(quickjsDir, 'libbf.c'),
  ];

  // Include directories
  const includeFlags = [
    `-I${quickjsDir}`,
    `-I${options.outputDir}`, // For code.h and methods.h
  ];

  // Compiler flags
  /*
  const flags = [
    '--target=wasm32-wasi', // WASM target
    `--sysroot=${wasiSdk}/share/wasi-sysroot`, // WASI sysroot for standard headers
    '-nostartfiles', // Don't link CRT startup files (prevents _start conflict)
    '-O3', // Optimize (changed from -Oz to -O3 for better performance)
    '-flto', // Link-time optimization
    '-fno-exceptions',
    '-DCONFIG_VERSION=\\"2021-03-27\\"',
    '-DCONFIG_BIGNUM',
    '-DCONFIG_WASM_MODULE',
    '-DJS_STRICT_NAN_BOXING',
    '-Wno-unused-parameter',
    '-Wl,--allow-undefined' // Allow undefined symbols (from Calimero runtime)
  ].join(' ');
  */
  const flagsArray = [
    '--target=wasm32-wasi',
    `--sysroot=${wasiSdk}/share/wasi-sysroot`,
    '-nostartfiles',
    '-Og',
    '-g',
    '-fno-exceptions',
    '-DCONFIG_VERSION="2021-03-27"',
    '-DCONFIG_BIGNUM',
    '-DCONFIG_WASM_MODULE',
    '-DJS_STRICT_NAN_BOXING',
    '-Wno-unused-parameter',
    '-Wl,--allow-undefined',
    '-Wl,--export-table',
    '-Wl,--export=__wasm_call_ctors',
    '-Wl,--export=__data_end',
    '-Wl,--export=__heap_base',
  ];
  // Extract method names from methods.h to explicitly export them
  const methodsH = path.join(options.outputDir, 'methods.h');
  const methodExports: string[] = [];
  if (fs.existsSync(methodsH)) {
    const methodsContent = fs.readFileSync(methodsH, 'utf-8');
    const methodMatches = methodsContent.matchAll(/DEFINE_CALIMERO_METHOD\((\w+)\)/g);
    for (const match of methodMatches) {
      methodExports.push(`-Wl,--export=calimero_method_${match[1]}`);
    }
  }

  // Linker flags
  const linkerFlags = [
    '-Wl,--no-entry', // No main function
    '-Wl,--allow-undefined', // Allow undefined host functions
    ...methodExports, // Explicitly export each method
  ];

  // Save unoptimized WASM for debugging
  const unoptimizedFile = outputFile.replace('.wasm', '.unoptimized.wasm');

  const args = [...flagsArray, ...includeFlags, ...linkerFlags, '-o', unoptimizedFile, ...sources];

  if (options.verbose) {
    console.log(`Compiling to WASM...`);
    console.log(`Command: ${wasiSdk}/bin/clang ${args.join(' ')}`);
  }

  try {
    execFileSync(`${wasiSdk}/bin/clang`, args, {
      stdio: options.verbose ? 'inherit' : 'pipe',
      cwd: process.cwd(),
    });
  } catch (error) {
    throw new Error(`WASM compilation failed: ${error}`);
  }

  if (!fs.existsSync(unoptimizedFile)) {
    throw new Error(`Failed to generate WASM file: ${unoptimizedFile}`);
  }

  // For now, just copy unoptimized to final (we'll optimize in a separate step)
  fs.copyFileSync(unoptimizedFile, outputFile);

  return outputFile;
}
