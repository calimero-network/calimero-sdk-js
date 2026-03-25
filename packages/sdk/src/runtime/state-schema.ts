/**
 * State Schema types for init_state host function.
 *
 * This module provides types and serialization for the StateSchema format
 * used by the init_state host function. The schema describes the CRDT
 * collections in the application state, allowing the Rust runtime to
 * create them with deterministic IDs.
 *
 * @see core/crates/primitives/src/crdt.rs for Rust definitions
 */

import * as env from '../env/api';

// =============================================================================
// CRDT TYPE ENUM
// =============================================================================

/**
 * CRDT type discriminants (must match Rust enum order in crdt.rs).
 */
export const enum CrdtTypeKind {
  LwwRegister = 0,
  GCounter = 1,
  PnCounter = 2,
  Rga = 3,
  UnorderedMap = 4,
  UnorderedSet = 5,
  Vector = 6,
  UserStorage = 7,
  FrozenStorage = 8,
  Custom = 9,
}

/**
 * CRDT type definition matching Rust CrdtType enum.
 */
export type CrdtType =
  | { kind: CrdtTypeKind.LwwRegister; inner_type: string }
  | { kind: CrdtTypeKind.GCounter }
  | { kind: CrdtTypeKind.PnCounter }
  | { kind: CrdtTypeKind.Rga }
  | { kind: CrdtTypeKind.UnorderedMap; key_type: string; value_type: string }
  | { kind: CrdtTypeKind.UnorderedSet; element_type: string }
  | { kind: CrdtTypeKind.Vector; element_type: string }
  | { kind: CrdtTypeKind.UserStorage }
  | { kind: CrdtTypeKind.FrozenStorage }
  | { kind: CrdtTypeKind.Custom; name: string };

// =============================================================================
// STATE SCHEMA
// =============================================================================

/**
 * Schema for a single field in the state.
 */
export interface StateFieldSchema {
  name: string;
  crdt_type: CrdtType;
}

/**
 * Schema describing the entire state structure.
 */
export interface StateSchema {
  fields: StateFieldSchema[];
}

// =============================================================================
// BORSH SERIALIZATION
// =============================================================================

/**
 * Writes a u32 length prefix in little-endian.
 */
function writeU32(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = value & 0xff;
  buf[1] = (value >> 8) & 0xff;
  buf[2] = (value >> 16) & 0xff;
  buf[3] = (value >> 24) & 0xff;
  return buf;
}

/**
 * Reads a u32 from little-endian bytes.
 */
function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

/**
 * Borsh-serializes a string (u32 length + UTF-8 bytes).
 */
function serializeString(s: string): Uint8Array {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(s);
  const len = writeU32(bytes.length);
  const result = new Uint8Array(4 + bytes.length);
  result.set(len, 0);
  result.set(bytes, 4);
  return result;
}

/**
 * Borsh-serializes a CrdtType.
 */
