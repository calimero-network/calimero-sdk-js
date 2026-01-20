/**
 * QuickJS compiler
 *
 * Compiles JavaScript to C code using qjsc (QuickJS compiler)
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { findPackageRoot } from '../utils/package-root.js';

interface QuickJSOptions {
  verbose: boolean;
  outputDir: string;
}

/**
 * Compiles JavaScript to C code using QuickJS
 *
 * @param jsFile - Path to JavaScript bundle
 * @param options - Compiler options
 * @returns Path to generated C header file
 */
export async function compileToC(jsFile: string, options: QuickJSOptions): Promise<string> {
  const packageRoot = findPackageRoot();
  const qjscPath = path.join(packageRoot, 'deps/qjsc');
  const outputFile = path.join(options.outputDir, 'code.h');

  // Check if qjsc exists
  if (!fs.existsSync(qjscPath)) {
    throw new Error(
      'QuickJS compiler not found. Please run: pnpm install\n' +
        'This will download QuickJS automatically.'
    );
  }

  // Compile with qjsc
  // -c: Compile to C code
  // -o: Output file
  // -m: Module mode (ES6 modules)
  // -N: Set C name for the bytecode array (must match builder.c)
  const cmd = `${qjscPath} -c -o ${outputFile} -m -N code ${jsFile}`;

  if (options.verbose) {
    console.log(`Running: ${cmd}`);
  }

  try {
    execSync(cmd, {
      stdio: options.verbose ? 'inherit' : 'pipe',
      cwd: process.cwd(),
    });
  } catch (error) {
    throw new Error(`QuickJS compilation failed: ${error}`);
  }

  if (!fs.existsSync(outputFile)) {
    throw new Error(`QuickJS failed to generate output file: ${outputFile}`);
  }

  return outputFile;
}
