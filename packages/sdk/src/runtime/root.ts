import * as env from '../env/api';
import { serialize, deserialize } from '../utils/serialize';
import { CollectionSnapshot, instantiateCollection, snapshotCollection } from './collections';

interface PersistedStateDocumentLegacy {
  version: 1;
  className: string;
  values: Record<string, PersistedValueEntry>;
  collections: Record<string, CollectionSnapshot>;
  metadata: {
    createdAt: number;
    updatedAt: number;
  };
}

interface PersistedStateDocumentV2 {
  version: 2;
  className: string;
  values: Record<string, unknown>;
  collections: Record<string, CollectionSnapshot>;
  metadata: {
    createdAt: number;
    updatedAt: number;
  };
}

interface PersistedValueEntry {
  encoding: 'json';
  data: string;
}

export const ROOT_STORAGE_KEY = new TextEncoder().encode('__calimero::root_state__');
const ROOT_METADATA = Symbol.for('__calimeroRootMetadata');

const textDecoder = new TextDecoder();

export function saveRootState(state: any): Uint8Array {
  if (!state || typeof state !== 'object') {
    throw new Error('StateManager.save expects an object instance');
  }

  const metadata = ensureMetadata(state);

  const doc: PersistedStateDocumentV2 = {
    version: 2,
    className: state.constructor?.name ?? 'AnonymousState',
    values: Object.create(null) as Record<string, unknown>,
    collections: Object.create(null) as Record<string, CollectionSnapshot>,
    metadata,
  };

  for (const key of Object.keys(state)) {
    const value = state[key];

    const collectionSnapshot = snapshotCollection(value);
    if (collectionSnapshot) {
      doc.collections[key] = collectionSnapshot;
      continue;
    }

    if (typeof value === 'function') {
      continue;
    }

    doc.values[key] = value;
  }

  const payload = serialize(doc);
  env.storageWrite(ROOT_STORAGE_KEY, payload);
  return payload;
}

export function loadRootState<T>(stateClass: { new (...args: any[]): T }): T | null {
  const raw = env.storageRead(ROOT_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  let doc: PersistedStateDocumentV2 | PersistedStateDocumentLegacy;
  let isLegacy = false;
  const json = textDecoder.decode(raw);

  try {
    const decoded = deserialize<any>(raw);
    if (decoded && typeof decoded === 'object' && decoded.version === 2) {
      doc = decoded as PersistedStateDocumentV2;
    } else {
      throw new Error('Unexpected document format');
    }
  } catch {
    try {
      doc = JSON.parse(json) as PersistedStateDocumentLegacy;
      isLegacy = true;
    } catch (error) {
      throw new Error(`Failed to parse persisted state: ${String(error)}`);
    }
  }

  const instance: any = new stateClass();
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
    } catch (error) {
      throw new Error(`Failed to hydrate collection '${key}': ${String(error)}`);
    }
  }

  if (doc.version === 2) {
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

    return instance;
  }

  // Legacy migration path (version 1 JSON format)
  try {
    const values = doc.values ?? {};
    for (const [key, entry] of Object.entries(values)) {
      if (entry.encoding !== 'json') {
        continue;
      }
      const bytes = hexToBytes(entry.data);
      const decoded = JSON.parse(textDecoder.decode(bytes));
      const current = target[key];
      if (shouldMergeIntoExisting(current)) {
        Object.assign(current, decoded);
      } else {
        target[key] = decoded;
      }
    }
  } catch (error) {
    throw new Error(`Failed to migrate legacy state: ${String(error)}`);
  }

  if (isLegacy) {
    try {
      saveRootState(instance);
    } catch (error) {
      env.log(`Failed to rewrite state in Borsh format: ${error}`);
    }
  }

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

function hexToBytes(hex: string): Uint8Array {
  const length = hex.length;
  const result = new Uint8Array(length / 2);
  for (let i = 0; i < length; i += 2) {
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return result;
}

function shouldMergeIntoExisting(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

