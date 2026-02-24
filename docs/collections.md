# CRDT Collections Guide

Calimero provides conflict-free replicated data types (CRDTs) for automatic state synchronization. Values are serialized with Calimero's Borsh encoder, so data written from JavaScript matches the bytes produced by Rust services as long as both sides agree on the same Borsh schema.

Complex nested structures (maps of sets, vectors of maps, etc.) work automatically with **zero manual intervention**. The SDK automatically tracks changes in nested collections and propagates them across nodes.

## UnorderedMap<K, V>

Last-Write-Wins map for key-value storage. Keys and values are encoded via Borsh; make sure you share the same schema with any cross-language consumers.

```typescript
import { UnorderedMap } from '@calimero-network/calimero-sdk-js/collections';

const map = new UnorderedMap<string, string>();

map.set('key', 'value');
const value = map.get('key'); // 'value'
const exists = map.has('key'); // true
map.remove('key');

// Iterate over entries, keys, values
const entries = map.entries(); // [['key1', 'value1'], ['key2', 'value2']]
const keys = map.keys(); // ['key1', 'key2']
const values = map.values(); // ['value1', 'value2']

// Nested collections work automatically - no manual re-serialization needed!
const ownerTags = new UnorderedSet<string>();
ownerTags.add('urgent');
ownerTags.add('team-alpha');

const nested = new UnorderedMap<string, UnorderedSet<string>>();
nested.set('task:123', ownerTags);

// Changes to nested collections automatically propagate across nodes
const existingTags = nested.get('task:123');
existingTags?.add('high-priority'); // Change automatically propagates!

const tags = nested.get('task:123')?.toArray(); // ['urgent', 'team-alpha', 'high-priority']
```

When a map contains another collection (or any non-primitive value), the SDK captures the nested CRDT snapshot and rewinds it on load. Make sure custom objects embed only serializable fields or provide a `toJSON()` method.

## 🚀 Automatic Nested Collection Tracking

The SDK automatically tracks changes in nested collections and propagates them across nodes without any manual intervention.

### What Works Automatically

```typescript
// Complex nested structures work out of the box!
const messageReactions = new UnorderedMap<string, UnorderedMap<string, UnorderedSet<string>>>();

// Add a reaction - all changes propagate automatically
function addReaction(messageId: string, emoji: string, userId: string) {
  let reactionMap = messageReactions.get(messageId);
  if (!reactionMap) {
    reactionMap = new UnorderedMap<string, UnorderedSet<string>>();
    messageReactions.set(messageId, reactionMap);
  }

  let userSet = reactionMap.get(emoji);
  if (!userSet) {
    userSet = new UnorderedSet<string>();
    reactionMap.set(emoji, userSet);
  }

  userSet.add(userId); // This change automatically propagates to all nodes!
}
```

### Before vs After

**❌ Before (manual re-serialization required):**

```typescript
// You had to manually force updates
const reactionMap = messageReactions.get(messageId);
if (reactionMap) {
  const userSet = reactionMap.get(emoji) || new UnorderedSet<string>();
  userSet.add(userId);
  reactionMap.set(emoji, userSet); // Manual re-serialization
  messageReactions.set(messageId, reactionMap); // Manual re-serialization
}
```

**✅ With automatic propagation:**

```typescript
// Just write natural code - it works seamlessly!
const userSet = messageReactions.get(messageId)?.get(emoji);
userSet?.add(userId); // Automatically propagates across all nodes!

// Or create and modify in one flow:
let reactionMap = messageReactions.get(messageId);
if (!reactionMap) {
  reactionMap = new UnorderedMap<string, UnorderedSet<string>>();
  messageReactions.set(messageId, reactionMap);
}

let userSet = reactionMap.get(emoji);
if (!userSet) {
  userSet = new UnorderedSet<string>();
  reactionMap.set(emoji, userSet);
}

userSet.add(userId); // That's it! No manual re-serialization needed.
```

### How It Works

1. **Automatic Detection**: The SDK detects when you store collections inside other collections
2. **Relationship Tracking**: Parent-child relationships are tracked automatically
3. **Change Propagation**: When inner collections change, parent collections are notified
4. **Batched Updates**: Changes are batched for optimal performance

### Supported Patterns

All these patterns work automatically:

