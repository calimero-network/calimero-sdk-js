/**
 * StateManager tests
 *
 * Tests for consistent StateManager initialization across decorator paths
 */

import './setup';
import { StateManager } from '../runtime/state-manager';

// Mock state class
class TestState {
  value: string = 'test';
}

// Another mock state class
class AnotherState {
  count: number = 0;
}

describe('StateManager', () => {
  beforeEach(() => {
    // Reset StateManager before each test
    StateManager.reset();
  });

  describe('initialize()', () => {
    it('should initialize with a state class', () => {
      expect(StateManager.isInitialized()).toBe(false);

      const result = StateManager.initialize(TestState);

      expect(result).toBe(true);
      expect(StateManager.isInitialized()).toBe(true);
      expect(StateManager.getStateClass()).toBe(TestState);
    });

    it('should be idempotent for the same state class', () => {
      StateManager.initialize(TestState);

      const result = StateManager.initialize(TestState);

      expect(result).toBe(true);
      expect(StateManager.isInitialized()).toBe(true);
      expect(StateManager.getStateClass()).toBe(TestState);
    });

    it('should return false and log warning when initializing with different class', () => {
      StateManager.initialize(TestState);

      const result = StateManager.initialize(AnotherState);

      expect(result).toBe(false);
      // Original class should be preserved
      expect(StateManager.getStateClass()).toBe(TestState);
    });

    it('should return false for null/undefined state class', () => {
      expect(StateManager.initialize(null)).toBe(false);
      expect(StateManager.initialize(undefined)).toBe(false);
      expect(StateManager.isInitialized()).toBe(false);
    });
  });

  describe('setStateClass()', () => {
    it('should delegate to initialize()', () => {
      StateManager.setStateClass(TestState);

      expect(StateManager.isInitialized()).toBe(true);
      expect(StateManager.getStateClass()).toBe(TestState);
    });
  });

  describe('load()', () => {
    it('should return cached state if available', () => {
      const cachedState = new TestState();
      StateManager.setCurrent(cachedState);

      const result = StateManager.load();

      expect(result).toBe(cachedState);
    });

    it('should preserve decorator-set class when explicit class differs (first class wins)', () => {
      // Simulate decorator setting state class first
      StateManager.setStateClass(TestState);

      // Dispatcher calls load with a different explicit class
      // The first-initialized class should win (TestState)
      StateManager.load(AnotherState);

      // TestState was already set via decorator, so it should be preserved
      expect(StateManager.getStateClass()).toBe(TestState);
    });

    it('should initialize with explicit class when not yet initialized', () => {
      expect(StateManager.isInitialized()).toBe(false);

      // When load is called with explicit class and not initialized
      StateManager.load(TestState);

      // It should initialize with the explicit class
      expect(StateManager.isInitialized()).toBe(true);
      expect(StateManager.getStateClass()).toBe(TestState);
    });

    it('should return null when no state class is available', () => {
      const result = StateManager.load();

      expect(result).toBe(null);
    });
  });

  describe('getCurrent() and setCurrent()', () => {
    it('should get and set current state', () => {
      const state = new TestState();

      StateManager.setCurrent(state);

      expect(StateManager.getCurrent()).toBe(state);
    });

    it('should allow setting null', () => {
      const state = new TestState();
      StateManager.setCurrent(state);

      StateManager.setCurrent(null);

      expect(StateManager.getCurrent()).toBe(null);
    });
  });

  describe('reset()', () => {
    it('should reset all state', () => {
      StateManager.initialize(TestState);
      StateManager.setCurrent(new TestState());

      StateManager.reset();

      expect(StateManager.isInitialized()).toBe(false);
      expect(StateManager.getStateClass()).toBe(null);
      expect(StateManager.getCurrent()).toBe(null);
    });
  });

  describe('decorator timing scenarios', () => {
    it('should handle @State decorator before dispatcher load', () => {
      // Scenario: @State decorator runs first
      StateManager.setStateClass(TestState);

      // Then dispatcher calls load with same class (from method registry)
      StateManager.load(TestState);

      // Should be properly initialized
      expect(StateManager.isInitialized()).toBe(true);
      expect(StateManager.getStateClass()).toBe(TestState);
    });

    it('should handle dispatcher load before @State decorator', () => {
      // Scenario: dispatcher calls load first with explicit class
      StateManager.load(TestState);

      // Then @State decorator runs
      StateManager.setStateClass(TestState);

      // Should be properly initialized (idempotent)
      expect(StateManager.isInitialized()).toBe(true);
      expect(StateManager.getStateClass()).toBe(TestState);
    });

    it('should handle dispatcher providing state class when decorator not run', () => {
      // Scenario: no @State decorator, but dispatcher has state class from registry
      expect(StateManager.isInitialized()).toBe(false);

      // Dispatcher calls load with explicit class
      StateManager.load(TestState);

      // Should initialize from explicit class
      expect(StateManager.isInitialized()).toBe(true);
      expect(StateManager.getStateClass()).toBe(TestState);
    });
  });
});
