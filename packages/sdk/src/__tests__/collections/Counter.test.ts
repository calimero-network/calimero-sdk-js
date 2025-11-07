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
      const prefix = 'test_counter';

      const counter1 = new Counter(prefix);
      counter1.increment();
      counter1.increment();

      const counter2 = new Counter(prefix);
      expect(counter2.value()).toBe(2n);
    });

    it('should accumulate increments', () => {
      const prefix = 'test_counter2';

      const counter1 = new Counter(prefix);
      counter1.increment();

      const counter2 = new Counter(prefix);
      counter2.increment();

      const counter3 = new Counter(prefix);
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

