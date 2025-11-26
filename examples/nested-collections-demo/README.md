# Nested Collections Demo

This example demonstrates the **automatic nested collection tracking** feature that allows you to use nested `Map<K, Set<V>>` and `Map<K, Map<K2, V2>>` structures without manual re-serialization.

## The Problem (Before)

Previously, you had to manually force re-serialization when modifying nested collections:

```typescript
// ❌ This didn't work - changes wouldn't propagate
const innerSet = this.messageReactions.get(messageId)?.get(emoji);
innerSet?.add(userId);

// ✅ You had to do this instead
const reactionMap = this.messageReactions.get(messageId);
if (reactionMap) {
  const innerSet = reactionMap.get(emoji) || new UnorderedSet<string>();
  innerSet.add(userId);
  reactionMap.set(emoji, innerSet); // Force re-serialization
  this.messageReactions.set(messageId, reactionMap); // Force outer re-serialization
}
```

## The Solution (Now)

With automatic nested tracking, you can write natural code:

```typescript
// ✅ This now works automatically!
let reactionMap = this.messageReactions.get(messageId);
if (!reactionMap) {
  reactionMap = new UnorderedMap<string, UnorderedSet<string>>();
  this.messageReactions.set(messageId, reactionMap);
}

let userSet = reactionMap.get(emoji);
if (!userSet) {
  userSet = new UnorderedSet<string>();
  reactionMap.set(emoji, userSet);
}

userSet.add(userId); // ✨ This change automatically propagates!
```

## How It Works

The SDK now automatically:

1. **Detects nested collections** when you store them in parent collections
2. **Tracks parent-child relationships** between collections
3. **Propagates changes** from inner collections to outer collections
4. **Batches updates** for performance using microtasks

## Usage

```bash
npm install
npm run build
```

Then deploy and test the application to see nested collection changes propagating across nodes automatically!

## Key Benefits

- **Natural API**: Write code the way you expect it to work
- **Automatic propagation**: No manual re-serialization needed
- **Performance**: Batched updates prevent excessive synchronization
- **Reliability**: All nested changes are guaranteed to propagate
