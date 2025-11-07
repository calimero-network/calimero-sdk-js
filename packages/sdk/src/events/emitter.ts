/**
 * Event emission functions
 */

import type { AppEvent } from './types';

// This will be provided by QuickJS runtime
declare const env: {
  emit(kind: Uint8Array, data: Uint8Array): void;
  emit_with_handler(kind: Uint8Array, data: Uint8Array, handler: Uint8Array): void;
};

/**
 * Emits an event without a handler
 *
 * @param event - Event to emit
 *
 * @example
 * ```typescript
 * emit(new ItemAdded('key1', 'value1'));
 * ```
 */
export function emit(event: AppEvent): void {
  const encoder = new TextEncoder();
  const kind = encoder.encode(event.constructor.name);
  const data = encoder.encode(JSON.stringify(event));

  env.emit(kind, data);
}

/**
 * Emits an event with a handler function
 *
 * The handler will be called on receiving nodes (not on the emitting node)
 *
 * @param event - Event to emit
 * @param handlerName - Name of the handler method
 *
 * @example
 * ```typescript
 * emitWithHandler(new ItemAdded('key1', 'value1'), 'onItemAdded');
 * ```
 */
export function emitWithHandler(event: AppEvent, handlerName: string): void {
  const encoder = new TextEncoder();
  const kind = encoder.encode(event.constructor.name);
  const data = encoder.encode(JSON.stringify(event));
  const handler = encoder.encode(handlerName);

  env.emit_with_handler(kind, data, handler);
}

