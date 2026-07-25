/**
 * Deterministic collection ID derivation.
 *
 * Concurrent-writer convergence requires that two nodes address the *same*
 * CRDT entity for the same logical state field. Because a JS app root is
 * opaque to core, the guest is responsible for choosing collection ids. As
 * long as every node runs the same guest code, deriving an id purely from the
 * field path yields the same 32-byte id everywhere, so `*_new_with_id` creates
 * (or re-opens) the same entity on each node and core's CRDT merge unifies
 * their contents on sync.
 *
 * NOTE: these ids only need to be *identical across nodes* for the same field;
 * the guest supplies the id to the host `*_new_with_id` functions, so the
 * derivation does not have to match core's internal id scheme byte-for-byte.
 * The domain separators mirror `core/crates/storage` so the two schemes stay
 * compatible if core ever needs to reproduce a guest-chosen id.
 */

import { sha256 } from './sha256';

const encoder = new TextEncoder();

const DOMAIN_SEPARATOR_COLLECTION = encoder.encode('__calimero_collection__');
const DOMAIN_SEPARATOR_ENTRY = encoder.encode('__calimero_entry__');

/**
 * The root parent id (all-zero 32 bytes). Top-level `@State` collection fields
 * are derived as children of the root.
 */
export const ROOT_ID: Uint8Array = new Uint8Array(32);

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

/**
 * Compute the deterministic id for a collection field.
 *
 * Formula: SHA256(parentId? + "__calimero_collection__" + fieldName)
 *
 * @param parentId - Parent entity id (use {@link ROOT_ID} for top-level fields), or null
 * @param fieldName - The logical field name
 * @returns 32-byte deterministic id
 */
export function computeCollectionId(parentId: Uint8Array | null, fieldName: string): Uint8Array {
  const fieldNameBytes = encoder.encode(fieldName);
  const data = parentId
    ? concat(parentId, DOMAIN_SEPARATOR_COLLECTION, fieldNameBytes)
    : concat(DOMAIN_SEPARATOR_COLLECTION, fieldNameBytes);
  return sha256(data);
}

/**
 * Compute the deterministic id for a map/set entry.
 *
 * Formula: SHA256(parentId + "__calimero_entry__" + key)
 *
 * @param parentId - Parent collection id
 * @param key - Serialized entry key bytes
 * @returns 32-byte deterministic id
 */
export function computeEntryId(parentId: Uint8Array, key: Uint8Array): Uint8Array {
  return sha256(concat(parentId, DOMAIN_SEPARATOR_ENTRY, key));
}
