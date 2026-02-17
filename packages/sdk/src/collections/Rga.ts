/**
 * Rga - Replicated Growable Array CRDT for collaborative text editing.
 *
 * RGA provides conflict-free collaborative editing by tracking character positions
 * with unique identifiers. Multiple users can concurrently edit text with automatic
 * conflict resolution.
 *
 * The CrdtType for this is `CrdtType::Rga`.
 */

import { bytesToHex, normalizeCollectionId } from '../utils/hex';
import {
  rgaNew,
  rgaInsert,
  rgaDelete,
  rgaGetText,
  rgaLen,
} from '../runtime/storage-wasm';
import { registerCollectionType, CollectionSnapshot } from '../runtime/collections';

export interface RgaOptions {
  id?: Uint8Array | string;
}

/**
 * Rga - Replicated Growable Array for collaborative text editing.
 *
 * Supports concurrent editing with automatic conflict resolution.
 * Each character is uniquely identified, allowing proper merge semantics.
 *
 * @example
 * ```typescript
 * const doc = new Rga();
 * doc.insert(0, 'Hello');
 * doc.insert(5, ' World');
 * console.log(doc.getText()); // "Hello World"
 * doc.delete(5); // Delete space
 * console.log(doc.getText()); // "HelloWorld"
 * ```
 */
export class Rga {
  private readonly rgaId: Uint8Array;

  constructor(options: RgaOptions = {}) {
    if (options.id) {
      this.rgaId = normalizeCollectionId(options.id, 'Rga');
    } else {
      this.rgaId = rgaNew();
    }
  }

  id(): string {
    return bytesToHex(this.rgaId);
  }

  idBytes(): Uint8Array {
    return new Uint8Array(this.rgaId);
  }

  /**
   * Insert text at the specified position.
   *
   * @param pos - Position to insert at (0-indexed)
   * @param text - Text to insert
   */
  insert(pos: number, text: string): void {
    validatePosition(pos);
    rgaInsert(this.rgaId, pos, text);
  }

  /**
   * Insert a single character at the specified position.
   *
   * @param pos - Position to insert at (0-indexed)
   * @param char - Character to insert
   */
  insertChar(pos: number, char: string): void {
    if (char.length !== 1) {
      throw new Error('insertChar expects a single character');
    }
    this.insert(pos, char);
  }

  /**
   * Delete a character at the specified position.
   *
   * @param pos - Position of character to delete (0-indexed)
   */
  delete(pos: number): void {
    validatePosition(pos);
    rgaDelete(this.rgaId, pos);
  }

  /**
   * Delete a range of characters starting at the specified position.
   *
   * @param pos - Starting position (0-indexed)
   * @param len - Number of characters to delete
   */
  deleteRange(pos: number, len: number): void {
    validatePosition(pos);
    if (!Number.isInteger(len) || len < 0) {
      throw new Error('Length must be a non-negative integer');
    }
    // Delete from end to start to avoid index shifting
    for (let i = len - 1; i >= 0; i--) {
      rgaDelete(this.rgaId, pos + i);
    }
  }

  /**
   * Get the current text content.
   */
  getText(): string {
    return rgaGetText(this.rgaId);
  }

  /**
   * Get the length of the text (number of characters).
   */
  length(): number {
    return rgaLen(this.rgaId);
  }

  /**
   * Check if the RGA is empty.
   */
  isEmpty(): boolean {
    return this.length() === 0;
  }

  /**
   * Clear all text content.
   */
  clear(): void {
    const len = this.length();
    for (let i = len - 1; i >= 0; i--) {
      rgaDelete(this.rgaId, i);
    }
  }

  /**
   * Replace all text content with new text.
   *
   * @param text - New text content
   */
  setText(text: string): void {
    this.clear();
    if (text.length > 0) {
      this.insert(0, text);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      __calimeroCollection: 'Rga',
      id: this.id(),
    };
  }
}

registerCollectionType(
  'Rga',
  (snapshot: CollectionSnapshot) => new Rga({ id: snapshot.id })
);

function validatePosition(pos: number): void {
  if (!Number.isInteger(pos) || pos < 0) {
    throw new Error('Position must be a non-negative integer');
  }
}
