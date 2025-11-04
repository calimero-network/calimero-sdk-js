/**
 * WASM optimizer
 *
 * Optimizes WASM binary using wasi-stub and wasm-opt
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface OptimizeOptions {
  verbose: boolean;
}

/**
 * Optimizes WASM binary
 *
 * @param input - Input WASM file
 * @param output - Output WASM file
 * @param options - Optimization options
 */
export async function optimizeWasm(
  input: string,
  output: string,
  options: OptimizeOptions
): Promise<void> {
  const binaryenDir = path.join(__dirname, '../../deps/binaryen');
  const wasiStub = path.join(binaryenDir, 'bin/wasi-stub');
  const wasmOpt = path.join(binaryenDir, 'bin/wasm-opt');

  // Check if tools exist
  if (!fs.existsSync(wasiStub) || !fs.existsSync(wasmOpt)) {
    if (options.verbose) {
      console.log('Binaryen tools not found, skipping optimization');
    }
    // Just copy file if optimization tools not available
    fs.copyFileSync(input, output);
    return;
  }

  const stubbed = input.replace('.wasm', '.stubbed.wasm');

  try {
    // Step 1: Remove WASI imports
    if (options.verbose) {
      console.log('Removing WASI imports...');
    }
    execSync(`${wasiStub} ${input} -o ${stubbed}`, {
      stdio: options.verbose ? 'inherit' : 'pipe'
    });

    // Step 2: Optimize with wasm-opt
    if (options.verbose) {
      console.log('Running wasm-opt...');
    }
    execSync(
      `${wasmOpt} ${stubbed} -O3 --strip-debug --strip-producers -o ${output}`,
      {
        stdio: options.verbose ? 'inherit' : 'pipe'
      }
    );

    // Cleanup temporary file
    if (fs.existsSync(stubbed)) {
      fs.unlinkSync(stubbed);
    }

    // Report size
    const stats = fs.statSync(output);
    if (options.verbose) {
      console.log(`Final WASM size: ${(stats.size / 1024).toFixed(2)} KB`);
    }
  } catch (error) {
    // If optimization fails, fall back to unoptimized
    if (options.verbose) {
      console.log('Optimization failed, using unoptimized WASM');
    }
    fs.copyFileSync(input, output);
  }
}

