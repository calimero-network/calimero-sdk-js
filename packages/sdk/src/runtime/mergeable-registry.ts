const MERGEABLE_TYPE_SYMBOL = Symbol.for('__calimeroMergeableType');

export interface MergeableDescriptor {
  type: string;
  merge?: (localValue: any, remoteValue: any) => any;
}

const descriptors = new Map<string, MergeableDescriptor>();

export function registerMergeableType(
  ctor: { prototype: object },
  descriptor: MergeableDescriptor,
): void {
  const { type } = descriptor;
  descriptors.set(type, descriptor);

  Object.defineProperty(ctor.prototype, MERGEABLE_TYPE_SYMBOL, {
    value: type,
    configurable: false,
    enumerable: false,
  });
}

export function getMergeableType(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const type = (value as any)[MERGEABLE_TYPE_SYMBOL];
  return typeof type === 'string' ? type : null;
}

export function getMergeableDescriptor(type: string): MergeableDescriptor | undefined {
  return descriptors.get(type);
}

export function cloneMergeableValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Uint8Array) {
    return new Uint8Array(value) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map(item => cloneMergeableValue(item)) as unknown as T;
  }

  const clone: Record<string, any> = Object.create(null);
  for (const [key, entryValue] of Object.entries(value)) {
    clone[key] = cloneMergeableValue(entryValue);
  }
  const type = getMergeableType(value);
  if (type) {
    markMergeableInstance(clone, type);
  }
  return clone as T;
}

export function markMergeableInstance(target: any, type: string): void {
  if (!target || typeof target !== 'object') {
    return;
  }

  Object.defineProperty(target, MERGEABLE_TYPE_SYMBOL, {
    value: type,
    configurable: false,
    enumerable: false,
  });
}

