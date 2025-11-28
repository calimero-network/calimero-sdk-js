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

  // Try ABI-aware serialization for state if ABI is available
  const abi = getAbiManifest();
  let payload: Uint8Array;

  if (abi) {
    const stateRootType = getStateRootType(abi);
    if (stateRootType && stateRootType.kind === 'record' && stateRootType.fields) {
      try {
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

        // For backward compatibility, we still need to store collections and metadata
        // We'll prepend a version byte: 0 = legacy format, 1 = ABI format
        // Then store: [version: u8][state: borsh][collections: legacy][metadata: legacy]
        const writer = new BorshWriter();
        writer.writeU8(1); // Version 1 = ABI format
        writer.writeBytes(statePayload);

        // Append collections and metadata using legacy format for now
        // TODO: Migrate collections/metadata to ABI format if needed
        const collectionsAndMetadata = serialize({
          collections: doc.collections,
          metadata: doc.metadata,
        });
        writer.writeBytes(collectionsAndMetadata);

        payload = writer.toBytes();
        env.log('[root] writing state using ABI-aware serialization (Rust-compatible)');
      } catch (error) {
        // Fallback to legacy serialization if ABI serialization fails
        env.log(`[root] ABI serialization failed, using legacy: ${error}`);
        payload = serialize(doc);
      }
    } else {
      // No state_root type in ABI or invalid type, use legacy
      payload = serialize(doc);
    }
  } else {
    // No ABI available, use legacy serialization
    payload = serialize(doc);
  }

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

  // Check if this is ABI-aware format (version byte at start)
  // Try to read version byte, but handle legacy format gracefully
  let doc: PersistedStateDocument;

  try {
    const reader = new BorshReader(source);
    const formatVersion = reader.readU8();

    if (formatVersion === 1) {
      // ABI-aware format: [version: u8][state: borsh][collections+metadata: legacy]
      const abi = getAbiManifest();
      if (!abi) {
        throw new Error('ABI manifest not available for deserialization');
      }

      const stateRootType = getStateRootType(abi);
      if (!stateRootType || stateRootType.kind !== 'record') {
        throw new Error('Invalid state_root type in ABI');
      }

      // Deserialize state using ABI-aware deserialization
      const stateTypeRef: TypeRef = {
        kind: 'reference',
        name: abi.state_root,
      };
      const stateBytes = reader.readBytes(); // readBytes() handles u32 length prefix
      const stateValues = deserializeWithAbi(stateBytes, stateTypeRef, abi) as Record<
        string,
        unknown
      >;

      // Deserialize collections and metadata (legacy format)
      // Read remaining bytes after state payload
      const remainingBytes = source.slice(
        reader.remaining() === 0 ? source.length : source.length - reader.remaining()
      );
      const collectionsAndMetadata =
        remainingBytes.length > 0
          ? deserialize<any>(remainingBytes)
          : { collections: {}, metadata: null };

      // Reconstruct document format
      doc = {
        className: stateClass?.name ?? 'AnonymousState',
        values: stateValues,
        collections: collectionsAndMetadata.collections || {},
        metadata: collectionsAndMetadata.metadata || {
          createdAt: Number(env.timeNow()),
          updatedAt: Number(env.timeNow()),
        },
      };

      env.log('[root] loaded state using ABI-aware deserialization (Rust-compatible)');
    } else {
      // Version 0 or other - treat as legacy format
      throw new Error('Legacy format detected');
    }
  } catch (error) {
    // Fallback to legacy format
    env.log(`[root] ABI format not detected or failed, using legacy: ${error}`);
    const decoded = deserialize<any>(source);
    if (!decoded || typeof decoded !== 'object') {
      throw new Error('Unsupported persisted state document');
    }

    const candidate = decoded as Record<string, unknown>;
    const version = (candidate as { version?: unknown }).version;
    if (typeof version !== 'undefined' && version !== 2) {
      throw new Error(`Unsupported persisted state version (expected 2, received ${version})`);
    }

    const base = (() => {
      if (typeof version === 'number') {
        const { version: _ignored, ...rest } = candidate as { version: number } & Record<
          string,
          unknown
        >;
        return rest;
      }
      return candidate;
    })();

    doc = base as unknown as PersistedStateDocument;
  }

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
