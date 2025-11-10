import { Vector } from '../collections/Vector';
import { UnorderedSet } from '../collections/UnorderedSet';
import { UnorderedMap } from '../collections/UnorderedMap';
import { LwwRegister } from '../collections/LwwRegister';

type Primitive = null | undefined | boolean | number | string | bigint | symbol;

export function exposeValue<T>(value: T): T {
  return innerExpose(value) as T;
}

function innerExpose(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value !== 'object') {
    return value as Primitive;
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof Vector) {
    return value.toArray().map(item => innerExpose(item));
  }

  if (value instanceof UnorderedSet) {
    return value.toArray().map(item => innerExpose(item));
  }

  if (value instanceof UnorderedMap) {
    const entries = value.entries().map(([key, val]) => [innerExpose(key), innerExpose(val)] as [unknown, unknown]);
    if (entries.every(([key]) => typeof key === 'string')) {
      const record: Record<string, unknown> = Object.create(null);
      for (const [key, val] of entries as [string, unknown][]) {
        record[key] = val;
      }
      return record;
    }
    return entries;
  }

  if (value instanceof LwwRegister) {
    return innerExpose(value.get());
  }

  if (Array.isArray(value)) {
    return value.map(item => innerExpose(item));
  }

  const result: Record<string, unknown> = Object.create(null);
  for (const [key, val] of Object.entries(value)) {
    result[key] = innerExpose(val);
  }
  return result;
}

