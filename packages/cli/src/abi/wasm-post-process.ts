/**
 * WASM Post-Processing for ABI Embedding
 * 
 * This module adds ABI custom sections to compiled WASM files,
 * ensuring compatibility with merodb and other Calimero tooling.
 */

import * as fs from 'fs';
import type { AbiManifest } from './emitter.js';

/**
 * Add ABI custom section to a WASM file
 */
export function embedAbiInWasm(wasmPath: string, manifest: AbiManifest): void {
  const wasmBytes = fs.readFileSync(wasmPath);
  const abiJson = JSON.stringify(manifest);
  const abiBytes = Buffer.from(abiJson, 'utf-8');
  
  // Create custom section
  const customSection = createCustomSection('calimero_abi_v1', abiBytes);
  
  // Insert custom section into WASM
  const modifiedWasm = insertCustomSection(wasmBytes, customSection);
  
  // Write back to file
  fs.writeFileSync(wasmPath, modifiedWasm);
}

/**
 * Create a WASM custom section
 */
function createCustomSection(name: string, data: Buffer): Buffer {
  const nameBytes = Buffer.from(name, 'utf-8');
  const nameLength = encodeULEB128(nameBytes.length);
  const sectionLength = encodeULEB128(nameLength.length + nameBytes.length + data.length);
  
  return Buffer.concat([
    Buffer.from([0x00]), // Custom section ID
    sectionLength,
    nameLength,
    nameBytes,
    data
  ]);
}

/**
 * Insert custom section into WASM binary
 */
function insertCustomSection(wasmBytes: Buffer, customSection: Buffer): Buffer {
  // WASM binary format: magic + version + sections
  const magic = wasmBytes.subarray(0, 4);
  const version = wasmBytes.subarray(4, 8);
  
  if (!magic.equals(Buffer.from([0x00, 0x61, 0x73, 0x6D]))) {
    throw new Error('Invalid WASM magic number');
  }
  
  if (!version.equals(Buffer.from([0x01, 0x00, 0x00, 0x00]))) {
    throw new Error('Unsupported WASM version');
  }
  
  // Find insertion point (after version, before first section)
  let insertPos = 8;
  
  // Parse sections to find a good insertion point
  let pos = 8;
  while (pos < wasmBytes.length) {
    const sectionId = wasmBytes[pos];
    pos++;
    
    const { value: sectionSize, bytesRead } = decodeULEB128(wasmBytes, pos);
    pos += bytesRead;
    
    // Insert custom section before the first non-custom section
    // or at the end if all sections are custom
    if (sectionId !== 0x00) { // Not a custom section
      insertPos = pos - bytesRead - 1;
      break;
    }
    
    pos += sectionSize;
    insertPos = pos;
  }
  
  // Insert the custom section
  return Buffer.concat([
    wasmBytes.subarray(0, insertPos),
    customSection,
    wasmBytes.subarray(insertPos)
  ]);
}

/**
 * Encode unsigned LEB128
 */
function encodeULEB128(value: number): Buffer {
  const bytes: number[] = [];
  
  do {
    let byte = value & 0x7F;
    value >>>= 7;
    
    if (value !== 0) {
      byte |= 0x80;
    }
    
    bytes.push(byte);
  } while (value !== 0);
  
  return Buffer.from(bytes);
}

/**
 * Decode unsigned LEB128
 */
function decodeULEB128(buffer: Buffer, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;
  
  while (offset + bytesRead < buffer.length) {
    const byte = buffer[offset + bytesRead];
    bytesRead++;
    
    value |= (byte & 0x7F) << shift;
    
    if ((byte & 0x80) === 0) {
      break;
    }
    
    shift += 7;
  }
  
  return { value, bytesRead };
}