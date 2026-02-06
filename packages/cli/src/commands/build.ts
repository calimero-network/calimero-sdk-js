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
import * as os from 'os';
import * as path from 'path';

const { Signale } = signale;

interface BuildOptions {
  output: string;
  verbose: boolean;
  optimize: boolean;
}

/**
 * Known build artifacts that may be created during the build process.
 * Only artifacts created during the current build are eligible for cleanup.
 * Note: Some artifacts are conditionally created depending on build options.
 */
const BUILD_ARTIFACTS = [
  'abi.json',
  'abi.h',
  'state-schema.json', // May not exist if state schema generation fails (non-fatal)
  'schema.json', // May not exist if ABI schema generation fails (non-fatal)
  'bundle.js',
  '__calimero_entry.ts',
  'methods.c',
  'methods.h',
  'code.h',
  'service.wasm',
  'service.unoptimized.wasm', // Created during WASM compilation step
];

/**
 * State for tracking active build for cleanup on signal interruption.
 */
interface BuildCleanupState {
  outputDir: string | null;
  outputPath: string | null;
  preexistingArtifacts: Set<string>;
  // Signale instance for build logging, null when not building
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
  outputPath: null,
  preexistingArtifacts: new Set(),
  signaleInstance: null,
  isBuilding: false,
};

// Flag to prevent reentrancy during cleanup (e.g., if user presses Ctrl+C twice)
let cleanupInProgress = false;

function getCleanupCandidates(): string[] {
  const { outputDir, outputPath } = buildCleanupState;

  if (!outputDir) {
    return [];
  }

  const candidates = new Set<string>();
  for (const artifact of BUILD_ARTIFACTS) {
    candidates.add(path.join(outputDir, artifact));
  }
  if (outputPath) {
    candidates.add(outputPath);
  }

  return Array.from(candidates);
}

function recordPreexistingArtifacts(): void {
  buildCleanupState.preexistingArtifacts.clear();
  for (const candidate of getCleanupCandidates()) {
    if (fs.existsSync(candidate)) {
      buildCleanupState.preexistingArtifacts.add(candidate);
    }
  }
}

/**
 * Resets all build cleanup state to initial values.
 * Should only be called after cleanup has completed or build succeeded.
 * Note: This function should not be called while cleanup is in progress.
 */
function resetBuildCleanupState(): void {
  buildCleanupState.isBuilding = false;
  buildCleanupState.outputDir = null;
  buildCleanupState.outputPath = null;
  buildCleanupState.signaleInstance = null;
  buildCleanupState.preexistingArtifacts.clear();
  // Reset reentrancy flag to ensure subsequent builds can run cleanup.
  // Safe to reset here since this function is only called after cleanup completes.
  cleanupInProgress = false;
}

/**
 * Cleans up build artifacts from the output directory.
 * Called when the build process is interrupted or fails.
 * Note: Cleanup must remain synchronous to work correctly with signal handlers.
 */
function cleanupBuildArtifacts(reason: 'signal' | 'error'): void {
  // Prevent reentrancy (e.g., if user presses Ctrl+C twice quickly)
  if (cleanupInProgress) {
    return;
  }

  const { outputDir, signaleInstance, isBuilding, preexistingArtifacts } = buildCleanupState;

  if (!isBuilding || !outputDir) {
    return;
  }

  cleanupInProgress = true;

  const warningMessage =
    reason === 'signal'
      ? '\nBuild interrupted, cleaning up artifacts...'
      : 'Build failed, cleaning up artifacts...';
  signaleInstance?.warn(warningMessage);

  for (const filePath of getCleanupCandidates()) {
    if (preexistingArtifacts.has(filePath)) {
      continue;
    }
    const displayName = path.relative(outputDir, filePath) || path.basename(filePath);
    try {
      // Directly attempt deletion - let the catch handle ENOENT for missing files
      fs.unlinkSync(filePath);
      signaleInstance?.info(`Removed: ${displayName}`);
    } catch (e: unknown) {
      // Ignore ENOENT (file doesn't exist), log other errors at debug level
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        signaleInstance?.debug?.(`Failed to remove ${displayName}: ${e}`);
      }
    }
  }

  cleanupInProgress = false;
}

/**
 * Signal handler for graceful shutdown.
 * Cleans up build artifacts and exits with appropriate code.
 * Exit code is 128 + signal number per POSIX convention.
 */
function createSignalHandler(signal: NodeJS.Signals): () => void {
  return () => {
    cleanupBuildArtifacts('signal');
    // Remove handlers before exit for defensive programming
    removeSignalHandlers();
    // Calculate exit code using signal number (128 + signal number per POSIX convention)
    const signalNumber = os.constants.signals[signal] ?? 0;
    const exitCode = 128 + signalNumber;
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
  const outputPath = options.output;
  const outputDir = path.dirname(outputPath);

  // Initialize cleanup state and install signal handlers
  buildCleanupState.outputDir = outputDir;
  buildCleanupState.outputPath = outputPath;
  buildCleanupState.signaleInstance = signale;
  buildCleanupState.isBuilding = true;
  recordPreexistingArtifacts();
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

    // Build output is now complete - mark as not building and remove signal handlers
    // immediately to prevent the race window where a signal could arrive after
    // isBuilding=false but before handlers are removed
    buildCleanupState.isBuilding = false;
    removeSignalHandlers();

    // Post-build informational operations - wrapped in try-catch since build is already
    // complete and we don't want to report failure if only the size calculation fails
    try {
      const stats = fs.statSync(options.output);
      const sizeKB = (stats.size / 1024).toFixed(2);
      signale.success(`Contract built successfully: ${options.output} (${sizeKB} KB)`);
    } catch {
      // Size calculation failed but build succeeded - report success without size
      signale.success(`Contract built successfully: ${options.output}`);
    }
  } catch (error) {
    // Build failed - clean up artifacts on error to avoid inconsistent state
    signale.error('Build failed:', error);
    cleanupBuildArtifacts('error');
    // Cleanup before exit - process.exit() below skips the finally block, so we must
    // explicitly clean up here. The finally block only runs on successful completion.
    removeSignalHandlers();
    resetBuildCleanupState();
    process.exit(1);
  } finally {
    // Cleanup for successful completion path only (error path exits via process.exit above)
    removeSignalHandlers();
    resetBuildCleanupState();
  }
}
