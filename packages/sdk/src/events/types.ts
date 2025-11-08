/**
 * Event type definitions
 */

/**
 * Base interface for application events
 */
export interface AppEvent {
  /**
   * Serializes the event payload.
   * Return `Uint8Array` for pre-serialized bytes, a plain object/string, or leave undefined to let the SDK serialize automatically.
   */
  serialize?(): Uint8Array | object | string;
}

/**
 * Event metadata
 */
export interface EventMetadata {
  /**
   * Event type name
   */
  kind: string;

  /**
   * Event data as JSON string
   */
  data: string;

  /**
   * Optional handler method name
   */
  handler?: string;
}

