/**
 * DeltaContext - Tracks CRDT operations for delta synchronization
 */

import { commitDelta } from '../../env/api';

export interface Action {
  type: 'Update' | 'Remove';
  key: Uint8Array;
  value?: Uint8Array;
  timestamp: number;
}

class DeltaContextManager {
  private actions: Action[] = [];
  private rootHash: Uint8Array | null = null;

  /**
   * Adds an action to the current delta
   */
  addAction(action: Action): void {
    this.actions.push(action);
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
        timestamp: a.timestamp
      }))
    );

    const encoder = new TextEncoder();
    this.rootHash = this._simpleHash(encoder.encode(data));
    return this.rootHash;
  }

  /**
   * Serializes the delta artifact
   *
   * @returns Serialized artifact
   */
  serializeArtifact(): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(
      JSON.stringify(
        this.actions.map(a => ({
          type: a.type,
          key: Array.from(a.key),
          value: a.value ? Array.from(a.value) : null,
          timestamp: a.timestamp
        }))
      )
    );
  }

  /**
   * Commits the current delta to storage
   */
  commit(): void {
    if (this.actions.length === 0) {
      return; // Nothing to commit
    }

    const rootHash = this.computeRootHash();
    const artifact = this.serializeArtifact();

    commitDelta(rootHash, artifact);

    // Clear after commit
    this.clear();
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

