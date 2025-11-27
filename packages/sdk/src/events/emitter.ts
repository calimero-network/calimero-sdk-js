/**
 * Event emission functions
 */

import type { AppEvent } from './types';
import { serializeJsValue } from '../utils/borsh-value';

// This will be provided by QuickJS runtime
declare const env: {
  emit(kind: Uint8Array, data: Uint8Array): void;
  emit_with_handler(kind: Uint8Array, data: Uint8Array, handler: Uint8Array): void;
};

const encoder = new TextEncoder();

export function emit(event: unknown): void {
  const kind = encoder.encode(eventConstructorName(event));
  const payload = extractPayload(event);
  env.emit(kind, payload);
}

export function emitWithHandler(event: unknown, handlerName: string): void {
  const kind = encoder.encode(eventConstructorName(event));
  const payload = extractPayload(event);
  const handler = encoder.encode(handlerName);
  env.emit_with_handler(kind, payload, handler);
}

function extractPayload(event: unknown): Uint8Array {
  const maybeEvent = event as AppEvent | undefined;
  if (maybeEvent && typeof maybeEvent.serialize === 'function') {
    const serialized = maybeEvent.serialize();
    if (serialized instanceof Uint8Array) {
      return serialized;
    }
    if (typeof serialized === 'string') {
      return encoder.encode(serialized);
    }
    return serializeJsValue(serialized);
  }
  return serializeJsValue(event);
}

function eventConstructorName(event: unknown): string {
  if (event && typeof event === 'object' && 'constructor' in event) {
    const ctor = (event as any).constructor;
    if (ctor) {
      if ('eventName' in ctor && typeof ctor.eventName === 'string') {
        return ctor.eventName;
      }
      if (typeof ctor.name === 'string' && ctor.name.length > 0) {
        return ctor.name;
      }
    }
  }
  return 'AnonymousEvent';
}