- `UnorderedMap<K, UnorderedSet<V>>`
- `UnorderedMap<K, UnorderedMap<K2, V2>>`
- `UnorderedMap<K, Vector<V>>`
- `Vector<UnorderedMap<K, V>>`
- `UnorderedSet<UnorderedMap<K, V>>`
- Any combination of nested collections!

### Conflict Resolution

When two nodes update the same key simultaneously, the value with the higher timestamp wins.

```
Node A: map.set('key', 'A') at t=1000
Node B: map.set('key', 'B') at t=1001

Result: key = 'B' (higher timestamp)
```

## Vector<T>

Ordered list that maintains insertion order.

```typescript
import { Vector } from '@calimero-network/calimero-sdk-js/collections';

const vec = new Vector<string>();

vec.push('first');
vec.push('second');
const item = vec.get(0); // 'first'
const len = vec.len(); // 2
const last = vec.pop(); // 'second'
```

## UnorderedSet<T>

Last-Write-Wins set for unique membership.

```typescript
import { UnorderedSet } from '@calimero-network/calimero-sdk-js/collections';

const set = new UnorderedSet<string>();

set.add('alice'); // true on first insert
set.add('alice'); // false when already present
const present = set.has('alice'); // true
set.delete('alice');
const count = set.size(); // 0
const allValues = set.toArray(); // []

// Nested inside another collection
const map = new UnorderedMap<string, UnorderedSet<string>>();
map.set('owners', set);
```

## Counter

Grow-only counter (G-Counter) for distributed counting.

```typescript
import { Counter } from '@calimero-network/calimero-sdk-js/collections';

const counter = new Counter();

counter.increment();
counter.increment();
const total = counter.value(); // 2n
```

### How It Works

Each node tracks its own count. The total is the sum across all nodes.

```
Node A increments: local_count_A = 1
Node B increments: local_count_B = 1
Total = local_count_A + local_count_B = 2
```

## LwwRegister<T>

Last-Write-Wins register for single values.

```typescript
import { LwwRegister } from '@calimero-network/calimero-sdk-js/collections';

const register = new LwwRegister<string>();

register.set('hello');
const value = register.get(); // 'hello'
const timestamp = register.timestamp(); // when it was set
```

## UserStorage<K, V>

User-owned, signed storage collection for per-user data. Keys are PublicKeys (32 bytes) that identify the user who owns the data. Writes are signed by the executor and verified on other nodes.

```typescript
import { UserStorage } from '@calimero-network/calimero-sdk-js/collections';
import { createUserStorage } from '@calimero-network/calimero-sdk-js';

interface UserProfile {
  displayName: string;
  score: number;
  badges: string[];
}

// Create a user storage for user profiles
const userProfiles = createUserStorage<UserProfile>();

// Insert data for the current executor (key is automatically set to executor's PublicKey)
userProfiles.insert({
  displayName: 'Alice',
  score: 100,
  badges: ['newcomer', 'contributor'],
});

// Get current user's data
const myProfile = userProfiles.get();

// Get any user's data by their PublicKey
const somePublicKey = new Uint8Array(32); // Another user's public key
const otherProfile = userProfiles.getForUser(somePublicKey);

// Check if current user has data
const hasProfile = userProfiles.containsCurrentUser();

// Check if another user has data
const hasOther = userProfiles.containsUser(somePublicKey);

// Remove current user's data
userProfiles.remove();

// Iterate over all users
const allUsers = userProfiles.entries(); // [[publicKey, profile], ...]
const allKeys = userProfiles.keys(); // [publicKey1, publicKey2, ...]
const allProfiles = userProfiles.values(); // [profile1, profile2, ...]
const count = userProfiles.size(); // number of users
```

### How It Works

1. **Writing**: When a user modifies data in `UserStorage`, the storage layer creates an action marked with `StorageType::User`.
2. **Signing**: The action is signed using the executor's identity private key, with a `signature` and `nonce` embedded in the metadata.
3. **Verification**: When other nodes receive this action, they verify:
   - **Signature**: Validates against the owner's public key
   - **Replay Protection**: Ensures the nonce is strictly greater than the last-seen nonce

### Use Cases

- Per-user settings and preferences
- User-owned game data (scores, inventory)
- Personal documents with ownership verification
- Any data that should be verifiably owned by a specific user

## FrozenStorage<T>

