/**
 * Rollup bundler
 *
 * Bundles TypeScript/JavaScript with all dependencies
 */

import { rollup } from 'rollup';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import { babel } from '@rollup/plugin-babel';
import * as fs from 'fs';
import * as path from 'path';

interface RollupOptions {
  verbose: boolean;
  outputDir: string;
}

/**
 * Bundles JavaScript/TypeScript with Rollup
 *
 * @param source - Source file path
 * @param options - Bundler options
 * @returns Path to bundled JavaScript file
 */
export async function bundleWithRollup(
  source: string,
  options: RollupOptions
): Promise<string> {
  const outputFile = path.join(options.outputDir, 'bundle.js');

  const bundle = await rollup({
    input: source,
    plugins: [
      nodeResolve({
        extensions: ['.js', '.ts'],
        preferBuiltins: false
      }),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        sourceMap: false
      }),
      commonjs(),
      babel({
        babelHelpers: 'bundled',
        presets: ['@babel/preset-env'],
        extensions: ['.js', '.ts']
      })
    ],
    external: [], // Bundle everything
    onwarn: (warning, warn) => {
      // Suppress certain warnings
      if (warning.code === 'THIS_IS_UNDEFINED') return;
      if (options.verbose) {
        warn(warning);
      }
    }
  });

  const { output } = await bundle.generate({
    format: 'esm',
    file: outputFile,
    sourcemap: false
  });

  // Write to file
  fs.writeFileSync(outputFile, output[0].code);

  if (options.verbose) {
    console.log(`Bundled to: ${outputFile} (${(output[0].code.length / 1024).toFixed(2)} KB)`);
  }

  return outputFile;
}

