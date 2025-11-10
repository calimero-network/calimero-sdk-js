/**
 * DeltaContext - Tracks CRDT operations for delta synchronization
 */

import '../../polyfills/text-encoding'; // Ensure TextEncoder is available
import { serializeStorageDelta, idFromString, type BorshAction } from '../../borsh';

export interface Action {
  type: 'Update' | 'Remove';
  key: Uint8Array;
  value?: Uint8Array;
  timestamp: bigint;
}

type CommitHandler = (rootHash: Uint8Array, artifact: Uint8Array) => void;

class DeltaContextManager {
  private actions: Action[] = [];
  private rootHash: Uint8Array | null = null;
  private commitHandler: CommitHandler | null = null;

  /**
   * Adds an action to the current delta
   */
  addAction(action: Action): void {
    this.actions.push(action);
    this.rootHash = null;
  }

  /**
   * Records an update action (storage write)
   */
  recordUpdate(key: Uint8Array, value: Uint8Array, timestamp: bigint): void {
    this.addAction({
      type: 'Update',
      key: key.slice(),
      value: value.slice(),
      timestamp,
    });
  }

  /**
   * Records a remove action (storage delete)
   */
  recordRemove(key: Uint8Array, timestamp: bigint): void {
    this.addAction({
      type: 'Remove',
      key: key.slice(),
      timestamp,
    });
  }

  /**
   * Gets all actions in the current delta
   */
  getActions(): Action[] {
    return this.actions;
  }

  /**
   * Checks if there are any pending actions
   */
  hasActions(): boolean {
    return this.actions.length > 0;
  }

  /**
   * Clears the current delta
   */
  clear(): void {
    this.actions = [];
    this.rootHash = null;
  }

  /**
   * Computes the root hash for the current delta
   *
   * @returns 32-byte root hash
   */
  computeRootHash(): Uint8Array {
    if (this.rootHash) {
      return this.rootHash;
    }

    // Serialize all actions
    const data = JSON.stringify(
      this.actions.map(a => ({
        type: a.type,
        key: Array.from(a.key),
        value: a.value ? Array.from(a.value) : null,
        timestamp: a.timestamp.toString(),
      }))
    );

    const encoder = new TextEncoder();
    this.rootHash = this._simpleHash(encoder.encode(data));
    return this.rootHash;
  }

  /**
   * Serializes the delta artifact to Borsh format
   *
   * @returns Borsh-serialized StorageDelta
   */
  serializeArtifact(): Uint8Array {
    const decoder = new TextDecoder();
    const borshActions: BorshAction[] = this.actions.map(action => {
      const id = idFromString(decoder.decode(action.key));

      if (action.type === 'Update' && action.value) {
        return {
          kind: 'Update',
          id,
          data: action.value,
          timestamp: action.timestamp,
        };
      }

      return {
        kind: 'DeleteRef',
        id,
        deletedAt: action.timestamp,
      };
    });

    return serializeStorageDelta(borshActions);
  }

  /**
   * Commits the current delta to storage
   */
  commit(handler?: CommitHandler): boolean {
    if (this.actions.length === 0) {
      return false; // Nothing to commit
    }

    const rootHash = this.computeRootHash();
    const artifact = this.serializeArtifact();

    if (artifact.length === 0) {
      // No actionable delta (e.g. unsupported action type)
      this.clear();
      return false;
    }

    const fn = handler ?? this.commitHandler;
    if (!fn) {
      throw new Error('DeltaContext commit handler is not configured');
    }

    fn(rootHash, artifact);

    // Clear after commit
    this.clear();
    return true;
  }

  /**
   * Registers a handler used when commit() is called without an explicit callback.
   */
  setCommitHandler(handler: CommitHandler | null): void {
    this.commitHandler = handler;
  }

  private _simpleHash(data: Uint8Array): Uint8Array {
    // Simple hash for MVP
    // TODO: Implement proper Merkle tree hashing
    let h = 0;
    for (let i = 0; i < data.length; i++) {
      h = ((h << 5) - h + data[i]) | 0;
    }
    const result = new Uint8Array(32);
    new DataView(result.buffer).setUint32(0, h, true);
    return result;
  }
}

export const DeltaContext = new DeltaContextManager();

