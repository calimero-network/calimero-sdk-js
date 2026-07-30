/**
 * SharedStorage - group-writable single value with a rotatable writer set.
 *
 * Wraps the Rust `JsSharedStorage` host functions landed in
 * calimero-network/core#3340. A SharedStorage cell holds a single byte value in
 * an LWW register that any member of its *writer set* may overwrite:
 *
 *  - `set(value)` and `rotateWriters(writers)` are **writer-gated**: the host
 *    rejects a non-writer executor ("Executor is not authorised…"), surfaced
 *    here as a thrown error. The executor identity is host-provided.
 *  - `get()` returns `null` until the value is first written.
 *  - `writers()` returns the current writer set (32-byte public keys).
 *  - `writableByMe()`/`isFrozen()` report writer membership and the frozen flag.
 *
 * A missing cell cannot be lazily recreated (its writer set is unknown), so a
 * cell must be constructed via `new SharedStorage({ writers })` (fresh, random
 * id), `new SharedStorage({ writers, id })` (deterministic id) or rehydrated
 * from a persisted snapshot via {@link SharedStorage.fromId}. Calling `get`/
 * `set`/etc. on an id that was never opened surfaces a host error.
 *
 * Writer keys are passed as raw 32-byte `Uint8Array` public keys (what the host
 * wants — e.g. the value returned by `env.executorId()`) or as 64-character hex
 * strings; both are normalized to raw 32-byte keys before crossing the ABI. The
 * writer set crosses the ABI as the concatenation of those 32-byte keys.
 */

import { serialize, deserialize } from '../utils/serialize';
import { bytesToHex, normalizeCollectionId } from '../utils/hex';
import {
  sharedNew,
  sharedNewWithId,
  sharedSet,
  sharedGet,
  sharedWriters,
  sharedWritableByMe,
  sharedIsFrozen,
  sharedRotateWriters,
} from '../runtime/storage-wasm';
import { registerCollectionType, CollectionSnapshot } from '../runtime/collections';

const SENTINEL_KEY = '__calimeroCollection';
const PUBLIC_KEY_LENGTH = 32;

/**
 * A writer public key: a raw 32-byte `Uint8Array` or a 64-character hex string.
 */
export type WriterKey = Uint8Array | string;

export interface SharedStorageOptions {
  /**
   * The initial writer set — raw 32-byte public keys or 64-character hex
   * strings. Required when creating a cell (omit only via {@link
   * SharedStorage.fromId}, which rehydrates an already-opened cell).
   */
  writers?: WriterKey[];
  /**
   * Whether the cell is created frozen. Defaults to `false`.
   */
  frozen?: boolean;
  /**
   * A 32-byte Uint8Array or 64-character hex cell identifier.
   *
   * With `writers` present, a cell is **created/registered at this exact id**
   * with the given writer set — use it for a stable, cross-node id at genesis
   * (this is how deterministic `@State` fields are assigned). It is **not** a
   * safe reopen of an existing cell: to reopen a cell that already holds data
   * without touching its value or writer set, use {@link SharedStorage.fromId}
   * (or `new SharedStorage({ id })` with no `writers`), which wraps the id with
   * no host call.
   */
  id?: Uint8Array | string;
}

/**
 * Normalize a single writer key to a raw 32-byte `Uint8Array`.
 */
function normalizeWriter(key: WriterKey): Uint8Array {
  return normalizeCollectionId(key, 'SharedStorage writer');
}

/**
 * Concatenate normalized writer keys into the `count * 32` byte encoding the
 * host expects. Rejects an empty writer set: a cell with no writers could never
 * be written to (`set`/`rotateWriters` are writer-gated) and `rotateWriters`
 * refuses an empty set, so it could never be recovered — it would be bricked.
 */
function encodeWriters(writers: WriterKey[]): Uint8Array {
  if (writers.length === 0) {
    throw new Error(
      'SharedStorage: writer set must not be empty — a cell with no writers can never be written to or recovered'
    );
  }
  const normalized = writers.map(normalizeWriter);
  const buffer = new Uint8Array(normalized.length * PUBLIC_KEY_LENGTH);
  normalized.forEach((key, index) => {
    buffer.set(key, index * PUBLIC_KEY_LENGTH);
  });
  return buffer;
}

export class SharedStorage<V> {
  private readonly cellId: Uint8Array;

  constructor(options: SharedStorageOptions = {}) {
    const { writers, frozen = false, id } = options;

    if (writers === undefined) {
      // Rehydrate an already-opened cell from its id (e.g. a persisted
      // snapshot). No host call: the cell is assumed to exist.
      if (id === undefined) {
        throw new Error('SharedStorage: `writers` is required to create a cell');
      }
      this.cellId = normalizeCollectionId(id, 'SharedStorage');
      return;
    }

    const encodedWriters = encodeWriters(writers);
    if (id === undefined) {
      // Fresh cell at a host-assigned random id.
      this.cellId = sharedNew(encodedWriters, frozen);
    } else {
      // Cell at a caller-supplied (deterministic) id.
      const normalizedId = normalizeCollectionId(id, 'SharedStorage');
      this.cellId = sharedNewWithId(normalizedId, encodedWriters, frozen);
    }
  }

  /**
   * Rehydrate an already-opened cell from its id (no host call). Used by the
   * snapshot loader; operations error if the cell was never opened.
   */
  static fromId<V>(id: Uint8Array | string): SharedStorage<V> {
    return new SharedStorage<V>({ id });
  }

  /**
   * Returns the underlying cell identifier as a hex string.
   */
  id(): string {
    return bytesToHex(this.cellId);
  }

  /**
   * Returns a copy of the cell identifier bytes.
   */
  idBytes(): Uint8Array {
    return new Uint8Array(this.cellId);
  }

  /**
   * Overwrites the stored value. **Writer-gated**: throws when the current
   * executor is not a member of the writer set.
   */
  set(value: V): void {
    sharedSet(this.cellId, serialize(value));
  }

  /**
   * Returns the stored value, or `null` when the cell has never been written.
   */
  get(): V | null {
    const raw = sharedGet(this.cellId);
    return raw ? deserialize<V>(raw) : null;
  }

  /**
   * Returns the current writer set as raw 32-byte public keys.
   */
  writers(): Uint8Array[] {
    return sharedWriters(this.cellId);
  }

  /**
   * Reports whether the current executor may write to this cell.
   */
  writableByMe(): boolean {
    return sharedWritableByMe(this.cellId);
  }

  /**
   * Reports whether the cell was created frozen.
   */
  isFrozen(): boolean {
    return sharedIsFrozen(this.cellId);
  }

  /**
   * Replaces the writer set. **Writer-gated**: throws when the current executor
   * is not a member of the *current* writer set.
   */
  rotateWriters(writers: WriterKey[]): void {
    sharedRotateWriters(this.cellId, encodeWriters(writers));
  }

  toJSON(): Record<string, unknown> {
    return {
      [SENTINEL_KEY]: 'SharedStorage',
      id: this.id(),
    };
  }
}

registerCollectionType('SharedStorage', (snapshot: CollectionSnapshot) =>
  SharedStorage.fromId(snapshot.id)
);
