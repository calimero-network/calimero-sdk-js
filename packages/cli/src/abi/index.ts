/**
 * ABI Generation for Calimero JavaScript SDK
 *
 * This module provides build-time ABI generation for JavaScript applications,
 * analyzing TypeScript/JavaScript source code and generating ABI manifests
 * that describe the application's state, methods, and events.
 */

export * from './emitter.js';

// Re-export main functions and types for convenience
export { generateAbiManifest, generateAbiFromSource, AbiEmitter } from './emitter.js';
export type {
  AbiManifest,
  TypeDef,
  Field,
  Variant,
  Method,
  Parameter,
  Event,
  TypeRef,
  ScalarType,
} from './emitter.js';
