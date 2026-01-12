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

  // Handle all TypedArrays (Uint8Array, Int8Array, Int16Array, Int32Array, Uint16Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array)
  if (
    val instanceof Uint8Array ||
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

  // Handle BigInt TypedArrays - convert to array of strings
  if (val instanceof BigInt64Array || val instanceof BigUint64Array) {
    return Array.from(val).map(item => item.toString());
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
    // Check if date is valid before calling toISOString() to avoid RangeError
    if (isNaN(val.getTime())) {
      return null; // Invalid date - convert to null (consistent with NaN/Infinity handling)
    }
    return val.toISOString();
  }

  return val;
}

/**
 * Safe JSON.stringify that handles circular references and all problematic types
 * Uses a path stack to track the current traversal path and only flag actual cycles
 */
function safeJsonStringify(value: unknown): string {
  // This tracks the current path (ancestor chain) to detect only actual cycles
  const path = new Set<object>();

  try {
    return serializeWithPathTracking(value, path);
  } catch (error) {
    // Fallback: if serialization fails, return error message as JSON string
    return JSON.stringify({ error: 'Failed to serialize value', message: String(error) });
  }
}

/**
 * Custom serializer that properly tracks the traversal path to detect only actual cycles.
 * Removes objects from path when backtracking, so shared (non-circular) references work correctly.
 */
function serializeWithPathTracking(value: unknown, path: Set<object>): string {
  // Apply type conversions first
  const converted = jsonStringifyReplacer('', value);

  // Handle circular references for objects
  if (converted !== null && typeof converted === 'object') {
    // Check if object is in current path (ancestor chain) - this indicates a true cycle
    if (path.has(converted)) {
      return '"[Circular]"';
    }
    // Add to path before processing children
    path.add(converted);
  }

  // Handle different types
  if (converted === null) {
    return 'null';
  }

  if (typeof converted === 'string') {
    return JSON.stringify(converted);
  }

  if (typeof converted === 'number') {
    return String(converted);
  }

  if (typeof converted === 'boolean') {
    return String(converted);
  }

  if (Array.isArray(converted)) {
    const items = converted.map(item => serializeWithPathTracking(item, path));
    // Remove from path after processing array (backtrack)
    path.delete(converted);
    return '[' + items.join(',') + ']';
  }

  if (converted !== null && typeof converted === 'object') {
    const entries: string[] = [];
    for (const [key, val] of Object.entries(converted)) {
      const jsonKey = JSON.stringify(key);
      const jsonValue = serializeWithPathTracking(val, path);
      entries.push(jsonKey + ':' + jsonValue);
    }
    // Remove from path after processing object (backtrack)
    path.delete(converted);
    return '{' + entries.join(',') + '}';
  }

  // Fallback to JSON.stringify for any other type
  return JSON.stringify(converted);
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
