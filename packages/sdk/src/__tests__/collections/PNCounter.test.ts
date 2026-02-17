/**
 * PNCounter tests - Positive-Negative Counter (supports decrement)
 *
 * PNCounter corresponds to Rust's `Counter<true>` / `PNCounter` type alias.
 * CrdtType: CrdtType::PnCounter
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

      counter.increment();
      expect(counter.value()).toBe(3n);
    });

    it('should decrement', () => {
      const counter = new PNCounter();

      counter.increment();
      counter.increment();
      counter.increment();
      expect(counter.value()).toBe(3n);

      counter.decrement();
      expect(counter.value()).toBe(2n);

      counter.decrement();
      expect(counter.value()).toBe(1n);
    });

    it('should go negative', () => {
      const counter = new PNCounter();

      counter.decrement();
      expect(counter.value()).toBe(-1n);

      counter.decrement();
      expect(counter.value()).toBe(-2n);
    });

    it('should increment by amount', () => {
      const counter = new PNCounter();

      counter.incrementBy(5);
      expect(counter.value()).toBe(5n);

      counter.incrementBy(0);
      expect(counter.value()).toBe(5n);
    });

    it('should decrement by amount', () => {
      const counter = new PNCounter();

      counter.incrementBy(10);
      counter.decrementBy(3);
      expect(counter.value()).toBe(7n);
    });

    it('should reject invalid increment amounts', () => {
      const counter = new PNCounter();
      expect(() => counter.incrementBy(-1)).toThrow();
      expect(() => counter.incrementBy(1.5)).toThrow();
      expect(() => counter.incrementBy(Number.NaN)).toThrow();
    });

    it('should reject invalid decrement amounts', () => {
      const counter = new PNCounter();
      expect(() => counter.decrementBy(-1)).toThrow();
      expect(() => counter.decrementBy(1.5)).toThrow();
      expect(() => counter.decrementBy(Number.NaN)).toThrow();
    });

    it('should handle mixed operations', () => {
      const counter = new PNCounter();

      counter.incrementBy(10);
      counter.decrementBy(3);
      counter.increment();
      counter.decrement();
      counter.incrementBy(5);
      counter.decrementBy(2);

      // 10 - 3 + 1 - 1 + 5 - 2 = 10
      expect(counter.value()).toBe(10n);
    });
  });

  describe('persistence', () => {
    it('should persist across instances', () => {
      const counter1 = new PNCounter();
      counter1.incrementBy(5);
      counter1.decrementBy(2);

      const counter2 = new PNCounter({ id: counter1.id() });
      expect(counter2.value()).toBe(3n);
    });

    it('should accumulate operations', () => {
      const counter1 = new PNCounter();
      counter1.increment();

      const counter2 = new PNCounter({ id: counter1.id() });
      counter2.decrement();

      const counter3 = new PNCounter({ id: counter1.id() });
      expect(counter3.value()).toBe(0n);
    });
  });

  describe('executor tracking', () => {
    it('should track per-executor positive counts', () => {
      const counter = new PNCounter();

      counter.increment();
      counter.increment();

      // In tests, all calls are from same mock executor
      expect(counter.getPositiveCount()).toBe(2);
    });

    it('should track per-executor negative counts', () => {
      const counter = new PNCounter();

      counter.decrement();
      counter.decrement();
      counter.decrement();

      expect(counter.getNegativeCount()).toBe(3);
    });

    it('should track both positive and negative separately', () => {
      const counter = new PNCounter();

      counter.incrementBy(5);
      counter.decrementBy(3);

      expect(counter.getPositiveCount()).toBe(5);
      expect(counter.getNegativeCount()).toBe(3);
      expect(counter.value()).toBe(2n);
    });
  });
});
