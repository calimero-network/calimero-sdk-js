import '../polyfills/text-encoding';

/*
 * Host-backed bridge for the storage CRDT collections.
 *
 * Instead of instantiating `storage-wasm` inside QuickJS (which is not available
 * when the engine runs inside a Wasm sandbox), we route all operations through
 * dedicated host functions. Those host functions execute the original Rust
 * collection logic and expose the same behaviour to JavaScript.
 */

import {
  registerLen,
  readRegister,
  jsCrdtMapNew,
  jsCrdtMapGet,
  jsCrdtMapInsert,
  jsCrdtMapRemove,
  jsCrdtMapContains,
  jsCrdtMapIter,
  jsCrdtVectorNew,
  jsCrdtVectorLen,
  jsCrdtVectorPush,
  jsCrdtVectorGet,
  jsCrdtVectorPop,
  jsCrdtSetNew,
  jsCrdtSetInsert,
  jsCrdtSetContains,
  jsCrdtSetRemove,
  jsCrdtSetLen,
  jsCrdtSetIter,
  jsCrdtSetClear,
  jsCrdtLwwNew,
  jsCrdtLwwSet,
  jsCrdtLwwGet,
  jsCrdtLwwTimestamp,
  jsCrdtCounterNew,
  jsCrdtCounterIncrement,
  jsCrdtCounterValue,
  jsCrdtCounterGetExecutorCount,
  timeNow,
  log
} from '../env/api';
import { DeltaContext } from '../collections/internal/DeltaContext';

const REGISTER_ID = 0n;
const COLLECTION_ID_LENGTH = 32;
const MAP_ENTRY_PREFIX = '__calimero::map::entry::';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

function debug(message: string): void {
  try {
    log(`[storage-wasm] ${message}`);
  } catch (error) {
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log(`[storage-wasm] ${message}`);
    }
  }
}

function readRegisterBytes(): Uint8Array {
  const length = Number(registerLen(REGISTER_ID));
  if (length <= 0) {
    return new Uint8Array(0);
  }

  const buffer = new Uint8Array(length);
  readRegister(REGISTER_ID, buffer);
  return buffer;
}

function decodeError(operation: string): never {
  const messageBytes = readRegisterBytes();
  const message = messageBytes.length ? textDecoder.decode(messageBytes) : 'unknown error';
  throw new Error(`[storage] ${operation} failed: ${message}`);
}

function ensureCollectionId(id: Uint8Array, name: string): void {
  if (!(id instanceof Uint8Array)) {
    throw new TypeError(`${name} must be a Uint8Array`);
  }
  if (id.length !== COLLECTION_ID_LENGTH) {
    throw new TypeError(`${name} must be ${COLLECTION_ID_LENGTH} bytes`);
  }
}

function ensureUint8Array(value: unknown, name: string): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError(`${name} must be a Uint8Array`);
  }
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function buildEntryKey(mapId: Uint8Array, key: Uint8Array): Uint8Array {
  const composite = `${MAP_ENTRY_PREFIX}${bytesToHex(mapId)}:${bytesToHex(key)}`;
  return textEncoder.encode(composite);
}

export function mapNew(): Uint8Array {
  const status = Number(jsCrdtMapNew(REGISTER_ID));
  debug(`mapNew status=${status}`);
  if (status < 0) {
    decodeError('mapNew');
  }

  const id = readRegisterBytes();
  debug(`mapNew id=${bytesToHex(id)}`);
  if (id.length !== COLLECTION_ID_LENGTH) {
    throw new Error(`[storage] mapNew returned invalid map id length (${id.length})`);
  }
  return id;
}

export function mapGet(mapId: Uint8Array, key: Uint8Array): Uint8Array | null {
  ensureCollectionId(mapId, 'mapId');
  ensureUint8Array(key, 'key');

  const status = Number(jsCrdtMapGet(mapId, key, REGISTER_ID));
  debug(`mapGet map=${bytesToHex(mapId)} key=${bytesToHex(key)} status=${status}`);
  if (status < 0) {
    decodeError('mapGet');
  }
  if (status === 0) {
    return null;
  }

  const value = readRegisterBytes();
  debug(`mapGet value=${bytesToHex(value)}`);
  return value;
}

