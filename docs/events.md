# Events Guide

Learn how to use events for communication in Calimero applications.

## Defining Events

Use the `@Event` decorator to mark event classes:

```typescript
import { Event } from '@calimero/sdk';

@Event
export class ItemAdded {
  constructor(
    public key: string,
    public value: string,
    public timestamp: number
  ) {}
}

@Event
export class ItemRemoved {
  constructor(public key: string) {}
}
```

## Emitting Events

### Without Handler

```typescript
import { emit } from '@calimero/sdk';

emit(new ItemAdded('key1', 'value1', Date.now()));
```

### With Handler

```typescript
import { emitWithHandler } from '@calimero/sdk';

emitWithHandler(new ItemAdded('key1', 'value1', Date.now()), 'onItemAdded');
```

## Event Handlers

Event handlers are methods that run when events are received:

```typescript
@Logic(MyApp)
export class MyAppLogic {
  // Regular method that emits event
  addItem(key: string, value: string): void {
    this.items.set(key, value);
    emitWithHandler(new ItemAdded(key, value, Date.now()), 'onItemAdded');
  }

  // Event handler (runs on receiving nodes)
  onItemAdded(event: ItemAdded): void {
    this.itemCount.increment();
  }
}
```

## ⚠️ Handler Requirements

**IMPORTANT**: Handlers may execute in parallel. They MUST be:

### 1. Commutative (Order-independent)

✅ **SAFE**:
```typescript
onUserRegistered(event: UserRegistered): void {
  this.userCount.increment(); // G-Counter is commutative
}
```

❌ **UNSAFE**:
```typescript
onCreate(event: Created): void {
  this.items.set(event.id, 'created');
}
onUpdate(event: Updated): void {
  const item = this.items.get(event.id); // Assumes onCreate ran first!
  this.items.set(event.id, item + ' updated');
}
```

### 2. Independent (No shared state)

✅ **SAFE**:
```typescript
handlerA(event: EventA): void {
  this.counters.set('a', new Counter());
}
handlerB(event: EventB): void {
  this.counters.set('b', new Counter()); // Different key
}
```

❌ **UNSAFE**:
```typescript
handlerA(): void {
  this.shared.set('count', 1); // RACE!
}
handlerB(): void {
  this.shared.set('count', 2); // RACE!
}
```

### 3. Idempotent (Safe to retry)

✅ **SAFE**:
```typescript
handler(): void {
  this.counter.increment(); // Can call multiple times
}
```

❌ **UNSAFE**:
```typescript
handler(amount: number): void {
  externalAPI.charge(amount); // May charge twice!
}
```

### 4. Pure (No side effects)

✅ **SAFE**:
```typescript
handler(data: string): void {
  this.items.set(data, 'processed');
  env.log('Processed'); // Logging is OK
}
```

❌ **UNSAFE**:
```typescript
handler(email: string): void {
  httpClient.post('/notify', email); // External call!
}
```

## Event Flow

```
Node A: Emit event → Broadcast to network
Node B: Receive event → Execute handler → Update state
Node C: Receive event → Execute handler → Update state
```

**Key Points**:
- Author node does NOT execute its own handlers
- Receiving nodes execute handlers
- Handlers run after delta is applied

## Best Practices

### Keep Handlers Simple

```typescript
// ✅ GOOD
onUserRegistered(): void {
  this.registrationCount.increment();
}

// ❌ BAD - too complex
onUserRegistered(user: User): void {
  this.createProfile(user);
  this.sendEmail(user);
  this.updateAnalytics();
  this.notifyAdmins();
}
```

### Use Multiple Events

Instead of complex handlers, emit multiple events:

```typescript
registerUser(user: User): void {
  this.users.set(user.id, user);

  emit(new UserRegistered(user.id));
  emit(new ProfileNeeded(user.id));
  emit(new WelcomeEmailNeeded(user.email));
}
```

### Test Concurrent Execution

Always test your handlers with concurrent events to ensure they work correctly regardless of order.

