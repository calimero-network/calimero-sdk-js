/**
 * Event type definitions
 */

/**
 * Base interface for application events
 */
export interface AppEvent {
  /**
   * Serializes the event to JSON
   */
  serialize(): string;
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

