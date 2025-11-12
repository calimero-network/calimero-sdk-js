import { registerInit } from '../runtime/method-registry';

/**
 * @Init decorator
 *
 * Marks a static method as the service initializer.
 * This method will be called when the service is first deployed.
 *
 * @example
 * ```typescript
 * @Logic(MyApp)
 * export class MyAppLogic {
 *   @Init
 *   static initialize(): MyApp {
 *     return new MyApp();
 *   }
 * }
 * ```
 */
export function Init(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
): void {
  if (typeof target !== 'function') {
    throw new Error('@Init decorator can only be used on static methods');
  }

  target._calimeroInitMethod = propertyKey;

  registerInit(target, propertyKey);
}


