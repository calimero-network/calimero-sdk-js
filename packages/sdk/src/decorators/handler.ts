/**
 * @Handler decorator
 *
 * Marks a method that `emitWithHandler(event, 'method')` may name. The build
 * records it in the ABI, and nodes run only handlers the ABI declares.
 *
 * @example
 * ```typescript
 * @Handler()
 * onItemAdded(event: ItemAdded): void {
 *   this.seen.increment();
 * }
 * ```
 */
export function Handler(): MethodDecorator {
  // A marker only: the build reads it from the source.
  return () => {};
}
