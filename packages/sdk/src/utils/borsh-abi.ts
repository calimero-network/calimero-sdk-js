/**
 * ABI-aware Borsh Serialization
 *
 * This module provides serialization/deserialization that uses the ABI
 * to determine the correct format for each field, using standard Borsh
 * format (compatible with Rust) instead of ValueKind-prefixed format.
 */

import { BorshWriter } from '../borsh/encoder.js';
import { BorshReader } from '../borsh/decoder.js';
import type { TypeRef, ScalarType, TypeDef } from '../abi/types.js';
import { hasRegisteredCollection, snapshotCollection } from '../runtime/collections.js';

/**
 * Serialize a value according to its ABI type using standard Borsh format
 */
export function serializeWithAbi(value: any, typeRef: TypeRef, abiManifest: any): Uint8Array {
  const writer = new BorshWriter();
  serializeTypeRef(value, typeRef, abiManifest, writer);
  return writer.toBytes();
}

/**
 * Deserialize bytes according to ABI type using standard Borsh format
 */
export function deserializeWithAbi<T = unknown>(
  bytes: Uint8Array,
  typeRef: TypeRef,
  abiManifest: any
): T {
  const reader = new BorshReader(bytes);
  return deserializeTypeRef(reader, typeRef, abiManifest) as T;
}

function serializeTypeRef(
  value: any,
  typeRef: TypeRef,
  abiManifest: any,
  writer: BorshWriter
): void {
  switch (typeRef.kind) {
    case 'scalar':
      if (!typeRef.scalar) {
        throw new Error('Scalar type ref missing scalar field');
      }
      serializeScalar(value, typeRef.scalar, writer);
      break;
    case 'vector':
      if (!typeRef.inner) {
        throw new Error('Vector type ref missing inner field');
      }
      if (!Array.isArray(value)) {
        throw new Error(`Expected array for vector type, got ${typeof value}`);
      }
      writer.writeU32(value.length);
      for (const item of value) {
        serializeTypeRef(item, typeRef.inner!, abiManifest, writer);
      }
      break;
    case 'map':
      if (!typeRef.key || !typeRef.value) {
        throw new Error('Map type ref missing key or value field');
      }
      const entries = value instanceof Map ? Array.from(value.entries()) : Object.entries(value);
      writer.writeU32(entries.length);
      for (const [key, val] of entries) {
        serializeTypeRef(key, typeRef.key, abiManifest, writer);
        serializeTypeRef(val, typeRef.value, abiManifest, writer);
      }
      break;
    case 'option':
      if (value === null || value === undefined) {
        writer.writeU8(0); // None
      } else {
        writer.writeU8(1); // Some
        if (!typeRef.inner) {
          throw new Error('Option type ref missing inner field');
        }
        serializeTypeRef(value, typeRef.inner, abiManifest, writer);
      }
      break;
    case 'reference':
      // Reference types point to a named type in the ABI
      if (!typeRef.name) {
        throw new Error('Reference type ref missing name field');
      }
      const typeDef = abiManifest.types?.[typeRef.name];
      if (!typeDef) {
        throw new Error(`Type '${typeRef.name}' not found in ABI manifest`);
      }
      serializeTypeDef(value, typeDef, abiManifest, writer);
      break;
    default:
      throw new Error(`Unsupported type ref kind: ${typeRef.kind}`);
  }
}

