/**
 * @Logic decorator
 *
 * Links a logic class to its state class and registers all methods
 * for export as contract functions.
 *
 * @example
 * ```typescript
 * @Logic(MyApp)
 * export class MyAppLogic {
 *   @Init
 *   static initialize(): MyApp {
 *     return new MyApp();
 *   }
 *
 *   set(key: string, value: string): void {
 *     this.items.set(key, value);
 *   }
 * }
 * ```
 */
export function Logic(stateClass: any) {
  return function <T extends new (...args: any[]) => any>(target: T): T {
    // Store state class reference
    (target as any)._calimeroStateClass = stateClass;
    (target as any)._calimeroLogic = true;

    // Scan for methods to export
    const methodNames = Object.getOwnPropertyNames(target.prototype).filter(
      name => name !== 'constructor' && 
             name !== '_calimeroInitMethod' &&
             typeof target.prototype[name] === 'function'
    );

    // Store methods list
    (target as any)._calimeroMethods = methodNames;

    return target;
  };
}

