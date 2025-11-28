/**
 * ABI Helper Functions
 *
 * Utilities for accessing and querying the ABI manifest at runtime
 */

import type { AbiManifest, TypeRef, TypeDef, Method, Event } from './types.js';

/**
 * Gets the ABI manifest from the global scope
 * Supports both parsed object (from Rollup) and string (from C injection)
 */
export function getAbiManifest(): AbiManifest | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }

  const manifest = (globalThis as any).__CALIMERO_ABI_MANIFEST__;
  if (!manifest) {
    return null;
  }

  // If it's a string (from C injection), parse it
  if (typeof manifest === 'string') {
    try {
      return JSON.parse(manifest) as AbiManifest;
    } catch {
      return null;
    }
  }

  // If it's already an object (from Rollup), return it
  return manifest as AbiManifest;
}

/**
 * Resolves a TypeRef to its full TypeDef
 */
export function resolveTypeRef(abi: AbiManifest, typeRef: TypeRef): TypeDef | null {
  if (typeRef.kind === 'reference' && typeRef.name) {
    return abi.types[typeRef.name] || null;
  }
  return null;
}

/**
 * Gets a method definition by name
 */
export function getMethod(abi: AbiManifest, methodName: string): Method | null {
  return abi.methods.find(m => m.name === methodName) || null;
}

/**
 * Gets an event definition by name
 */
export function getEvent(abi: AbiManifest, eventName: string): Event | null {
  return abi.events.find(e => e.name === eventName) || null;
}

/**
 * Gets the payload type for an event
 */
export function getEventPayloadType(abi: AbiManifest, eventName: string): TypeRef | null {
  const event = getEvent(abi, eventName);
  return event?.payload || null;
}

/**
 * Gets the state root type definition
 */
export function getStateRootType(abi: AbiManifest): TypeDef | null {
  if (!abi.state_root) {
    return null;
  }
  return abi.types[abi.state_root] || null;
}

/**
 * Checks if a type is nullable
 */
export function isNullable(typeRef: TypeRef): boolean {
  if (typeRef.kind === 'option') {
    return true;
  }
  // Check if the type itself has nullable flag (for fields)
  return false;
}

/**
 * Gets the inner type for option/vector types
 */
export function getInnerType(typeRef: TypeRef): TypeRef | null {
  if (typeRef.kind === 'option' || typeRef.kind === 'vector') {
    return typeRef.inner || null;
  }
  return null;
}
