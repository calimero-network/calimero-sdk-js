export interface MethodRegistrySnapshot {
  logic: Record<string, { methods: string[]; init?: string; mutating: Record<string, boolean> }>;
  functions: string[];
}

interface MethodRegistryGlobal {
  __CALIMERO_METHOD_REGISTRY__?: MethodRegistrySnapshot;
  __CALIMERO_RUNTIME_LOGIC__?: RuntimeLogicEntry[];
}

export interface RuntimeLogicEntry {
  target: new (...args: any[]) => any;
  stateClass: any;
  init?: string;
  methods: Map<string, string[]>;
  mutating: Map<string, boolean>;
}

const registry: MethodRegistrySnapshot = {
  logic: Object.create(null),
  functions: [],
};

const runtimeLogic = new Map<new (...args: any[]) => any, RuntimeLogicEntry>();

const globalTarget: MethodRegistryGlobal | undefined =
  typeof globalThis !== 'undefined' ? (globalThis as MethodRegistryGlobal) : undefined;

const LOGIC_FALLBACK_NAME = 'ContractLogic';

function ensureGlobalRegistry(): void {
  if (!globalTarget) {
    return;
  }
  if (!globalTarget.__CALIMERO_METHOD_REGISTRY__) {
    globalTarget.__CALIMERO_METHOD_REGISTRY__ = registry;
  }
  if (!globalTarget.__CALIMERO_RUNTIME_LOGIC__) {
    globalTarget.__CALIMERO_RUNTIME_LOGIC__ = [];
  }
}

function normalizeLogicName(target: new (...args: any[]) => any): string {
  const name = target?.name;
  if (typeof name === 'string' && name.trim().length > 0) {
    return name;
  }
  return LOGIC_FALLBACK_NAME;
}

function isExportable(name: string | undefined): name is string {
  return !!name && name !== 'constructor' && !name.startsWith('_');
}

function addMethodToEntry(entry: { methods: string[]; init?: string }, method: string): void {
  if (!entry.methods.includes(method)) {
    entry.methods.push(method);
    entry.methods.sort();
  }
}

function ensureLogicEntry(logicName: string) {
  if (!registry.logic[logicName]) {
    registry.logic[logicName] = { methods: [], mutating: Object.create(null) };
  }
  return registry.logic[logicName];
}

function ensureRuntimeLogicEntry(target: new (...args: any[]) => any, stateClass: any): RuntimeLogicEntry {
  const existing = runtimeLogic.get(target);
  if (existing) {
    if (!existing.stateClass && stateClass) {
      existing.stateClass = stateClass;
    }
    return existing;
  }

  const entry: RuntimeLogicEntry = {
    target,
    stateClass,
    methods: new Map<string, string[]>(),
    mutating: new Map<string, boolean>(),
  };
  runtimeLogic.set(target, entry);
  if (globalTarget) {
    globalTarget.__CALIMERO_RUNTIME_LOGIC__ = Array.from(runtimeLogic.values());
  }
  return entry;
}

function recordRuntimeMethodMetadata(
  target: new (...args: any[]) => any,
  stateClass: any,
  method: string
): void {
  const runtimeEntry = ensureRuntimeLogicEntry(target, stateClass);
  const fn = target.prototype?.[method];
  if (typeof fn !== 'function') {
    return;
  }
  const params = extractParameterNames(fn);
  runtimeEntry.methods.set(method, params);
  if (!runtimeEntry.mutating.has(method)) {
    runtimeEntry.mutating.set(method, true);
  }
  if (globalTarget) {
    globalTarget.__CALIMERO_RUNTIME_LOGIC__ = Array.from(runtimeLogic.values());
  }
}

function updateRuntimeInit(target: new (...args: any[]) => any, stateClass: any, methodName: string): void {
  const runtimeEntry = ensureRuntimeLogicEntry(target, stateClass);
  runtimeEntry.init = methodName;
  runtimeEntry.mutating.set(methodName, true);
  if (globalTarget) {
    globalTarget.__CALIMERO_RUNTIME_LOGIC__ = Array.from(runtimeLogic.values());
  }
}

