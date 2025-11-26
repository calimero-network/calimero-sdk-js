/**
 * Decorator tests
 */

import './setup';
import { State } from '../decorators/state';
import { Logic } from '../decorators/logic';
import { Init } from '../decorators/init';
import { Event } from '../decorators/event';

describe('Decorators', () => {
  describe('@State', () => {
    it('should mark class as state', () => {
      @State
      class TestApp {
        value: string = 'test';
      }

      expect((TestApp as any)._calimeroState).toBe(true);
    });

    it('should preserve constructor', () => {
      @State
      class TestApp {
        value: string;

        constructor() {
          this.value = 'initialized';
        }
      }

      const instance = new TestApp();
      expect(instance.value).toBe('initialized');
    });
  });

  describe('@Logic', () => {
    it('should store state class reference', () => {
      @State
      class TestState {}

      @Logic(TestState)
      class TestLogic extends TestState {}

      expect((TestLogic as any)._calimeroStateClass).toBe(TestState);
      expect((TestLogic as any)._calimeroLogic).toBe(true);
    });

    it('should extract method names', () => {
      @State
      class TestState {}

      @Logic(TestState)
      class TestLogic extends TestState {
        method1() {}
        method2() {}
      }

      const methods = (TestLogic as any)._calimeroMethods;
      expect(methods).toContain('method1');
      expect(methods).toContain('method2');
    });
  });

  describe('@Init', () => {
    it('should mark method as initializer', () => {
      @State
      class TestState {}

      @Logic(TestState)
      class TestLogic extends TestState {
        @Init
        static initialize(): TestState {
          return new TestState();
        }
      }

      expect((TestLogic as any)._calimeroInitMethod).toBe('initialize');
    });
  });

  describe('@Event', () => {
    it('should add serialization methods', () => {
      @Event
      class TestEvent {
        constructor(public data: string) {}
      }

      const event: any = new TestEvent('test');
      expect(event.serialize).toBeDefined();
      expect(typeof event.serialize()).toBe('string');
    });

    it('should mark as event class', () => {
      @Event
      class TestEvent {}

      expect((TestEvent as any)._calimeroEvent).toBe(true);
    });
  });
});
