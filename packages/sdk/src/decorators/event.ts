/**
 * @Event decorator
 *
 * Marks a class as an event type that can be emitted and handled.
 *
 * @example
 * ```typescript
 * @Event
 * export class ItemAdded {
 *   constructor(
 *     public key: string,
 *     public value: string
 *   ) {}
 * }
 * ```
 */
export function Event<T extends new (...args: any[]) => any>(target: T): T {
  // Add serialization methods
  const enhanced = class extends target {
    serialize(): string {
      return JSON.stringify(this);
    }

    static deserialize(data: string): InstanceType<T> {
      const parsed = JSON.parse(data);
      return Object.assign(new target(), parsed) as InstanceType<T>;
    }

    static get eventName(): string {
      return target.name;
    }
  };

  // Mark as event class
  (enhanced as any)._calimeroEvent = true;

  // TODO: Register in EventRegistry
  // EventRegistry.register(target.name, enhanced);

  return enhanced as T;
}

