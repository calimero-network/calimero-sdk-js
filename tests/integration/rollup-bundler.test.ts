/**
 * Integration test for Rollup bundler
 */

import * as path from 'path';
import * as fs from 'fs';
import { bundleWithRollup } from '../../packages/cli/src/compiler/rollup';

// Minimal ABI manifest for testing
const minimalAbiManifest = {
  schema_version: 'wasm-abi/1',
  types: {},
  methods: [],
  events: [],
};

describe('Rollup Bundler', () => {
  const outputDir = path.join(__dirname, 'output');

  beforeAll(() => {
    // Create output directory
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true });
    }
  });

  // Skipping for now - requires tslib installed in the workspace
  it.skip('should bundle simple TypeScript file', async () => {
    // Create a simple test file
    const testFile = path.join(outputDir, 'test-source.ts');
    fs.writeFileSync(
      testFile,
      `
      class Counter {
        private count = 0;
        
        increment(): number {
          this.count += 1;
          return this.count;
        }
        
        getCount(): number {
          return this.count;
        }
      }
      
      export { Counter };
    `
    );

    const bundlePath = await bundleWithRollup(testFile, {
      verbose: false,
      outputDir,
      abiManifest: minimalAbiManifest,
    });

    expect(fs.existsSync(bundlePath)).toBe(true);

    const bundleCode = fs.readFileSync(bundlePath, 'utf-8');

    // Verify bundle contains our code
    expect(bundleCode).toContain('Counter');
    expect(bundleCode).toContain('increment');
    expect(bundleCode).toContain('getCount');

    // Verify it's bundled
    expect(bundleCode.length).toBeGreaterThan(100);
  }, 30000);

  // Skip example bundling tests for now - they require full SDK setup
  it.skip('should bundle counter example', async () => {
    const counterSource = path.join(__dirname, '../../examples/counter/src/index.ts');

    const bundlePath = await bundleWithRollup(counterSource, {
      verbose: false,
      outputDir,
      abiManifest: minimalAbiManifest,
    });

    expect(fs.existsSync(bundlePath)).toBe(true);
    const bundleCode = fs.readFileSync(bundlePath, 'utf-8');
    expect(bundleCode).toContain('Counter');
  }, 30000);

  it.skip('should bundle kv-store example', async () => {
    const kvSource = path.join(__dirname, '../../examples/kv-store/src/index.ts');

    const bundlePath = await bundleWithRollup(kvSource, {
      verbose: false,
      outputDir,
      abiManifest: minimalAbiManifest,
    });

    expect(fs.existsSync(bundlePath)).toBe(true);
    const bundleCode = fs.readFileSync(bundlePath, 'utf-8');
    expect(bundleCode).toContain('KvStore');
  }, 30000);
});
