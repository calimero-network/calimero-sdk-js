import { applyStorageDelta, input, registerLen, readRegister, log } from '../env/api';

const REGISTER_ID = 0n;

function readDeltaPayload(): Uint8Array {
  input(REGISTER_ID);
  const length = Number(registerLen(REGISTER_ID));
  if (!Number.isFinite(length) || length <= 0) {
    return new Uint8Array(0);
  }

  const buffer = new Uint8Array(length);
  readRegister(REGISTER_ID, buffer);
  return buffer;
}

function handleSyncNext(): void {
  try {
    const payload = readDeltaPayload();
    if (payload.length === 0) {
      return;
    }

    applyStorageDelta(payload);
  } catch (error) {
    log(`[sync] __calimero_sync_next error=${String(error)}`);
    throw error;
  }
}

(globalThis as any).__calimero_sync_next = handleSyncNext;