Immutable, content-addressable storage collection. Values are keyed by their SHA256 hash, ensuring content-addressability. Once inserted, values cannot be updated or deleted.

```typescript
import { FrozenStorage, FrozenValue } from '@calimero-network/calimero-sdk-js/collections';
import { createFrozenStorage } from '@calimero-network/calimero-sdk-js';

// Create frozen storage for documents
const documents = createFrozenStorage<Document>();

// Add a value - returns its SHA256 hash
const hash = documents.add({
  title: 'Important Document',
  content: 'This content is immutable...',
  timestamp: Date.now(),
});

// Retrieve by hash
const doc = documents.get(hash);

// Check if hash exists
const exists = documents.has(hash);

// Get all stored documents
const allEntries = documents.entries(); // [[hash, document], ...]
const allHashes = documents.hashes(); // [hash1, hash2, ...]
const allDocs = documents.values(); // [doc1, doc2, ...]

// Compute hash without storing (useful for deduplication)
const wouldBeHash = FrozenStorage.computeHash(myValue);

// Attempting to remove throws an error
// documents.remove(hash); // Error: FrozenStorage does not support remove
```

### How It Works

1. **Content-Addressing**: When you call `add(value)`, the storage:
   - Serializes the value
   - Computes its SHA256 hash
   - Uses the hash as the key in the underlying map
2. **Immutability**: Values are wrapped in `FrozenValue<T>`, which has an empty merge implementation, preventing any changes.
3. **Verification**: The storage layer enforces:
   - **No Updates/Deletes**: Update and delete actions are strictly forbidden
   - **Content-Addressing**: Add actions are only accepted if the key matches the SHA256 hash of the value

### Use Cases

- Audit logs and immutable records
- Document versioning (each version gets a unique hash)
- Certificates and attestations
- Content-addressable data sharing
- Deduplication (same content = same hash)

### FrozenValue<T>

The wrapper type that ensures immutability:

```typescript
import { FrozenValue } from '@calimero-network/calimero-sdk-js/collections';

// FrozenValue wraps any value
const frozen = new FrozenValue({ data: 'immutable' });
console.log(frozen.value); // { data: 'immutable' }

// Merge is a no-op - frozen values don't change
const other = new FrozenValue({ data: 'different' });
const result = frozen.merge(other); // Returns original frozen value
```

## View vs Mutation Methods

Understanding the difference between view and mutation methods is crucial for building efficient Calimero applications.

### What Are View Methods?

View methods are read-only operations decorated with `@View()`. They query state without modifying it, and the runtime **skips state persistence** after they execute.

```typescript
import { View } from '@calimero-network/calimero-sdk-js';

@Logic(MyApp)
export class MyAppLogic {
  // ✅ View method - only reads data
  @View()
  getUser(userId: string): User | null {
    return this.users.get(userId) ?? null;
  }

  // ✅ View method - computes value from state
  @View()
  getUserCount(): number {
    return this.users.size();
  }

  // ✅ View method - checks existence
  @View()
  hasUser(userId: string): boolean {
    return this.users.has(userId);
  }
}
```

### What Are Mutation Methods?

Mutation methods (the default, without `@View()`) modify state. After execution, the runtime automatically persists changes and synchronizes them across all nodes.

```typescript
@Logic(MyApp)
export class MyAppLogic {
  // Mutation method - modifies state (no decorator needed)
  addUser(userId: string, name: string): void {
    this.users.set(userId, { name, createdAt: Date.now() });
    // Changes are automatically persisted and synced
  }

  // Mutation method - modifies state
  removeUser(userId: string): boolean {
    return this.users.remove(userId);
    // Removal is automatically persisted and synced
  }

  // Mutation method - modifies multiple collections
  transferItem(fromUser: string, toUser: string, itemId: string): void {
    const item = this.inventory.get(fromUser)?.get(itemId);
    if (item) {
      this.inventory.get(fromUser)?.remove(itemId);
      this.inventory.get(toUser)?.set(itemId, item);
      // All changes are persisted together
    }
  }
}
```

### Key Differences

| Aspect         | View Methods (`@View()`) | Mutation Methods (default) |
| -------------- | ------------------------ | -------------------------- |
| State changes  | NOT persisted            | Automatically persisted    |
| Network sync   | No gossip traffic        | Changes broadcast to nodes |
| Storage impact | No DAG growth            | Updates storage DAG        |
| Use case       | Queries, getters, checks | Creates, updates, deletes  |

