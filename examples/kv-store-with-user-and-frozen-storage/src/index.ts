/**
 * KV Store with User and Frozen Storage Example
 *
 * Demonstrates the use of:
 * - Public storage (UnorderedMap)
 * - User-owned storage (UserStorage)
 * - Immutable content-addressable storage (FrozenStorage)
 */

import { State, Logic, Init, Event, View, emit } from '@calimero-network/calimero-sdk-js';
import {
  UnorderedMap,
  LwwRegister,
  FrozenStorage,
  UserStorage,
} from '@calimero-network/calimero-sdk-js/collections';
import * as env from '@calimero-network/calimero-sdk-js/env';

// Events

@Event
export class ItemInserted {
  constructor(
    public key: string,
    public value: string
  ) {}
}

@Event
export class ItemUpdated {
  constructor(
    public key: string,
    public value: string
  ) {}
}

@Event
export class ItemRemoved {
  constructor(public key: string) {}
}

@Event
export class StoreCleared {}

@Event
export class UserSimpleSet {
  constructor(
    public executorId: string,
    public value: string
  ) {}
}

@Event
export class UserNestedSet {
  constructor(
    public executorId: string,
    public key: string,
    public value: string
  ) {}
}

@Event
export class FrozenAdded {
  constructor(
    public hash: string,
    public value: string
  ) {}
}

// State

@State
export class KvStoreWithUserAndFrozen {
  // Public items, viewable by all
  items: UnorderedMap<string, LwwRegister<string>>;

  // Simple user-owned data (e.g., a user's profile name)
  // Uses UserStorage with LwwRegister value
  userItemsSimple: UserStorage<LwwRegister<string>>;

  // Nested user-owned data (e.g., a user's private key-value store)
  // Uses UserStorage with UnorderedMap directly (nested collections work automatically)
  userItemsNested: UserStorage<UnorderedMap<string, LwwRegister<string>>>;

  // Content-addressable, immutable data
  frozenItems: FrozenStorage<string>;

  constructor() {
    this.items = new UnorderedMap<string, LwwRegister<string>>();
    this.userItemsSimple = new UserStorage<LwwRegister<string>>();
    this.userItemsNested = new UserStorage<UnorderedMap<string, LwwRegister<string>>>();
    this.frozenItems = new FrozenStorage<string>();
  }
}

// Logic

@Logic(KvStoreWithUserAndFrozen)
export class KvStoreWithUserAndFrozenLogic extends KvStoreWithUserAndFrozen {
  @Init
  static init(): KvStoreWithUserAndFrozen {
    env.log('[kv-store] Initializing KvStoreWithUserAndFrozen');
    return new KvStoreWithUserAndFrozen();
  }

  // --- Public Storage Methods ---

  set(key: string, value: string): void {
    env.log(`[kv-store] Setting key: ${key} to value: ${value}`);

    let register = this.items.get(key);
    const isUpdate = register !== null;

    if (!register) {
      register = new LwwRegister<string>();
    }

    register.set(value);
    this.items.set(key, register);

    if (isUpdate) {
      emit(new ItemUpdated(key, value));
    } else {
      emit(new ItemInserted(key, value));
    }
  }

  get(key: string): string | null {
    env.log(`[kv-store] Getting key: ${key}`);
    const register = this.items.get(key);
    return register ? register.get() : null;
  }

  @View()
  entries(): Record<string, string> {
    env.log('[kv-store] Getting all entries');
    const result: Record<string, string> = {};
    for (const [key, register] of this.items.entries()) {
      const value = register.get();
      if (value !== null) {
        result[key] = value;
      }
    }
    return result;
  }

  @View()
  len(): number {
    env.log('[kv-store] Getting the number of entries');
    return this.items.entries().length;
  }

  remove(key: string): string | null {
    env.log(`[kv-store] Removing key: ${key}`);
    const register = this.items.get(key);
    const value = register ? register.get() : null;
    this.items.remove(key);
    emit(new ItemRemoved(key));
    return value;
  }

