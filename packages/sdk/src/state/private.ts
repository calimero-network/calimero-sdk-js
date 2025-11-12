import { storageRead, storageWrite, storageRemove } from '../env/api';
import { serialize, deserialize } from '../utils/serialize';

const textEncoder = new TextEncoder();

type KeyInput = string | Uint8Array;

function normalizeKey(key: KeyInput): Uint8Array {
  if (typeof key === 'string') {
    return textEncoder.encode(key);
  }
  if (key instanceof Uint8Array) {
    return new Uint8Array(key);
  }
  throw new TypeError('private storage key must be a string or Uint8Array');
}

/**
 * Handle for reading/writing node-local private storage entries.
 *
 * Mirrors the Rust `private_storage::EntryHandle`.
 */
export class PrivateEntryHandle<T> {
  private readonly key: Uint8Array;

  constructor(key: KeyInput) {
    this.key = normalizeKey(key);
  }

  /**
   * Reads the stored value, returning `null` when no entry exists.
   */
  get(): T | null {
    const raw = storageRead(this.key);
    if (!raw) {
      return null;
    }
    return deserialize<T>(raw);
  }

  /**
   * Writes a value to private storage.
   */
  set(value: T): void {
    const bytes = serialize(value);
    storageWrite(this.key, bytes);
  }

  /**
   * Removes the value from storage.
   *
  * @returns `true` if the key existed.
   */
  remove(): boolean {
    return storageRemove(this.key);
  }

  /**
   * Loads an existing value or initializes it via `initialiser`.
   */
  getOrInit(initialiser: () => T): T {
    const existing = this.get();
    if (existing !== null) {
      return existing;
    }
    const value = initialiser();
    this.set(value);
    return value;
  }

  /**
   * Loads an existing value or returns the provided default.
   */
  getOrDefault(defaultValue: T): T {
    const existing = this.get();
    if (existing !== null) {
      return existing;
    }
    this.set(defaultValue);
    return defaultValue;
  }

  /**
   * Mutates the stored value. If no value exists, `initialiser` is used.
   *
   * Returns the updated value.
   */
  modify(mutator: (value: T) => void, initialiser: () => T): T {
    const value = this.getOrInit(initialiser);
    mutator(value);
    this.set(value);
    return value;
  }
}

/**
 * Convenience helper to create a {@link PrivateEntryHandle}.
 */
export function createPrivateEntry<T>(key: KeyInput): PrivateEntryHandle<T> {
  return new PrivateEntryHandle<T>(key);
}

