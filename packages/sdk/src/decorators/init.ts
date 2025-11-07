/**
 * @Init decorator
 *
 * Marks a static method as the contract initializer.
 * This method will be called when the contract is first deployed.
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
  // Store init method name on the class constructor
  target._calimeroInitMethod = propertyKey;

  // TODO: Register in method registry
  // MethodRegistry.registerInit(propertyKey, descriptor.value);

  // Ensure it's a static method
  if (typeof target !== 'function') {
    throw new Error('@Init decorator can only be used on static methods');
  }
}

