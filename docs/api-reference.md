# API Reference

Complete API documentation for @calimero-network/calimero-sdk-js

## Decorators

### @State

Marks a class as the application state container.

```typescript
@State
export class MyApp {
  items: UnorderedMap<string, string>;
}
```

### @Logic

Links a logic class to its state class.

```typescript
@Logic(MyApp)
export class MyAppLogic {
  // methods
}
```

### @Init

Marks a static method as the service initializer.

```typescript
@Init
static initialize(): MyApp {
  return new MyApp();
}
```

### @Event

Marks a class as an event type.

```typescript
@Event
export class ItemAdded {
  constructor(
    public key: string,
    public value: string
  ) {}
}
```

## Environment Functions (env)

### log(message: string)

Logs a message to the runtime.

```typescript
env.log('Hello, Calimero!');
```

### contextId(): Uint8Array

Gets the current context ID (32 bytes).

```typescript
const ctx = env.contextId();
```

### executorId(): Uint8Array

Gets the current executor ID (32 bytes).

```typescript
const executor = env.executorId();
```

### storageRead(key: Uint8Array): Uint8Array | null

Reads from storage.

```typescript
const value = env.storageRead(key);
```

### storageWrite(key: Uint8Array, value: Uint8Array): void

Writes to storage.

```typescript
env.storageWrite(key, value);
```

### storageRemove(key: Uint8Array): boolean

Removes from storage.

```typescript
env.storageRemove(key);
```

### timeNow(): bigint

Gets current timestamp in nanoseconds.

```typescript
const now = env.timeNow();
```

### ed25519Verify(signature, publicKey, message): boolean

Verifies an Ed25519 signature.

```typescript
const signature = new Uint8Array(64); // 64-byte signature
const publicKey = new Uint8Array(32); // 32-byte public key
const message = new TextEncoder().encode('Hello, World!');

const isValid = env.ed25519Verify(signature, publicKey, message);
if (!isValid) {
  throw new Error('Invalid signature');
}
```

**Parameters:**

- `signature`: 64-byte Ed25519 signature as `Uint8Array`
- `publicKey`: 32-byte Ed25519 public key as `Uint8Array`
- `message`: Message bytes as `Uint8Array`

**Returns:** `true` if signature is valid, `false` otherwise

## Events

### emit(event: AppEvent): void

Emits an event without a handler.

```typescript
emit(new ItemAdded('key', 'value'));
```

### emitWithHandler(event: AppEvent, handler: string): void

Emits an event with a handler function.

```typescript
emitWithHandler(new ItemAdded('key', 'value'), 'onItemAdded');
```

## Collections

See [Collections Guide](./collections.md) for detailed documentation on:

- UnorderedMap
- UnorderedSet
- Vector
- Counter
- LwwRegister
- **UserStorage** - User-owned, signed storage with PublicKey keys
- **FrozenStorage** - Immutable, content-addressable storage

## State Helpers

Factory functions for creating CRDT collections:

```typescript
import {
  createUnorderedMap,
  createUnorderedSet,
  createVector,
  createCounter,
  createLwwRegister,
  createUserStorage,
  createFrozenStorage,
} from '@calimero-network/calimero-sdk-js';

// Standard collections
const map = createUnorderedMap<string, number>();
const set = createUnorderedSet<string>();
const vec = createVector<string>();
const counter = createCounter();
const register = createLwwRegister<string>();

// Specialized storage
const userStorage = createUserStorage<UserProfile>();
const frozenStorage = createFrozenStorage<Document>();
```
