/**
 * Deterministic ID assignment for collections.
 *
 * This module ensures that collections created during state initialization
 * get deterministic IDs based on their field names. This is critical for
 * multi-node sync - all nodes must use the same IDs for the same fields.
 *
 * @see core/crates/storage/src/collections.rs for Rust implementation
 */

import { computeCollectionId, ROOT_ID } from '../utils/deterministic-id';
import {
  mapNewWithId,
  vectorNewWithId,
  setNewWithId,
  lwwNewWithId,
  gCounterNewWithId,
  pnCounterNewWithId,
  rgaNewWithId,
} from './storage-wasm';
import { bytesToHex } from '../utils/hex';
import * as env from '../env/api';
// Static imports for collection classes - no require() in QuickJS
import { UnorderedMap } from '../collections/UnorderedMap';
import { Vector } from '../collections/Vector';
import { UnorderedSet } from '../collections/UnorderedSet';
import { LwwRegister } from '../collections/LwwRegister';
import { GCounter } from '../collections/GCounter';
import { PNCounter } from '../collections/PNCounter';
import { Rga } from '../collections/Rga';

/**
 * Known collection types that need deterministic IDs.
 */
const COLLECTION_SENTINELS = [
  'UnorderedMap',
  'Vector',
  'UnorderedSet',
  'LwwRegister',
  'GCounter',
  'PNCounter',
  'Rga',
] as const;

type CollectionType = (typeof COLLECTION_SENTINELS)[number];

interface CollectionLike {
  toJSON(): { __calimeroCollection: string; id: string };
  idBytes(): Uint8Array;
}

function isCollection(value: unknown): value is CollectionLike {
  if (!value || typeof value !== 'object') return false;
  if (typeof (value as any).toJSON !== 'function') return false;
  if (typeof (value as any).idBytes !== 'function') return false;

  try {
    const json = (value as any).toJSON();
    return (
      json &&
      typeof json === 'object' &&
      '__calimeroCollection' in json &&
      COLLECTION_SENTINELS.includes(json.__calimeroCollection)
    );
  } catch {
    return false;
  }
}

function getCollectionType(value: CollectionLike): CollectionType {
  const json = value.toJSON();
  return json.__calimeroCollection as CollectionType;
}

/**
 * Creates a collection with a deterministic ID.
 * This is called internally - the collection class constructors don't need modification.
 */
function createCollectionWithDeterministicId(
  type: CollectionType,
  fieldName: string
): Uint8Array {
  const deterministicId = computeCollectionId(ROOT_ID, fieldName);

  switch (type) {
    case 'UnorderedMap':
      return mapNewWithId(deterministicId);
    case 'Vector':
      return vectorNewWithId(deterministicId);
    case 'UnorderedSet':
      return setNewWithId(deterministicId);
    case 'LwwRegister':
      return lwwNewWithId(deterministicId);
    case 'GCounter':
      return gCounterNewWithId(deterministicId);
    case 'PNCounter':
      return pnCounterNewWithId(deterministicId);
    case 'Rga':
      return rgaNewWithId(deterministicId);
    default:
      throw new Error(`Unknown collection type: ${type}`);
  }
}

/**
 * Assigns deterministic IDs to all collection fields in a state object.
 *
 * This function is called after state initialization to ensure all collections
 * have IDs that are deterministic based on their field names.
 *
 * The approach is:
 * 1. Walk through all properties of the state object
 * 2. For each collection field, compute what its deterministic ID should be
 * 3. If the current ID doesn't match, create a new collection with the deterministic ID
 *    and copy the data
 *
 * Note: For fresh state (first init), we expect the collections to be empty,
 * so we can just create new ones with deterministic IDs.
 *
 * @param state - The state object to process
 */
export function assignDeterministicIds(state: any): void {
  if (!state || typeof state !== 'object') {
    return;
  }

  for (const key of Object.keys(state)) {
    const value = state[key];

    if (isCollection(value)) {
      const currentId = value.idBytes();
      const expectedId = computeCollectionId(ROOT_ID, key);

      // Check if IDs match
      if (currentId.length === expectedId.length) {
        let match = true;
        for (let i = 0; i < currentId.length; i++) {
          if (currentId[i] !== expectedId[i]) {
            match = false;
            break;
          }
        }
        if (match) {
          // Already has the correct deterministic ID
          continue;
        }
      }

      // ID doesn't match - this collection was created with a random ID
      // We need to create a new collection with the deterministic ID
      const type = getCollectionType(value);
      env.log(
        `[deterministic-ids] Reassigning ${type} field '${key}' from ${bytesToHex(currentId)} to ${bytesToHex(expectedId)}`
      );

      // Create new collection with deterministic ID
      // The old collection with random ID will be orphaned (no references)
      // Note: This works because fresh collections should be empty
      const newId = createCollectionWithDeterministicId(type, key);

      // Update the state object to point to the new collection
      // We create a new instance using fromId pattern
      const collectionModule = getCollectionModule(type);
      if (collectionModule) {
        state[key] = collectionModule.fromId(newId);
      }
    }
  }
}

/**
 * Gets the collection class for creating instances with fromId.
 * Uses static imports to work in QuickJS environment (no require()).
 */
function getCollectionModule(
  type: CollectionType
): { fromId: (id: Uint8Array) => any } | null {
  switch (type) {
    case 'UnorderedMap':
      return UnorderedMap;
    case 'Vector':
      return Vector;
    case 'UnorderedSet':
      return UnorderedSet;
    case 'LwwRegister':
      return LwwRegister;
    case 'GCounter':
      return GCounter;
    case 'PNCounter':
      return PNCounter;
    case 'Rga':
      return Rga;
    default:
      return null;
  }
}

/**
 * Checks if all collections in a state object have deterministic IDs.
 */
export function verifyDeterministicIds(state: any): boolean {
  if (!state || typeof state !== 'object') {
    return true;
  }

  for (const key of Object.keys(state)) {
    const value = state[key];

    if (isCollection(value)) {
      const currentId = value.idBytes();
      const expectedId = computeCollectionId(ROOT_ID, key);

      if (currentId.length !== expectedId.length) {
        return false;
      }

      for (let i = 0; i < currentId.length; i++) {
        if (currentId[i] !== expectedId[i]) {
          return false;
        }
      }
    }
  }

  return true;
}
