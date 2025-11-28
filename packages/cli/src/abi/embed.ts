/**
 * ABI Embedding for JavaScript applications
 * 
 * This module provides both build-time and runtime ABI embedding approaches:
 * 1. Build-time: Embed ABI as custom WASM section (like Rust)
 * 2. Runtime: Export ABI access functions (like Rust get_abi_* functions)
 */

import * as fs from 'fs';
import * as path from 'path';
import { AbiManifest } from './emitter.js';

/**
 * Generate JavaScript code that embeds ABI for runtime access
 * This creates the equivalent of Rust's get_abi_ptr/get_abi_len functions
 */
export function generateRuntimeAbiCode(manifest: AbiManifest): string {
  const abiJson = JSON.stringify(manifest, null, 2);
  
  return `
// Auto-generated ABI runtime access code
// This provides the same interface as Rust's get_abi_* functions

const ABI_MANIFEST = ${JSON.stringify(abiJson)};

// Export functions that merodb can call to extract ABI
globalThis.get_abi_ptr = function() {
  // In JavaScript/WASM context, we return the string directly
  // The actual pointer will be handled by the WASM runtime
  return ABI_MANIFEST;
};

globalThis.get_abi_len = function() {
  return ABI_MANIFEST.length;
};

globalThis.get_abi = function() {
  return ABI_MANIFEST;
};

// Also store in global for runtime introspection
globalThis.__CALIMERO_ABI_MANIFEST__ = ${JSON.stringify(manifest)};
`;
}

/**
 * Generate C code to embed ABI as custom WASM section
 * This creates the equivalent of Rust's custom section approach
 */
export function generateCustomSectionCode(manifest: AbiManifest): string {
  const abiJson = JSON.stringify(manifest);
  const abiBytes = Buffer.from(abiJson, 'utf-8');
  const bytesArray = Array.from(abiBytes).join(', ');
  
  return `
// Auto-generated ABI custom section code
// This embeds ABI in WASM custom section like Rust does

#include <stdint.h>

// ABI data as byte array
static const uint8_t ABI_DATA[] = {${bytesArray}};
static const uint32_t ABI_LENGTH = ${abiBytes.length};

// Export functions for runtime access (like Rust's get_abi_* functions)
__attribute__((export_name("get_abi_ptr")))
uint32_t get_abi_ptr() {
    return (uint32_t)ABI_DATA;
}

__attribute__((export_name("get_abi_len")))
uint32_t get_abi_len() {
    return ABI_LENGTH;
}

__attribute__((export_name("get_abi")))
uint32_t get_abi() {
    return get_abi_ptr();
}

// Export the ABI JSON string directly for easier access
__attribute__((export_name("get_abi_json")))
const char* get_abi_json() {
    return "${abiJson.replace(/"/g, '\\"').replace(/\n/g, '\\n')}";
}
`;
}

/**
 * Embed ABI in the build output directory
 */
export function embedAbi(manifest: AbiManifest, outputDir: string): void {
  // 1. Generate runtime JavaScript code
  const runtimeCode = generateRuntimeAbiCode(manifest);
  const runtimeFile = path.join(outputDir, 'abi_runtime.js');
  fs.writeFileSync(runtimeFile, runtimeCode);

  // 2. Generate custom section C code
  const customSectionCode = generateCustomSectionCode(manifest);
  const customSectionFile = path.join(outputDir, 'abi_embed.c');
  fs.writeFileSync(customSectionFile, customSectionCode);

  // 3. Save ABI manifest as JSON for debugging
  const abiFile = path.join(outputDir, 'abi.json');
  fs.writeFileSync(abiFile, JSON.stringify(manifest, null, 2));

  console.log(`ABI embedded: ${abiFile}`);
  console.log(`Runtime code: ${runtimeFile}`);
  console.log(`Custom section: ${customSectionFile}`);
}

/**
 * Post-process WASM file to embed ABI custom section
 */
export function postProcessWasmWithAbi(wasmPath: string, manifest: AbiManifest): void {
  try {
    const { embedAbiInWasm } = require('./wasm-post-process.js');
    embedAbiInWasm(wasmPath, manifest);
  } catch (error) {
    console.warn('Failed to embed ABI in WASM:', error);
  }
}

/**
 * Create ABI injection code for the JavaScript bundle
 * This gets injected into the main bundle to provide runtime ABI access
 */
export function createAbiInjectionCode(manifest: AbiManifest): string {
  return `
// Calimero ABI Runtime Injection
// This code MUST execute immediately when the bundle loads
(function() {
  'use strict';
  const ABI_MANIFEST = ${JSON.stringify(manifest)};
  
  // Store manifest globally for runtime access
  if (typeof globalThis !== 'undefined') {
    globalThis.__CALIMERO_ABI_MANIFEST__ = ABI_MANIFEST;
    
    // Export ABI access functions
    globalThis.get_abi_ptr = function() {
      return JSON.stringify(ABI_MANIFEST);
    };
    
    globalThis.get_abi_len = function() {
      return JSON.stringify(ABI_MANIFEST).length;
    };
    
    globalThis.get_abi = function() {
      return JSON.stringify(ABI_MANIFEST);
    };
  }
  
  // Also try to export for WASM context
  if (typeof exports !== 'undefined') {
    exports.get_abi_ptr = globalThis.get_abi_ptr;
    exports.get_abi_len = globalThis.get_abi_len;
    exports.get_abi = globalThis.get_abi;
  }
})();
// End of ABI Runtime Injection
`;
}

/**
 * Update the C builder to include ABI custom section
 */
export function generateBuilderUpdate(outputDir: string): string {
  return `
// Include ABI embedding code
#include "abi_embed.c"

// The ABI functions are now available:
// - get_abi_ptr()
// - get_abi_len() 
// - get_abi()
`;
}

/**
 * Validate ABI manifest structure
 */
export function validateAbiManifest(manifest: AbiManifest): boolean {
  try {
    // Check required fields
    if (!manifest.schema_version || manifest.schema_version !== 'wasm-abi/1') {
      console.warn('Invalid or missing schema_version');
      return false;
    }

    if (!manifest.types || typeof manifest.types !== 'object') {
      console.warn('Invalid or missing types');
      return false;
    }

    if (!Array.isArray(manifest.methods)) {
      console.warn('Invalid or missing methods');
      return false;
    }

    if (!Array.isArray(manifest.events)) {
      console.warn('Invalid or missing events');
      return false;
    }

    // Validate methods
    for (const method of manifest.methods) {
      if (!method.name || typeof method.name !== 'string') {
        console.warn(`Invalid method name: ${method.name}`);
        return false;
      }
      
      if (!Array.isArray(method.params)) {
        console.warn(`Invalid params for method ${method.name}`);
        return false;
      }
    }

    // Validate events
    for (const event of manifest.events) {
      if (!event.name || typeof event.name !== 'string') {
        console.warn(`Invalid event name: ${event.name}`);
        return false;
      }
      
      if (!Array.isArray(event.fields)) {
        console.warn(`Invalid fields for event ${event.name}`);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.warn('ABI validation error:', error);
    return false;
  }
}
