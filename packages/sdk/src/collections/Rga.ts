/**
 * Rga - RGA (Replicated Growable Array) sequence CRDT backed by the Rust host
 * implementation.
 *
 * The RGA models collaboratively-edited UTF-8 text as a sequence of elements.
 * Inserts and deletes are addressed by index, and the full text can be read
 * back with {@link Rga.getText}. Concurrent inserts at the same position are
 * resolved deterministically by the host so every replica converges on the
 * same ordering.
 *
 * There is no separate serialize/deserialize host function — text round-trips
 * through {@link Rga.insert} / {@link Rga.getText}.
 */

import { bytesToHex, normalizeCollectionId } from '../utils/hex';
import { rgaNew, rgaInsert, rgaDelete, rgaGetText, rgaLen } from '../runtime/storage-wasm';
import { registerCollectionType, CollectionSnapshot } from '../runtime/collections';
import { nestedTracker } from '../runtime/nested-tracking';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface RgaOptions {
  id?: Uint8Array | string;
}

export class Rga {
  private readonly rgaId: Uint8Array;

  constructor(options: RgaOptions = {}) {
    if (options.id) {
      this.rgaId = normalizeCollectionId(options.id, 'Rga');
    } else {
      this.rgaId = rgaNew();
    }

    // Register with nested tracker for automatic change propagation
    nestedTracker.registerCollection(this);
  }

  /**
   * Create an RGA populated with the provided initial text (inserted at 0).
   */
  static fromText(text: string, options: RgaOptions = {}): Rga {
    const rga = new Rga(options);
    if (text.length > 0) {
      rga.insert(0, text);
    }
    return rga;
  }

  /**
   * Returns the identifier of this RGA as a hex string.
   */
  id(): string {
    return bytesToHex(this.rgaId);
  }

  /**
   * Returns a copy of the identifier bytes.
   */
  idBytes(): Uint8Array {
    return new Uint8Array(this.rgaId);
  }

  /**
   * Inserts `text` at the given index. The bytes are stored as UTF-8 and can be
   * read back verbatim via {@link Rga.getText}.
   *
   * `index` is a **Unicode codepoint offset** (0..={@link Rga.len}), NOT a
   * JS-string (UTF-16 code-unit) offset — the two differ for astral-plane
   * characters like emoji. Derive it from codepoints, e.g.
   * `[...text].length` / `Array.from(text)`, not `text.length` or
   * `text.indexOf(...)`.
   *
   * @param index - Zero-based codepoint position to insert at (0..=len)
   * @param text - Text to insert
   */
  insert(index: number, text: string): void {
    rgaInsert(this.rgaId, index, textEncoder.encode(text));

    // Notify tracker of modification
    nestedTracker.notifyCollectionModified(this);
  }

  /**
   * Deletes the codepoint at the given index.
   *
   * @param index - Zero-based codepoint position to delete (see {@link Rga.insert})
   */
  delete(index: number): void {
    rgaDelete(this.rgaId, index);

    // Notify tracker of modification
    nestedTracker.notifyCollectionModified(this);
  }

  /**
   * Reads the entire sequence back as a UTF-8 string.
   */
  getText(): string {
    return textDecoder.decode(rgaGetText(this.rgaId));
  }

  /**
   * Returns the number of visible codepoints in the sequence. This is the
   * upper bound for an {@link Rga.insert} index, and equals `[...getText()].length`.
   */
  len(): number {
    return rgaLen(this.rgaId);
  }

  toJSON(): Record<string, unknown> {
    return {
      __calimeroCollection: 'Rga',
      id: this.id(),
    };
  }
}

registerCollectionType('Rga', (snapshot: CollectionSnapshot) => new Rga({ id: snapshot.id }));
