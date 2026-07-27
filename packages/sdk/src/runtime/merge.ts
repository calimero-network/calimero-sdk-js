/**
 * Field-aware root-state merge (concurrent-writer convergence).
 *
 * A JS app root is opaque to core, so two concurrent writers would otherwise
 * diverge (last-writer-wins collapse). When the guest opts in via
 * `register_js_sdk_root_merge()` (see dispatcher), core routes the root to the
 * `__calimero_merge_root_state` export defined here on every sync.
 *
 * Calling convention (must match core exactly):
 *   Input  (register 0): borsh `MergeRootStateRequest`
 *     { existing: Vec<u8>, incoming: Vec<u8>,
 *       existing_created_at: u64, existing_ts: u64, incoming_ts: u64 }
 *   Output (valueReturn): borsh `MergeRootStateResponse` enum
 *     variant 0 = Ok(Vec<u8>)  -> merged root-doc bytes
 *     variant 1 = Err(String)
 *
 * Bootstrap fast-path: if `existing_created_at == existing_ts` the existing
 * side was created but never written, so the incoming doc is returned verbatim.
 */

import * as env from '../env/api';
import { BorshWriter } from '../borsh/encoder';
import { BorshReader } from '../borsh/decoder';
import { serialize } from '../utils/serialize';
import { parseRootDocument, serializeRootDocument, type RootDocument } from './root';
import type { CollectionSnapshot } from './collections';
import { mergeMergeableValues } from './mergeable';
import { getMergeableType, mergeableTypeCount } from './mergeable-registry';

const REGISTER_ID = 0n;

export interface MergeRootStateRequest {
  existing: Uint8Array;
  incoming: Uint8Array;
  existingCreatedAt: bigint;
  existingTs: bigint;
  incomingTs: bigint;
}

// --- Request / response codec (borsh) ------------------------------------

export function decodeMergeRootStateRequest(bytes: Uint8Array): MergeRootStateRequest {
  const reader = new BorshReader(bytes);
  const existing = reader.readBytes();
  const incoming = reader.readBytes();
  const existingCreatedAt = reader.readU64();
  const existingTs = reader.readU64();
  const incomingTs = reader.readU64();
  return { existing, incoming, existingCreatedAt, existingTs, incomingTs };
}

export function encodeMergeRootStateResponseOk(bytes: Uint8Array): Uint8Array {
  const writer = new BorshWriter();
  writer.writeU8(0); // Ok
  writer.writeBytes(bytes);
  return writer.toBytes();
}

export function encodeMergeRootStateResponseErr(message: string): Uint8Array {
  const writer = new BorshWriter();
  writer.writeU8(1); // Err
  writer.writeString(message);
  return writer.toBytes();
}

// --- Field-aware merge ----------------------------------------------------

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const min = Math.min(a.length, b.length);
  for (let i = 0; i < min; i += 1) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return a.length - b.length;
}

function isDefaultValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (value === 0 || value === 0n || value === '' || value === false) {
    return true;
  }
  if (value instanceof Map) {
    return value.size === 0;
  }
  if (value instanceof Set) {
    return value.size === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

/**
 * Merge a single plain (non-collection) state field.
 *
 * Mergeable values fold via their descriptor; everything else is scalar LWW:
 * equal -> keep; one side default -> take the non-default; otherwise a
 * deterministic byte-order tiebreak so both nodes converge on the same result.
 */
export function mergeField(local: unknown, remote: unknown): unknown {
  const mergeableType = getMergeableType(remote) ?? getMergeableType(local);
  if (mergeableType) {
    return mergeMergeableValues(local, remote);
  }

  const localBytes = serialize(local);
  const remoteBytes = serialize(remote);
  if (bytesEqual(localBytes, remoteBytes)) {
    return local;
  }

  const localDefault = isDefaultValue(local);
  const remoteDefault = isDefaultValue(remote);
  if (localDefault && !remoteDefault) {
    return remote;
  }
  if (remoteDefault && !localDefault) {
    return local;
  }

  return compareBytes(localBytes, remoteBytes) >= 0 ? local : remote;
}

export function mergeRootValues(
  local: Record<string, unknown> | undefined,
  remote: Record<string, unknown> | undefined
): Record<string, unknown> {
  const keys = Array.from(new Set([...Object.keys(local ?? {}), ...Object.keys(remote ?? {})]));
  keys.sort();
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    result[key] = mergeField(local?.[key], remote?.[key]);
  }
  return result;
}

