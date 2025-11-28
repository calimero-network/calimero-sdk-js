/**
 * Build command implementation
 */

import signale from 'signale';
import { bundleWithRollup } from '../compiler/rollup.js';
import { compileToC } from '../compiler/quickjs.js';
import { compileToWasm } from '../compiler/wasm.js';
import { optimizeWasm } from '../compiler/optimize.js';
import { generateMethodsHeader } from '../compiler/methods.js';
import { generateAbiJson, generateAbiHeader } from '../compiler/abi.js';
import * as fs from 'fs';
import * as path from 'path';

const { Signale } = signale;

interface BuildOptions {
  output: string;
  verbose: boolean;
  optimize: boolean;
}

export async function buildCommand(source: string, options: BuildOptions): Promise<void> {
  const signale = new Signale({ scope: 'build', interactive: !options.verbose });

  try {
    signale.await(`Building ${source}...`);

    // Ensure output directory exists
    const outputDir = path.dirname(options.output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Step 1: Generate ABI manifest
    signale.await('Generating ABI manifest...');
    const abiJsonPath = await generateAbiJson(source, {
      verbose: options.verbose,
      outputDir,
    });
    const abiManifest = JSON.parse(fs.readFileSync(abiJsonPath, 'utf-8'));
    signale.success('ABI manifest generated');

    // Step 2: Generate ABI header for WASM embedding
    signale.await('Generating ABI header...');
    await generateAbiHeader(abiJsonPath, {
      verbose: options.verbose,
      outputDir,
    });
    signale.success('ABI header generated');

    // Step 3: Bundle with Rollup (with ABI injection)
    signale.await('Bundling JavaScript with Rollup...');
    const jsBundle = await bundleWithRollup(source, {
      verbose: options.verbose,
      outputDir,
      abiManifest,
    });
    signale.success('JavaScript bundled');

    // Step 4: Generate methods header
    signale.await('Extracting service methods...');
    await generateMethodsHeader(jsBundle, outputDir);
    signale.success('Methods extracted');

    // Step 5: Compile to C with QuickJS
    signale.await('Compiling to C with QuickJS...');
    const cCodePath = await compileToC(jsBundle, {
      verbose: options.verbose,
      outputDir,
    });
    signale.success('Compiled to C');

    // Step 6: Compile to WASM
    signale.await('Compiling to WebAssembly...');
    const wasmPath = await compileToWasm(cCodePath, {
      verbose: options.verbose,
      outputDir,
    });
    signale.success('Compiled to WASM');

    // Step 7: Copy ABI JSON to output directory alongside WASM
    const finalAbiPath = path.join(path.dirname(options.output), 'abi.json');
    fs.copyFileSync(abiJsonPath, finalAbiPath);
    if (options.verbose) {
      signale.info(`ABI JSON saved to: ${finalAbiPath}`);
    }

    // Step 8: Optimize (if enabled)
    if (options.optimize) {
      signale.await('Optimizing WASM...');
      await optimizeWasm(wasmPath, options.output, {
        verbose: options.verbose,
      });
      signale.success('WASM optimized');
    } else {
      // Just copy to output
      fs.copyFileSync(wasmPath, options.output);
    }

    // Get final size
    const stats = fs.statSync(options.output);
    const sizeKB = (stats.size / 1024).toFixed(2);

    signale.success(`Contract built successfully: ${options.output} (${sizeKB} KB)`);
  } catch (error) {
    signale.error('Build failed:', error);
    process.exit(1);
  }
}
