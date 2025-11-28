import * as env from '../env/api';
import { CollectionSnapshot, instantiateCollection, snapshotCollection } from './collections';
import { RuntimeAbiGenerator, type AbiManifest, type TypeDef } from '../abi/index.js';
import { serializeWithAbi, deserializeWithAbi } from '../utils/borsh-abi.js';
import { BorshWriter } from '../borsh/encoder.js';
import { BorshReader } from '../borsh/decoder.js';

interface PersistedStateDocument {
  className: string;
  values: Record<string, Uint8Array>; // Serialized values using ABI-aware Borsh
  valueTypes: Record<string, string>; // Type reference for each field
  collections: Record<string, CollectionSnapshot>;
  metadata: {
    createdAt: number;
    updatedAt: number;
  };
}

const ROOT_METADATA = Symbol.for('__calimeroRootMetadata');

export function saveRootState(state: any): Uint8Array {
  if (!state || typeof state !== 'object') {
    throw new Error('StateManager.save expects an object instance');
  }

  const metadata = ensureMetadata(state);

  // Get ABI manifest
  const abiManifest = RuntimeAbiGenerator.generateRuntimeManifest();
  if (!abiManifest.state_root) {
    throw new Error('ABI manifest missing state_root - cannot serialize state without ABI');
  }

  // Get state root type definition
  const stateRootType = abiManifest.types[abiManifest.state_root];
  if (!stateRootType || stateRootType.kind !== 'record') {
    throw new Error(`State root type '${abiManifest.state_root}' not found or is not a record`);
  }

  const doc: PersistedStateDocument = {
    className: state.constructor?.name ?? 'AnonymousState',
    values: Object.create(null) as Record<string, Uint8Array>,
    valueTypes: Object.create(null) as Record<string, string>,
    collections: Object.create(null) as Record<string, CollectionSnapshot>,
    metadata,
  };

  // Serialize each field according to ABI
  for (const field of stateRootType.fields || []) {
    const key = field.name;
    const value = state[key];

    // Skip functions and metadata (ROOT_METADATA is a Symbol, not enumerable)
    if (typeof value === 'function') {
      continue;
    }

    // Handle collections
    const collectionSnapshot = snapshotCollection(value);
    if (collectionSnapshot) {
      env.log(`[root] snapshotting collection field '${key}' with id=${collectionSnapshot.id}`);
      doc.collections[key] = collectionSnapshot;
      continue;
    }

    // Serialize scalar/other values using ABI-aware Borsh
    try {
      const serialized = serializeWithAbi(value, field.type, abiManifest);
      doc.values[key] = serialized;
      // Store the type reference as JSON string for deserialization
      doc.valueTypes[key] = JSON.stringify(field.type);
      env.log(`[root] serialized field '${key}' using ABI (${serialized.length} bytes)`);
    } catch (error) {
      env.log(`[root] failed to serialize field '${key}': ${error}`);
      throw new Error(`Failed to serialize state field '${key}': ${error}`);
    }
  }

  // Serialize the document using standard Borsh (no ValueKind prefixes)
  const writer = new BorshWriter();

  // Write className
  writer.writeString(doc.className);

  // Write values: u32 count + (string key + u32 value_len + bytes + string type_ref) for each
  writer.writeU32(Object.keys(doc.values).length);
  for (const [key, valueBytes] of Object.entries(doc.values)) {
    writer.writeString(key);
    writer.writeU32(valueBytes.length);
    writer.writeFixedArray(valueBytes);
    writer.writeString(doc.valueTypes[key]);
  }

  // Write collections: u32 count + (string key + string type + string id) for each
  writer.writeU32(Object.keys(doc.collections).length);
  for (const [key, snapshot] of Object.entries(doc.collections)) {
    writer.writeString(key);
    writer.writeString(snapshot.type);
    writer.writeString(snapshot.id);
  }

  // Write metadata
  writer.writeU64(BigInt(doc.metadata.createdAt));
  writer.writeU64(BigInt(doc.metadata.updatedAt));

  const payload = writer.toBytes();
  env.log('[root] writing state document to host (ABI-aware Borsh format)');
  env.persistRootState(payload, metadata.createdAt, metadata.updatedAt);
  return payload;
}

