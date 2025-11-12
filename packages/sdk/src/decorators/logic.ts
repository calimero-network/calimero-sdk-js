import { registerLogic } from '../runtime/method-registry';

/**
 * @Logic decorator
 *
 * Links a logic class to its state class and registers all methods
 * for export as service functions.
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
    (target as any)._calimeroStateClass = stateClass;
    (target as any)._calimeroLogic = true;

    const methodNames = Object.getOwnPropertyNames(target.prototype).filter(
      name => name !== 'constructor' &&
             name !== '_calimeroInitMethod' &&
             typeof target.prototype[name] === 'function'
    );

    (target as any)._calimeroMethods = methodNames;

    registerLogic(target, methodNames, stateClass);

    return target;
  };
}

