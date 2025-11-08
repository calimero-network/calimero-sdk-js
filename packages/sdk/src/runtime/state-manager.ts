/**
 * State Manager
 *
 * Handles state persistence and lifecycle
 */

import * as env from '../env/api';
import { instantiateCollection } from './collections';
import { saveRootState, loadRootState, ROOT_STORAGE_KEY } from './root';

const LEGACY_STATE_KEY = new TextEncoder().encode('STATE');
const LEGACY_DECODER = new TextDecoder();

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

    if (this.stateClass) {
      try {
        const state = loadRootState(this.stateClass);
        if (state) {
          this.currentState = state;
          return state;
        }
      } catch (error) {
        env.log(`Failed to hydrate state: ${error}`);
      }
    }

    const raw = env.storageRead(LEGACY_STATE_KEY);
    if (!raw) {
      return null;
    }

    try {
      const legacyJson = LEGACY_DECODER.decode(raw);
      const data = JSON.parse(legacyJson);
      const revived = this.reviveLegacyCollections(data);
      const legacyState = this.instantiateState(revived);
      this.currentState = legacyState;

      try {
        saveRootState(legacyState);
        env.storageRemove(LEGACY_STATE_KEY);
      } catch (error) {
        env.log(`Failed to migrate legacy state: ${error}`);
      }

      return legacyState;
    } catch (error) {
      env.log(`Failed to load legacy state: ${error}`);
      return null;
    }
  }

  /**
   * Saves state to storage
   */
  static save(state: any): void {
    try {
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

  private static instantiateState(data: any): any {
    if (!this.stateClass) {
      return data;
    }

    const instance = Object.create(this.stateClass.prototype);
    Object.assign(instance, data);
    return instance;
  }

  private static reviveLegacyCollections(value: any): any {
    if (Array.isArray(value)) {
      return value.map(item => this.reviveLegacyCollections(item));
    }

    if (value && typeof value === 'object') {
      const maybeType = (value as any).__calimeroCollection;
      const maybeId = (value as any).id;
      if (typeof maybeType === 'string' && typeof maybeId === 'string') {
        try {
          return instantiateCollection({ type: maybeType, id: maybeId });
        } catch (error) {
          env.log(`Failed to revive legacy collection '${maybeType}': ${error}`);
        }
      }

      const entries = Object.entries(value);
      for (const [key, entryValue] of entries) {
        (value as any)[key] = this.reviveLegacyCollections(entryValue);
      }
    }

    return value;
  }
}

