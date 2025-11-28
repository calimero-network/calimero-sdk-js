/**
 * ABI Generation and Embedding
 *
 * Generates ABI manifest from source code and creates header file for embedding
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateAbiManifestRustFormat } from '../abi/emitter.js';

interface AbiOptions {
  verbose: boolean;
  outputDir: string;
}

/**
 * Generates ABI manifest from source code and saves as JSON
 *
 * @param sourceFile - Path to source TypeScript/JavaScript file
 * @param options - Options for ABI generation
 * @returns Path to generated ABI JSON file
 */
export async function generateAbiJson(sourceFile: string, options: AbiOptions): Promise<string> {
  const abiJsonPath = path.join(options.outputDir, 'abi.json');

  if (options.verbose) {
    console.log(`Generating ABI from: ${sourceFile}`);
  }

  const abi = generateAbiManifestRustFormat(sourceFile);

  // Write ABI JSON file
  fs.writeFileSync(abiJsonPath, JSON.stringify(abi, null, 2));

  if (options.verbose) {
    const stats = fs.statSync(abiJsonPath);
    console.log(`ABI JSON generated: ${abiJsonPath} (${(stats.size / 1024).toFixed(2)} KB)`);
  }

  return abiJsonPath;
}

/**
 * Generates C header file from ABI JSON for embedding in WASM
 *
 * @param abiJsonPath - Path to ABI JSON file
 * @param options - Options for header generation
 * @returns Path to generated ABI header file
 */
export async function generateAbiHeader(abiJsonPath: string, options: AbiOptions): Promise<string> {
  const abiHeaderPath = path.join(options.outputDir, 'abi.h');

  if (!fs.existsSync(abiJsonPath)) {
    throw new Error(`ABI JSON file not found: ${abiJsonPath}`);
  }

  const abiJson = fs.readFileSync(abiJsonPath, 'utf-8');
  const abiBytes = Buffer.from(abiJson, 'utf-8');

  // Generate C header file similar to storage_wasm.h
  // Use xxd-style format: unsigned char array with length
  const lines: string[] = [];
  lines.push('#ifndef CALIMERO_ABI_H');
  lines.push('#define CALIMERO_ABI_H');
  lines.push('');
  lines.push('// Auto-generated ABI manifest');
  lines.push(`// Generated from: ${path.basename(abiJsonPath)}`);
  lines.push('');

  // Generate byte array
  const varName = 'calimero_abi_json';
  lines.push(`static const unsigned char ${varName}[] = {`);

  // Write bytes in hex format (16 bytes per line)
  for (let i = 0; i < abiBytes.length; i += 16) {
    const chunk = abiBytes.slice(i, i + 16);
    const hexBytes = Array.from(chunk)
      .map(b => `0x${b.toString(16).padStart(2, '0')}`)
      .join(', ');
    const comma = i + 16 < abiBytes.length ? ',' : '';
    lines.push(`  ${hexBytes}${comma}`);
  }

  lines.push('};');
  lines.push('');
  lines.push(`#define ${varName}_len ${abiBytes.length}`);
  lines.push('');
  lines.push('#endif // CALIMERO_ABI_H');

  fs.writeFileSync(abiHeaderPath, lines.join('\n'));

  if (options.verbose) {
    console.log(`ABI header generated: ${abiHeaderPath}`);
  }

  return abiHeaderPath;
}

/**
 * Generates a codegen-compatible ABI JSON (removes Rust-specific fields)
 *
 * @param abiJsonPath - Path to ABI JSON file
 * @param options - Options for codegen ABI generation
 * @returns Path to generated codegen-compatible ABI JSON file
 */
export async function generateCodegenAbi(
  abiJsonPath: string,
  options: AbiOptions
): Promise<string> {
  const codegenAbiPath = path.join(options.outputDir, 'abi.codegen.json');

  if (!fs.existsSync(abiJsonPath)) {
    throw new Error(`ABI JSON file not found: ${abiJsonPath}`);
  }

  const abi = JSON.parse(fs.readFileSync(abiJsonPath, 'utf-8'));

  // Remove Rust-specific fields that aren't in the codegen schema
  // - Remove state_root (not in schema)
  // - Remove is_init and is_view from methods (not in schema)
  const codegenAbi: any = {
    schema_version: abi.schema_version,
    types: abi.types,
    methods: abi.methods.map((method: any) => {
      const { is_init, is_view, ...rest } = method;
      return rest;
    }),
    events: abi.events,
  };

  fs.writeFileSync(codegenAbiPath, JSON.stringify(codegenAbi, null, 2));

  if (options.verbose) {
    console.log(`Codegen-compatible ABI generated: ${codegenAbiPath}`);
  }

  return codegenAbiPath;
}
