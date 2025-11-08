import * as env from '../env/api';
import { valueReturn, flushDelta } from '../env/api';
import { StateManager } from './state-manager';
import { runtimeLogicEntries } from './method-registry';

type JsonObject = Record<string, unknown>;

const REGISTER_ID = 0n;
const textDecoder = new TextDecoder();

try {
  if (typeof console !== 'undefined' && typeof console.log === 'function') {
    console.log('[dispatcher] module initializing');
  }
} catch (_error) {
  // ignore
}

if (typeof (globalThis as any).__calimero_sync_next !== 'function') {
  (globalThis as any).__calimero_sync_next = function __calimero_sync_next(): void {
    logDebug('[dispatcher] __calimero_sync_next invoked (noop)');
  };
}

if (typeof (globalThis as any).__calimero_register_merge !== 'function') {
  (globalThis as any).__calimero_register_merge = function __calimero_register_merge(): void {
    logDebug('[dispatcher] __calimero_register_merge invoked (noop)');
  };
}

logDebug('[dispatcher] runtime dispatcher loaded');

function logDebug(message: string): void {
  try {
    env.log(message);
  } catch (_error) {
    try {
      if (typeof console !== 'undefined' && typeof console.log === 'function') {
        console.log(message);
      } else if (typeof (globalThis as any).print === 'function') {
        (globalThis as any).print(message);
      }
    } catch (_inner) {
      // give up
    }
  }
}

function formatValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`;
  }
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return Object.prototype.toString.call(value);
  }
}

interface DispatcherGlobal {
  __CALIMERO_DISPATCHERS_INITIALIZED__?: boolean;
}

const globalTarget: DispatcherGlobal | undefined =
  typeof globalThis !== 'undefined' ? (globalThis as DispatcherGlobal) : undefined;

function readPayload(): unknown {
  logDebug('[dispatcher] readPayload start');
  try {
    env.input(REGISTER_ID);
    const len = Number(env.registerLen(REGISTER_ID));
    if (!Number.isFinite(len) || len <= 0) {
      logDebug('[dispatcher] readPayload empty register');
      return undefined;
    }

    const buffer = new Uint8Array(len);
    env.readRegister(REGISTER_ID, buffer);
    const decoded = textDecoder.decode(buffer);
    if (decoded.length === 0) {
      logDebug('[dispatcher] readPayload decoded empty string');
      return undefined;
    }
    return JSON.parse(decoded);
  } catch (error) {
    env.log(`Failed to parse input: ${error}`);
    return undefined;
  }
}

function normalizeArgs(payload: unknown, paramNames: string[]): unknown[] {
  logDebug(`[dispatcher] normalizeArgs payload=${formatValue(payload)} params=${formatValue(paramNames)}`);
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
    return paramNames.map(name => obj[name]);
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
  env.log(message);
  env.panic(message);
}

function createLogicDispatcher(
  logicCtor: any,
  stateCtor: any,
  methodName: string,
  paramNames: string[] = [],
  isMutating: boolean = true
): () => void {
  return function dispatch(): void {
    const payload = readPayload();
    const args = normalizeArgs(payload, paramNames);

    let logicInstance: any;
    try {
      let state = StateManager.load();
      if (!state && stateCtor) {
        state = new stateCtor();
      }

      logicInstance = state ? Object.assign(new logicCtor(), state) : new logicCtor();
      StateManager.setCurrent(logicInstance);

      const result = logicInstance[methodName](...args);

      if (isMutating) {
        StateManager.save(logicInstance);
        flushDelta();
      }

      if (result !== undefined) {
        valueReturn(result);
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
    logDebug(`[dispatcher:init:${methodName}] start`);
    const payload = readPayload();
    logDebug(`[dispatcher:init:${methodName}] payload=${formatValue(payload)}`);
    const args = normalizeArgs(payload, paramNames);
    logDebug(`[dispatcher:init:${methodName}] args=${formatValue(args)}`);

    try {
      const existing = StateManager.load();
      if (existing) {
        logDebug(`[dispatcher:init:${methodName}] existing state detected`);
        env.panic('Contract state already initialized');
      }

      logDebug(`[dispatcher:init:${methodName}] invoking logic initializer`);
      const result = logicCtor[methodName](...args);
      logDebug(`[dispatcher:init:${methodName}] logic result=${formatValue(result)}`);
      const state = result ?? (stateCtor ? new stateCtor() : undefined);
      if (!state) {
        logDebug(`[dispatcher:init:${methodName}] initializer returned no state`);
        env.panic('Init method must return state instance');
      }

      logDebug(
        `[dispatcher:init:${methodName}] saving state type=${formatValue(
          (state as any)?.constructor?.name ?? 'UnknownState'
        )}`
      );
      StateManager.save(state);
      flushDelta();
      logDebug(`[dispatcher:init:${methodName}] completed successfully`);
    } catch (error) {
      logDebug(`[dispatcher:init:${methodName}] error=${formatValue(error)}`);
      handleError(methodName, error);
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
      const dispatcher = createLogicDispatcher(
        logicCtor,
        stateCtor,
        methodName,
        params,
        mutating
      );
      logDebug(`[dispatcher] registering ${methodName}`);
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


