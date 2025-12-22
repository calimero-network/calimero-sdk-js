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

## Context Management

### contextAddMember(publicKey: Uint8Array): void

Adds a member to the current context. This is an asynchronous operation that takes effect after successful execution.

**Parameters:**

- `publicKey`: 32-byte Ed25519 public key of the member to add

**Example:**

```typescript
import { contextAddMember } from '@calimero-network/calimero-sdk-js/env';

const memberKey = new Uint8Array(32); // Member's public key
contextAddMember(memberKey);
```

### contextRemoveMember(publicKey: Uint8Array): void

Removes a member from the current context. This is an asynchronous operation that takes effect after successful execution.

**Parameters:**

- `publicKey`: 32-byte Ed25519 public key of the member to remove

**Example:**

```typescript
import { contextRemoveMember } from '@calimero-network/calimero-sdk-js/env';

const memberKey = new Uint8Array(32); // Member's public key
contextRemoveMember(memberKey);
```

### contextIsMember(publicKey: Uint8Array): boolean

Checks if a public key is a member of the current context. This is a synchronous read operation.

**Parameters:**

- `publicKey`: 32-byte Ed25519 public key to check

**Returns:** `true` if the public key is a member, `false` otherwise

**Example:**

```typescript
import { contextIsMember } from '@calimero-network/calimero-sdk-js/env';

const memberKey = new Uint8Array(32); // Member's public key
const isMember = contextIsMember(memberKey);
if (isMember) {
  console.log('User is a member');
}
```

### contextMembers(): Uint8Array[]

Gets all members of the current context. This is a synchronous read operation.

**Returns:** Array of 32-byte public keys representing context members

**Example:**

```typescript
import { contextMembers } from '@calimero-network/calimero-sdk-js/env';

const members = contextMembers();
console.log(`Context has ${members.length} members`);
for (const memberKey of members) {
  console.log('Member:', memberKey);
}
```

### contextCreate(protocol: Uint8Array, applicationId: Uint8Array, initArgs: Uint8Array, alias: Uint8Array): void

Creates a new child context with the specified protocol, application ID, initialization arguments, and alias.

**Parameters:**

- `protocol`: Protocol identifier (e.g., "near", "icp", "stellar")
- `applicationId`: 32-byte application ID for the new context
- `initArgs`: Initialization arguments as JSON bytes (typically '{}' for default)
- `alias`: Alias string for the context (max 64 bytes)

**Example:**

```typescript
import { contextCreate } from '@calimero-network/calimero-sdk-js/env';

const protocol = new TextEncoder().encode('near');
const appId = new Uint8Array(32); // Application ID
const initArgs = new TextEncoder().encode('{}');
const alias = new TextEncoder().encode('my-context');
contextCreate(protocol, appId, initArgs, alias);
```

### contextDelete(contextId: Uint8Array): void

Deletes a context. This is an asynchronous operation that takes effect after successful execution.

**Parameters:**

- `contextId`: 32-byte context ID to delete. Pass the current context ID for self-deletion.

**Example:**

```typescript
import { contextDelete, contextId } from '@calimero-network/calimero-sdk-js/env';

// Self-delete (delete current context)
const currentId = contextId();
contextDelete(currentId);
```

### contextResolveAlias(alias: Uint8Array): Uint8Array | null

Resolves a context alias to a context ID.

**Parameters:**

- `alias`: Alias string to resolve

**Returns:** 32-byte context ID if alias exists, `null` otherwise

**Example:**

```typescript
import { contextResolveAlias } from '@calimero-network/calimero-sdk-js/env';

const alias = new TextEncoder().encode('my-context');
const contextId = contextResolveAlias(alias);
if (contextId) {
  console.log('Resolved context ID:', contextId);
}
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
- Vector
- Counter
- LwwRegister
