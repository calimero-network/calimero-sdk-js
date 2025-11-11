import { BorshWriter } from '../borsh/encoder';
import { BorshReader } from '../borsh/decoder';
import { instantiateCollection, snapshotCollection, hasRegisteredCollection } from '../runtime/collections';

enum ValueKind {
  Null = 0,
  Boolean = 1,
  Number = 2,
  BigInt = 3,
  String = 4,
  Bytes = 5,
  Array = 6,
  Object = 7
}

type NormalizedPrimitive = null | boolean | number | string | bigint | Uint8Array;
interface NormalizedArray extends Array<NormalizedValue> {}
interface NormalizedObject {
  [key: string]: NormalizedValue;
}
type NormalizedValue = NormalizedPrimitive | NormalizedArray | NormalizedObject;

function isTypedArray(value: unknown): value is ArrayBufferView {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function toUint8Array(value: ArrayBufferView | ArrayBuffer): Uint8Array {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  if (isTypedArray(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value.slice(0));
  }
  throw new TypeError('Unsupported binary type');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeValue(input: any, seen: Map<any, any>): NormalizedValue {
  if (input === null || input === undefined) {
    return null;
  }

  if (typeof input === 'boolean' || typeof input === 'number' || typeof input === 'string' || typeof input === 'bigint') {
    return input as NormalizedValue;
  }

  if (typeof input === 'symbol' || typeof input === 'function') {
    throw new TypeError(`Cannot serialize value of type '${typeof input}'`);
  }

  if (input instanceof Date) {
    return input.toISOString();
  }

  if (input instanceof ArrayBuffer || isTypedArray(input)) {
    return toUint8Array(input);
  }

  if (input instanceof Uint8Array) {
    return new Uint8Array(input);
  }

  const collectionSnapshot = snapshotCollection(input);
  if (collectionSnapshot) {
    return {
      __calimeroCollection: collectionSnapshot.type,
      id: collectionSnapshot.id
    } as unknown as NormalizedValue;
  }

  if (Array.isArray(input)) {
    if (seen.has(input)) {
      throw new TypeError('Cannot serialize circular references');
    }
    seen.set(input, true);
    const result = input.map(item => normalizeValue(item, seen));
    seen.delete(input);
    return result;
  }

  if (input instanceof Set) {
    const array = Array.from(input.values()).map(item => normalizeValue(item, seen));
    return {
      __calimeroSet: true,
      values: array
    } as unknown as NormalizedValue;
  }

  if (input instanceof Map) {
    const entries = Array.from(input.entries()).map(([key, value]) => ({
      key: normalizeValue(key, seen),
      value: normalizeValue(value, seen)
    }));

    return {
      __calimeroMap: true,
      entries
    } as unknown as NormalizedValue;
  }

  if (typeof input.toJSON === 'function') {
    return normalizeValue(input.toJSON(), seen);
  }

  if (isPlainObject(input)) {
    if (seen.has(input)) {
      throw new TypeError('Cannot serialize circular references');
    }
    seen.set(input, true);
    const result: Record<string, NormalizedValue> = Object.create(null);
    const keys = Object.keys(input);
    for (const key of keys) {
      const value = input[key];
      if (value === undefined) {
        continue;
      }
      result[key] = normalizeValue(value, seen);
    }
    seen.delete(input);
    return result;
  }

  // For class instances, fall back to enumerating own properties.
  const ownKeys = Reflect.ownKeys(input);
  if (ownKeys.length > 0) {
    const temp: Record<string, NormalizedValue> = Object.create(null);
    for (const key of ownKeys) {
      if (typeof key === 'string') {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (descriptor && descriptor.enumerable) {
          const value = (input as any)[key];
          if (value !== undefined) {
            temp[key] = normalizeValue(value, seen);
          }
        }
      }
    }
    return temp;
  }

  throw new TypeError(`Unsupported value for serialization: ${String(input)}`);
}

function reviveValue(input: NormalizedValue): any {
  if (input === null || typeof input !== 'object') {
    return input;
  }

  if (input instanceof Uint8Array) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(item => reviveValue(item));
  }

  const maybeCollection = input as Record<string, any>;
  if (typeof maybeCollection.__calimeroCollection === 'string' && typeof maybeCollection.id === 'string') {
    return instantiateCollection({
      type: maybeCollection.__calimeroCollection,
      id: maybeCollection.id
    });
  }

  if (maybeCollection.__calimeroMapEntry && 'key' in maybeCollection && 'value' in maybeCollection) {
    return {
      __calimeroMapEntry: true,
      key: reviveValue(maybeCollection.key),
      value: reviveValue(maybeCollection.value)
    };
  }

  if (maybeCollection.__calimeroSet && Array.isArray(maybeCollection.values)) {
    return {
      __calimeroSet: true,
      values: (maybeCollection.values as NormalizedValue[]).map(item => reviveValue(item))
    };
  }

  if (maybeCollection.__calimeroMap && Array.isArray(maybeCollection.entries)) {
    return {
      __calimeroMap: true,
      entries: (maybeCollection.entries as Array<{ key: NormalizedValue; value: NormalizedValue }>).map(entry => ({
        key: reviveValue(entry.key),
        value: reviveValue(entry.value)
      }))
    };
  }

  const result: Record<string, any> = Object.create(null);
  for (const [key, value] of Object.entries(maybeCollection)) {
    result[key] = reviveValue(value as NormalizedValue);
  }
  return result;
}

function encodeNormalizedValue(value: NormalizedValue, writer: BorshWriter): void {
  if (value === null) {
    writer.writeU8(ValueKind.Null);
    return;
  }

  if (typeof value === 'boolean') {
    writer.writeU8(ValueKind.Boolean);
    writer.writeU8(value ? 1 : 0);
    return;
  }

  if (typeof value === 'number') {
    writer.writeU8(ValueKind.Number);
    writer.writeF64(value);
    return;
  }

  if (typeof value === 'bigint') {
    writer.writeU8(ValueKind.BigInt);
    writer.writeString(value.toString());
    return;
  }

  if (typeof value === 'string') {
    writer.writeU8(ValueKind.String);
    writer.writeString(value);
    return;
  }

  if (value instanceof Uint8Array) {
    writer.writeU8(ValueKind.Bytes);
    writer.writeBytes(value);
    return;
  }

  if (Array.isArray(value)) {
    writer.writeU8(ValueKind.Array);
    writer.writeU32(value.length);
    for (const item of value) {
      encodeNormalizedValue(item, writer);
    }
    return;
  }

  // Object
  writer.writeU8(ValueKind.Object);
  const entries = Object.entries(value);
  writer.writeU32(entries.length);
  for (const [key, entryValue] of entries) {
    writer.writeString(key);
    encodeNormalizedValue(entryValue as NormalizedValue, writer);
  }
}

function decodeNormalizedValue(reader: BorshReader): NormalizedValue {
  const kind = reader.readU8();

  switch (kind) {
    case ValueKind.Null:
      return null;
    case ValueKind.Boolean:
      return reader.readU8() === 1;
    case ValueKind.Number:
      return reader.readF64();
    case ValueKind.BigInt:
      return BigInt(reader.readString());
    case ValueKind.String:
      return reader.readString();
    case ValueKind.Bytes:
      return reader.readBytes();
    case ValueKind.Array: {
      const length = reader.readU32();
      const array: NormalizedValue[] = new Array(length);
      for (let i = 0; i < length; i++) {
        array[i] = decodeNormalizedValue(reader);
      }
      return array;
    }
    case ValueKind.Object: {
      const entries = reader.readU32();
      const result: Record<string, NormalizedValue> = Object.create(null);
      for (let i = 0; i < entries; i++) {
        const key = reader.readString();
        result[key] = decodeNormalizedValue(reader);
      }
      return result;
    }
    default:
      throw new Error(`Unknown Borsh value kind: ${kind}`);
  }
}

function finalizeCollections(value: any): any {
  if (value && typeof value === 'object' && hasRegisteredCollection(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(finalizeCollections);
  }

  if (value && typeof value === 'object') {
    if (value.__calimeroSet && Array.isArray(value.values)) {
      return new Set(value.values.map(finalizeCollections));
    }

    if (value.__calimeroMap && Array.isArray(value.entries)) {
      const map = new Map<any, any>();
      for (const entry of value.entries) {
        map.set(finalizeCollections(entry.key), finalizeCollections(entry.value));
      }
      return map;
    }

    if (value.__calimeroMapEntry) {
      return {
        __calimeroMapEntry: true,
        key: finalizeCollections(value.key),
        value: finalizeCollections(value.value)
      };
    }

    const result: Record<string, any> = Object.create(null);
    for (const [key, entryValue] of Object.entries(value)) {
      result[key] = finalizeCollections(entryValue);
    }
    return result;
  }

  return value;
}

export function serializeJsValue(value: any): Uint8Array {
  const normalized = normalizeValue(value, new Map());
  const writer = new BorshWriter();
  encodeNormalizedValue(normalized, writer);
  return writer.toBytes();
}

export function deserializeJsValue<T = unknown>(bytes: Uint8Array): T {
  const reader = new BorshReader(bytes);
  const normalized = decodeNormalizedValue(reader);
  const revived = reviveValue(normalized);
  return finalizeCollections(revived) as T;
}

export function deepCloneNormalized(value: any): any {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value)) {
    return value.map(item => deepCloneNormalized(item));
  }
  const result: Record<string, any> = Object.create(null);
  for (const [key, entryValue] of Object.entries(value)) {
    result[key] = deepCloneNormalized(entryValue);
  }
  return result;
}


