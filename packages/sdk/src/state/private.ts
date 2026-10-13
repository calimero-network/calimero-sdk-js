import { privateStorageRead, privateStorageWrite, privateStorageRemove } from '../env/api';
import { serialize, deserialize } from '../utils/serialize';
import { sha256 } from '../utils/sha256';

const textEncoder = new TextEncoder();
const PRIVATE_KEY_TAG = 0xff; // core's private-state key tag, as the Rust SDK's `#[app::private]`

type KeyInput = string | Uint8Array;

// Core stores only fixed-length keys, so any key becomes the tag plus SHA-256 of its bytes.
function storageKey(key: KeyInput): Uint8Array {
  let material: Uint8Array;
  if (typeof key === 'string') {
    material = textEncoder.encode(key);
  } else if (key instanceof Uint8Array) {
    material = key;
  } else {
    throw new TypeError('private storage key must be a string or Uint8Array');
  }
  return new Uint8Array([PRIVATE_KEY_TAG, ...sha256(material)]);
}

/**
 * Handle for reading/writing node-local private storage entries.
 *
 * Mirrors the Rust `private_storage::EntryHandle`.
 */
export class PrivateEntryHandle<T> {
  private readonly key: Uint8Array;

  constructor(key: KeyInput) {
    this.key = storageKey(key);
  }

  /**
   * Reads the stored value, returning `null` when no entry exists.
   */
  get(): T | null {
    const raw = privateStorageRead(this.key);
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
    privateStorageWrite(this.key, bytes);
  }

  /**
   * Removes the value from storage.
   *
   * @returns `true` if the key existed.
   */
  remove(): boolean {
    return privateStorageRemove(this.key);
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
