/**
 * @XCall decorator
 *
 * Marks a method that other contexts may reach with `env.xcall`. The build
 * records it in the ABI, and nodes reject an xcall to any undeclared method.
 * `fromSameApp` limits callers to contexts running this same application.
 *
 * @example
 * ```typescript
 * @XCall()
 * pong(payload: PongPayload): number {
 *   return ++this.counter;
 * }
 * ```
 */
export interface XCallOptions {
  fromSameApp?: boolean;
}

export function XCall(_options?: XCallOptions): MethodDecorator {
  // A marker only: the build reads it from the source.
  return () => {};
}
