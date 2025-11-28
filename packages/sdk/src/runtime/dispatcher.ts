import { log, valueReturn, flushDelta, registerLen, readRegister, input, panic } from '../env/api';
import { StateManager } from './state-manager';
import { runtimeLogicEntries } from './method-registry';
import { getAbiManifest, getMethod } from '../abi/helpers';
import type { TypeRef, AbiManifest, ScalarType } from '../abi/types';
import './sync';

type JsonObject = Record<string, unknown>;

const REGISTER_ID = 0n;

if (typeof (globalThis as any).__calimero_register_merge !== 'function') {
  (globalThis as any).__calimero_register_merge = function __calimero_register_merge(): void {};
}

/**
 * Converts a JSON value to ABI-compatible format
 * Handles string-to-bigint conversion and other type-specific conversions
 */
function convertFromJsonCompatible(value: unknown, typeRef: TypeRef, abi: AbiManifest): unknown {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return null;
  }

  // Handle scalar types (both formats: {kind: "scalar", scalar: "u64"} and {kind: "u64"})
  const scalarType =
    typeRef.kind === 'scalar'
      ? typeRef.scalar
      : [
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
          ].includes(typeRef.kind)
        ? (typeRef.kind as ScalarType)
        : null;

  if (scalarType) {
    // Convert string bigint types back to bigint
    if (
      scalarType === 'u64' ||
      scalarType === 'i64' ||
      scalarType === 'u128' ||
      scalarType === 'i128'
    ) {
      if (typeof value === 'string') {
        return BigInt(value);
      }
      if (typeof value === 'number') {
        return BigInt(value);
      }
    }

    // Handle bytes - convert array of numbers back to Uint8Array
    if (scalarType === 'bytes') {
      if (Array.isArray(value)) {
        return new Uint8Array(value as number[]);
      }
    }

    // For other scalars, return as-is
    return value;
  }

  // Handle option types
  if (typeRef.kind === 'option') {
    if (value === null || value === undefined) {
      return null;
    }
    return convertFromJsonCompatible(value, typeRef.inner!, abi);
  }

  // Handle vector/list types
  if (typeRef.kind === 'vector' || typeRef.kind === 'list') {
    if (!Array.isArray(value)) {
      throw new Error(`Expected array for ${typeRef.kind} type, got ${typeof value}`);
    }
    const innerType = typeRef.inner || typeRef.items;
    if (!innerType) {
      throw new Error(`Missing inner type for ${typeRef.kind}`);
    }
    return value.map(item => convertFromJsonCompatible(item, innerType, abi));
  }

  // Handle map types
  if (typeRef.kind === 'map') {
    if (typeof value !== 'object' || value === null) {
      throw new Error(`Expected object for map type, got ${typeof value}`);
    }
    const entries = Object.entries(value);
    const result: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      result[key] = convertFromJsonCompatible(val, typeRef.value!, abi);
    }
    return result;
  }

  // Handle set types
  if (typeRef.kind === 'set') {
    if (!Array.isArray(value)) {
      throw new Error(`Expected array for set type, got ${typeof value}`);
    }
    const innerType = typeRef.inner || typeRef.items;
    if (!innerType) {
      throw new Error('Missing inner type for set');
    }
    return value.map(item => convertFromJsonCompatible(item, innerType, abi));
  }

  // Handle reference types (records, variants, etc.)
  if (typeRef.kind === 'reference' || typeRef.$ref) {
    const typeName = typeRef.name || typeRef.$ref;
    if (!typeName) {
      throw new Error('Missing type name for reference');
    }
    const typeDef = abi.types[typeName];
    if (!typeDef) {
      throw new Error(`Type ${typeName} not found in ABI`);
    }

    // Handle record types
    if (typeDef.kind === 'record' && typeDef.fields) {
      if (typeof value !== 'object' || value === null) {
        throw new Error(`Expected object for record type ${typeName}, got ${typeof value}`);
      }
      const result: Record<string, unknown> = {};
      for (const field of typeDef.fields) {
        const fieldValue = (value as Record<string, unknown>)[field.name];
        if (fieldValue === undefined && !field.nullable) {
          continue; // Skip undefined fields
        }
        result[field.name] = convertFromJsonCompatible(fieldValue, field.type, abi);
      }
      return result;
    }

    // Handle variant types
    if (typeDef.kind === 'variant' && typeDef.variants) {
      // Variants are typically represented as objects with a discriminator
      if (typeof value !== 'object' || value === null) {
        throw new Error(`Expected object for variant type ${typeName}, got ${typeof value}`);
      }
      // Return as-is for variants (they should already be JSON-compatible)
      return value;
    }

    // Handle alias types
    if (typeDef.kind === 'alias' && typeDef.target) {
      return convertFromJsonCompatible(value, typeDef.target, abi);
    }
  }

  // Fallback: return value as-is
  return value;
}

