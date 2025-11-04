import { State, Logic, Init } from '@calimero/sdk';
import { Counter } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

@State
export class CounterApp {
  count: Counter;

  constructor() {
    this.count = new Counter();
  }
}

@Logic(CounterApp)
export class CounterLogic extends CounterApp {
  @Init
  static initialize(): CounterApp {
    env.log('Initializing counter application');
    return new CounterApp();
  }

  increment(): void {
    this.count.increment();
    env.log(`Counter incremented`);
  }

  getCount(): bigint {
    return this.count.value();
  }
}

