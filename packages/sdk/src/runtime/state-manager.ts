/**
 * State Manager
 *
 * Handles state persistence and lifecycle with consistent initialization.
 *
 * Initialization is consolidated to a single, explicit path via the `initialize()`
 * method. This ensures deterministic behavior regardless of decorator execution order.
 *
 * Usage:
 * - `@State` decorator calls `setStateClass()` (which delegates to `initialize()`)
 * - Dispatcher calls `load(explicitStateClass)` with the state class from method registry
 * - The explicit state class parameter takes precedence, ensuring consistency
 */

import * as env from '../env/api';
import { saveRootState, loadRootState } from './root';

export class StateManager {
  private static currentState: any = null;
  private static stateClass: any = null;
  private static initialized: boolean = false;

  /**
   * Initializes the StateManager with a state class.
   *
   * This is the canonical initialization path. It ensures that:
   * 1. The state class is set exactly once (idempotent for same class)
   * 2. Warnings are logged if attempting to set a different class
   * 3. The initialization state is tracked
   *
   * @param stateClass - The state class to use for loading/saving state
   * @returns true if initialization was successful, false if already initialized with different class
   */
  static initialize(stateClass: any): boolean {
    if (!stateClass) {
      env.log('[state-manager] initialize called with null/undefined stateClass');
      return false;
    }

    if (this.initialized && this.stateClass === stateClass) {
      // Idempotent: same class, already initialized
      return true;
    }

    if (this.initialized && this.stateClass !== stateClass) {
      // Warning: attempting to initialize with different class
      env.log(
        '[state-manager] warning: already initialized with different state class, ignoring new class'
      );
      return false;
    }

    this.stateClass = stateClass;
    this.initialized = true;
    env.log('[state-manager] initialized with state class');
    return true;
  }

  /**
   * Sets the current state class (called by @State decorator).
   *
   * Delegates to `initialize()` to ensure consistent initialization.
   * This method is kept for backward compatibility with the @State decorator.
   */
  static setStateClass(stateClass: any): void {
    this.initialize(stateClass);
  }

  /**
   * Returns whether the StateManager has been initialized.
   */
  static isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Gets the currently registered state class.
   */
  static getStateClass(): any {
    return this.stateClass;
  }

  /**
   * Loads state from storage.
   *
   * @param explicitStateClass - Optional explicit state class to use. This takes
   *                             precedence over the decorator-set class, ensuring
   *                             consistent behavior regardless of decorator timing.
   * @returns The loaded state instance, or null if no state is available
   */
  static load(explicitStateClass?: any): any | null {
    if (this.currentState) {
      env.log('[state-manager] returning cached state instance');
      return this.currentState;
    }

    // Use explicit state class if provided, otherwise fall back to decorator-set class
    // This ensures consistent behavior when dispatcher passes the state class from registry
    const effectiveStateClass = explicitStateClass || this.stateClass;

    // If explicit class provided and different from current, initialize with it
    if (explicitStateClass && !this.initialized) {
      this.initialize(explicitStateClass);
    }

    if (effectiveStateClass) {
      try {
        const state = loadRootState(effectiveStateClass);
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

  /**
   * Resets the StateManager to its initial state.
   *
   * This is primarily for testing purposes to ensure clean state between tests.
   * In production, state should persist across the lifetime of the contract.
   */
  static reset(): void {
    this.currentState = null;
    this.stateClass = null;
    this.initialized = false;
  }
}
