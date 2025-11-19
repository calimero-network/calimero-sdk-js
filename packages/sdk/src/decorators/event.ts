import type { AppEvent } from '../events/types';

type Constructor<T = {}> = new (...args: any[]) => T;

type EventConstructor<TBase extends Constructor> = TBase & {
  new (...args: ConstructorParameters<TBase>): InstanceType<TBase> & AppEvent;
  deserialize(data: string): InstanceType<TBase> & AppEvent;
  readonly eventName: string;
  prototype: InstanceType<TBase> & AppEvent;
};

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
export function Event<TBase extends Constructor>(target: TBase): EventConstructor<TBase> {
  const enhanced = class extends target implements AppEvent {
    serialize(): string {
      const plain: Record<string, unknown> = {};
      for (const key in this) {
        if (Object.prototype.hasOwnProperty.call(this, key)) {
          plain[key] = (this as Record<string, unknown>)[key];
        }
      }

      return JSON.stringify({
        eventType: (this.constructor as typeof enhanced).eventName,
        ...plain,
      });
    }

    static deserialize(data: string): InstanceType<TBase> & AppEvent {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object' && 'eventType' in parsed) {
        delete parsed.eventType;
      }
      return Object.assign(new target(), parsed) as InstanceType<TBase> & AppEvent;
    }

    static get eventName(): string {
      return target.name;
    }
  };

  (enhanced as any)._calimeroEvent = true;

  return enhanced as unknown as EventConstructor<TBase>;
}

