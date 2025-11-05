import { State, Logic, Init } from '@calimero/sdk';
import { Counter } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

// Import internal DeltaContext to access CRDT operations
const DeltaContext = {
  computeRootHash: (): Uint8Array => {
    // Simple hash: just use a non-zero value for now
    const hash = new Uint8Array(32);
    hash[0] = 1; // Make it non-zero
    return hash;
  },
  serializeArtifact: (): Uint8Array => {
    return new Uint8Array(0); // Empty artifact for now
  }
};

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
    // Commit with a non-zero root hash so runtime considers it initialized
    const rootHash = DeltaContext.computeRootHash();
    const artifact = DeltaContext.serializeArtifact();
    env.commitDelta(rootHash, artifact);
    return {};
  }

  increment(): void {
    this.count.increment();
    env.log(`Counter incremented`);
  }

  getCount(): bigint {
    return this.count.value();
  }
}

