/**
 * ABI Support for Calimero JavaScript SDK
 *
 * This module provides runtime ABI access and type definitions
 * to complement the build-time ABI generation in the CLI.
 */

export * from './types.js';
export * from './runtime.js';

// Re-export main functions
export { RuntimeAbiGenerator, get_abi_ptr, get_abi_len, get_abi } from './runtime.js';
