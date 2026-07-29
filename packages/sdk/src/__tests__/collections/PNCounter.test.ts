/**
 * PNCounter tests
 */

import '../setup';
import { PNCounter } from '../../collections/PNCounter';
import { clearStorage } from '../setup';

describe('PNCounter', () => {
  beforeEach(() => {
    clearStorage();
  });

  describe('basic operations', () => {
    it('should start at zero', () => {
      const counter = new PNCounter();
      expect(counter.value()).toBe(0n);
    });

    it('should increment', () => {
      const counter = new PNCounter();

      counter.increment();
      expect(counter.value()).toBe(1n);

      counter.increment();
      expect(counter.value()).toBe(2n);
    });

    it('should decrement to a negative (signed) value', () => {
      const counter = new PNCounter();

      counter.decrement();
      expect(counter.value()).toBe(-1n);

      counter.decrement();
      expect(counter.value()).toBe(-2n);
    });

    it('should net increments and decrements into a signed total', () => {
      const counter = new PNCounter();

      counter.increment();
      counter.increment();
      counter.increment();
      counter.decrement();

      expect(counter.value()).toBe(2n);
    });

    it('should increment and decrement by amount', () => {
      const counter = new PNCounter();

      counter.incrementBy(5);
      expect(counter.value()).toBe(5n);

      counter.decrementBy(8);
      expect(counter.value()).toBe(-3n);
    });

    it('should reject invalid amounts', () => {
      const counter = new PNCounter();
      expect(() => counter.incrementBy(-1)).toThrow();
      expect(() => counter.decrementBy(1.5)).toThrow();
      expect(() => counter.incrementBy(Number.NaN)).toThrow();
    });
  });

  describe('persistence', () => {
    it('should persist across instances', () => {
      const counter1 = new PNCounter();
      counter1.increment();
      counter1.increment();
      counter1.decrement();

      const counter2 = new PNCounter({ id: counter1.id() });
      expect(counter2.value()).toBe(1n);
    });
  });

  describe('executor tracking', () => {
    it('should track per-executor signed net counts', () => {
      const counter = new PNCounter();

      counter.increment();
      counter.increment();
      counter.decrement();

      // In tests, all calls are from the same mock executor.
      expect(counter.getExecutorCount()).toBe(1);
    });
  });
});
