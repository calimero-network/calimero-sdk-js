import { markMethodNonMutating } from '../runtime/method-registry';

/**
 * @View decorator
 *
 * Marks a method as a read-only view that does not modify application state.
 * View methods skip state persistence after execution, which provides several benefits:
 *
 * **View vs Mutation Semantics:**
 *
 * - **View methods** (`@View()`): Read-only operations that query state without modifying it.
 *   The runtime skips state serialization and persistence after the method completes.
 *   Changes made inside a view method are NOT persisted and will be lost.
 *
 * - **Mutation methods** (default, no decorator): Operations that modify state.
 *   After execution, the runtime automatically persists all state changes to storage
 *   and propagates them across nodes via the CRDT synchronization protocol.
 *
 * **When to use `@View()`:**
 *
 * - Getter methods that return existing data (e.g., `getUser`, `listItems`)
 * - Query methods that compute values from state (e.g., `count`, `exists`, `search`)
 * - Any method that should NOT persist changes to the distributed state
 *
 * **Benefits of marking methods as `@View()`:**
 *
 * - **Performance**: Skips state serialization overhead after method execution
 * - **Reduced storage**: Keeps the storage DAG compact by avoiding unnecessary writes
 * - **Lower network traffic**: Reduces gossip traffic since no state updates are broadcast
 * - **Semantic clarity**: Makes the code's intent clear to other developers
 *
 * **Important:** If you accidentally modify state inside a `@View()` method, those changes
 * will be visible within that method call but will NOT be persisted or synchronized.
 * This can lead to subtle bugs if not used correctly.
 *
 * @example
 * ```typescript
 * @Logic(MyApp)
 * export class MyAppLogic {
 *   // View method - reads data without modifying state
 *   @View()
 *   getItem(key: string): string | null {
 *     return this.items.get(key) ?? null;
 *   }
 *
 *   // View method - computes a value from state
 *   @View()
 *   count(): number {
 *     return this.items.size();
 *   }
 *
 *   // View method - checks existence
 *   @View()
 *   hasItem(key: string): boolean {
 *     return this.items.has(key);
 *   }
 *
 *   // Mutation method (default) - modifies state
 *   setItem(key: string, value: string): void {
 *     this.items.set(key, value); // This change IS persisted
 *   }
 *
 *   // Mutation method - modifies state
 *   removeItem(key: string): boolean {
 *     return this.items.remove(key); // This change IS persisted
 *   }
 * }
 * ```
 *
 * @returns A method decorator that marks the method as non-mutating
 */
export function View(): MethodDecorator {
  return (target, propertyKey) => {
    if (typeof propertyKey !== 'string') {
      return;
    }
    const ctor = target && (target as any).constructor;
    if (typeof ctor !== 'function') {
      return;
    }
    markMethodNonMutating(ctor, propertyKey);
  };
}