function serializeCrdtType(crdt: CrdtType): Uint8Array {
  const parts: Uint8Array[] = [];

  // Discriminant byte
  parts.push(new Uint8Array([crdt.kind]));

  // Variant data
  switch (crdt.kind) {
    case CrdtTypeKind.LwwRegister:
      parts.push(serializeString(crdt.inner_type));
      break;
    case CrdtTypeKind.GCounter:
    case CrdtTypeKind.PnCounter:
    case CrdtTypeKind.Rga:
    case CrdtTypeKind.UserStorage:
    case CrdtTypeKind.FrozenStorage:
      // No additional data
      break;
    case CrdtTypeKind.UnorderedMap:
      parts.push(serializeString(crdt.key_type));
      parts.push(serializeString(crdt.value_type));
      break;
    case CrdtTypeKind.UnorderedSet:
      parts.push(serializeString(crdt.element_type));
      break;
    case CrdtTypeKind.Vector:
      parts.push(serializeString(crdt.element_type));
      break;
    case CrdtTypeKind.Custom:
      parts.push(serializeString(crdt.name));
      break;
  }

  // Concatenate all parts
  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * Borsh-serializes a StateFieldSchema.
 */
function serializeFieldSchema(field: StateFieldSchema): Uint8Array {
  const name = serializeString(field.name);
  const crdt = serializeCrdtType(field.crdt_type);
  const result = new Uint8Array(name.length + crdt.length);
  result.set(name, 0);
  result.set(crdt, name.length);
  return result;
}

/**
 * Borsh-serializes a StateSchema.
 */
export function serializeStateSchema(schema: StateSchema): Uint8Array {
  const parts: Uint8Array[] = [];

  // Vec length prefix
  parts.push(writeU32(schema.fields.length));

  // Each field
  for (const field of schema.fields) {
    parts.push(serializeFieldSchema(field));
  }

  // Concatenate
  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

// =============================================================================
// RESULT DESERIALIZATION
// =============================================================================

/**
 * Result from init_state: map of field_name → collection_id.
 */
export type StateInitResult = Map<string, Uint8Array>;

/**
 * Deserializes the init_state result (BTreeMap<String, Id>).
 *
 * Borsh format: u32 count + (String, [u8; 32])...
 */
export function deserializeStateInitResult(bytes: Uint8Array): StateInitResult {
  const result = new Map<string, Uint8Array>();
  let offset = 0;

  // Read count
  const count = readU32(bytes, offset);
  offset += 4;

  for (let i = 0; i < count; i++) {
    // Read string (field name)
    const strLen = readU32(bytes, offset);
    offset += 4;
    const strBytes = bytes.slice(offset, offset + strLen);
    offset += strLen;
    const name = new TextDecoder().decode(strBytes);

    // Read Id (32 bytes)
    const id = bytes.slice(offset, offset + 32);
    offset += 32;

    result.set(name, id);
  }

  return result;
}

// =============================================================================
// SCHEMA BUILDING FROM ABI
// =============================================================================

/**
 * Maps ABI crdt_type string to CrdtType.
 */
export function abiCrdtTypeToCrdtType(
  abiType: string,
  keyType?: string,
  valueType?: string,
  elementType?: string,
  innerType?: string
): CrdtType {
  switch (abiType) {
    case 'g_counter':
      return { kind: CrdtTypeKind.GCounter };
    case 'pn_counter':
      return { kind: CrdtTypeKind.PnCounter };
    case 'rga':
      return { kind: CrdtTypeKind.Rga };
    case 'unordered_map':
      return {
        kind: CrdtTypeKind.UnorderedMap,
        key_type: keyType || 'String',
        value_type: valueType || 'Vec<u8>',
      };
    case 'unordered_set':
      return {
        kind: CrdtTypeKind.UnorderedSet,
        element_type: elementType || 'Vec<u8>',
      };
    case 'vector':
      return {
        kind: CrdtTypeKind.Vector,
        element_type: elementType || 'Vec<u8>',
      };
    case 'lww_register':
      return {
        kind: CrdtTypeKind.LwwRegister,
        inner_type: innerType || 'Vec<u8>',
      };
    case 'user_storage':
      return { kind: CrdtTypeKind.UserStorage };
    case 'frozen_storage':
      return { kind: CrdtTypeKind.FrozenStorage };
    default:
      // Unknown type - treat as custom
      return { kind: CrdtTypeKind.Custom, name: abiType };
  }
}

/**
 * Extracts type name from an ABI TypeRef.
 */
function typeRefToString(typeRef: any): string {
  if (!typeRef) return 'Vec<u8>';

  // Handle scalar types
  if (typeRef.kind === 'scalar' && typeRef.scalar) {
    return typeRef.scalar;
  }
  if (
    typeof typeRef.kind === 'string' &&
    !['option', 'vector', 'list', 'map', 'set', 'reference'].includes(typeRef.kind)
  ) {
    // Direct scalar like { kind: 'string' }
    return typeRef.kind;
  }
  if (typeRef.$ref) {
    return typeRef.$ref;
  }
  if (typeRef.name) {
    return typeRef.name;
  }

  return 'Vec<u8>';
}

/**
 * Builds a StateSchema from an ABI manifest.
 */
export function buildSchemaFromAbi(abi: any): StateSchema | null {
  if (!abi || !abi.state_root) {
    return null;
  }

  const stateTypeName = abi.state_root;
  const stateType = abi.types[stateTypeName];

  if (!stateType || stateType.kind !== 'record' || !stateType.fields) {
    return null;
  }

  const fields: StateFieldSchema[] = [];

  for (const field of stateType.fields) {
    const fieldType = field.type;
    const crdtTypeStr = fieldType.crdt_type;

    if (!crdtTypeStr) {
      // Not a CRDT field, skip
      env.log(`[state-schema] Skipping non-CRDT field: ${field.name}`);
      continue;
    }

    // Extract type parameters
    const keyType = fieldType.key ? typeRefToString(fieldType.key) : undefined;
    const valueType = fieldType.value ? typeRefToString(fieldType.value) : undefined;
    const elementType = fieldType.items ? typeRefToString(fieldType.items) : undefined;
    const innerType = fieldType.inner_type ? typeRefToString(fieldType.inner_type) : undefined;

    const crdt = abiCrdtTypeToCrdtType(crdtTypeStr, keyType, valueType, elementType, innerType);
    fields.push({ name: field.name, crdt_type: crdt });

    env.log(`[state-schema] Field '${field.name}' -> CRDT type: ${crdtTypeStr}`);
  }

  return { fields };
}

// =============================================================================
// INIT STATE HELPER
// =============================================================================

/**
 * Initializes state by calling the init_state host function.
 *
 * This creates all CRDT collections with deterministic IDs based on
 * the schema. Returns a map of field_name → collection_id.
 *
 * @param schema - The state schema describing all CRDT fields
 * @returns Map of field names to their collection IDs
 */
export function callInitState(schema: StateSchema): StateInitResult {
  env.log(`[state-schema] Calling init_state with ${schema.fields.length} fields`);

  const schemaBytes = serializeStateSchema(schema);
  const resultBytes = env.initState(schemaBytes);
  const result = deserializeStateInitResult(resultBytes);

  env.log(`[state-schema] init_state returned ${result.size} collection IDs`);
  return result;
}