function serializeScalar(value: any, scalarType: ScalarType, writer: BorshWriter): void {
  switch (scalarType) {
    case 'bool':
      writer.writeU8(value ? 1 : 0);
      break;
    case 'i32':
      // i32: signed 32-bit integer, write as little-endian
      const i32 = value | 0; // Ensure it's a 32-bit signed integer
      writer.writeU32(i32 >>> 0); // Convert to unsigned for writing
      break;
    case 'i64':
      // i64: signed 64-bit integer, write as little-endian
      const i64 = BigInt(value);
      writer.writeU64(i64);
      break;
    case 'u32':
      writer.writeU32(value);
      break;
    case 'u64':
      // For Counter, value is the collection reference (element ID)
      if (hasRegisteredCollection && hasRegisteredCollection(value)) {
        const snapshot = snapshotCollection(value);
        if (snapshot && snapshot.id) {
          // Convert hex string ID to bytes
          const idBytes = hexToBytes(snapshot.id);
          if (idBytes.length === 32) {
            writer.writeFixedArray(idBytes);
            return;
          }
        }
      }
      // Otherwise, serialize as u64
      writer.writeU64(BigInt(value));
      break;
    case 'f32':
      // f32: 32-bit float, write as little-endian
      const f32View = new DataView(new ArrayBuffer(4));
      f32View.setFloat32(0, value, true);
      const f32Bytes = new Uint8Array(f32View.buffer);
      writer.writeFixedArray(f32Bytes);
      break;
    case 'f64':
      writer.writeF64(value);
      break;
    case 'string':
      // Standard Borsh string: u32 length + UTF-8 bytes (no ValueKind prefix)
      writer.writeString(value);
      break;
    case 'bytes':
      // Standard Borsh bytes: u32 length + bytes (no ValueKind prefix)
      if (value instanceof Uint8Array) {
        writer.writeBytes(value);
      } else if (Array.isArray(value)) {
        writer.writeBytes(new Uint8Array(value));
      } else {
        throw new Error(
          `Cannot serialize bytes: expected Uint8Array or Array, got ${typeof value}`
        );
      }
      break;
    default:
      throw new Error(`Unsupported scalar type: ${scalarType}`);
  }
}

// Collections are handled as references - they serialize to their element ID

function serializeTypeDef(
  value: any,
  typeDef: TypeDef,
  abiManifest: any,
  writer: BorshWriter
): void {
  switch (typeDef.kind) {
    case 'record':
      // Serialize each field in order
      if (!typeDef.fields) {
        throw new Error('Record type def missing fields');
      }
      for (const field of typeDef.fields) {
        const fieldValue = (value as any)[field.name];
        if (fieldValue === undefined && !field.nullable) {
          throw new Error(`Required field '${field.name}' is undefined`);
        }
        if (fieldValue !== undefined) {
          serializeTypeRef(fieldValue, field.type, abiManifest, writer);
        }
      }
      break;
    case 'variant':
      // Variants are serialized as: u8 discriminant + payload (if any)
      if (!typeDef.variants) {
        throw new Error('Variant type def missing variants');
      }
      // We need to find which variant matches the value
      // For now, this is a placeholder - variant serialization needs more work
      throw new Error('Variant serialization not yet implemented');
    case 'alias':
      if (!typeDef.target) {
        throw new Error('Alias type def missing target');
      }
      serializeTypeRef(value, typeDef.target, abiManifest, writer);
      break;
    case 'bytes':
      if (value instanceof Uint8Array) {
        writer.writeBytes(value);
      } else if (Array.isArray(value)) {
        writer.writeBytes(new Uint8Array(value));
      } else {
        throw new Error(
          `Cannot serialize bytes: expected Uint8Array or Array, got ${typeof value}`
        );
      }
      break;
    default:
      throw new Error(`Unsupported type def kind: ${(typeDef as any).kind}`);
  }
}

