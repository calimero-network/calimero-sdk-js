/**
 * Runtime ABI Access for JavaScript SDK
 *
 * This module provides runtime ABI generation and access, similar to Rust's
 * runtime reflection capabilities. It complements the build-time ABI generation.
 */

import type { AbiManifest, TypeRef } from './types.js';

/**
 * Runtime ABI generator that uses JavaScript reflection
 * to analyze the current application state and generate ABI
 */
export class RuntimeAbiGenerator {
  private static cachedManifest: AbiManifest | null = null;

  /**
   * Generate ABI manifest from runtime reflection
   */
  static generateRuntimeManifest(): AbiManifest {
    if (this.cachedManifest) {
      return this.cachedManifest;
    }

    const manifest: AbiManifest = {
      schema_version: 'wasm-abi/1',
      types: {},
      methods: [],
      events: [],
    };

    // Check for build-time generated ABI first
    const buildTimeAbi = this.getBuildTimeAbi();
    if (buildTimeAbi) {
      this.cachedManifest = buildTimeAbi;
      return buildTimeAbi;
    }

    // Fallback to runtime reflection
    try {
      this.analyzeGlobalScope(manifest);
      this.analyzeStateManager(manifest);
      this.analyzeMethodRegistry(manifest);
    } catch (error) {
      console.warn('Runtime ABI generation failed:', error);
    }

    this.cachedManifest = manifest;
    return manifest;
  }

