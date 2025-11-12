import * as env from '../env/api';
import { serialize, deserialize } from '../utils/serialize';
import { CollectionSnapshot, instantiateCollection, snapshotCollection } from './collections';

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

  const payload = serialize(doc);
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
      const { version: _ignored, ...rest } = candidate as { version: number } & Record<string, unknown>;
      return rest;
    }
    return candidate;
  })();

  const doc = base as unknown as PersistedStateDocument;

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

  const instance: any =
    typeof stateClass === 'function' ? Object.create(stateClass.prototype) : {};
  const target = instance as Record<string, unknown>;
  const metadata = doc.metadata && typeof doc.metadata === 'object'
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