  clear(): void {
    env.log('[kv-store] Clearing all entries');
    for (const [key] of this.items.entries()) {
      this.items.remove(key);
    }
    emit(new StoreCleared());
  }

  // --- User Storage (Simple) Methods ---

  /**
   * Sets a simple string value for the *current* user.
   */
  set_user_simple(value: string): void {
    const executorId = env.executorIdHex();
    env.log(`[kv-store] Setting simple value for user ${executorId}: ${value}`);

    const register = new LwwRegister<string>();
    register.set(value);
    this.userItemsSimple.insert(register);

    emit(new UserSimpleSet(executorId, value));
  }

  /**
   * Gets the simple string value for the *current* user.
   */
  get_user_simple(): string | null {
    const executorId = env.executorIdHex();
    env.log(`[kv-store] Getting simple value for user ${executorId}`);

    const register = this.userItemsSimple.get();
    return register ? register.get() : null;
  }

  /**
   * Gets the simple string value for a *specific* user.
   * @param user_key - Hex-encoded 32-byte account id
   */
  get_user_simple_for(user_key: string): string | null {
    env.log(`[kv-store] Getting simple value for specific user ${user_key}`);
    const userKeyBytes = env.hexToBytes(user_key);
    const register = this.userItemsSimple.getForUser(userKeyBytes);
    return register ? register.get() : null;
  }

  // --- User Storage (Nested) Methods ---

  /**
   * Sets a key-value pair in the *current* user's nested map.
   * Get or create nested map, modify it, then re-insert.
   */
  set_user_nested(key: string, value: string): void {
    const executorId = env.executorIdHex();
    env.log(`[kv-store] Setting nested key ${key} for user ${executorId}: ${value}`);

    // Get or create the user's nested map
    let nestedMap = this.userItemsNested.get();
    if (!nestedMap) {
      nestedMap = new UnorderedMap<string, LwwRegister<string>>();
    }

    // Get or create the register for this key
    let register = nestedMap.get(key);
    if (!register) {
      register = new LwwRegister<string>();
    }

    // Set the value in the register
    register.set(value);

    // Set the register in the nested map
    nestedMap.set(key, register);

    // Re-insert the nested map into UserStorage
    this.userItemsNested.insert(nestedMap);

    emit(new UserNestedSet(executorId, key, value));
  }

  /**
   * Gets a value from the *current* user's nested map.
   * returns Option<String> (null if not found).
   */
  get_user_nested(key: string): string | null {
    const executorId = env.executorIdHex();
    env.log(`[kv-store] Getting nested key ${key} for user ${executorId}`);

    const nestedMap = this.userItemsNested.get();
    if (!nestedMap) {
      return null;
    }

    const register = nestedMap.get(key);
    if (!register) {
      return null;
    }

    return register.get();
  }

  // --- Frozen Storage Methods ---

  /**
   * Adds an immutable value to frozen storage.
   * Returns the hex-encoded SHA256 hash (key) of the value.
   */
  add_frozen(value: string): string {
    env.log(`[kv-store] Adding frozen value: ${value}`);

    const hashBytes = this.frozenItems.add(value);
    const hashHex = env.bytesToHex(hashBytes);

    emit(new FrozenAdded(hashHex, value));

    return hashHex;
  }

  /**
   * Gets an immutable value from frozen storage by its hash.
   * throws error if not found
   */
  get_frozen(hash_hex: string): string {
    env.log(`[kv-store] Getting frozen value for hash ${hash_hex}`);

    const hashBytes = env.hexToBytes(hash_hex);
    if (hashBytes.length !== 32) {
      throw new Error('dehex error');
    }

    const value = this.frozenItems.get(hashBytes);
    if (value === null) {
      throw new Error('Frozen value is not found');
    }

    return value;
  }
}
