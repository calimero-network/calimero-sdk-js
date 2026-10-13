import { State, Logic, Init, View } from '@calimero-network/calimero-sdk-js';
import {
  bytesToHex,
  contextId,
  hexToBytes,
  log,
  xcall,
} from '@calimero-network/calimero-sdk-js/env';

const textEncoder = new TextEncoder();

function decodeContextId(value: string): Uint8Array {
  const decoded = hexToBytes(value);
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
    const currentContext = contextId();

    log(`[xcall] sending ping from=${bytesToHex(currentContext)} to=${targetContext}`);

    const payload = {
      fromContext: bytesToHex(currentContext),
    };

    xcall(targetBytes, 'pong', textEncoder.encode(JSON.stringify(payload)));
  }

  pong(payload: PongPayload | string): number {
    const fromContext = typeof payload === 'string' ? payload : payload?.fromContext;

    if (!fromContext) {
      throw new Error('Invalid pong payload');
    }

    // Validate input but keep hex for events/logs
    decodeContextId(fromContext);

    this.counter += 1;

    log(`[xcall] received pong from=${fromContext} counter=${this.counter}`);
    return this.counter;
  }

  @View()
  getCounter(): number {
    log(`[xcall] counter=${this.counter}`);
    return this.counter;
  }

  resetCounter(): number {
    log('[xcall] resetting counter');
    this.counter = 0;
    return this.counter;
  }
}
