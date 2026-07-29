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
import { bytesToHex } from '../utils/hex';
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
} from './storage-wasm';

type WithIdFn = (id: Uint8Array) => Uint8Array;

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

    const withId = WITH_ID[snapshot.type];
    if (!withId) {
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
    // the field to a collection wrapping that id. The previous random-id entity
    // is orphaned (safe: fresh collections are empty).
    withId(expectedId);
    target[key] = instantiateCollection({ type: snapshot.type, id: expectedHex });
    env.log(
      `[deterministic-ids] field '${key}' (${snapshot.type}) -> ${expectedHex.slice(0, 16)}…`
    );
  }
}
