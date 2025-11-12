/**
 * State Manager
 *
 * Handles state persistence and lifecycle
 */

import * as env from '../env/api';
import { saveRootState, loadRootState } from './root';

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
      env.log('[state-manager] returning cached state instance');
      return this.currentState;
    }

    if (this.stateClass) {
      try {
        const state = loadRootState(this.stateClass);
        if (state) {
          env.log('[state-manager] restored state from persisted snapshot');
          this.currentState = state;
          return state;
        }
        env.log('[state-manager] no persisted state snapshot available');
      } catch (error) {
        env.log(`Failed to hydrate state: ${error}`);
      }
    }
    return null;
  }

  /**
   * Saves state to storage
   */
  static save(state: any): void {
    try {
      env.log('[state-manager] persisting state snapshot');
      saveRootState(state);
    } catch (error) {
      env.log(`Failed to persist state: ${error}`);
      throw error;
    }

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
}

