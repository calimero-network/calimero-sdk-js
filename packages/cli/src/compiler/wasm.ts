/**
 * WASM compiler
 *
 * Compiles C code to WebAssembly using Clang/WASI-SDK
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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
export async function compileToWasm(
  cCodePath: string,
  options: WasmOptions
): Promise<string> {
  const wasiSdk = path.join(__dirname, '../../deps/wasi-sdk');
  const quickjsDir = path.join(__dirname, '../../deps/quickjs');
  const builderC = path.join(__dirname, '../../builder/builder.c');
  const outputFile = path.join(options.outputDir, 'contract.wasm');

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
  const sources = [
    builderC,
    path.join(quickjsDir, 'quickjs.c'),
    path.join(quickjsDir, 'libregexp.c'),
    path.join(quickjsDir, 'libunicode.c'),
    path.join(quickjsDir, 'cutils.c'),
    path.join(quickjsDir, 'quickjs-libc-min.c'),
    path.join(quickjsDir, 'libbf.c')
  ].join(' ');

  // Include directories
  const includes = [
    `-I${quickjsDir}`,
    `-I${options.outputDir}` // For code.h and methods.h
  ].join(' ');

  // Compiler flags
  const flags = [
    '-O3', // Optimize for size
    '-flto', // Link-time optimization
    '-fno-exceptions',
    '-DCONFIG_VERSION=\\"2021-03-27\\"',
    '-DCONFIG_BIGNUM',
    '-DJS_STRICT_NAN_BOXING',
    '-Wno-unused-parameter'
  ].join(' ');

  // Linker flags
  const linkerFlags = [
    '-Wl,--no-entry', // No main function
    '-Wl,--export-dynamic', // Export all functions
    '-Wl,--allow-undefined' // Allow undefined host functions
  ].join(' ');

  const cmd = `
    ${wasiSdk}/bin/clang ${flags} ${includes} \\
    ${linkerFlags} \\
    -o ${outputFile} \\
    ${sources}
  `.replace(/\s+/g, ' ').trim();

  if (options.verbose) {
    console.log(`Compiling to WASM...`);
    console.log(`Command: ${cmd}`);
  }

  try {
    execSync(cmd, {
      stdio: options.verbose ? 'inherit' : 'pipe',
      cwd: process.cwd()
    });
  } catch (error) {
    throw new Error(`WASM compilation failed: ${error}`);
  }

  if (!fs.existsSync(outputFile)) {
    throw new Error(`Failed to generate WASM file: ${outputFile}`);
  }

  return outputFile;
}