function deserializeTypeRef(reader: BorshReader, typeRef: TypeRef, abiManifest: any): any {
  switch (typeRef.kind) {
    case 'scalar':
      if (!typeRef.scalar) {
        throw new Error('Scalar type ref missing scalar field');
      }
      return deserializeScalar(reader, typeRef.scalar);
    case 'vector':
      if (!typeRef.inner) {
        throw new Error('Vector type ref missing inner field');
      }
      const length = reader.readU32();
      const array = [];
      for (let i = 0; i < length; i++) {
        array.push(deserializeTypeRef(reader, typeRef.inner, abiManifest));
      }
      return array;
    case 'map':
      if (!typeRef.key || !typeRef.value) {
        throw new Error('Map type ref missing key or value field');
      }
      const mapLength = reader.readU32();
      const map = new Map();
      for (let i = 0; i < mapLength; i++) {
        const key = deserializeTypeRef(reader, typeRef.key, abiManifest);
        const val = deserializeTypeRef(reader, typeRef.value, abiManifest);
        map.set(key, val);
      }
      return map;
    case 'option':
      const isSome = reader.readU8() === 1;
      if (!isSome) {
        return null;
      }
      if (!typeRef.inner) {
        throw new Error('Option type ref missing inner field');
      }
      return deserializeTypeRef(reader, typeRef.inner, abiManifest);
    case 'reference':
      if (!typeRef.name) {
        throw new Error('Reference type ref missing name field');
      }
      const typeDef = abiManifest.types?.[typeRef.name];
      if (!typeDef) {
        throw new Error(`Type '${typeRef.name}' not found in ABI manifest`);
      }
      return deserializeTypeDef(reader, typeDef, abiManifest);
    default:
      throw new Error(`Unsupported type ref kind: ${typeRef.kind}`);
  }
}

function deserializeScalar(reader: BorshReader, scalarType: ScalarType): any {
  switch (scalarType) {
    case 'bool':
      return reader.readU8() === 1;
    case 'i32':
      // i32: signed 32-bit integer, read as unsigned then convert
      const u32 = reader.readU32();
      return (u32 | 0) === u32 ? u32 : (u32 | 0x80000000) - 0x80000000;
    case 'i64':
      // i64: signed 64-bit integer
      const u64 = reader.readU64();
      // Convert unsigned bigint to signed
      const maxI64 = BigInt('0x7FFFFFFFFFFFFFFF');
      if (u64 > maxI64) {
        return Number(u64 - BigInt('0x10000000000000000'));
      }
      return Number(u64);
    case 'u32':
      return reader.readU32();
    case 'u64':
      return Number(reader.readU64());
    case 'f32':
      // f32: 32-bit float
      const f32Bytes = reader.readFixedArray(4);
      const f32View = new DataView(f32Bytes.buffer, f32Bytes.byteOffset, 4);
      return f32View.getFloat32(0, true);
    case 'f64':
      return reader.readF64();
    case 'string':
      // Standard Borsh string: u32 length + UTF-8 bytes
      return reader.readString();
    case 'bytes':
      // Standard Borsh bytes: u32 length + bytes
      return reader.readBytes();
    default:
      throw new Error(`Unsupported scalar type: ${scalarType}`);
  }
}

// Collections are handled as references - they deserialize from their element ID

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function deserializeTypeDef(reader: BorshReader, typeDef: TypeDef, abiManifest: any): any {
  switch (typeDef.kind) {
    case 'record':
      if (!typeDef.fields) {
        throw new Error('Record type def missing fields');
      }
      const result: any = {};
      for (const field of typeDef.fields) {
        result[field.name] = deserializeTypeRef(reader, field.type, abiManifest);
      }
      return result;
    case 'variant':
      if (!typeDef.variants) {
        throw new Error('Variant type def missing variants');
      }
      // Variants: u8 discriminant + payload
      const discriminant = reader.readU8();
      const variant = typeDef.variants[discriminant];
      if (!variant) {
        throw new Error(`Invalid variant discriminant: ${discriminant}`);
      }
      if (variant.payload) {
        return {
          variant: variant.name,
          payload: deserializeTypeRef(reader, variant.payload, abiManifest),
        };
      }
      return { variant: variant.name };
    case 'alias':
      if (!typeDef.target) {
        throw new Error('Alias type def missing target');
      }
      return deserializeTypeRef(reader, typeDef.target, abiManifest);
    case 'bytes':
      return reader.readBytes();
    default:
      throw new Error(`Unsupported type def kind: ${(typeDef as any).kind}`);
  }
}
