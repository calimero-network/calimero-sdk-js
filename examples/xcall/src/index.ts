import { State, Logic, Init, Event, emit } from '@calimero/sdk';
import * as env from '@calimero/sdk/env';
import bs58 from 'bs58';

const textEncoder = new TextEncoder();

function encodeBase58(bytes: Uint8Array): string {
  return bs58.encode(bytes);
}

function decodeContextId(value: string): Uint8Array {
  const decoded = bs58.decode(value);
  if (decoded.length !== 32) {
    throw new Error('Context ID must decode to exactly 32 bytes');
  }
  return decoded;
}

@State
export class XCallState {
  counter: number;

  constructor() {
    this.counter = 0;
  }
}

@Event
export class PingSent {
  constructor(public toContext: string) {}
}

@Event
export class PongReceived {
  constructor(public fromContext: string, public counter: number) {}
}

type PongPayload = {
  fromContext: string;
};

@Logic(XCallState)
export class XCallLogic extends XCallState {
  @Init
  static init(): XCallState {
    return new XCallState();
  }

  ping(targetContext: string): void {
    const targetBytes = decodeContextId(targetContext);
    const currentContext = env.contextId();

    env.log(
      `[xcall] sending ping from=${encodeBase58(currentContext)} to=${targetContext}`
    );

    const payload = {
      fromContext: encodeBase58(currentContext)
    };

    env.xcall(targetBytes, 'pong', textEncoder.encode(JSON.stringify(payload)));

    emit(new PingSent(targetContext));
  }

  pong(payload: PongPayload): number {
    if (!payload?.fromContext) {
      throw new Error('Invalid pong payload');
    }

    // Validate input but keep base58 for events/logs
    decodeContextId(payload.fromContext);

    this.counter += 1;

    env.log(
      `[xcall] received pong from=${payload.fromContext} counter=${this.counter}`
    );

    emit(new PongReceived(payload.fromContext, this.counter));

    return this.counter;
  }

  getCounter(): number {
    env.log(`[xcall] counter=${this.counter}`);
    return this.counter;
  }

  resetCounter(): number {
    env.log('[xcall] resetting counter');
    this.counter = 0;
    return this.counter;
  }
}

