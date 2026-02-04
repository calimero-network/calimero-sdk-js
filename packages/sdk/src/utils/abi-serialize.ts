/**
 * ABI-Aware Borsh Serialization
 *
 * Serializes and deserializes values according to ABI type definitions
 * to ensure compatibility with Rust's Borsh format
 */

import { BorshWriter } from '../borsh/encoder.js';
import { BorshReader } from '../borsh/decoder.js';
import type { AbiManifest, TypeRef, TypeDef, ScalarType, Variant } from '../abi/types.js';
import { getAbiManifest, resolveTypeRef, isNullable } from '../abi/helpers.js';
import {
  SerializationError,
  ValidationError,
  AbiError,
  ErrorCode,
} from '../errors.js';

/**
 * Serializes a value according to an ABI TypeRef
 */
export function serializeWithAbi(value: unknown, typeRef: TypeRef, abi?: AbiManifest): Uint8Array {
  const manifest = abi || getAbiManifest();
  if (!manifest) {
    throw AbiError.notAvailable();
  }

  const writer = new BorshWriter();
  serializeValue(writer, value, typeRef, manifest);
  return writer.toBytes();
}

/**
 * Deserializes bytes according to an ABI TypeRef
 */
export function deserializeWithAbi<T = unknown>(
  bytes: Uint8Array,
  typeRef: TypeRef,
  abi?: AbiManifest
): T {
  const manifest = abi || getAbiManifest();
  if (!manifest) {
    throw AbiError.notAvailable();
  }

  const reader = new BorshReader(bytes);
  return deserializeValue(reader, typeRef, manifest) as T;
}

/**
 * Internal serialization function
 */
function serializeValue(
  writer: BorshWriter,
  value: unknown,
  typeRef: TypeRef,
  abi: AbiManifest
): void {
  // Handle null/undefined for nullable types
  if (value === null || value === undefined) {
    if (typeRef.kind === 'option') {
      writer.writeU8(0); // None
      return;
    }
    if (isNullable(typeRef)) {
      writer.writeU8(0); // None
      return;
    }
    throw new SerializationError(
      ErrorCode.SERIALIZATION_TYPE_MISMATCH,
      `Cannot serialize null/undefined for non-nullable type: ${typeRef.kind}`,
      { typeKind: typeRef.kind }
    );
  }

  // Handle option types
  if (typeRef.kind === 'option') {
    const innerType = typeRef.inner;
    if (!innerType) {
      throw new AbiError(
        ErrorCode.ABI_INVALID_TYPE_REF,
        'Option type missing inner type',
        { typeKind: 'option' }
      );
    }
    writer.writeU8(1); // Some
    serializeValue(writer, value, innerType, abi);
    return;
  }

  // Handle scalar types
  // Rust ABI format uses { "kind": "string" } directly, not { "kind": "scalar", "scalar": "string" }
  if (typeRef.kind === 'scalar') {
    serializeScalar(writer, value, typeRef.scalar!);
    return;
  }

  // Check if kind is a scalar type name directly (Rust format)
  const scalarTypes: ScalarType[] = [
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
  ];
  if (scalarTypes.includes(typeRef.kind as ScalarType)) {
    serializeScalar(writer, value, typeRef.kind as ScalarType);
    return;
  }

  // Handle vector/list types
  // Rust ABI format uses "list" instead of "vector"
  if (typeRef.kind === 'vector' || typeRef.kind === 'list') {
    const innerType = typeRef.inner || (typeRef as any).items; // Rust uses "items" instead of "inner"
    if (!innerType) {
      throw new AbiError(
        ErrorCode.ABI_INVALID_TYPE_REF,
        'Vector/list type missing inner type',
        { typeKind: typeRef.kind }
      );
    }
    if (!Array.isArray(value)) {
      throw SerializationError.typeMismatch('array', typeof value, typeRef.kind);
    }
    writer.writeU32(value.length);
    for (const item of value) {
      serializeValue(writer, item, innerType, abi);
    }
    return;
  }

  // Handle map types
  if (typeRef.kind === 'map') {
    const keyType = typeRef.key;
    const valueType = typeRef.value;
    if (!keyType || !valueType) {
      throw new AbiError(
        ErrorCode.ABI_INVALID_TYPE_REF,
        'Map type missing key or value type',
        { typeKind: 'map' }
      );
    }
    if (!(value instanceof Map)) {
      throw SerializationError.typeMismatch('Map', typeof value, 'map');
    }
    writer.writeU32(value.size);
    for (const [key, val] of value.entries()) {
      serializeValue(writer, key, keyType, abi);
      serializeValue(writer, val, valueType, abi);
    }
    return;
  }

  // Handle set types
  if (typeRef.kind === 'set') {
    const innerType = typeRef.inner || typeRef.items;
    if (!innerType) {
      throw new AbiError(
        ErrorCode.ABI_INVALID_TYPE_REF,
        'Set type missing inner type',
        { typeKind: 'set' }
      );
    }
    if (!(value instanceof Set) && !Array.isArray(value)) {
      throw SerializationError.typeMismatch('Set or array', typeof value, 'set');
    }
    const items = value instanceof Set ? Array.from(value) : value;
    writer.writeU32(items.length);
    for (const item of items) {
      serializeValue(writer, item, innerType, abi);
    }
    return;
  }

  // Handle reference types (records, variants, aliases)
  // Rust ABI format uses "$ref" instead of { "kind": "reference", "name": "..." }
  if (typeRef.kind === 'reference' || (typeRef as any).$ref) {
    const typeName = typeRef.name || (typeRef as any).$ref;
    if (!typeName) {
      throw new AbiError(
        ErrorCode.ABI_INVALID_TYPE_REF,
        'Reference type missing name',
        { typeRef }
      );
    }
    const typeDef = resolveTypeRef(abi, typeRef);
    if (!typeDef) {
      throw AbiError.typeNotFound(typeName);
    }
    serializeTypeDef(writer, value, typeDef, abi);
    return;
  }

  throw AbiError.unsupportedType(typeRef.kind, 'ABI serialization');
}