interface DispatcherGlobal {
  __CALIMERO_DISPATCHERS_INITIALIZED__?: boolean;
}

const globalTarget: DispatcherGlobal | undefined =
  typeof globalThis !== 'undefined' ? (globalThis as DispatcherGlobal) : undefined;

function readPayload(methodName?: string): unknown {
  input(REGISTER_ID);
  const len = Number(registerLen(REGISTER_ID));
  if (!Number.isFinite(len) || len <= 0) {
    log(`[dispatcher] readPayload: no data for method ${methodName} (len=${len})`);
    return undefined;
  }

  const buffer = new Uint8Array(len);
  readRegister(REGISTER_ID, buffer);

  // Method parameters are sent as JSON (not Borsh)
  // Decode buffer as UTF-8 string and parse JSON
  const jsonString = new TextDecoder().decode(buffer);
  let jsonValue: unknown;
  try {
    jsonValue = JSON.parse(jsonString);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`[dispatcher] readPayload: failed to parse JSON for ${methodName}: ${errorMsg}`);
    throw new Error(`Failed to parse JSON parameters: ${errorMsg}`);
  }

  // ABI-aware conversion is required
  if (!methodName) {
    throw new Error('Method name is required for parameter conversion');
  }

  const abi = getAbiManifest();
  if (!abi) {
    throw new Error('ABI manifest is required but not available');
  }

  const method = getMethod(abi, methodName);
  if (!method) {
    throw new Error(`Method ${methodName} not found in ABI`);
  }

  if (method.params.length === 0) {
    log(`[dispatcher] readPayload: method ${methodName} has no parameters in ABI`);
    // Even if ABI says no params, check if there's actual data
    // This handles cases where ABI is incomplete but host sends params
    if (buffer.length > 0) {
      try {
        const jsonString = new TextDecoder().decode(buffer);
        const jsonValue = JSON.parse(jsonString);
        log(
          `[dispatcher] readPayload: found payload data despite no params in ABI, returning as-is`
        );
        return jsonValue;
      } catch {
        // If parsing fails, return undefined
        return undefined;
      }
    }
    return undefined;
  }

  try {
    // Convert JSON value to ABI-compatible format
    // If single parameter, convert directly; if multiple, convert as record
    if (method.params.length === 1) {
      const result = convertFromJsonCompatible(jsonValue, method.params[0].type, abi);
      log(
        `[dispatcher] readPayload: converted ${methodName} param (type: ${JSON.stringify(method.params[0].type)}, result type: ${typeof result})`
      );
      return result;
    } else {
      // Multiple parameters - convert as record
      const result = convertFromJsonCompatible(
        jsonValue,
        {
          kind: 'reference',
          name: `Method_${methodName}_Params`,
        },
        abi
      );
      log(`[dispatcher] readPayload: converted ${methodName} params as record`);
      return result;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`[dispatcher] readPayload: failed to convert ${methodName}: ${errorMsg}`);
    throw error;
  }
}

function normalizeArgs(payload: unknown, paramNames: string[]): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    // If we have a single parameter name, check if payload has that property
    // If not, assume payload IS the parameter value itself
    if (paramNames.length === 1) {
      const obj = payload as JsonObject;
      const paramName = paramNames[0];
      // Check if payload has the parameter name as a property
      // This handles cases where params are serialized as { paramName: value }
      if (paramName in obj && Object.keys(obj).length === 1) {
        return [obj[paramName]];
      }
      // Otherwise, payload is the parameter value itself (common for single object params)
      return [payload];
    }

    if (paramNames.length === 0) {
      const values = Object.values(payload as JsonObject);
      if (values.length === 0) {
        return [];
      }
      if (values.length === 1) {
        return values;
      }
      return [payload];
    }

    // Multiple parameters - map by name
    const obj = payload as JsonObject;
    return paramNames.map((name, index) => {
      if (name in obj) {
        return obj[name];
      }
      if (index === 0) {
        return obj;
      }
      return undefined;
    });
  }

  if (payload === undefined || payload === null) {
    return [];
  }

  if (paramNames.length <= 1) {
    return [payload];
  }

  return [payload];
}

