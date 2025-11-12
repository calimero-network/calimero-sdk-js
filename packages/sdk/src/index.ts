/**
 * @calimero/sdk - Core SDK for building Calimero P2P applications
 *
 * @packageDocumentation
 */

// Decorators
export { State } from './decorators/state';
export { Logic } from './decorators/logic';
export { Init } from './decorators/init';
export { Event } from './decorators/event';
export { View } from './decorators/view';

// Environment API
export * as env from './env/api';

// Events
export { emit, emitWithHandler } from './events/emitter';
export type { AppEvent } from './events/types';

// Runtime
export { StateManager } from './runtime/state-manager';

// Re-export collections from dedicated entry point
// Users can import as: import { UnorderedMap } from '@calimero/sdk/collections';

// State helpers
export * from './state/helpers';

// Types
export type { SerializeOptions, DeserializeOptions } from './utils/types';

