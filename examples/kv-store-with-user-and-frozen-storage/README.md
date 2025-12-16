# KV Store with User and Frozen Storage

A key-value store application demonstrating the use of specialized storage collections in the Calimero JavaScript SDK.

## Features

This example showcases three types of storage:

### 1. Public Storage (`UnorderedMap`)

Standard key-value storage accessible to all users.

```typescript
// Set a value
set(key: string, value: string)

// Get a value
get(key: string): { output: string | null }

// Get all entries
entries(): { output: Record<string, string> }

// Remove a value
remove(key: string): { output: string | null }

// Clear all values
clear()
```

### 2. User Storage (`UserStorage`)

Per-user storage where each user can only write to their own key slot. Data is signed by the executor and verified on other nodes.

**Simple User Storage:**

```typescript
// Set value for current user
set_user_simple(value: string)

// Get value for current user
get_user_simple(): { output: string | null }

// Get value for specific user by their hex-encoded public key
get_user_simple_for(user_key: string): { output: string | null }
```

**Nested User Storage:**

```typescript
// Set key-value pair in current user's nested map
set_user_nested(key: string, value: string)

// Get value from current user's nested map
get_user_nested(key: string): { output: string | null }
```

### 3. Frozen Storage (`FrozenStorage`)

Immutable, content-addressable storage. Values are keyed by their SHA256 hash and cannot be updated or deleted.

```typescript
// Add an immutable value (returns hex-encoded hash)
add_frozen(value: string): { output: string }

// Get a value by its hash
get_frozen(hash_hex: string): { output: string } | { error: string }

// Check if a hash exists
has_frozen(hash_hex: string): { output: boolean }
```

## Building

```bash
# Install dependencies
pnpm install

# Build the WASM module
pnpm build

# Or use the build script
./build.sh
```

## Testing

The example includes workflow tests for both User Storage and Frozen Storage:

```bash
# Run user storage tests
calimero-test run workflows/test_user_storage.yml

# Run frozen storage tests
calimero-test run workflows/test_frozen_storage.yml
```

## Events

The application emits the following events:

- `ItemInserted` - When a new public item is added
- `ItemUpdated` - When a public item is updated
- `ItemRemoved` - When a public item is removed
- `StoreCleared` - When all public items are cleared
- `UserSimpleSet` - When a user sets their simple storage value
- `UserNestedSet` - When a user sets a nested storage value
- `FrozenAdded` - When a new frozen value is added

## Architecture

```
KvStoreWithUserAndFrozen
├── items: UnorderedMap<string, LwwRegister<string>>
│   └── Public key-value storage
├── userItemsSimple: UserStorage<LwwRegister<string>>
│   └── Per-user simple value storage
├── userItemsNested: UserStorage<NestedUserData>
│   └── Per-user nested map storage
└── frozenItems: FrozenStorage<string>
    └── Immutable content-addressable storage
```

## Use Cases

- **Public Storage**: Shared application data, configuration, public content
- **User Storage**: User profiles, preferences, personal data, scores
- **Frozen Storage**: Audit logs, certificates, document versions, immutable records
