/**
 * @State decorator
 *
 * Marks a class as the application state container.
 * The decorated class will be automatically serialized/deserialized
 * and persisted across function calls.
 *
 * @example
 * ```typescript
 * @State
 * export class MyApp {
 *   items: UnorderedMap<string, string> = new UnorderedMap();
 * }
 * ```
 */
import { StateManager } from '../runtime/state-manager';

export function State<T extends new (...args: any[]) => any>(target: T): T {
  // Mark as state class
  (target as any)._calimeroState = true;
  StateManager.setStateClass(target);

  return target;
}

