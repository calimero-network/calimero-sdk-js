import { State, Logic, Init } from '@calimero/sdk';
import { Counter, DeltaContext } from '@calimero/sdk/collections';
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
  static init() {
    // Call commit ONLY ONCE with non-zero root hash
    const rootHash = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      rootHash[i] = i + 1; // Non-zero hash
    }
    const artifact = new Uint8Array([1, 2, 3, 4, 5]); // Minimal artifact
    
    env.commitDelta(rootHash, artifact);
  }

  increment(): void {
    this.count.increment();
    // Commit the delta after increment
    DeltaContext.commit();
  }

  getCount(): bigint {
    return this.count.value();
  }
}