/**
 * Serialize a scalar value
 */
function serializeScalar(writer: BorshWriter, value: unknown, scalar: ScalarType): void {
  switch (scalar) {
    case 'bool':
      if (typeof value !== 'boolean') {
        throw SerializationError.typeMismatch('boolean', typeof value, scalar);
      }
      writer.writeU8(value ? 1 : 0);
      break;

    case 'u8':
    case 'u16':
    case 'u32':
      if (typeof value !== 'number') {
        throw SerializationError.typeMismatch('number', typeof value, scalar);
      }
      if (scalar === 'u8') {
        writer.writeU8(value);
      } else if (scalar === 'u16') {
        writer.writeU16(value);
      } else {
        writer.writeU32(value);
      }
      break;

    case 'u64': {
      if (typeof value !== 'bigint' && typeof value !== 'number') {
        throw SerializationError.typeMismatch('bigint or number', typeof value, scalar);
      }
      const bigValue = typeof value === 'bigint' ? value : BigInt(value);
      writer.writeU64(bigValue);
      break;
    }
    case 'u128': {
      if (typeof value !== 'bigint' && typeof value !== 'number') {
        throw SerializationError.typeMismatch('bigint or number', typeof value, scalar);
      }
      const bigValue = typeof value === 'bigint' ? value : BigInt(value);
      // u128 is two u64s in Borsh: low 64 bits, then high 64 bits
      const lowBits = bigValue & BigInt('0xffffffffffffffff');
      const highBits = bigValue >> 64n;
      writer.writeU64(lowBits);
      writer.writeU64(highBits);
      break;
    }

    case 'i8':
    case 'i16':
    case 'i32':
      if (typeof value !== 'number') {
        throw SerializationError.typeMismatch('number', typeof value, scalar);
      }
      // Signed integers are written as unsigned in Borsh
      if (scalar === 'i8') {
        writer.writeU8(value & 0xff);
      } else if (scalar === 'i16') {
        // i16 is written as u16 in Borsh
        writer.writeU16(value & 0xffff);
      } else {
        writer.writeU32(value);
      }
      break;

    case 'i64':
    case 'i128': {
      if (typeof value !== 'bigint' && typeof value !== 'number') {
        throw SerializationError.typeMismatch('bigint or number', typeof value, scalar);
      }
      const signedBigValue = typeof value === 'bigint' ? value : BigInt(value);
      if (scalar === 'i64') {
        writer.writeU64(signedBigValue);
      } else {
        // i128 is two u64s in Borsh: low 64 bits, then high 64 bits
        const lowBits = signedBigValue & BigInt('0xffffffffffffffff');
        const highBits = signedBigValue >> 64n;
        writer.writeU64(lowBits);
        writer.writeU64(highBits);
      }
      break;
    }

    case 'f32':
    case 'f64':
      if (typeof value !== 'number') {
        throw SerializationError.typeMismatch('number', typeof value, scalar);
      }
      if (scalar === 'f32') {
        writer.writeF32(value);
      } else {
        writer.writeF64(value);
      }
      break;

    case 'string':
      if (typeof value !== 'string') {
        throw SerializationError.typeMismatch('string', typeof value);
      }
      writer.writeString(value);
      break;

    case 'bytes':
      if (!(value instanceof Uint8Array)) {
        throw SerializationError.typeMismatch('Uint8Array', typeof value, 'bytes');
      }
      writer.writeBytes(value);
      break;

    case 'unit':
      // Unit type has no value
      break;

    default:
      throw AbiError.unsupportedType(scalar, 'scalar serialization');
  }
}

