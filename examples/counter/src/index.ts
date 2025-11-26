import { State, Logic, Init, View } from '@calimero/sdk';
import { Counter } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

@State
export class CounterApp {
  count: Counter = new Counter();
}

@Logic(CounterApp)
export class CounterLogic extends CounterApp {
  @Init
  static init(): CounterApp {
    env.log('Initializing CounterApp');
    return new CounterApp();
  }

  increment(): void {
    env.log('Incrementing counter');
    this.count.increment();
  }

  @View()
  getCount(): bigint {
    return this.count.value();
  }

  @View()
  hello(): { message: string } {
    return { message: 'hello world from QuickJS!' };
  }
}
