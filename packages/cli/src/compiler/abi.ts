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
      const { is_init: _is_init, is_view: _is_view, ...rest } = method;
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

/**
 * Generates JSON Schema for ABI validation
 *
 * @param options - Options for schema generation
 * @returns Path to generated schema.json file
 */
export async function generateAbiSchema(options: AbiOptions): Promise<string> {
  const schemaPath = path.join(options.outputDir, 'schema.json');

  // JSON Schema definition for ABI manifest
  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Calimero ABI Manifest Schema',
    description: 'JSON Schema for validating Calimero ABI manifest files',
    type: 'object',
    required: ['schema_version', 'types', 'methods', 'events'],
    properties: {
      schema_version: {
        type: 'string',
        description: 'ABI schema version',
        enum: ['wasm-abi/1'],
      },
      types: {
        type: 'object',
        description: 'Type definitions',
        additionalProperties: {
          type: 'object',
          required: ['kind'],
          oneOf: [
            {
              // Record type
              properties: {
                kind: { const: 'record' },
                fields: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['name', 'type'],
                    properties: {
                      name: { type: 'string' },
                      type: { $ref: '#/definitions/TypeRef' },
                      nullable: { type: 'boolean' },
                    },
                    additionalProperties: false,
                  },
                },
              },
              required: ['kind', 'fields'],
              additionalProperties: false,
            },
            {
              // Variant type
              properties: {
                kind: { const: 'variant' },
                variants: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['name'],
                    properties: {
                      name: { type: 'string' },
                      code: { type: 'string' },
                      payload: { $ref: '#/definitions/TypeRef' },
                    },
                    additionalProperties: false,
                  },
                },
              },
              required: ['kind', 'variants'],
              additionalProperties: false,
            },
            {
              // Bytes type
              properties: {
                kind: { const: 'bytes' },
                size: { type: 'number' },
                encoding: { type: 'string' },
              },
              required: ['kind'],
              additionalProperties: false,
            },
            {
              // Alias type
              properties: {
                kind: { const: 'alias' },
                target: { $ref: '#/definitions/TypeRef' },
              },
              required: ['kind', 'target'],
              additionalProperties: false,
            },
          ],
        },
      },
      methods: {
        type: 'array',
        description: 'Method definitions',
        items: {
          type: 'object',
          required: ['name', 'params'],
          properties: {
            name: { type: 'string' },
            params: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name', 'type'],
                properties: {
                  name: { type: 'string' },
                  type: { $ref: '#/definitions/TypeRef' },
                },
                additionalProperties: false,
              },
            },
            returns: { $ref: '#/definitions/TypeRef' },
            is_init: { type: 'boolean' },
            is_view: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      },
      events: {
        type: 'array',
        description: 'Event definitions',
        items: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            payload: { $ref: '#/definitions/TypeRef' },
          },
          additionalProperties: false,
        },
      },
      state_root: {
        type: 'string',
        description: 'Root state type name',
      },
    },
    additionalProperties: false,
    definitions: {
      TypeRef: {
        type: 'object',
        oneOf: [
          {
            // Scalar type (Rust format: { "kind": "string" })
            properties: {
              kind: {
                type: 'string',
                enum: [
                  'bool',
                  'u8',
                  'u16',
                  'u32',
                  'u64',
                  'u128',
                  'i8',
                  'i16',
                  'i32',
                  'i64',
                  'i128',
                  'f32',
                  'f64',
                  'string',
                  'bytes',
                  'unit',
                ],
              },
            },
            required: ['kind'],
            additionalProperties: false,
          },
          {
            // Option type
            properties: {
              kind: { const: 'option' },
              inner: { $ref: '#/definitions/TypeRef' },
            },
            required: ['kind', 'inner'],
            additionalProperties: false,
          },
          {
            // Vector/List type
            properties: {
              kind: { enum: ['vector', 'list'] },
              inner: { $ref: '#/definitions/TypeRef' },
              items: { $ref: '#/definitions/TypeRef' },
            },
            required: ['kind'],
            anyOf: [{ required: ['inner'] }, { required: ['items'] }],
            additionalProperties: false,
          },
          {
            // Map type
            properties: {
              kind: { const: 'map' },
              key: { $ref: '#/definitions/TypeRef' },
              value: { $ref: '#/definitions/TypeRef' },
            },
            required: ['kind', 'key', 'value'],
            additionalProperties: false,
          },
          {
            // Set type
            properties: {
              kind: { const: 'set' },
              inner: { $ref: '#/definitions/TypeRef' },
              items: { $ref: '#/definitions/TypeRef' },
            },
            required: ['kind'],
            anyOf: [{ required: ['inner'] }, { required: ['items'] }],
            additionalProperties: false,
          },
          {
            // Reference type (Rust format: { "$ref": "TypeName" })
            properties: {
              $ref: { type: 'string' },
            },
            required: ['$ref'],
            additionalProperties: false,
          },
          {
            // Reference type (TypeScript format: { "kind": "reference", "name": "TypeName" })
            properties: {
              kind: { const: 'reference' },
              name: { type: 'string' },
            },
            required: ['kind', 'name'],
            additionalProperties: false,
          },
        ],
      },
    },
  };

  fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2));

  if (options.verbose) {
    console.log(`ABI schema generated: ${schemaPath}`);
  }

  return schemaPath;
}
