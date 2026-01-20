/**
 * WASM optimizer
 *
 * Optimizes WASM binary using wasi-stub and wasm-opt
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { findPackageRoot } from '../utils/package-root.js';

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
  const packageRoot = findPackageRoot();
  const binaryenDir = path.join(packageRoot, 'deps/binaryen');
  const wasiStubScript = path.join(binaryenDir, 'wasi-stub/run.sh');
  const wasiStubBinary = path.join(binaryenDir, 'wasi-stub/wasi-stub');
  const wasmOpt = path.join(binaryenDir, 'bin/wasm-opt'); // May not exist

  // Try script first, fallback to binary
  const wasiStub = fs.existsSync(wasiStubScript) ? wasiStubScript : wasiStubBinary;

  // Check if wasi-stub exists (critical for removing WASI imports)
  if (!fs.existsSync(wasiStub)) {
    if (options.verbose) {
      console.log('wasi-stub not found, skipping WASI import removal');
    }
    // Just copy file if wasi-stub not available
    fs.copyFileSync(input, output);
    return;
  }

  try {
    // Step 1: Remove WASI imports with wasi-stub
    if (options.verbose) {
      console.log('Removing WASI imports with wasi-stub...');
    }

    // Use absolute paths for input/output
    const absInput = path.resolve(input);
    const absOutput = path.resolve(output);

    // Use bash to run the script (which handles library paths)
    const cmd = wasiStub.endsWith('.sh')
      ? `bash ${wasiStub} ${absInput} -o ${absOutput}`
      : `${wasiStub} ${absInput} -o ${absOutput}`;

    execSync(cmd, {
      stdio: options.verbose ? 'inherit' : 'pipe',
    });

    // Step 2: Optimize with wasm-opt (if available)
    if (fs.existsSync(wasmOpt)) {
      if (options.verbose) {
        console.log('Running wasm-opt...');
      }
      const tempOptimized = output.replace('.wasm', '.opt.wasm');
      execSync(`${wasmOpt} ${output} -O3 --strip-debug --strip-producers -o ${tempOptimized}`, {
        stdio: options.verbose ? 'inherit' : 'pipe',
      });
      // Replace original with optimized
      fs.renameSync(tempOptimized, output);
    } else if (options.verbose) {
      console.log('wasm-opt not found, skipping additional optimization');
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
