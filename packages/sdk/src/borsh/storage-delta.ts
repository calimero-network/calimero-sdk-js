/**
 * Storage Delta Borsh Serialization
 * 
 * Serializes CRDT actions to Borsh format matching calimero-storage
 */

import { BorshWriter } from './encoder';

/**
 * Simplified Action for init (Update variant only)
 */
export interface BorshAction {
  type: 'Update';
  id: Uint8Array;        // [u8; 32]
  data: Uint8Array;
  timestamp: bigint;     // For metadata.created_at and updated_at
}

/**
 * Serialize a storage action to Borsh format
 * 
 * Action::Update {
 *   id: Id,              // [u8; 32]
 *   data: Vec<u8>,
 *   ancestors: Vec<ChildInfo>,
 *   metadata: Metadata { created_at: u64, updated_at: u64 }
 * }
 */
function serializeAction(writer: BorshWriter, action: BorshAction): void {
  // Action enum variant - Update = 3
  writer.writeU8(3);
  
  // id: [u8; 32]
  writer.writeFixedArray(action.id);
  
  // data: Vec<u8>
  writer.writeVec(Array.from(action.data), (byte) => writer.writeU8(byte));
  
  // ancestors: Vec<ChildInfo> - empty for now
  writer.writeU32(0);
  
  // metadata: Metadata
  writer.writeU64(action.timestamp);      // created_at
  writer.writeU64(action.timestamp);      // updated_at
}

/**
 * Serialize StorageDelta::Actions
 * 
 * StorageDelta::Actions(Vec<Action>)
 */
export function serializeStorageDelta(actions: BorshAction[]): Uint8Array {
  const writer = new BorshWriter();
  
  // Enum variant: StorageDelta::Actions = 0
  writer.writeU8(0);
  
  // Vec<Action>
  writer.writeVec(actions, (action) => serializeAction(writer, action));
  
  return writer.toBytes();
}

/**
 * Helper to create a random 32-byte ID
 */
export function randomId(): Uint8Array {
  const id = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    id[i] = Math.floor(Math.random() * 256);
  }
  return id;
}

/**
 * Helper to create ID from string (deterministic)
 */
export function idFromString(str: string): Uint8Array {
  const id = new Uint8Array(32);
  for (let i = 0; i < Math.min(str.length, 32); i++) {
    id[i] = str.charCodeAt(i);
  }
  return id;
}

