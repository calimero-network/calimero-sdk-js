/**
 * Storage Delta Borsh Serialization
 *
 * Serializes CRDT actions to Borsh format matching calimero-storage
 */

import { BorshWriter } from './encoder';

export type BorshAction =
  | {
      kind: 'Update';
      id: Uint8Array; // [u8; 32]
      data: Uint8Array;
      timestamp: bigint; // Metadata timestamps
    }
  | {
      kind: 'DeleteRef';
      id: Uint8Array; // [u8; 32]
      deletedAt: bigint;
    };

function serializeUpdate(
  writer: BorshWriter,
  action: Extract<BorshAction, { kind: 'Update' }>
): void {
  // Action::Update variant = 3
  writer.writeU8(3);
  writer.writeFixedArray(action.id);
  writer.writeVec(Array.from(action.data), byte => writer.writeU8(byte));
  // ancestors: Vec<ChildInfo> (empty)
  writer.writeU32(0);
  // metadata::Metadata { created_at, updated_at }
  writer.writeU64(action.timestamp);
  writer.writeU64(action.timestamp);
}

function serializeDeleteRef(
  writer: BorshWriter,
  action: Extract<BorshAction, { kind: 'DeleteRef' }>
): void {
  // Action::DeleteRef variant = 2
  writer.writeU8(2);
  writer.writeFixedArray(action.id);
  writer.writeU64(action.deletedAt);
}

function serializeAction(writer: BorshWriter, action: BorshAction): void {
  switch (action.kind) {
    case 'Update':
      serializeUpdate(writer, action);
      break;
    case 'DeleteRef':
      serializeDeleteRef(writer, action);
      break;
    default:
      ((_: never) => {
        throw new Error('Unknown action kind');
      })(action);
  }
}

export function serializeStorageDelta(actions: BorshAction[]): Uint8Array {
  const writer = new BorshWriter();
  // StorageDelta::Actions = 0
  writer.writeU8(0);
  writer.writeVec(actions, action => serializeAction(writer, action));
  return writer.toBytes();
}

/**
 * Simple deterministic ID from string key (fits into [u8;32])
 */
export function idFromString(value: string): Uint8Array {
  const result = new Uint8Array(32);
  const limit = Math.min(value.length, 32);
  for (let i = 0; i < limit; i += 1) {
    result[i] = value.charCodeAt(i) & 0xff;
  }
  return result;
}

/**
 * Generate a random 32-byte identifier
 */
export function randomId(): Uint8Array {
  const result = new Uint8Array(32);
  for (let i = 0; i < result.length; i += 1) {
    result[i] = Math.floor(Math.random() * 256);
  }
  return result;
}
