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
export async function bundleWithRollup(source: string, options: RollupOptions): Promise<string> {
  const outputFile = path.join(options.outputDir, 'bundle.js');
  const normalizedSource = path.resolve(source).replace(/\\/g, '/');
  const entryFile = path.join(options.outputDir, '__calimero_entry.ts');

  const entryContents = [
    `import '${normalizedSource}';`,
    "import '@calimero-network/calimero-sdk-js/runtime/dispatcher';",
  ].join('\n');

  fs.writeFileSync(entryFile, `${entryContents}\n`);

  // Find tsconfig relative to source file
  const sourceDir = path.dirname(path.resolve(source));
  const possibleTsconfigs = [
    path.join(sourceDir, 'tsconfig.json'),
    path.join(sourceDir, '..', 'tsconfig.json'),
    path.join(sourceDir, '..', '..', 'tsconfig.json'),
  ];

  let tsconfigPath: string | undefined;
  for (const tsconfig of possibleTsconfigs) {
    if (fs.existsSync(tsconfig)) {
      tsconfigPath = tsconfig;
      break;
    }
  }

  const bundle = await rollup({
    input: entryFile,
    plugins: [
      nodeResolve({
        extensions: ['.js', '.ts'],
        preferBuiltins: false,
      }),
      typescript({
        tsconfig: tsconfigPath,
        declaration: false,
        sourceMap: false,
        compilerOptions: {
          module: 'ES2015',
          target: 'ES2015',
          importHelpers: false,
          noEmitHelpers: true,
        },
      }),
      commonjs(),
      babel({
        babelHelpers: 'bundled',
        presets: ['@babel/preset-env'],
        extensions: ['.js', '.ts'],
      }),
    ],
    external: [], // Bundle everything
    onwarn: (warning, warn) => {
      // Suppress certain warnings
      if (warning.code === 'THIS_IS_UNDEFINED') return;
      if (options.verbose) {
        warn(warning);
      }
    },
  });

  const { output } = await bundle.generate({
    format: 'esm',
    file: outputFile,
    sourcemap: false,
  });

  // Write to file
  fs.writeFileSync(outputFile, output[0].code);

  try {
    fs.unlinkSync(entryFile);
  } catch (error) {
    if (options.verbose) {
      console.warn(`Failed to remove temporary entry file: ${error}`);
    }
  }

  if (options.verbose) {
    console.log(`Bundled to: ${outputFile} (${(output[0].code.length / 1024).toFixed(2)} KB)`);
  }

  return outputFile;
}
