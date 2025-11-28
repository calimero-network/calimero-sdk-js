import * as env from '../env/api';
import { serialize, deserialize } from '../utils/serialize';
import { CollectionSnapshot, instantiateCollection, snapshotCollection } from './collections';
import { getAbiManifest, getStateRootType } from '../abi/helpers';
import { serializeWithAbi, deserializeWithAbi } from '../utils/abi-serialize';
import { BorshWriter } from '../borsh/encoder';
import { BorshReader } from '../borsh/decoder';
import type { TypeRef } from '../abi/types';

interface PersistedStateDocument {
  className: string;
  values: Record<string, unknown>;
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

  const doc: PersistedStateDocument = {
    className: state.constructor?.name ?? 'AnonymousState',
    values: Object.create(null) as Record<string, unknown>,
    collections: Object.create(null) as Record<string, CollectionSnapshot>,
    metadata,
  };

  for (const key of Object.keys(state)) {
    const value = state[key];

    const collectionSnapshot = snapshotCollection(value);
    if (collectionSnapshot) {
      env.log(`[root] snapshotting collection field '${key}' with id=${collectionSnapshot.id}`);
      doc.collections[key] = collectionSnapshot;
      continue;
    }

    if (typeof value === 'function') {
      continue;
    }

    doc.values[key] = value;
  }

  // ABI-aware serialization is required
  const abi = getAbiManifest();
  if (!abi) {
    throw new Error('ABI manifest is required but not available for state serialization');
  }

  const stateRootType = getStateRootType(abi);
  if (!stateRootType || stateRootType.kind !== 'record' || !stateRootType.fields) {
    throw new Error('Invalid or missing state_root type in ABI');
  }

  // Serialize state values according to ABI state_root type for Rust compatibility
  // Create a state object with only the values (no collections, no metadata)
  const stateValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc.values)) {
    stateValues[key] = value;
  }

  // Serialize state directly using ABI-aware serialization (like Rust does)
  const stateTypeRef: TypeRef = {
    kind: 'reference',
    name: abi.state_root,
  };
  const statePayload = serializeWithAbi(stateValues, stateTypeRef, abi);

  // Store collections and metadata using legacy format (they're JS-specific)
  // Format: [version: u8=1][state: borsh][collections: legacy][metadata: legacy]
  const writer = new BorshWriter();
  writer.writeU8(1); // Version 1 = ABI format
  writer.writeBytes(statePayload);

  // Append collections and metadata using legacy format
  // Collections are JS-specific CRDT snapshots, not part of Rust state
  const collectionsAndMetadata = serialize({
    collections: doc.collections,
    metadata: doc.metadata,
  });
  writer.writeBytes(collectionsAndMetadata);

  const payload = writer.toBytes();
  env.log('[root] writing state using ABI-aware serialization (Rust-compatible)');

  env.log('[root] writing state document to host');
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

  // ABI-aware format is required
  const reader = new BorshReader(source);
  const formatVersion = reader.readU8();

  if (formatVersion !== 1) {
    throw new Error(`Unsupported state format version: ${formatVersion} (expected 1)`);
  }

  // ABI-aware format: [version: u8][state: borsh][collections+metadata: legacy]
  const abi = getAbiManifest();
  if (!abi) {
    throw new Error('ABI manifest is required but not available for state deserialization');
  }

  const stateRootType = getStateRootType(abi);
  if (!stateRootType || stateRootType.kind !== 'record') {
    throw new Error('Invalid or missing state_root type in ABI');
  }

  // Deserialize state using ABI-aware deserialization
  const stateTypeRef: TypeRef = {
    kind: 'reference',
    name: abi.state_root,
  };
  const stateBytes = reader.readBytes(); // readBytes() handles u32 length prefix
  const stateValues = deserializeWithAbi(stateBytes, stateTypeRef, abi) as Record<string, unknown>;

  // Deserialize collections and metadata (legacy format)
  // Collections/metadata are stored with u32 length prefix (from writeBytes)
  const collectionsAndMetadataBytes = reader.readBytes(); // readBytes() handles u32 length prefix
  const collectionsAndMetadata =
    collectionsAndMetadataBytes.length > 0
      ? deserialize<any>(collectionsAndMetadataBytes)
      : { collections: {}, metadata: null };

  // Reconstruct document format
  const doc: PersistedStateDocument = {
    className: stateClass?.name ?? 'AnonymousState',
    values: stateValues,
    collections: collectionsAndMetadata.collections || {},
    metadata: collectionsAndMetadata.metadata || {
      createdAt: Number(env.timeNow()),
      updatedAt: Number(env.timeNow()),
    },
  };

  env.log('[root] loaded state using ABI-aware deserialization (Rust-compatible)');

  if (
    typeof doc.className !== 'string' ||
    typeof doc.metadata !== 'object' ||
    doc.metadata === null ||
    typeof doc.metadata.createdAt !== 'number' ||
    typeof doc.metadata.updatedAt !== 'number' ||
    typeof doc.values !== 'object' ||
    doc.values === null ||
    typeof doc.collections !== 'object' ||
    doc.collections === null
  ) {
    throw new Error('Persisted state document missing required fields');
  }

  const instance: any = typeof stateClass === 'function' ? Object.create(stateClass.prototype) : {};
  const target = instance as Record<string, unknown>;
  const metadata =
    doc.metadata && typeof doc.metadata === 'object'
      ? doc.metadata
      : { createdAt: Number(env.timeNow()), updatedAt: Number(env.timeNow()) };

  Object.defineProperty(instance, ROOT_METADATA, {
    value: { ...metadata },
    enumerable: false,
    configurable: true,
    writable: true,
  });

  const collections = doc.collections ?? {};
  for (const [key, snapshot] of Object.entries(collections)) {
    try {
      const collection = instantiateCollection(snapshot);
      target[key] = collection;
      env.log(`[root] hydrated collection field '${key}' with id=${snapshot.id}`);
    } catch (error) {
      throw new Error(`Failed to hydrate collection '${key}': ${String(error)}`);
    }
  }

  const values = doc.values ?? {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      continue;
    }
    const current = target[key];
    if (shouldMergeIntoExisting(current)) {
      Object.assign(current, value);
    } else {
      target[key] = value;
    }
  }

  env.log('[root] finished hydrating state instance');
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

function shouldMergeIntoExisting(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