/**
 * Pick a single collection reference. Equal ids (the deterministic-id case)
 * unify to the same entity; unequal ids fall back to the lexicographically
 * smaller id so both nodes agree.
 */
function pickCollection(
  local: CollectionSnapshot | undefined,
  remote: CollectionSnapshot | undefined
): CollectionSnapshot | null {
  if (local && remote) {
    if (local.id === remote.id) {
      return local;
    }
    return local.id < remote.id ? local : remote;
  }
  return local ?? remote ?? null;
}

export function mergeRootCollections(
  local: Record<string, CollectionSnapshot> | undefined,
  remote: Record<string, CollectionSnapshot> | undefined
): Record<string, CollectionSnapshot> {
  const keys = Array.from(new Set([...Object.keys(local ?? {}), ...Object.keys(remote ?? {})]));
  keys.sort();
  const result: Record<string, CollectionSnapshot> = {};
  for (const key of keys) {
    const chosen = pickCollection(local?.[key], remote?.[key]);
    if (chosen) {
      result[key] = { type: chosen.type, id: chosen.id };
    }
  }
  return result;
}

export function mergeRootMetadata(
  local: { createdAt: number; updatedAt: number },
  remote: { createdAt: number; updatedAt: number }
): { createdAt: number; updatedAt: number } {
  return {
    createdAt: Math.min(local.createdAt, remote.createdAt),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  };
}

export function mergeRootDocuments(existing: RootDocument, incoming: RootDocument): RootDocument {
  return {
    values: mergeRootValues(existing.values, incoming.values),
    collections: mergeRootCollections(existing.collections, incoming.collections),
    metadata: mergeRootMetadata(existing.metadata, incoming.metadata),
  };
}

/**
 * Full request -> response computation. Exposed for unit testing.
 */
export function computeMergeResponse(requestBytes: Uint8Array): Uint8Array {
  try {
    const request = decodeMergeRootStateRequest(requestBytes);

    // Bootstrap fast-path: existing side never written -> take incoming.
    if (request.existingCreatedAt === request.existingTs) {
      return encodeMergeRootStateResponseOk(request.incoming);
    }

    const existing = parseRootDocument(request.existing);
    const incoming = parseRootDocument(request.incoming);
    const merged = mergeRootDocuments(existing, incoming);
    return encodeMergeRootStateResponseOk(serializeRootDocument(merged));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return encodeMergeRootStateResponseErr(message);
  }
}

// --- Host export ----------------------------------------------------------

function readInput(): Uint8Array {
  env.input(REGISTER_ID);
  const len = Number(env.registerLen(REGISTER_ID));
  if (!Number.isFinite(len) || len <= 0) {
    return new Uint8Array(0);
  }
  const buffer = new Uint8Array(len);
  env.readRegister(REGISTER_ID, buffer);
  return buffer;
}

export function handleMergeRootState(): void {
  try {
    const requestBytes = readInput();
    const response = computeMergeResponse(requestBytes);
    env.valueReturnRaw(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    env.log(`[merge] __calimero_merge_root_state error=${message}`);
    try {
      env.valueReturnRaw(encodeMergeRootStateResponseErr(message));
    } catch {
      // Nothing more we can do if even the error response fails.
    }
  }
}

/**
 * Invoked from the `__calimero_register_merge` hook. `@Mergeable` descriptors
 * self-register at import time; this just reports how many are known.
 */
export function registerMergeTypes(): void {
  env.log(`[merge] register_merge: ${mergeableTypeCount()} mergeable type(s) registered`);
}

(globalThis as any).__calimero_merge_root_state = handleMergeRootState;