/**
 * Serialize a TypeDef (record, variant, alias, bytes)
 */
function serializeTypeDef(
  writer: BorshWriter,
  value: unknown,
  typeDef: TypeDef,
  abi: AbiManifest
): void {
  switch (typeDef.kind) {
    case 'record': {
      if (!typeDef.fields) {
        throw new AbiError(
          ErrorCode.ABI_INVALID_TYPE_REF,
          'Record type missing fields',
          { typeKind: 'record' }
        );
      }
      if (typeof value !== 'object' || value === null) {
        throw SerializationError.typeMismatch('object', typeof value, 'record');
      }
      const obj = value as Record<string, unknown>;
      for (const field of typeDef.fields) {
        const fieldValue = obj[field.name];
        // Handle missing fields (undefined) - treat as null for nullable fields, provide defaults for non-nullable
        if (fieldValue === undefined) {
          if (field.nullable) {
            writer.writeU8(0); // None
          } else {
            // For non-nullable fields, provide default values based on type
            if (field.type.kind === 'map') {
              writer.writeU32(0); // Empty map
            } else if (field.type.kind === 'vector' || field.type.kind === 'list') {
              writer.writeU32(0); // Empty vector/list
            } else if (field.type.kind === 'set') {
              writer.writeU32(0); // Empty set
            } else {
              // For scalar types, write default values
              const scalarType = field.type.kind === 'scalar' ? field.type.scalar : field.type.kind;
              if (
                scalarType === 'u64' ||
                scalarType === 'i64' ||
                scalarType === 'u128' ||
                scalarType === 'i128'
              ) {
                if (scalarType === 'u128' || scalarType === 'i128') {
                  writer.writeU64(0n); // low 64 bits
                  writer.writeU64(0n); // high 64 bits
                } else {
                  writer.writeU64(0n);
                }
              } else if (scalarType === 'u8' || scalarType === 'i8') {
                writer.writeU8(0);
              } else if (scalarType === 'u16' || scalarType === 'i16') {
                writer.writeU16(0);
              } else if (scalarType === 'u32' || scalarType === 'i32') {
                writer.writeU32(0);
              } else if (scalarType === 'bool') {
                writer.writeU8(0); // false
              } else if (scalarType === 'string') {
                writer.writeString('');
              } else if (scalarType === 'bytes') {
                writer.writeBytes(new Uint8Array(0));
            } else {
              // For other types, throw error as we can't provide a default
              throw ValidationError.requiredField(field.name, field.type.kind);
            }
            }
          }
          continue;
        }
        if (field.nullable && fieldValue === null) {
          writer.writeU8(0); // None
        } else {
          if (field.nullable) {
            writer.writeU8(1); // Some
          }
          serializeValue(writer, fieldValue, field.type, abi);
        }
      }
      break;
    }

    case 'variant': {
      if (!typeDef.variants) {
        throw new AbiError(
          ErrorCode.ABI_INVALID_TYPE_REF,
          'Variant type missing variants',
          { typeKind: 'variant' }
        );
      }
      // Variants are serialized as u8 discriminant + payload
      // Handle string enum values (TypeScript enums) by converting to object format
      let variantObj: Record<string, unknown>;
      if (typeof value === 'string') {
        // Check if the string matches a variant name (case-insensitive)
        const matchingVariant = typeDef.variants.find(
          (v: Variant) => v.name.toLowerCase() === value.toLowerCase()
        );
        if (matchingVariant) {
          // Convert string enum to object format: { type: "VariantName" }
          // If variant has a payload, we can't convert from string alone
          if (matchingVariant.payload) {
            throw new SerializationError(
              ErrorCode.SERIALIZATION_TYPE_MISMATCH,
              `Cannot serialize string enum value "${value}" for variant with payload`,
              { variantName: matchingVariant.name, value }
            );
          }
          // Unit variant - convert to object format
          variantObj = { type: matchingVariant.name };
        } else {
          // If no match found, use the string value as the type
          variantObj = { type: value };
        }
      } else if (typeof value === 'object' && value !== null) {
        variantObj = value as Record<string, unknown>;
      } else {
        throw SerializationError.typeMismatch('object or string', typeof value, 'variant');
      }
      // Find which variant this is (check for discriminant or type field)
      const variantName = variantObj.type || variantObj.kind || Object.keys(variantObj)[0];
      const variant = typeDef.variants.find(v => v.name === variantName);
      if (!variant) {
        throw AbiError.variantMismatch(
          'unknown',
          variantName,
          typeDef.variants.map(v => v.name)
        );
      }
      const variantIndex = typeDef.variants.indexOf(variant);
      writer.writeU8(variantIndex);
      if (variant.payload) {
        const payload = variantObj.payload || variantObj;
        serializeValue(writer, payload, variant.payload, abi);
      }
      break;
    }

    case 'alias':
      if (!typeDef.target) {
        throw new AbiError(
          ErrorCode.ABI_INVALID_TYPE_REF,
          'Alias type missing target',
          { typeKind: 'alias' }
        );
      }
      serializeValue(writer, value, typeDef.target, abi);
      break;

    case 'bytes':
      if (!(value instanceof Uint8Array)) {
        throw SerializationError.typeMismatch('Uint8Array', typeof value, 'bytes');
      }
      if (typeDef.size !== undefined) {
        // Fixed-size bytes
        writer.writeFixedArray(value);
      } else {
        // Variable-size bytes
        writer.writeBytes(value);
      }
      break;

    default:
      throw AbiError.unsupportedType(typeDef.kind, 'TypeDef serialization');
  }
}

