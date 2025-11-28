/**
 * ABI Generation and Embedding for Calimero JavaScript SDK
 *
 * This module provides comprehensive ABI support for JavaScript applications,
 * implementing both build-time analysis and runtime access patterns similar
 * to the Rust SDK.
 */

export * from './emitter.js';
export * from './embed.js';
export * from './wasm-post-process.js';

// Re-export main functions for convenience
export { generateAbiManifest, generateAbiFromSource, AbiEmitter } from './emitter.js';
export {
  embedAbi,
  generateRuntimeAbiCode,
  generateCustomSectionCode,
  createAbiInjectionCode,
  validateAbiManifest,
  postProcessWasmWithAbi,
} from './embed.js';
export { embedAbiInWasm } from './wasm-post-process.js';