function updateRuntimeMutating(target: new (...args: any[]) => any, stateClass: any, methodName: string): void {
  const runtimeEntry = ensureRuntimeLogicEntry(target, stateClass);
  runtimeEntry.mutating.set(methodName, true);
  if (globalTarget) {
    globalTarget.__CALIMERO_RUNTIME_LOGIC__ = Array.from(runtimeLogic.values());
  }
}

function extractParameterNames(fn: (...args: any[]) => any): string[] {
  const fnString = Function.prototype.toString.call(fn)
    .replace(/\/\*.*?\*\//gs, '')
    .replace(/\/\/.*$/gm, '');
  const match = fnString.match(/^[^(]*\(([^)]*)\)/);
  if (!match) {
    return [];
  }
  return match[1]
    .split(',')
    .map(param => param.trim())
    .filter(Boolean)
    .map(param => param.replace(/=.*$/, '').trim())
    .map(param => param.replace(/:[^,]+$/, '').trim());
}

export function registerLogic(target: new (...args: any[]) => any, methods: string[], stateClass: any): void {
  ensureGlobalRegistry();

  const logicName = normalizeLogicName(target);
  const entry = ensureLogicEntry(logicName);

  for (const method of methods) {
    if (isExportable(method)) {
      addMethodToEntry(entry, method);
      if (entry.mutating[method] === undefined) {
        entry.mutating[method] = true;
      }
      recordRuntimeMethodMetadata(target, stateClass, method);
    }
  }

  const mutatingSet: Set<string> | undefined = (target as any).__calimeroMutatingMethods;
  if (mutatingSet) {
    mutatingSet.forEach(method => {
      if (isExportable(method)) {
        entry.mutating[method] = true;
        updateRuntimeMutating(target, stateClass, method);
      }
    });
  }

  const initMethod = (target as any)._calimeroInitMethod;
  if (typeof initMethod === 'string' && initMethod.length > 0) {
    entry.init = initMethod;
    updateRuntimeInit(target, stateClass, initMethod);
  }

  (target as any).__calimeroMutatingMethods = mutatingSet;

  registry.logic[logicName] = entry;
}

export function markMethodMutating(target: new (...args: any[]) => any, methodName: string): void {
  const mutating: Set<string> = (target as any).__calimeroMutatingMethods ?? new Set<string>();
  mutating.add(methodName);
  (target as any).__calimeroMutatingMethods = mutating;
  const stateClass = (target as any)._calimeroStateClass;
  updateRuntimeMutating(target, stateClass, methodName);
}

export function markMethodNonMutating(target: new (...args: any[]) => any, methodName: string): void {
  const runtimeEntry = ensureRuntimeLogicEntry(target, (target as any)._calimeroStateClass);
  runtimeEntry.mutating.set(methodName, false);
  if (globalTarget) {
    globalTarget.__CALIMERO_RUNTIME_LOGIC__ = Array.from(runtimeLogic.values());
  }
}

export function registerInit(target: new (...args: any[]) => any, methodName: string): void {
  ensureGlobalRegistry();

  const logicName = normalizeLogicName(target);
  const entry = ensureLogicEntry(logicName);
  entry.init = methodName;
  entry.mutating[methodName] = true;
  registry.logic[logicName] = entry;

  const stateClass = (target as any)._calimeroStateClass;
  updateRuntimeInit(target, stateClass, methodName);
}

export function registerTopLevel(methodName: string): void {
  ensureGlobalRegistry();
  if (isExportable(methodName) && !registry.functions.includes(methodName)) {
    registry.functions.push(methodName);
    registry.functions.sort();
  }
}

export function snapshot(): MethodRegistrySnapshot {
  return registry;
}

export function runtimeLogicEntries(): RuntimeLogicEntry[] {
  return Array.from(runtimeLogic.values());
}

ensureGlobalRegistry();

if (globalTarget) {
  globalTarget.__CALIMERO_RUNTIME_LOGIC__ = Array.from(runtimeLogic.values());
}

declare global {
  // eslint-disable-next-line no-var
  var __CALIMERO_METHOD_REGISTRY__: MethodRegistrySnapshot | undefined;
  // eslint-disable-next-line no-var
  var __CALIMERO_RUNTIME_LOGIC__: RuntimeLogicEntry[] | undefined;
}


