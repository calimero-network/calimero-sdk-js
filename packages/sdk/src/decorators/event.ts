import type { AppEvent } from '../events/types';

/**
 * Replacer function for JSON.stringify that handles all problematic types
 * This ensures safe serialization of values that JSON.stringify can't handle natively
 */
function jsonStringifyReplacer(_key: string, val: unknown): unknown {
  // Handle BigInt - convert to string
  if (typeof val === 'bigint') {
    return val.toString();
  }

  // Handle undefined - convert to null for consistency
  if (val === undefined) {
    return null;
  }

  // Handle other TypedArrays (Int8Array, Int16Array, Int32Array, Uint16Array, Uint32Array, Float32Array, Float64Array)
  if (
    val instanceof Int8Array ||
    val instanceof Int16Array ||
    val instanceof Int32Array ||
    val instanceof Uint16Array ||
    val instanceof Uint32Array ||
    val instanceof Float32Array ||
    val instanceof Float64Array
  ) {
    return Array.from(val);
  }

  // Handle Symbol - convert to string representation
  if (typeof val === 'symbol') {
    return val.toString();
  }

  // Handle functions - convert to null (functions can't be serialized)
  if (typeof val === 'function') {
    return null;
  }

  // Handle RegExp - convert to string representation
  if (val instanceof RegExp) {
    return val.toString();
  }

  // Handle NaN and Infinity - convert to null for JSON compatibility
  if (typeof val === 'number' && (isNaN(val) || !isFinite(val))) {
    return null;
  }

  // Handle Date - ensure consistent ISO string format
  if (val instanceof Date) {
    return val.toISOString();
  }

  return val;
}

/**
 * Safe JSON.stringify that handles circular references and all problematic types
 * Uses a WeakSet to track visited objects and prevent circular reference errors
 */
function safeJsonStringify(value: unknown): string {
  const visited = new WeakSet<object>();

  const circularReplacer = (key: string, val: unknown): unknown => {
    // First apply the standard type conversions
    const converted = jsonStringifyReplacer(key, val);

    // Then handle circular references for objects
    if (converted !== null && typeof converted === 'object') {
      if (visited.has(converted)) {
        // Circular reference detected - replace with a placeholder
        return '[Circular]';
      }
      visited.add(converted);
    }

    return converted;
  };

  try {
    return JSON.stringify(value, circularReplacer);
  } catch (error) {
    // Fallback: if JSON.stringify still fails, return error message as JSON string
    return JSON.stringify({ error: 'Failed to serialize value', message: String(error) });
  }
}

type Constructor<T = object> = new (...args: any[]) => T;

type EventConstructor<TBase extends Constructor> = TBase & {
  new (...args: ConstructorParameters<TBase>): InstanceType<TBase> & AppEvent;
  deserialize(data: string): InstanceType<TBase> & AppEvent;
  readonly eventName: string;
  prototype: InstanceType<TBase> & AppEvent;
};

/**
 * @Event decorator
 *
 * Marks a class as an event type that can be emitted and handled.
 *
 * @example
 * ```typescript
 * @Event
 * export class ItemAdded {
 *   constructor(
 *     public key: string,
 *     public value: string
 *   ) {}
 * }
 * ```
 */
export function Event<TBase extends Constructor>(target: TBase): EventConstructor<TBase> {
  const enhanced = class extends target implements AppEvent {
    serialize(): string {
      const plain: Record<string, unknown> = {};
      for (const key in this) {
        if (Object.prototype.hasOwnProperty.call(this, key)) {
          plain[key] = (this as Record<string, unknown>)[key];
        }
      }

      return safeJsonStringify({
        eventType: (this.constructor as typeof enhanced).eventName,
        ...plain,
      });
    }

    static deserialize(data: string): InstanceType<TBase> & AppEvent {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object' && 'eventType' in parsed) {
        delete parsed.eventType;
      }
      return Object.assign(new target(), parsed) as InstanceType<TBase> & AppEvent;
    }

    static get eventName(): string {
      return target.name;
    }
  };

  (enhanced as any)._calimeroEvent = true;

  return enhanced as unknown as EventConstructor<TBase>;
}