export function loadRootState<T>(stateClass: { new (...args: any[]): T }): T | null {
  const source = env.readRootState();
  if (!source) {
    env.log('[root] host returned no root state payload');
    return null;
  }

  env.log('[root] host returned persisted state payload');

  // Get ABI manifest
  const abiManifest = RuntimeAbiGenerator.generateRuntimeManifest();
  if (!abiManifest.state_root) {
    throw new Error('ABI manifest missing state_root - cannot deserialize state without ABI');
  }

  // Get state root type definition
  const stateRootType = abiManifest.types[abiManifest.state_root];
  if (!stateRootType || stateRootType.kind !== 'record') {
    throw new Error(`State root type '${abiManifest.state_root}' not found or is not a record`);
  }

  // Deserialize using ABI-aware format
  return loadRootStateAbiAware<T>(source, stateClass, abiManifest, stateRootType);
}

function loadRootStateAbiAware<T>(
  source: Uint8Array,
  stateClass: { new (...args: any[]): T },
  abiManifest: AbiManifest,
  stateRootType: TypeDef
): T {
  const reader = new BorshReader(source);

  // Read className (stored but not used in deserialization)
  const _className = reader.readString();

  // Read values
  const valuesCount = reader.readU32();
  const values: Record<string, any> = {};
  const valueTypes: Record<string, any> = {};

  for (let i = 0; i < valuesCount; i++) {
    const key = reader.readString();
    const valueLen = reader.readU32();
    const valueBytes = reader.readFixedArray(valueLen);
    const typeRefJson = reader.readString();
    valueTypes[key] = JSON.parse(typeRefJson);
    values[key] = valueBytes;
  }

  // Read collections
  const collectionsCount = reader.readU32();
  const collections: Record<string, CollectionSnapshot> = {};

  for (let i = 0; i < collectionsCount; i++) {
    const key = reader.readString();
    const type = reader.readString();
    const id = reader.readString();
    collections[key] = { type, id };
  }

  // Read metadata
  const createdAt = Number(reader.readU64());
  const updatedAt = Number(reader.readU64());

  const instance: any = typeof stateClass === 'function' ? Object.create(stateClass.prototype) : {};
  const target = instance as Record<string, unknown>;

  // Set metadata
  Object.defineProperty(instance, ROOT_METADATA, {
    value: { createdAt, updatedAt },
    enumerable: false,
    configurable: true,
    writable: true,
  });

  // Hydrate collections
  for (const [key, snapshot] of Object.entries(collections)) {
    try {
      const collection = instantiateCollection(snapshot);
      target[key] = collection;
      env.log(`[root] hydrated collection field '${key}' with id=${snapshot.id}`);
    } catch (error) {
      throw new Error(`Failed to hydrate collection '${key}': ${String(error)}`);
    }
  }

  // Deserialize values using ABI
  for (const field of stateRootType.fields || []) {
    const key = field.name;
    const valueBytes = values[key];

    if (valueBytes) {
      try {
        const deserialized = deserializeWithAbi(valueBytes, field.type, abiManifest);
        target[key] = deserialized;
        env.log(`[root] deserialized field '${key}' using ABI`);
      } catch (error) {
        env.log(`[root] failed to deserialize field '${key}': ${error}`);
        throw new Error(`Failed to deserialize state field '${key}': ${error}`);
      }
    }
  }

  env.log('[root] finished hydrating state instance (ABI-aware Borsh format)');
  return instance;
}

function ensureMetadata(state: any): { createdAt: number; updatedAt: number } {
  const now = Number(env.timeNow());
  const existing = state[ROOT_METADATA];
  if (existing && typeof existing === 'object') {
    existing.updatedAt = now;
    return existing;
  }

  const metadata = { createdAt: now, updatedAt: now };
  Object.defineProperty(state, ROOT_METADATA, {
    value: metadata,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return metadata;
}