/**
 * Internal deserialization function
 */
function deserializeValue(reader: BorshReader, typeRef: TypeRef, abi: AbiManifest): unknown {
  // Handle option types
  if (typeRef.kind === 'option') {
    const some = reader.readU8();
    if (some === 0) {
      return null;
    }
    const innerType = typeRef.inner;
    if (!innerType) {
      throw new AbiError(
        ErrorCode.ABI_INVALID_TYPE_REF,
        'Option type missing inner type',
        { typeKind: 'option' }
      );
    }
    return deserializeValue(reader, innerType, abi);
  }

  // Handle scalar types
  // Rust ABI format uses { "kind": "string" } directly, not { "kind": "scalar", "scalar": "string" }
  if (typeRef.kind === 'scalar') {
    return deserializeScalar(reader, typeRef.scalar!);
  }

  // Check if kind is a scalar type name directly (Rust format)
  const scalarTypes: ScalarType[] = [
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
  ];
  if (scalarTypes.includes(typeRef.kind as ScalarType)) {
    return deserializeScalar(reader, typeRef.kind as ScalarType);
  }

  // Handle vector/list types
  // Rust ABI format uses "list" instead of "vector"
  if (typeRef.kind === 'vector' || typeRef.kind === 'list') {
    const innerType = typeRef.inner || (typeRef as any).items; // Rust uses "items" instead of "inner"
    if (!innerType) {
      throw new AbiError(
        ErrorCode.ABI_INVALID_TYPE_REF,
        'Vector/list type missing inner type',
        { typeKind: typeRef.kind }
      );
    }
    const length = reader.readU32();
    const array: unknown[] = [];
    for (let i = 0; i < length; i++) {
      array.push(deserializeValue(reader, innerType, abi));
    }
    return array;
  }

  // Handle map types
  if (typeRef.kind === 'map') {
    const keyType = typeRef.key;
    const valueType = typeRef.value;
    if (!keyType || !valueType) {
      throw new AbiError(
        ErrorCode.ABI_INVALID_TYPE_REF,
        'Map type missing key or value type',
        { typeKind: 'map' }
      );
    }
    const length = reader.readU32();
    const map = new Map();
    for (let i = 0; i < length; i++) {
      const key = deserializeValue(reader, keyType, abi);
      const value = deserializeValue(reader, valueType, abi);
      map.set(key, value);
    }
    return map;
  }

  // Handle reference types (records, variants, aliases)
  // Rust ABI format uses "$ref" instead of { "kind": "reference", "name": "..." }
  if (typeRef.kind === 'reference' || (typeRef as any).$ref) {
    const typeName = typeRef.name || (typeRef as any).$ref;
    if (!typeName) {
      throw new AbiError(
        ErrorCode.ABI_INVALID_TYPE_REF,
        'Reference type missing name',
        { typeRef }
      );
    }
    const typeDef = resolveTypeRef(abi, typeRef);
    if (!typeDef) {
      throw AbiError.typeNotFound(typeName);
    }
    return deserializeTypeDef(reader, typeDef, abi);
  }

  throw AbiError.unsupportedType(typeRef.kind, 'ABI deserialization');
}

