import { log, valueReturn, flushDelta, registerLen, readRegister, input, panic } from '../env/api';
import { StateManager } from './state-manager';
import { runtimeLogicEntries } from './method-registry';
import { getAbiManifest, getMethod } from '../abi/helpers';
import { deserializeWithAbi } from '../utils/abi-serialize';
import './sync';

type JsonObject = Record<string, unknown>;

const REGISTER_ID = 0n;

if (typeof (globalThis as any).__calimero_register_merge !== 'function') {
  (globalThis as any).__calimero_register_merge = function __calimero_register_merge(): void {};
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

  // ABI-aware deserialization is required
  if (!methodName) {
    throw new Error('Method name is required for deserialization');
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
    log(`[dispatcher] readPayload: method ${methodName} has no parameters`);
    return undefined;
  }

  try {
    // Deserialize parameters according to ABI
    // If single parameter, deserialize directly; if multiple, deserialize as record
    if (method.params.length === 1) {
      const result = deserializeWithAbi(buffer, method.params[0].type, abi);
      log(`[dispatcher] readPayload: deserialized ${methodName} param (type: ${JSON.stringify(method.params[0].type)}, result type: ${typeof result})`);
      return result;
    } else {
      // Multiple parameters - deserialize as record
      // This is a simplified approach; full implementation would need tuple support
      const result = deserializeWithAbi(
        buffer,
        {
          kind: 'reference',
          name: `Method_${methodName}_Params`,
        },
        abi
      );
      log(`[dispatcher] readPayload: deserialized ${methodName} params as record`);
      return result;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`[dispatcher] readPayload: failed to deserialize ${methodName}: ${errorMsg}`);
    throw error;
  }
}

function normalizeArgs(payload: unknown, paramNames: string[]): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
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
