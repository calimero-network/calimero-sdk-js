import { State, Logic, Init } from '@calimero/sdk';
import { Counter, DeltaContext } from '@calimero/sdk/collections';
import { BorshWriter } from '@calimero/sdk/borsh';
import * as env from '@calimero/sdk/env';

@State
export class CounterApp {
  count: Counter;

  constructor() {
    this.count = new Counter();
  }
}

// Init function returns state object (like Rust SDK pattern)
// The C wrapper will serialize this and call commitDelta
export function init() {
  return {
    count: {
      counts: {}
    }
  };
}

@Logic(CounterApp)
export class CounterLogic extends CounterApp {
  increment(): void {
    this.count.increment();
    // Commit the delta after increment
    DeltaContext.commit();
  }

  getCount(): bigint {
    return this.count.value();
  }
}