  /**
   * Get build-time generated ABI if available
   */
  private static getBuildTimeAbi(): AbiManifest | null {
    try {
      // Check for embedded ABI manifest
      if (typeof globalThis !== 'undefined') {
        // Try direct access first
        if (globalThis.__CALIMERO_ABI_MANIFEST__) {
          return globalThis.__CALIMERO_ABI_MANIFEST__;
        }
        
        // Try to get from ABI access functions (for WASM context)
        if (typeof (globalThis as any).get_abi === 'function') {
          try {
            const abiJson = (globalThis as any).get_abi();
            if (typeof abiJson === 'string') {
              const manifest = JSON.parse(abiJson);
              // Cache it for future use
              globalThis.__CALIMERO_ABI_MANIFEST__ = manifest;
              return manifest;
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Analyze global scope for Calimero classes
   */
  private static analyzeGlobalScope(manifest: AbiManifest): void {
    if (typeof globalThis === 'undefined') return;

    for (const [name, value] of Object.entries(globalThis)) {
      if (typeof value === 'function' && value.prototype) {
        // Check for Calimero decorators
        if ((value as any)._calimeroState) {
          manifest.state_root = name;
          this.analyzeStateClass(value, manifest);
        }

        if ((value as any)._calimeroLogic) {
          this.analyzeLogicClass(value, manifest);
        }

        if ((value as any)._calimeroEvent) {
          this.analyzeEventClass(value, manifest);
        }
      }
    }
  }

  /**
   * Analyze state manager for current state
   */
  private static analyzeStateManager(manifest: AbiManifest): void {
    try {
      // Try to get state from StateManager
      const StateManager = (globalThis as any).StateManager;
      if (StateManager && StateManager.getCurrentState) {
        const state = StateManager.getCurrentState();
        if (state) {
          const stateClass = state.constructor;
          manifest.state_root = stateClass.name;
          this.analyzeStateClass(stateClass, manifest);
        }
      }
    } catch {
      // Ignore errors in state analysis
    }
  }

  /**
   * Analyze method registry for available methods
   */
  private static analyzeMethodRegistry(manifest: AbiManifest): void {
    try {
      const registry = (globalThis as any).__CALIMERO_METHOD_REGISTRY__;
      if (registry) {
        // Extract methods from registry
        if (registry.logic) {
          Object.values(registry.logic).forEach((entry: any) => {
            if (entry.methods) {
              entry.methods.forEach((methodName: string) => {
                if (!manifest.methods.find(m => m.name === methodName)) {
                  manifest.methods.push({
                    name: methodName,
                    params: [], // Runtime reflection can't easily get param types
                    returns: { kind: 'scalar', scalar: 'string' }, // Default return type
                  });
                }
              });
            }

            if (entry.init) {
              manifest.methods.push({
                name: entry.init,
                params: [],
                is_init: true,
              });
            }
          });
        }

        if (registry.functions) {
          registry.functions.forEach((functionName: string) => {
            if (!manifest.methods.find(m => m.name === functionName)) {
              manifest.methods.push({
                name: functionName,
                params: [],
                returns: { kind: 'scalar', scalar: 'string' },
              });
            }
          });
        }
      }
    } catch {
      // Ignore errors in method registry analysis
    }
  }

  /**
   * Analyze a state class
   */
  private static analyzeStateClass(stateClass: any, manifest: AbiManifest): void {
    const className = stateClass.name;
    if (!className || manifest.types[className]) return;

    const fields: any[] = [];

    // Try to get field information from prototype or instance
    try {
      const instance = new stateClass();
      for (const key of Object.keys(instance)) {
        if (!key.startsWith('_')) {
          fields.push({
            name: key,
            type: this.inferTypeFromValue(instance[key]),
          });
        }
      }
    } catch {
      // If we can't instantiate, try to get from prototype
      const prototype = stateClass.prototype;
      if (prototype) {
        for (const key of Object.getOwnPropertyNames(prototype)) {
          if (!key.startsWith('_') && key !== 'constructor') {
            fields.push({
              name: key,
              type: { kind: 'scalar', scalar: 'string' }, // Default type
            });
          }
        }
      }
    }

    manifest.types[className] = {
      kind: 'record',
      fields,
    };
  }

  /**
   * Analyze a logic class
   */
  private static analyzeLogicClass(logicClass: any, manifest: AbiManifest): void {
    const prototype = logicClass.prototype;
    if (!prototype) return;

    for (const methodName of Object.getOwnPropertyNames(prototype)) {
      if (methodName === 'constructor' || methodName.startsWith('_')) {
        continue;
      }

      const method = prototype[methodName];
      if (typeof method === 'function') {
        // Check for existing method
        if (manifest.methods.find(m => m.name === methodName)) {
          continue;
        }

        // Try to extract method metadata
        const isInit = method._calimeroInit || methodName === 'init';
        const isView = method._calimeroView;

        manifest.methods.push({
          name: methodName,
          params: [], // Runtime can't easily determine parameter types
          returns: { kind: 'scalar', scalar: 'string' }, // Default return type
          is_init: isInit,
          is_view: isView,
        });
      }
    }
  }

  /**
   * Analyze an event class
   */
  private static analyzeEventClass(eventClass: any, manifest: AbiManifest): void {
    const className = eventClass.name;
    if (!className || manifest.events.find(e => e.name === className)) return;

    manifest.events.push({
      name: className,
      fields: [], // Runtime can't easily determine event fields
    });
  }

  /**
   * Infer type from a runtime value
   */
  private static inferTypeFromValue(value: any): TypeRef {
    if (value === null || value === undefined) {
      return { kind: 'scalar', scalar: 'string' };
    }

    const type = typeof value;
    switch (type) {
      case 'boolean':
        return { kind: 'scalar', scalar: 'bool' };
      case 'number':
        return { kind: 'scalar', scalar: 'f64' };
      case 'bigint':
        return { kind: 'scalar', scalar: 'u64' };
      case 'string':
        return { kind: 'scalar', scalar: 'string' };
      case 'object':
        if (Array.isArray(value)) {
          return {
            kind: 'vector',
            inner:
              value.length > 0
                ? this.inferTypeFromValue(value[0])
                : { kind: 'scalar', scalar: 'string' },
          };
        }
        if (value.constructor) {
          const constructorName = value.constructor.name;
          // Check for Calimero CRDT types
          switch (constructorName) {
            case 'UnorderedMap':
              return {
                kind: 'map',
                key: { kind: 'scalar', scalar: 'string' },
                value: { kind: 'scalar', scalar: 'string' },
              };
            case 'UnorderedSet':
              return { kind: 'set', inner: { kind: 'scalar', scalar: 'string' } };
            case 'Vector':
              return { kind: 'vector', inner: { kind: 'scalar', scalar: 'string' } };
            case 'Counter':
              // Counter returns u64 value, but is stored as collection reference (32 bytes)
              return { kind: 'scalar', scalar: 'u64' };
            case 'LwwRegister':
              return { kind: 'scalar', scalar: 'string' }; // Default inner type
            default:
              return { kind: 'reference', name: constructorName };
          }
        }
        return { kind: 'scalar', scalar: 'string' };
      default:
        return { kind: 'scalar', scalar: 'string' };
    }
  }

  /**
   * Clear cached manifest (useful for testing)
   */
  static clearCache(): void {
    this.cachedManifest = null;
  }
}

/**
 * Export functions that merodb can call (similar to Rust's get_abi_* functions)
 */
export function get_abi_ptr(): string {
  const manifest = RuntimeAbiGenerator.generateRuntimeManifest();
  return JSON.stringify(manifest);
}

export function get_abi_len(): number {
  return get_abi_ptr().length;
}

export function get_abi(): string {
  return get_abi_ptr();
}

// Export to global scope for WASM access
if (typeof globalThis !== 'undefined') {
  globalThis.get_abi_ptr = get_abi_ptr;
  globalThis.get_abi_len = get_abi_len;
  globalThis.get_abi = get_abi;
}