### Benefits of Using `@View()`

1. **Performance**: Skips serialization and persistence overhead
2. **Reduced Storage**: Keeps the storage DAG compact
3. **Lower Network Traffic**: No unnecessary state updates broadcast
4. **Semantic Clarity**: Code intent is immediately clear

### Common Patterns

```typescript
@Logic(TaskManager)
export class TaskManagerLogic {
  // === VIEW METHODS ===

  @View()
  getTask(id: string): Task | null {
    return this.tasks.get(id) ?? null;
  }

  @View()
  listTasks(): Task[] {
    return this.tasks.values();
  }

  @View()
  getTasksByStatus(status: string): Task[] {
    return this.tasks.values().filter(t => t.status === status);
  }

  @View()
  countCompletedTasks(): number {
    return this.tasks.values().filter(t => t.status === 'completed').length;
  }

  // === MUTATION METHODS ===

  createTask(title: string): string {
    const id = generateId();
    this.tasks.set(id, { id, title, status: 'pending', createdAt: Date.now() });
    return id;
  }

  updateTaskStatus(id: string, status: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    this.tasks.set(id, { ...task, status });
    return true;
  }

  deleteTask(id: string): boolean {
    return this.tasks.remove(id);
  }
}
```

### Warning: Accidental Mutations in View Methods

If you modify state inside a `@View()` method, changes are visible during that call but are **NOT persisted**:

```typescript
@View()
getAndIncrement(): number {
  const current = this.counter.value();
  this.counter.increment(); // ⚠️ This change is LOST after the method returns!
  return current;
}
```

This can lead to subtle bugs. Always ensure view methods only read data.

## Best Practices

### Use the Right Collection

- **UnorderedMap**: Key-value data (users, items, configs)
- **Vector**: Ordered lists (logs, history, queues)
- **Counter**: Metrics, totals, counts
- **LwwRegister**: Single values (status, config value)

### Write Natural Code with Nested Collections

✅ **Just modify nested collections directly** - the SDK handles propagation automatically:

```typescript
// This works seamlessly across all nodes!
const userSet = this.messageReactions.get(messageId)?.get(emoji);
userSet?.add(userId);

// Or build complex structures naturally:
const group = this.userGroups.get(groupName) || new UnorderedSet<string>();
group.add(userId);
this.userGroups.set(groupName, group);
// No manual re-serialization needed!
```

### Avoid Anti-Patterns

❌ Don't use regular objects:

```typescript
// BAD - loses concurrent updates
class BadApp {
  count: number = 0; // Not a CRDT!
}
```

✅ Use CRDT collections:

```typescript
// GOOD - handles concurrent updates
class GoodApp {
  count: Counter; // CRDT!
}
```

### Combine with View Decorators

