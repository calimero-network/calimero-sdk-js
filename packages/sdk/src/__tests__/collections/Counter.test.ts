/**
 * Counter tests
 */

import '../setup';
import { Counter } from '../../collections/Counter';
import { clearStorage } from '../setup';

describe('Counter', () => {
  beforeEach(() => {
    clearStorage();
  });

  describe('basic operations', () => {
    it('should start at zero', () => {
      const counter = new Counter();
      expect(counter.value()).toBe(0n);
    });

    it('should increment', () => {
      const counter = new Counter();

      counter.increment();
      expect(counter.value()).toBe(1n);

      counter.increment();
      expect(counter.value()).toBe(2n);

      counter.increment();
      expect(counter.value()).toBe(3n);
    });

    it('should increment by amount', () => {
      const counter = new Counter();

      counter.incrementBy(5);
      expect(counter.value()).toBe(5n);

      counter.incrementBy(0);
      expect(counter.value()).toBe(5n);
    });

    it('should reject invalid increment amounts', () => {
      const counter = new Counter();
      expect(() => counter.incrementBy(-1)).toThrow();
      expect(() => counter.incrementBy(1.5)).toThrow();
      expect(() => counter.incrementBy(Number.NaN)).toThrow();
    });

    it('should handle multiple increments', () => {
      const counter = new Counter();

      for (let i = 0; i < 10; i++) {
        counter.increment();
      }

      expect(counter.value()).toBe(10n);
    });
  });

  describe('persistence', () => {
    it('should persist across instances', () => {
      const counter1 = new Counter();
      counter1.increment();
      counter1.increment();

      const counter2 = new Counter({ id: counter1.id() });
      expect(counter2.value()).toBe(2n);
    });

    it('should accumulate increments', () => {
      const counter1 = new Counter();
      counter1.increment();

      const counter2 = new Counter({ id: counter1.id() });
      counter2.increment();

      const counter3 = new Counter({ id: counter1.id() });
      expect(counter3.value()).toBe(2n);
    });
  });

  describe('executor tracking', () => {
    it('should track per-executor counts', () => {
      const counter = new Counter();

      counter.increment();
      counter.increment();

      // In tests, all calls are from same mock executor
      expect(counter.getExecutorCount()).toBe(2);
    });
  });
});