function handleError(method: string, error: unknown): never {
  const text = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  const message = `[dispatcher] ${method} failed: ${text}`;
  log(message);
  panic(message);
}

function createLogicDispatcher(
  logicCtor: any,
  stateCtor: any,
  methodName: string,
  paramNames: string[] = [],
  isMutating: boolean = true
): () => void {
  return function dispatch(): void {
    const payload = readPayload(methodName);
    const args = normalizeArgs(payload, paramNames);

    let logicInstance: any;
    try {
      let state = StateManager.load();

      if (!state && stateCtor) {
        state = new stateCtor();
      }

      if (state) {
        if (logicCtor && state instanceof logicCtor === false) {
          Object.setPrototypeOf(state, logicCtor.prototype);
        }
        logicInstance = state;
      } else {
        logicInstance = new logicCtor();
      }
      StateManager.setCurrent(logicInstance);

      const result = logicInstance[methodName](...args);

      if (isMutating) {
        StateManager.save(logicInstance);
        flushDelta();
        StateManager.save(logicInstance);
      }

      if (result !== undefined) {
        valueReturn(result, methodName);
      }
    } catch (error) {
      handleError(methodName, error);
    } finally {
      StateManager.setCurrent(null);
    }
  };
}

function createInitDispatcher(
  logicCtor: any,
  stateCtor: any,
  methodName: string,
  paramNames: string[] = []
): () => void {
  return function initDispatch(): void {
    const payload = readPayload(methodName);
    const args = normalizeArgs(payload, paramNames);

    log(
      `[dispatcher] initDispatch: method=${methodName}, paramNames=${JSON.stringify(paramNames)}, payload type=${typeof payload}, args length=${args.length}`
    );
    if (args.length > 0 && args[0] !== undefined && args[0] !== null) {
      log(
        `[dispatcher] initDispatch: first arg type=${typeof args[0]}, keys=${typeof args[0] === 'object' ? Object.keys(args[0]).join(',') : 'N/A'}`
      );
    } else if (payload && typeof payload === 'object') {
      // If payload exists but normalizeArgs didn't handle it, use payload directly
      log(`[dispatcher] initDispatch: payload exists but args empty, using payload as first arg`);
      args.push(payload);
    } else {
      log(
        `[dispatcher] initDispatch: no payload or args, init method may fail if it expects parameters`
      );
    }

    let state: any;
    try {
      const existing = StateManager.load();
      if (existing) {
        panic('Contract state already initialized');
      }

      const result = logicCtor[methodName](...args);
      // Init methods typically return void or state, so we don't serialize the return value
      state = result ?? (stateCtor ? new stateCtor() : undefined);
      if (!state) {
        panic('Init method must return state instance');
      }

      if (logicCtor && state instanceof logicCtor === false) {
        Object.setPrototypeOf(state, logicCtor.prototype);
      }

      StateManager.save(state);
      flushDelta();
    } catch (error) {
      handleError(methodName, error);
    } finally {
      StateManager.setCurrent(null);
    }
  };
}

function registerDispatchers(): void {
  const entries = runtimeLogicEntries();
  for (const entry of entries) {
    const logicCtor: any = entry.target;
    const stateCtor: any = entry.stateClass ?? null;

    if (entry.init) {
      const initParams = entry.methods.get(entry.init) ?? [];
      const initDispatcher = createInitDispatcher(logicCtor, stateCtor, entry.init, initParams);
      (globalThis as any)[entry.init] = initDispatcher;
    }

    for (const [methodName, params] of entry.methods.entries()) {
      const isInit = entry.init === methodName;
      if (isInit) {
        continue;
      }

      const mutating = entry.mutating.get(methodName) ?? true;
      const dispatcher = createLogicDispatcher(logicCtor, stateCtor, methodName, params, mutating);
      (globalThis as any)[methodName] = dispatcher;
    }
  }
}

if (globalTarget && !globalTarget.__CALIMERO_DISPATCHERS_INITIALIZED__) {
  registerDispatchers();
  globalTarget.__CALIMERO_DISPATCHERS_INITIALIZED__ = true;
}

declare global {
  // eslint-disable-next-line no-var
  var __CALIMERO_DISPATCHERS_INITIALIZED__: boolean | undefined;
}