export function mapInsert(mapId: Uint8Array, key: Uint8Array, value: Uint8Array): Uint8Array | null {
  ensureCollectionId(mapId, 'mapId');
  ensureUint8Array(key, 'key');
  ensureUint8Array(value, 'value');

  const status = Number(jsCrdtMapInsert(mapId, key, value, REGISTER_ID));
  debug(`mapInsert map=${bytesToHex(mapId)} key=${bytesToHex(key)} value=${bytesToHex(value)} status=${status}`);
  if (status < 0) {
    decodeError('mapInsert');
  }

  DeltaContext.recordUpdate(buildEntryKey(mapId, key), value, timeNow());

  if (status === 0) {
    return null;
  }

  const previous = readRegisterBytes();
  debug(`mapInsert previous=${bytesToHex(previous)}`);
  return previous;
}

export function mapRemove(mapId: Uint8Array, key: Uint8Array): Uint8Array | null {
  ensureCollectionId(mapId, 'mapId');
  ensureUint8Array(key, 'key');

  const status = Number(jsCrdtMapRemove(mapId, key, REGISTER_ID));
  debug(`mapRemove map=${bytesToHex(mapId)} key=${bytesToHex(key)} status=${status}`);
  if (status < 0) {
    decodeError('mapRemove');
  }

  if (status === 1) {
    DeltaContext.recordRemove(buildEntryKey(mapId, key), timeNow());
    const previous = readRegisterBytes();
    debug(`mapRemove previous=${bytesToHex(previous)}`);
    return previous;
  }

  return null;
}

export function mapContains(mapId: Uint8Array, key: Uint8Array): boolean {
  ensureCollectionId(mapId, 'mapId');
  ensureUint8Array(key, 'key');

  const status = Number(jsCrdtMapContains(mapId, key));
  debug(`mapContains map=${bytesToHex(mapId)} key=${bytesToHex(key)} status=${status}`);
  if (status < 0) {
    decodeError('mapContains');
  }
  return status === 1;
}