/**
 * Deserialize a scalar value
 */
function deserializeScalar(reader: BorshReader, scalar: ScalarType): unknown {
  switch (scalar) {
    case 'bool':
      return reader.readU8() === 1;

    case 'u8':
      return reader.readU8();
    case 'u16':
      return reader.readU16();
    case 'u32':
      return reader.readU32();

    case 'u64':
      return reader.readU64();
    case 'u128': {
      // u128 is two u64s: low 64 bits, then high 64 bits
      const low = reader.readU64();
      const high = reader.readU64();
      return (high << 64n) | low;
    }

    case 'i8': {
      const u8 = reader.readU8();
      return u8 > 127 ? u8 - 256 : u8;
    }
    case 'i16': {
      const u16 = reader.readU16();
      return u16 > 32767 ? u16 - 65536 : u16;
    }
    case 'i32': {
      const u32 = reader.readU32();
      return u32 > 2147483647 ? u32 - 4294967296 : u32;
    }

    case 'i64': {
      const u64 = reader.readU64();
      // Convert to signed: if high bit is set, it's negative
      const mask = BigInt('0x8000000000000000');
      return u64 >= mask ? u64 - BigInt('0x10000000000000000') : u64;
    }
    case 'i128': {
      const iLow = reader.readU64();
      const iHigh = reader.readU64();
      // Combine as unsigned bigint first
      const unsigned = (iHigh << 64n) | iLow;
      // Convert to signed: if high bit is set, it's negative
      const mask = BigInt('0x80000000000000000000000000000000');
      return unsigned >= mask ? unsigned - BigInt('0x100000000000000000000000000000000') : unsigned;
    }

    case 'f32':
      return reader.readF32();
    case 'f64':
      return reader.readF64();

    case 'string':
      return reader.readString();

    case 'bytes':
      return reader.readBytes();

    case 'unit':
      return undefined;

    default:
      throw AbiError.unsupportedType(scalar, 'scalar deserialization');
  }
}

/**
 * Deserialize a TypeDef
 */
function deserializeTypeDef(reader: BorshReader, typeDef: TypeDef, abi: AbiManifest): unknown {
  switch (typeDef.kind) {
    case 'record': {
      if (!typeDef.fields) {
        throw new AbiError(
          ErrorCode.ABI_INVALID_TYPE_REF,
          'Record type missing fields',
          { typeKind: 'record' }
        );
      }
      const record: Record<string, unknown> = {};
      for (const field of typeDef.fields) {
        if (field.nullable) {
          const some = reader.readU8();
          if (some === 0) {
            record[field.name] = null;
            continue;
          }
        }
        record[field.name] = deserializeValue(reader, field.type, abi);
      }
      return record;
    }

    case 'variant': {
      if (!typeDef.variants) {
        throw new AbiError(
          ErrorCode.ABI_INVALID_TYPE_REF,
          'Variant type missing variants',
          { typeKind: 'variant' }
        );
      }
      const discriminant = reader.readU8();
      const variant = typeDef.variants[discriminant];
      if (!variant) {
        throw new SerializationError(
          ErrorCode.DESERIALIZATION_FAILED,
          `Invalid variant discriminant: ${discriminant}`,
          { discriminant, validRange: `0-${typeDef.variants.length - 1}` }
        );
      }
      if (variant.payload) {
        const payload = deserializeValue(reader, variant.payload, abi);
        return {
          type: variant.name,
          payload,
        };
      }
      return {
        type: variant.name,
      };
    }

    case 'alias':
      if (!typeDef.target) {
        throw new AbiError(
          ErrorCode.ABI_INVALID_TYPE_REF,
          'Alias type missing target',
          { typeKind: 'alias' }
        );
      }
      return deserializeValue(reader, typeDef.target, abi);

    case 'bytes':
      if (typeDef.size !== undefined) {
        return reader.readFixedArray(typeDef.size);
      }
      return reader.readBytes();

    default:
      throw AbiError.unsupportedType(typeDef.kind, 'TypeDef deserialization');
  }
}
