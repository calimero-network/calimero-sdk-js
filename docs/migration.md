# Migration Guide: Rust → JavaScript

Guide for migrating Calimero applications from Rust to JavaScript.

## Side-by-Side Comparison

### Rust Version

```rust
use calimero_sdk::app;
use calimero_storage::collections::UnorderedMap;

#[app::state]
#[derive(BorshSerialize, BorshDeserialize)]
pub struct KvStore {
    items: UnorderedMap<String, String>,
}

#[app::logic]
impl KvStore {
    #[app::init]
    pub fn init() -> KvStore {
        KvStore {
            items: UnorderedMap::new(),
        }
    }

    pub fn set(&mut self, key: String, value: String) {
        self.items.insert(key, value).unwrap();
    }

    pub fn get(&self, key: &str) -> Option<String> {
        self.items.get(key).unwrap()
    }
}
```

### JavaScript Version

```typescript
import { State, Logic, Init } from '@calimero/sdk';
import { UnorderedMap } from '@calimero/sdk/collections';

@State
export class KvStore {
  items: UnorderedMap<string, string>;

  constructor() {
    this.items = new UnorderedMap();
  }
}

@Logic(KvStore)
export class KvStoreLogic {
  @Init
  static initialize(): KvStore {
    return new KvStore();
  }

  set(key: string, value: string): void {
    this.items.set(key, value);
  }

  get(key: string): string | null {
    return this.items.get(key);
  }
}
```

## Key Differences

### 1. Decorators vs Macros

| Rust | JavaScript |
|------|------------|
| `#[app::state]` | `@State` |
| `#[app::logic]` | `@Logic(StateClass)` |
| `#[app::init]` | `@Init` |
| `#[app::event]` | `@Event` |

### 2. Error Handling

**Rust**: Explicit with `Result<T, E>` and `?` operator
```rust
pub fn set(&mut self, key: String) -> app::Result<()> {
    self.items.insert(key, value)?;
    Ok(())
}
```

**JavaScript**: Collections throw on error
```typescript
set(key: string): void {
  this.items.set(key, value); // throws on error
}
```

### 3. Initialization

**Rust**: Field initialization in struct literal
```rust
KvStore {
    items: UnorderedMap::new(),
}
```

**JavaScript**: Constructor
```typescript
constructor() {
  this.items = new UnorderedMap();
}
```

### 4. Types

**Rust**: Explicit generic types
```rust
UnorderedMap<String, String>
```

**JavaScript**: TypeScript generics
```typescript
UnorderedMap<string, string>
```

## Collection Mapping

| Rust | JavaScript | Notes |
|------|------------|-------|
| `UnorderedMap<K, V>` | `UnorderedMap<K, V>` | Same API |
| `Vector<T>` | `Vector<T>` | Same API |
| `Counter` | `Counter` | Same behavior |
| `LwwRegister<T>` | `LwwRegister<T>` | Same API |

## Migration Checklist

- [ ] Replace macros with decorators
- [ ] Update initialization pattern
- [ ] Remove `?` operator calls
- [ ] Update import statements
- [ ] Test contract functionality
- [ ] Verify multi-node sync

## Common Pitfalls

### 1. Forgetting Constructor

❌ **BAD**:
```typescript
@State
export class MyApp {
  items: UnorderedMap<string, string>; // Not initialized!
}
```

✅ **GOOD**:
```typescript
@State
export class MyApp {
  items: UnorderedMap<string, string>;

  constructor() {
    this.items = new UnorderedMap(); // ✅
  }
}
```

### 2. Mixing State and Logic

❌ **BAD**:
```typescript
@State
export class MyApp {
  items: UnorderedMap<string, string>;

  set(key: string, value: string) { // ❌ Methods go in @Logic!
    this.items.set(key, value);
  }
}
```

✅ **GOOD**:
```typescript
@State
export class MyApp {
  items: UnorderedMap<string, string>;
}

@Logic(MyApp)
export class MyAppLogic {
  set(key: string, value: string) { // ✅
    this.items.set(key, value);
  }
}
```

## Performance Comparison

| Metric | Rust | JavaScript | Difference |
|--------|------|------------|------------|
| WASM Size | ~100KB | ~500KB | 5x larger |
| Build Time | 5-10s | 3-8s | Similar |
| Execution | Native | ~2x slower | Acceptable |

## When to Use Each

**Use Rust SDK** when:
- Performance is critical
- Building complex algorithms
- Need smallest WASM size

**Use JavaScript SDK** when:
- Rapid prototyping
- Team knows JavaScript/TypeScript
- npm ecosystem needed
- Developer experience priority

Both SDKs are fully compatible and can interact on the same network!