export function mapEntries(mapId: Uint8Array): Array<[Uint8Array, Uint8Array]> {
  ensureCollectionId(mapId, 'mapId');

  const status = Number(jsCrdtMapIter(mapId, REGISTER_ID));
  debug(`mapIter map=${bytesToHex(mapId)} status=${status}`);
  if (status < 0) {
    decodeError('mapIter');
  }

  const payload = readRegisterBytes();
  if (payload.length === 0) {
    return [];
  }
  if (payload.length < 4) {
    throw new Error('[storage] mapIter payload too small');
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let offset = 0;
  const count = view.getUint32(offset, true);
  offset += 4;

  const entries: Array<[Uint8Array, Uint8Array]> = [];
  for (let index = 0; index < count; index += 1) {
    if (offset + 4 > payload.length) {
      throw new Error('[storage] mapIter payload truncated (key length)');
    }
    const keyLen = view.getUint32(offset, true);
    offset += 4;
    const keyEnd = offset + keyLen;
    if (keyEnd > payload.length) {
      throw new Error('[storage] mapIter payload truncated (key bytes)');
    }
    const keyBytes = payload.slice(offset, keyEnd);
    offset = keyEnd;

    if (offset + 4 > payload.length) {
      throw new Error('[storage] mapIter payload truncated (value length)');
    }
    const valueLen = view.getUint32(offset, true);
    offset += 4;
    const valueEnd = offset + valueLen;
    if (valueEnd > payload.length) {
      throw new Error('[storage] mapIter payload truncated (value bytes)');
    }
    const valueBytes = payload.slice(offset, valueEnd);
    offset = valueEnd;

    entries.push([keyBytes, valueBytes]);
  }

  if (offset !== payload.length) {
    throw new Error('[storage] mapIter payload has trailing bytes');
  }

  return entries;
}

function readBigUint64(): bigint {
  const bytes = readRegisterBytes();
  if (bytes.length === 0) {
    return 0n;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getBigUint64(0, true);
}

function readTimestampPayload(): { time: bigint; node: Uint8Array } {
  const bytes = readRegisterBytes();
  if (bytes.length !== 24) {
    throw new Error(`[storage] lwwTimestamp returned invalid payload length (${bytes.length})`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const time = view.getBigUint64(0, true);
  const node = bytes.slice(8);
  return { time, node };
}

export function vectorNew(): Uint8Array {
  const status = Number(jsCrdtVectorNew(REGISTER_ID));
  debug(`vectorNew status=${status}`);
  if (status < 0) {
    decodeError('vectorNew');
  }

  const id = readRegisterBytes();
  debug(`vectorNew id=${bytesToHex(id)}`);
  if (id.length !== COLLECTION_ID_LENGTH) {
    throw new Error(`[storage] vectorNew returned invalid id length (${id.length})`);
  }
  return id;
}

export function vectorLen(vectorId: Uint8Array): number {
  ensureCollectionId(vectorId, 'vectorId');

  const status = Number(jsCrdtVectorLen(vectorId, REGISTER_ID));
  debug(`vectorLen id=${bytesToHex(vectorId)} status=${status}`);
  if (status < 0) {
    decodeError('vectorLen');
  }

  return Number(readBigUint64());
}

export function vectorPush(vectorId: Uint8Array, value: Uint8Array): void {
  ensureCollectionId(vectorId, 'vectorId');
  ensureUint8Array(value, 'value');

  const status = Number(jsCrdtVectorPush(vectorId, value));
  debug(`vectorPush id=${bytesToHex(vectorId)} value=${bytesToHex(value)} status=${status}`);
  if (status < 0) {
    decodeError('vectorPush');
  }
}

export function vectorGet(vectorId: Uint8Array, index: number): Uint8Array | null {
  ensureCollectionId(vectorId, 'vectorId');
  if (!Number.isInteger(index) || index < 0) {
    throw new TypeError('index must be a non-negative integer');
  }

  const status = Number(jsCrdtVectorGet(vectorId, BigInt(index), REGISTER_ID));
  debug(`vectorGet id=${bytesToHex(vectorId)} index=${index} status=${status}`);
  if (status < 0) {
    decodeError('vectorGet');
  }
  if (status === 0) {
    return null;
  }

  return readRegisterBytes();
}

export function vectorPop(vectorId: Uint8Array): Uint8Array | null {
  ensureCollectionId(vectorId, 'vectorId');

  const status = Number(jsCrdtVectorPop(vectorId, REGISTER_ID));
  debug(`vectorPop id=${bytesToHex(vectorId)} status=${status}`);
  if (status < 0) {
    decodeError('vectorPop');
  }
  if (status === 0) {
    return null;
  }

  return readRegisterBytes();
}

export function setNew(): Uint8Array {
  const status = Number(jsCrdtSetNew(REGISTER_ID));
  debug(`setNew status=${status}`);
  if (status < 0) {
    decodeError('setNew');
  }

  const id = readRegisterBytes();
  debug(`setNew id=${bytesToHex(id)}`);
  if (id.length !== COLLECTION_ID_LENGTH) {
    throw new Error(`[storage] setNew returned invalid id length (${id.length})`);
  }
  return id;
}

export function setInsert(setId: Uint8Array, value: Uint8Array): boolean {
  ensureCollectionId(setId, 'setId');
  ensureUint8Array(value, 'value');

  const status = Number(jsCrdtSetInsert(setId, value));
  debug(`setInsert id=${bytesToHex(setId)} value=${bytesToHex(value)} status=${status}`);
  if (status < 0) {
    decodeError('setInsert');
  }
  return status === 1;
}

export function setContains(setId: Uint8Array, value: Uint8Array): boolean {
  ensureCollectionId(setId, 'setId');
  ensureUint8Array(value, 'value');

  const status = Number(jsCrdtSetContains(setId, value));
  debug(`setContains id=${bytesToHex(setId)} value=${bytesToHex(value)} status=${status}`);
  if (status < 0) {
    decodeError('setContains');
  }
  return status === 1;
}

export function setRemove(setId: Uint8Array, value: Uint8Array): boolean {
  ensureCollectionId(setId, 'setId');
  ensureUint8Array(value, 'value');

  const status = Number(jsCrdtSetRemove(setId, value));
  debug(`setRemove id=${bytesToHex(setId)} value=${bytesToHex(value)} status=${status}`);
  if (status < 0) {
    decodeError('setRemove');
  }
  return status === 1;
}

export function setLen(setId: Uint8Array): number {
  ensureCollectionId(setId, 'setId');

  const status = Number(jsCrdtSetLen(setId, REGISTER_ID));
  debug(`setLen id=${bytesToHex(setId)} status=${status}`);
  if (status < 0) {
    decodeError('setLen');
  }

  return Number(readBigUint64());
}

export function setValues(setId: Uint8Array): Uint8Array[] {
  ensureCollectionId(setId, 'setId');

  const status = Number(jsCrdtSetIter(setId, REGISTER_ID));
  debug(`setIter id=${bytesToHex(setId)} status=${status}`);
  if (status < 0) {
    decodeError('setIter');
  }

  const payload = readRegisterBytes();
  if (payload.length === 0) {
    return [];
  }
  if (payload.length < 4) {
    throw new Error('[storage] setIter payload too small');
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let offset = 0;
  const count = view.getUint32(offset, true);
  offset += 4;

  const values: Uint8Array[] = [];
  for (let index = 0; index < count; index += 1) {
    if (offset + 4 > payload.length) {
      throw new Error('[storage] setIter payload truncated (length header)');
    }

    const valueLen = view.getUint32(offset, true);
    offset += 4;
    const end = offset + valueLen;
    if (end > payload.length) {
      throw new Error('[storage] setIter payload truncated (value bytes)');
    }

    values.push(payload.slice(offset, end));
    offset = end;
  }

  if (offset !== payload.length) {
    throw new Error('[storage] setIter payload has trailing bytes');
  }

  return values;
}

export function setClear(setId: Uint8Array): void {
  ensureCollectionId(setId, 'setId');

  const status = Number(jsCrdtSetClear(setId));
  debug(`setClear id=${bytesToHex(setId)} status=${status}`);
  if (status < 0) {
    decodeError('setClear');
  }
}

export function lwwNew(): Uint8Array {
  const status = Number(jsCrdtLwwNew(REGISTER_ID));
  debug(`lwwNew status=${status}`);
  if (status < 0) {
    decodeError('lwwNew');
  }

  const id = readRegisterBytes();
  debug(`lwwNew id=${bytesToHex(id)}`);
  if (id.length !== COLLECTION_ID_LENGTH) {
    throw new Error(`[storage] lwwNew returned invalid id length (${id.length})`);
  }
  return id;
}

export function lwwSet(registerId: Uint8Array, value: Uint8Array | null): void {
  ensureCollectionId(registerId, 'registerId');
  if (value !== null) {
    ensureUint8Array(value, 'value');
  }

  const status = Number(jsCrdtLwwSet(registerId, value));
  debug(`lwwSet id=${bytesToHex(registerId)} value=${value ? bytesToHex(value) : '<null>'} status=${status}`);
  if (status < 0) {
    decodeError('lwwSet');
  }
}

export function lwwGet(registerId: Uint8Array): Uint8Array | null {
  ensureCollectionId(registerId, 'registerId');

  const status = Number(jsCrdtLwwGet(registerId, REGISTER_ID));
  debug(`lwwGet id=${bytesToHex(registerId)} status=${status}`);
  if (status < 0) {
    decodeError('lwwGet');
  }
  if (status === 0) {
    return null;
  }

  return readRegisterBytes();
}

export function lwwTimestamp(registerId: Uint8Array): { time: bigint; node: Uint8Array } | null {
  ensureCollectionId(registerId, 'registerId');

  const status = Number(jsCrdtLwwTimestamp(registerId, REGISTER_ID));
  debug(`lwwTimestamp id=${bytesToHex(registerId)} status=${status}`);
  if (status < 0) {
    decodeError('lwwTimestamp');
  }
  if (status === 0) {
    return null;
  }

  return readTimestampPayload();
}

export function counterNew(): Uint8Array {
  const status = Number(jsCrdtCounterNew(REGISTER_ID));
  debug(`counterNew status=${status}`);
  if (status < 0) {
    decodeError('counterNew');
  }

  const id = readRegisterBytes();
  debug(`counterNew id=${bytesToHex(id)}`);
  if (id.length !== COLLECTION_ID_LENGTH) {
    throw new Error(`[storage] counterNew returned invalid id length (${id.length})`);
  }
  return id;
}

export function counterIncrement(counterId: Uint8Array): void {
  ensureCollectionId(counterId, 'counterId');

  const status = Number(jsCrdtCounterIncrement(counterId));
  debug(`counterIncrement id=${bytesToHex(counterId)} status=${status}`);
  if (status < 0) {
    decodeError('counterIncrement');
  }
}

export function counterValue(counterId: Uint8Array): bigint {
  ensureCollectionId(counterId, 'counterId');

  const status = Number(jsCrdtCounterValue(counterId, REGISTER_ID));
  debug(`counterValue id=${bytesToHex(counterId)} status=${status}`);
  if (status < 0) {
    decodeError('counterValue');
  }

  return readBigUint64();
}

export function counterGetExecutorCount(counterId: Uint8Array, executorId?: Uint8Array): bigint {
  ensureCollectionId(counterId, 'counterId');
  if (executorId !== undefined && executorId !== null) {
    ensureUint8Array(executorId, 'executorId');
  }

  const status = Number(
    jsCrdtCounterGetExecutorCount(counterId, REGISTER_ID, executorId ?? undefined)
  );
  debug(`counterGetExecutorCount id=${bytesToHex(counterId)} executor=${executorId ? bytesToHex(executorId) : '<default>'} status=${status}`);
  if (status < 0) {
    decodeError('counterGetExecutorCount');
  }

  return readBigUint64();
}


