/**
 * DeltaContext - Tracks CRDT operations for delta synchronization
 */

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
    // TODO: Implement proper Merkle tree hashing
    // For now, simple hash
    const data = JSON.stringify(
      this.actions.map(a => ({
        type: a.type,
        key: Array.from(a.key),
        value: a.value ? Array.from(a.value) : null,
        timestamp: a.timestamp
      }))
    );

    const encoder = new TextEncoder();
    return this._simpleHash(encoder.encode(data));
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

  private _simpleHash(data: Uint8Array): Uint8Array {
    // Simple hash for placeholder
    // TODO: Use proper cryptographic hash
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