- Initialize CRDT fields inline using the helper factories exposed from `@calimero-network/calimero-sdk-js` (`createUnorderedMap`, `createVector`, etc.). Constructors run on every invocation, so inline defaults guarantee the runtime reuses the persisted collection IDs.
- Mark read-only methods (`get`, `list`, `count`, `has`, etc.) with `@View()` so the dispatcher skips persistence when you only read data. This keeps the storage DAG compact and reduces gossip traffic. See the [View vs Mutation Methods](#view-vs-mutation-methods) section above for detailed guidance.

### Handles, Not Deep Copies

- `map.get('key')` for a CRDT value (vector, set, nested map) returns a lightweight handle that retains the underlying CRDT ID. The host does **not** deserialize the entire structure when you fetch it.
- Mutating that handle (`vector.push`, `set.add`, etc.) issues incremental host calls that touch only the affected entries. Nested CRDTs behave the same way: a conflict on `profiles['alice'].notes` merges just that inner collection.
- The only time a full structure is materialized in JS is when you explicitly call methods like `toArray()` or return the entire map from a view.
- Under the hood the serialized value contains a sentinel such as `{"__calimeroCollection":"Vector","id":"…hex…"}`. The Rust side stores that JSON as a `Vec<u8>`, but the CRDT’s real state is keyed by the ID. When you hydrate the handle the SDK reattaches the stored ID, so subsequent operations go straight to the host functions (no deep clone or replay of the entire collection on every call).

#### Example: `UnorderedMap<string, Vector<MyStruct>>`

```
Map entry "alice" ─┬─> { "__calimeroCollection": "Vector", "id": "caf3…" }
                   │        │
                   │        └─ host keeps Vector CRDT with ID caf3… (elements are serialized MyStruct)
                   │
Contract flow:
1. const vec = profiles.get('alice') ?? new Vector<MyStruct>();
2. vec.push({ score: 10, badge: 'gold' });
3. profiles.set('alice', vec);

- Step 1 rehydrates the vector handle (ID caf3…).
- Step 2 calls `js_crdt_vector_push`, mutating the same CRDT on the host.
- Step 3 persists only the small handle wrapper; the vector contents stay in the CRDT store.
```

#### Example: `UnorderedMap<string, UnorderedSet<LwwRegister<string>>>`

````
Map entry "project-x" ─┬─> { "__calimeroCollection": "UnorderedSet", "id": "dead…" }
                       │        │
                       │        └─ host keeps Set CRDT with ID dead…
                       │            each element is a serialized LWW register handle
                       │
Set element handle     └─> { "__calimeroCollection": "LwwRegister", "id": "beef…" }

Contract flow:
1. const set = tags.get('project-x') ?? new UnorderedSet<LwwRegister<string>>();
2. const register = new LwwRegister<string>();
   register.set('critical');
3. set.add(register);
4. tags.set('project-x', set);

- Step 1 rehydrates the set handle (ID dead…).
- Step 3 calls the host to add the LWW register (ID beef…) into that set.
- Step 4 persists only the set handle; both the set and the register keep their IDs in the CRDT store.

### Rehydration

- When you call `map.get('key')` and the value is a CRDT, the host returns a tiny JSON wrapper with the CRDT ID. The JS SDK **rehydrates** the CRDT by instantiating the corresponding class (`Vector`, `UnorderedSet`, `LwwRegister`, …) and attaching that ID.
- Subsequent operations on the rehydrated instance (`push`, `add`, `set`) invoke the host functions for that ID; the host does not resend the entire structure. Only on explicit full reads (`toArray`, view returning the whole map) is the entire data set streamed back.

### Best Practices by Type

- **UnorderedMap**
  Hydrate the existing entry before mutating (`const value = map.get(key) ?? new …`). Setting a brand-new CRDT instance replaces the stored ID and falls back to last-write-wins.

- **Vector**
  Use `Vector.fromArray` only for initialization. For updates use `push`, `pop`, `get`, `len` to keep the existing ID. For read-heavy paths prefer `len`/`get` instead of `toArray`.

- **UnorderedSet**
  Call `add`, `remove`, `has` on the rehydrated set. Adding a fresh `UnorderedSet` each time replaces the CRDT ID; instead reuse the handle returned by `get`.

- **Counter**
  Keep counters inline (`createCounter()`) and use `increment`, `incrementBy`. Avoid replacing the counter with a new instance; mutate the existing handle instead.

- **LwwRegister**
  Rehydrate the register with `map.get(key)` (or `createPrivateEntry`) and call `set`. Registers capture the last-writer timestamp; replacing the register object skips merge semantics.

- **Nested Structures**
  Just write natural code and changes propagate automatically:
  ```ts
  // ✅ This works automatically - no manual re-serialization needed!
  const set = profiles.get('alice') ?? new UnorderedSet<string>();
  set.add('blue'); // Automatically propagates to parent map!

  // Or even simpler:
  profiles.get('alice')?.add('blue'); // Just works!
````

**Manual approach** (still works but not needed):

```ts
// ❌ Manual re-serialization (not required)
const set = profiles.get('alice') ?? new UnorderedSet<string>();
set.add('blue');
profiles.set('alice', set); // Manual re-serialization
```

```

## Performance

| Collection | Get | Set | Remove | Memory |
|------------|-----|-----|--------|--------|
| UnorderedMap | O(1) | O(1) | O(1) | O(n) |
| UnorderedSet | O(1) | O(1) | O(1) | O(n) |
| Vector | O(1) | O(1) | O(1) | O(n) |
| Counter | O(1) | O(1) | - | O(nodes) |
| LwwRegister | O(1) | O(1) | O(1) | O(1) |

```
