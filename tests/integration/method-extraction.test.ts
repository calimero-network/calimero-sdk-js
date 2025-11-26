/**
 * Integration test for method extraction
 */

import * as path from 'path';
import * as fs from 'fs';
import { generateMethodsHeader } from '../../packages/cli/src/compiler/methods';

describe('Method Extraction', () => {
  const outputDir = path.join(__dirname, 'output');

  beforeAll(() => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true });
    }
  });

  it('should extract methods from simple class', async () => {
    // Create test JavaScript file
    const testJs = path.join(outputDir, 'test.js');
    fs.writeFileSync(
      testJs,
      `
      class CounterLogic {
        increment() {}
        decrement() {}
        getCount() {}
      }
    `
    );

    await generateMethodsHeader(testJs, outputDir);

    const headerPath = path.join(outputDir, 'methods.h');
    expect(fs.existsSync(headerPath)).toBe(true);

    const header = fs.readFileSync(headerPath, 'utf-8');
    expect(header).toContain('DEFINE_CALIMERO_METHOD(increment)');
    expect(header).toContain('DEFINE_CALIMERO_METHOD(decrement)');
    expect(header).toContain('DEFINE_CALIMERO_METHOD(getCount)');
  });

  it('should not include static methods', async () => {
    const testJs = path.join(outputDir, 'test-static.js');
    fs.writeFileSync(
      testJs,
      `
      class TestLogic {
        static initialize() {}
        regularMethod() {}
      }
    `
    );

    await generateMethodsHeader(testJs, outputDir);

    const header = fs.readFileSync(path.join(outputDir, 'methods.h'), 'utf-8');
    expect(header).toContain('DEFINE_CALIMERO_METHOD(regularMethod)');
    expect(header).not.toContain('DEFINE_CALIMERO_METHOD(initialize)');
  });
});
