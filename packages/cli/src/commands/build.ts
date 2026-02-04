/**
 * Build command implementation
 */

import signale from 'signale';
import { bundleWithRollup } from '../compiler/rollup.js';
import { compileToC } from '../compiler/quickjs.js';
import { compileToWasm } from '../compiler/wasm.js';
import { optimizeWasm } from '../compiler/optimize.js';
import { generateMethodsHeader } from '../compiler/methods.js';
import {
  generateAbiJson,
  generateAbiHeader,
  generateAbiSchema,
  generateStateSchema,
} from '../compiler/abi.js';
import * as fs from 'fs';
import * as path from 'path';

const { Signale } = signale;

interface BuildOptions {
  output: string;
  verbose: boolean;
  optimize: boolean;
}

/**
 * Known build artifacts that may be created during the build process.
 * These files will be cleaned up if the build is interrupted.
 */
const BUILD_ARTIFACTS = [
  'abi.json',
  'abi.h',
  'state-schema.json',
  'schema.json',
  'bundle.js',
  '__calimero_entry.ts',
  'methods.c',
  'methods.h',
  'code.h',
  'service.wasm',
  'service.unoptimized.wasm',
];

/**
 * State for tracking active build for cleanup on signal interruption.
 */
interface BuildCleanupState {
  outputDir: string | null;
  // Using any type for signale instance to avoid complex generic type constraints
  signaleInstance: ReturnType<typeof createSignaleInstance> | null;
  isBuilding: boolean;
}

/**
 * Creates a Signale instance for build logging.
 */
function createSignaleInstance(verbose: boolean) {
  return new Signale({ scope: 'build', interactive: !verbose });
}

const buildCleanupState: BuildCleanupState = {
  outputDir: null,
  signaleInstance: null,
  isBuilding: false,
};

/**
 * Cleans up build artifacts from the output directory.
 * Called when the build process is interrupted by a signal.
 */
function cleanupBuildArtifacts(): void {
  const { outputDir, signaleInstance, isBuilding } = buildCleanupState;

  if (!isBuilding || !outputDir) {
    return;
  }

  signaleInstance?.warn('\nBuild interrupted, cleaning up artifacts...');

  for (const artifact of BUILD_ARTIFACTS) {
    const filePath = path.join(outputDir, artifact);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        if (signaleInstance) {
          signaleInstance.info(`Removed: ${artifact}`);
        }
      }
    } catch {
      // Ignore cleanup errors - best effort cleanup
    }
  }

  // Reset state after cleanup
  buildCleanupState.isBuilding = false;
  buildCleanupState.outputDir = null;
}

/**
 * Signal handler for graceful shutdown.
 * Cleans up build artifacts and exits with appropriate code.
 */
function createSignalHandler(signal: NodeJS.Signals): () => void {
  return () => {
    cleanupBuildArtifacts();
    // Exit codes: 128 + signal number (SIGINT=2 -> 130, SIGTERM=15 -> 143)
    const exitCode = signal === 'SIGINT' ? 130 : 143;
    process.exit(exitCode);
  };
}

// Store signal handlers for cleanup
let sigintHandler: (() => void) | null = null;
let sigtermHandler: (() => void) | null = null;

/**
 * Installs signal handlers for graceful shutdown.
 * Should be called at the start of the build process.
 */
function installSignalHandlers(): void {
  sigintHandler = createSignalHandler('SIGINT');
  sigtermHandler = createSignalHandler('SIGTERM');
  process.on('SIGINT', sigintHandler);
  process.on('SIGTERM', sigtermHandler);
}

/**
 * Removes signal handlers after build completes.
 * Should be called when the build finishes (success or failure).
 */
function removeSignalHandlers(): void {
  if (sigintHandler) {
    process.removeListener('SIGINT', sigintHandler);
    sigintHandler = null;
  }
  if (sigtermHandler) {
    process.removeListener('SIGTERM', sigtermHandler);
    sigtermHandler = null;
  }
}

export async function buildCommand(source: string, options: BuildOptions): Promise<void> {
  const signale = createSignaleInstance(options.verbose);

  // Setup output directory path
  const outputDir = path.dirname(options.output);

  // Initialize cleanup state and install signal handlers
  buildCleanupState.outputDir = outputDir;
  buildCleanupState.signaleInstance = signale;
  buildCleanupState.isBuilding = true;
  installSignalHandlers();

  try {
    signale.await(`Building ${source}...`);

    // Ensure output directory exists
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

    // Step 2: Generate state schema (state_root + types with CRDT metadata)
    signale.await('Generating state schema...');
    try {
      await generateStateSchema(source, abiJsonPath, {
        verbose: options.verbose,
        outputDir,
      });
      signale.success('State schema generated');
    } catch (error) {
      // Non-fatal: state schema generation is optional
      if (options.verbose) {
        signale.warn(`Failed to generate state schema: ${error}`);
      }
    }

    // Step 3: Generate ABI header for WASM embedding
    signale.await('Generating ABI header...');
    await generateAbiHeader(abiJsonPath, {
      verbose: options.verbose,
      outputDir,
    });
    signale.success('ABI header generated');

    // Step 4: Bundle with Rollup (with ABI injection)
    signale.await('Bundling JavaScript with Rollup...');
    const jsBundle = await bundleWithRollup(source, {
      verbose: options.verbose,
      outputDir,
      abiManifest,
    });
    signale.success('JavaScript bundled');

    // Step 5: Generate methods header
    signale.await('Extracting service methods...');
    await generateMethodsHeader(jsBundle, outputDir);
    signale.success('Methods extracted');

    // Step 6: Compile to C with QuickJS
    signale.await('Compiling to C with QuickJS...');
    const cCodePath = await compileToC(jsBundle, {
      verbose: options.verbose,
      outputDir,
    });
    signale.success('Compiled to C');

    // Step 7: Compile to WASM
    signale.await('Compiling to WebAssembly...');
    const wasmPath = await compileToWasm(cCodePath, {
      verbose: options.verbose,
      outputDir,
    });
    signale.success('Compiled to WASM');

    // Step 8: Generate JSON Schema for ABI validation
    signale.await('Generating ABI schema...');
    try {
      await generateAbiSchema({
        verbose: options.verbose,
        outputDir: outputDir,
      });
      signale.success('ABI schema generated');
    } catch (error) {
      // Non-fatal: schema generation is optional
      if (options.verbose) {
        signale.warn(`Failed to generate ABI schema: ${error}`);
      }
    }

    // Step 9: Optimize (if enabled)
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

    // Build completed successfully - mark as not building before removing handlers
    buildCleanupState.isBuilding = false;

    signale.success(`Contract built successfully: ${options.output} (${sizeKB} KB)`);
  } catch (error) {
    // Build failed - clean up artifacts on error to avoid inconsistent state
    signale.error('Build failed:', error);
    cleanupBuildArtifacts();
    process.exit(1);
  } finally {
    // Always remove signal handlers when build completes
    removeSignalHandlers();
    buildCleanupState.outputDir = null;
    buildCleanupState.signaleInstance = null;
  }
}
