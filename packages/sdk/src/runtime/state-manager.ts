/**
 * State Manager
 *
 * Handles state persistence and lifecycle
 */

import * as env from '../env/api';
import { serialize, deserialize } from '../utils/serialize';

const STATE_KEY = new TextEncoder().encode('STATE');

/**
 * Global state manager
 */
export class StateManager {
  private static currentState: any = null;
  private static stateClass: any = null;

  /**
   * Sets the current state class
   */
  static setStateClass(stateClass: any): void {
    this.stateClass = stateClass;
  }

  /**
   * Loads state from storage
   */
  static load(): any | null {
    if (this.currentState) {
      return this.currentState;
    }

    const raw = env.storageRead(STATE_KEY);
    if (!raw) {
      return null;
    }

    try {
      const data = deserialize(raw);
      this.currentState = this.reconstruct(data);
      return this.currentState;
    } catch (error) {
      env.log(`Failed to load state: ${error}`);
      return null;
    }
  }

  /**
   * Saves state to storage
   */
  static save(state: any): void {
    const serialized = serialize(state);
    env.storageWrite(STATE_KEY, serialized);
    this.currentState = state;
  }

  /**
   * Gets the current state
   */
  static getCurrent(): any {
    return this.currentState;
  }

  /**
   * Sets the current state
   */
  static setCurrent(state: any): void {
    this.currentState = state;
  }

  /**
   * Reconstructs state object from plain data
   */
  private static reconstruct(data: any): any {
    if (!this.stateClass) {
      return data;
    }

    const instance = Object.create(this.stateClass.prototype);
    Object.assign(instance, data);
    return instance;
  }
}

