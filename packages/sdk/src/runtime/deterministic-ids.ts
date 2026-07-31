/**
 * Deterministic id assignment for top-level `@State` collection fields.
 *
 * Collections instantiated in a state-class constructor get a *random* id from
 * the host `*_new` functions. For concurrent-writer convergence, two nodes must
 * address the same CRDT entity for the same logical field, so after fresh state
 * construction we re-open each top-level collection field at a deterministic id
 * derived from its field name (via the host `*_new_with_id` functions).
 *
 * This runs only on fresh state (init / first-use), where collections are still
 * empty, so re-opening at a new id cannot lose data. On subsequent loads the id
 * is restored from the persisted snapshot, and re-running is a cheap no-op
 * because the id already matches.
 */

import * as env from '../env/api';
import { bytesToHex, hexToBytes } from '../utils/hex';
import { computeCollectionId, ROOT_ID } from '../utils/deterministic-id';
import { snapshotCollection, instantiateCollection } from './collections';
import {
  mapNewWithId,
  vectorNewWithId,
  setNewWithId,
  lwwNewWithId,
  counterNewWithId,
  pncounterNewWithId,
  rgaNewWithId,
  sortedMapNewWithId,
  sortedSetNewWithId,
  authoredMapNewWithId,
  authoredVectorNewWithId,
  userStorageNewWithId,
  frozenStorageNewWithId,
  sharedNewWithId,
  sharedWriters,
  sharedIsFrozen,
  deleteCollection,
} from './storage-wasm';

type WithIdFn = (id: Uint8Array) => Uint8Array;

const SHARED_WRITER_KEY_LENGTH = 32;

/**
 * Re-open a SharedStorage cell at a deterministic id. Unlike the other
 * collections, SharedStorage carries construction state (its writer set and the
 * frozen flag), so it cannot be created from an id alone — we read that state
 * off the freshly-constructed (random-id) cell and recreate it at the
 * deterministic id.
 *
 * Safety rests on the same contract {@link assignDeterministicIds} relies on for
 * every collection: reassignment runs *only* on fresh state (genesis / first
 * init), which in practice is the context creator. Joining nodes do not
 * reconstruct the field — they hydrate it from the synced snapshot — so the
 * creator's writer set is the single authoritative one and does not diverge
 * across nodes (even though a per-node `executorId()` writer would differ if two
 * nodes each ran init). And because the source cell is empty at this point (the
 * fresh-state contract), carrying only the writer set / frozen flag — not a
 * value — loses nothing.
 */
function reopenSharedAt(currentHex: string, expectedId: Uint8Array): void {
  const currentId = hexToBytes(currentHex);
  const keys = sharedWriters(currentId);
  const frozen = sharedIsFrozen(currentId);
  const encoded = new Uint8Array(keys.length * SHARED_WRITER_KEY_LENGTH);
  keys.forEach((key, index) => {
    encoded.set(key, index * SHARED_WRITER_KEY_LENGTH);
  });
  sharedNewWithId(expectedId, encoded, frozen);
}

const WITH_ID: Record<string, WithIdFn> = {
  UnorderedMap: mapNewWithId,
  Vector: vectorNewWithId,
  UnorderedSet: setNewWithId,
  LwwRegister: lwwNewWithId,
  Counter: counterNewWithId,
  PNCounter: pncounterNewWithId,
  Rga: rgaNewWithId,
  SortedMap: sortedMapNewWithId,
  SortedSet: sortedSetNewWithId,
  AuthoredMap: authoredMapNewWithId,
  AuthoredVector: authoredVectorNewWithId,
  UserStorage: userStorageNewWithId,
  FrozenStorage: frozenStorageNewWithId,
};

/**
 * Re-open every top-level collection field of {@link state} at a deterministic
 * id derived from its field name. Idempotent: fields already at the expected id
 * are skipped.
 */
export function assignDeterministicIds(state: unknown): void {
  if (!state || typeof state !== 'object') {
    return;
  }

  const target = state as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    const value = target[key];

    const snapshot = snapshotCollection(value);
    if (!snapshot) {
      continue;
    }

    const isShared = snapshot.type === 'SharedStorage';
    const withId = WITH_ID[snapshot.type];
    if (!withId && !isShared) {
      // Unknown/unsupported collection type — leave it untouched.
      continue;
    }

    const expectedId = computeCollectionId(ROOT_ID, key);
    const expectedHex = bytesToHex(expectedId);
    if (snapshot.id === expectedHex) {
      // Already at the deterministic id (e.g. hydrated from a prior snapshot).
      continue;
    }

    // Create/re-open the entity at the deterministic id in the host, then swap
    // the field to a collection wrapping that id. SharedStorage needs its writer
    // set/frozen flag carried across; other collections re-open from id.
    if (isShared) {
      reopenSharedAt(snapshot.id, expectedId);
    } else {
      withId!(expectedId);
    }
    target[key] = instantiateCollection({ type: snapshot.type, id: expectedHex });

    // Reclaim the random-id entity the field used to point at. This runs on
    // fresh genesis state, so it is empty and the create+delete land in the same
    // delta (every replica converges with no orphan). Best-effort: a benign
    // leftover must never break init, so a cleanup failure is only logged.
    try {
      deleteCollection(hexToBytes(snapshot.id));
    } catch (err) {
      env.log(`[deterministic-ids] orphan cleanup skipped for '${key}': ${String(err)}`);
    }

    env.log(
      `[deterministic-ids] field '${key}' (${snapshot.type}) -> ${expectedHex.slice(0, 16)}…`
    );
  }
}
