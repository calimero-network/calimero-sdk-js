/**
 * ABI Embedding Tests
 *
 * Tests that verify ABI manifest is correctly generated and embedded
 * into JavaScript bundles and WASM files.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('ABI Embedding', () => {
  const testExampleDir = path.join(__dirname, '../../examples/counter');
  const testOutputDir = path.join(__dirname, '../../tmp/abi-embedding-test');

  beforeAll(() => {
    // Clean up test directory
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true });
    }
    fs.mkdirSync(testOutputDir, { recursive: true });
  });

  afterAll(() => {
    // Clean up test directory
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true });
    }
  });

  describe('ABI Generation via Build', () => {
    it('should generate ABI JSON file during build', () => {
      // Run build command which should generate ABI
      const buildDir = path.join(testExampleDir, 'build');
      if (fs.existsSync(buildDir)) {
        fs.rmSync(buildDir, { recursive: true });
      }

      const buildOutput = execSync(`cd ${testExampleDir} && pnpm build:manual 2>&1`, {
        encoding: 'utf-8',
      });

      expect(buildOutput).toContain('ABI manifest generated');
      expect(buildOutput).toContain('ABI header generated');

      const abiJsonPath = path.join(testExampleDir, 'build/abi.json');
      expect(fs.existsSync(abiJsonPath)).toBe(true);

      const abiContent = JSON.parse(fs.readFileSync(abiJsonPath, 'utf-8'));
      expect(abiContent).toHaveProperty('schema_version');
      expect(abiContent).toHaveProperty('types');
      expect(abiContent).toHaveProperty('methods');
      expect(abiContent).toHaveProperty('events');
      expect(abiContent.schema_version).toBe('wasm-abi/1');
    });

    it('should generate ABI header file during build', () => {
      const abiHeaderPath = path.join(testExampleDir, 'build/abi.h');
      expect(fs.existsSync(abiHeaderPath)).toBe(true);

      const headerContent = fs.readFileSync(abiHeaderPath, 'utf-8');
      expect(headerContent).toContain('#ifndef CALIMERO_ABI_H');
      expect(headerContent).toContain('#define CALIMERO_ABI_H');
      expect(headerContent).toContain('calimero_abi_json');
      expect(headerContent).toContain('calimero_abi_json_len');
    });

    it('should generate ABI with correct structure', () => {
      const abiJsonPath = path.join(testExampleDir, 'build/abi.json');
      const abi = JSON.parse(fs.readFileSync(abiJsonPath, 'utf-8'));

      // Check that state root exists
      expect(abi.state_root).toBeDefined();
      expect(typeof abi.state_root).toBe('string');

      // Check that state root type exists in types
      if (abi.state_root) {
        expect(abi.types[abi.state_root]).toBeDefined();
        expect(abi.types[abi.state_root].kind).toBe('record');
      }

      // Check that methods exist
      expect(Array.isArray(abi.methods)).toBe(true);
      expect(abi.methods.length).toBeGreaterThan(0);

      // Check that init method exists
      const initMethod = abi.methods.find((m: { is_init?: boolean }) => m.is_init === true);
      expect(initMethod).toBeDefined();
    });
  });

  describe('Build Integration', () => {
    it('should generate ABI files during build', () => {
      const buildDir = path.join(testOutputDir, 'build');
      if (fs.existsSync(buildDir)) {
        fs.rmSync(buildDir, { recursive: true });
      }
      fs.mkdirSync(buildDir, { recursive: true });

      // Run build command
      const buildOutput = execSync(`cd ${testExampleDir} && pnpm build:manual 2>&1`, {
        encoding: 'utf-8',
      });

      expect(buildOutput).toContain('ABI manifest generated');
      expect(buildOutput).toContain('ABI header generated');

      // Check that ABI files exist in build directory
      const abiJsonPath = path.join(testExampleDir, 'build/abi.json');
      const abiHeaderPath = path.join(testExampleDir, 'build/abi.h');

      expect(fs.existsSync(abiJsonPath)).toBe(true);
      expect(fs.existsSync(abiHeaderPath)).toBe(true);
    });

    it('should embed ABI in JavaScript bundle', () => {
      const bundlePath = path.join(testExampleDir, 'build/bundle.js');
      if (!fs.existsSync(bundlePath)) {
        // Build if bundle doesn't exist
        execSync(`cd ${testExampleDir} && pnpm build:manual`, { encoding: 'utf-8' });
      }

      expect(fs.existsSync(bundlePath)).toBe(true);
      const bundleContent = fs.readFileSync(bundlePath, 'utf-8');

      // Check that ABI manifest is injected
      expect(bundleContent).toContain('__CALIMERO_ABI_MANIFEST__');
      expect(bundleContent).toContain('schema_version');

      // Verify ABI content matches generated JSON
      const abiJsonPath = path.join(testExampleDir, 'build/abi.json');
      const abi = JSON.parse(fs.readFileSync(abiJsonPath, 'utf-8'));

      // Check that bundle contains state_root from ABI
      expect(bundleContent).toContain(abi.state_root);
    });

    it('should generate ABI JSON alongside WASM output', () => {
      const wasmPath = path.join(testExampleDir, 'build/service.wasm');
      const abiJsonPath = path.join(testExampleDir, 'build/abi.json');

      if (!fs.existsSync(wasmPath)) {
        execSync(`cd ${testExampleDir} && pnpm build:manual`, { encoding: 'utf-8' });
      }

      // Both files should exist in the same directory
      expect(fs.existsSync(wasmPath)).toBe(true);
      expect(fs.existsSync(abiJsonPath)).toBe(true);

      // Verify ABI JSON is valid
      const abi = JSON.parse(fs.readFileSync(abiJsonPath, 'utf-8'));
      expect(abi.schema_version).toBe('wasm-abi/1');
    });
  });

  describe('ABI Header Content', () => {
    it('should generate valid C header with correct byte array', () => {
      const abiJsonPath = path.join(testExampleDir, 'build/abi.json');
      const abiHeaderPath = path.join(testExampleDir, 'build/abi.h');

      expect(fs.existsSync(abiJsonPath)).toBe(true);
      expect(fs.existsSync(abiHeaderPath)).toBe(true);

      const headerContent = fs.readFileSync(abiHeaderPath, 'utf-8');
      const abiJson = fs.readFileSync(abiJsonPath, 'utf-8');

      // Verify header contains byte array
      expect(headerContent).toMatch(/static const unsigned char calimero_abi_json\[\] = \{/);

      // Verify length macro exists
      expect(headerContent).toMatch(/calimero_abi_json_len/);

      // Verify header length matches JSON length
      const lengthMatch = headerContent.match(/calimero_abi_json_len (\d+)/);
      if (lengthMatch) {
        const declaredLength = parseInt(lengthMatch[1], 10);
        expect(declaredLength).toBe(abiJson.length);
      }
    });
  });
});
