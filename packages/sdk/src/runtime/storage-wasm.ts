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
  jsCrdtMapNewWithId,
  jsCrdtVectorNewWithId,
  jsCrdtSetNewWithId,
  jsCrdtLwwNewWithId,
  jsCrdtCounterNewWithId,
  jsUserStorageNewWithId,
  jsFrozenStorageNewWithId,
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
  jsCrdtPncounterNew,
  jsCrdtPncounterNewWithId,
  jsCrdtPncounterIncrement,
  jsCrdtPncounterDecrement,
  jsCrdtPncounterValue,
  jsCrdtPncounterGetExecutorCount,
  jsCrdtRgaNew,
  jsCrdtRgaNewWithId,
  jsCrdtRgaInsert,
  jsCrdtRgaDelete,
  jsCrdtRgaGetText,
  jsCrdtRgaLen,
  jsCrdtSortedMapNew,
  jsCrdtSortedMapNewWithId,
  jsCrdtSortedMapGet,
  jsCrdtSortedMapInsert,
  jsCrdtSortedMapRemove,
  jsCrdtSortedMapContains,
  jsCrdtSortedMapIter,
  jsCrdtSortedSetNew,
  jsCrdtSortedSetNewWithId,
  jsCrdtSortedSetInsert,
  jsCrdtSortedSetContains,
  jsCrdtSortedSetRemove,
  jsCrdtSortedSetLen,
  jsCrdtSortedSetIter,
  jsCrdtSortedSetClear,
  jsUserStorageNew,
  jsUserStorageInsert,
  jsUserStorageGet,
  jsUserStorageGetForUser,
  jsUserStorageRemove,
  jsUserStorageContains,
  jsUserStorageContainsUser,
  jsFrozenStorageNew,
  jsFrozenStorageAdd,
  jsFrozenStorageGet,
  jsFrozenStorageContains,
} from '../env/api';

const REGISTER_ID = 0n;
const COLLECTION_ID_LENGTH = 32;
const textDecoder = new TextDecoder();

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

// Removed unused function bytesToHex

export function mapNew(): Uint8Array {
  const status = Number(jsCrdtMapNew(REGISTER_ID));
  if (status < 0) {
    decodeError('mapNew');
  }

  const id = readRegisterBytes();
  if (id.length !== COLLECTION_ID_LENGTH) {
    throw new Error(`[storage] mapNew returned invalid map id length (${id.length})`);
  }
  return id;
}

// --- Deterministic-id constructors ---------------------------------------
//
// These create a collection *at a caller-supplied 32-byte id* via the host
// `*_new_with_id` functions. Used for concurrent-writer convergence so two
// nodes address the same entity for the same logical state field.

function newCollectionWithId(
  id: Uint8Array,
  call: (id: Uint8Array, register: bigint) => number,
  operation: string
): Uint8Array {
  ensureCollectionId(id, `${operation}.id`);
  const status = Number(call(id, REGISTER_ID));
  if (status < 0) {
    decodeError(operation);
  }
  const returnedId = readRegisterBytes();
  if (returnedId.length !== COLLECTION_ID_LENGTH) {
    throw new Error(`[storage] ${operation} returned invalid id length (${returnedId.length})`);
  }
  return returnedId;
}

export function mapNewWithId(id: Uint8Array): Uint8Array {
  return newCollectionWithId(id, jsCrdtMapNewWithId, 'mapNewWithId');
}

export function vectorNewWithId(id: Uint8Array): Uint8Array {
  return newCollectionWithId(id, jsCrdtVectorNewWithId, 'vectorNewWithId');
}

export function setNewWithId(id: Uint8Array): Uint8Array {
  return newCollectionWithId(id, jsCrdtSetNewWithId, 'setNewWithId');
}

export function lwwNewWithId(id: Uint8Array): Uint8Array {
  return newCollectionWithId(id, jsCrdtLwwNewWithId, 'lwwNewWithId');
}

export function counterNewWithId(id: Uint8Array): Uint8Array {
  return newCollectionWithId(id, jsCrdtCounterNewWithId, 'counterNewWithId');
}

export function pncounterNewWithId(id: Uint8Array): Uint8Array {
  return newCollectionWithId(id, jsCrdtPncounterNewWithId, 'pncounterNewWithId');
}

export function rgaNewWithId(id: Uint8Array): Uint8Array {
  return newCollectionWithId(id, jsCrdtRgaNewWithId, 'rgaNewWithId');
}

export function sortedMapNewWithId(id: Uint8Array): Uint8Array {
  return newCollectionWithId(id, jsCrdtSortedMapNewWithId, 'sortedMapNewWithId');
}

export function sortedSetNewWithId(id: Uint8Array): Uint8Array {
  return newCollectionWithId(id, jsCrdtSortedSetNewWithId, 'sortedSetNewWithId');
}

export function userStorageNewWithId(id: Uint8Array): Uint8Array {
  return newCollectionWithId(id, jsUserStorageNewWithId, 'userStorageNewWithId');
}

export function frozenStorageNewWithId(id: Uint8Array): Uint8Array {
  return newCollectionWithId(id, jsFrozenStorageNewWithId, 'frozenStorageNewWithId');
}

export function mapGet(mapId: Uint8Array, key: Uint8Array): Uint8Array | null {
  ensureCollectionId(mapId, 'mapId');
  ensureUint8Array(key, 'key');

  const status = Number(jsCrdtMapGet(mapId, key, REGISTER_ID));
  if (status < 0) {
    decodeError('mapGet');
  }
  if (status === 0) {
    return null;
  }

  const value = readRegisterBytes();
  return value;
}

export function mapInsert(
  mapId: Uint8Array,
  key: Uint8Array,
  value: Uint8Array
): Uint8Array | null {
  ensureCollectionId(mapId, 'mapId');
  ensureUint8Array(key, 'key');
  ensureUint8Array(value, 'value');

  const status = Number(jsCrdtMapInsert(mapId, key, value, REGISTER_ID));
  if (status < 0) {
    decodeError('mapInsert');
  }

  if (status === 0) {
    return null;
  }

  const previous = readRegisterBytes();
  return previous;
}

export function mapRemove(mapId: Uint8Array, key: Uint8Array): Uint8Array | null {
  ensureCollectionId(mapId, 'mapId');
  ensureUint8Array(key, 'key');

  const status = Number(jsCrdtMapRemove(mapId, key, REGISTER_ID));
  if (status < 0) {
    decodeError('mapRemove');
  }

  if (status === 1) {
    const previous = readRegisterBytes();
    return previous;
  }

  return null;
}

export function mapContains(mapId: Uint8Array, key: Uint8Array): boolean {
  ensureCollectionId(mapId, 'mapId');
  ensureUint8Array(key, 'key');

  const status = Number(jsCrdtMapContains(mapId, key));
  if (status < 0) {
    decodeError('mapContains');
  }
  return status === 1;
}

export function mapEntries(mapId: Uint8Array): Array<[Uint8Array, Uint8Array]> {
  ensureCollectionId(mapId, 'mapId');

  const status = Number(jsCrdtMapIter(mapId, REGISTER_ID));
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

function readBigInt64(): bigint {
  const bytes = readRegisterBytes();
  if (bytes.length === 0) {
    return 0n;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getBigInt64(0, true);
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
  if (status < 0) {
    decodeError('vectorNew');
  }

  const id = readRegisterBytes();
  if (id.length !== COLLECTION_ID_LENGTH) {
    throw new Error(`[storage] vectorNew returned invalid id length (${id.length})`);
  }
  return id;
}

export function vectorLen(vectorId: Uint8Array): number {
  ensureCollectionId(vectorId, 'vectorId');

  const status = Number(jsCrdtVectorLen(vectorId, REGISTER_ID));
  if (status < 0) {
    decodeError('vectorLen');
  }

  return Number(readBigUint64());
}

export function vectorPush(vectorId: Uint8Array, value: Uint8Array): void {
  ensureCollectionId(vectorId, 'vectorId');
  ensureUint8Array(value, 'value');

  const status = Number(jsCrdtVectorPush(vectorId, value));
  if (status < 0) {
    decodeError('vectorPush');
  }
}

export function vectorGet(
  vectorId: Uint8Array,
  index: number,
  register: bigint
): Uint8Array | null {
  ensureCollectionId(vectorId, 'vectorId');
  if (!Number.isInteger(index) || index < 0) {
    throw new TypeError('index must be a non-negative integer');
  }

  const status = Number(jsCrdtVectorGet(vectorId, index, register));
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
  if (status < 0) {
    decodeError('setNew');
  }

  const id = readRegisterBytes();
  if (id.length !== COLLECTION_ID_LENGTH) {
    throw new Error(`[storage] setNew returned invalid id length (${id.length})`);
  }
  return id;
}

export function setInsert(setId: Uint8Array, value: Uint8Array): boolean {
  ensureCollectionId(setId, 'setId');
  ensureUint8Array(value, 'value');

  const status = Number(jsCrdtSetInsert(setId, value));
  if (status < 0) {
    decodeError('setInsert');
  }
  return status === 1;
}

export function setContains(setId: Uint8Array, value: Uint8Array): boolean {
  ensureCollectionId(setId, 'setId');
  ensureUint8Array(value, 'value');

  const status = Number(jsCrdtSetContains(setId, value));
  if (status < 0) {
    decodeError('setContains');
  }
  return status === 1;
}

export function setRemove(setId: Uint8Array, value: Uint8Array): boolean {
  ensureCollectionId(setId, 'setId');
  ensureUint8Array(value, 'value');

  const status = Number(jsCrdtSetRemove(setId, value));
  if (status < 0) {
    decodeError('setRemove');
  }
  return status === 1;
}

export function setLen(setId: Uint8Array): number {
  ensureCollectionId(setId, 'setId');

  const status = Number(jsCrdtSetLen(setId, REGISTER_ID));
  if (status < 0) {
    decodeError('setLen');
  }

  return Number(readBigUint64());
}

export function setValues(setId: Uint8Array): Uint8Array[] {
  ensureCollectionId(setId, 'setId');

  const status = Number(jsCrdtSetIter(setId, REGISTER_ID));
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
  if (status < 0) {
    decodeError('setClear');
  }
}

export function lwwNew(): Uint8Array {
  const status = Number(jsCrdtLwwNew(REGISTER_ID));
  if (status < 0) {
    decodeError('lwwNew');
  }

  const id = readRegisterBytes();
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
  if (status < 0) {
    decodeError('lwwSet');
  }
}

export function lwwGet(registerId: Uint8Array): Uint8Array | null {
  ensureCollectionId(registerId, 'registerId');

  const status = Number(jsCrdtLwwGet(registerId, REGISTER_ID));
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
  if (status < 0) {
    decodeError('counterNew');
  }

  const id = readRegisterBytes();
  if (id.length !== COLLECTION_ID_LENGTH) {
    throw new Error(`[storage] counterNew returned invalid id length (${id.length})`);
  }
  return id;
}

export function counterIncrement(counterId: Uint8Array): void {
  ensureCollectionId(counterId, 'counterId');

  const status = Number(jsCrdtCounterIncrement(counterId));
  if (status < 0) {
    decodeError('counterIncrement');
  }
}

export function counterValue(counterId: Uint8Array): bigint {
  ensureCollectionId(counterId, 'counterId');

  const status = Number(jsCrdtCounterValue(counterId, REGISTER_ID));
  if (status < 0) {
    decodeError('counterValue');
  }

  const value = readBigUint64();
  return value;
}

export function counterGetExecutorCount(counterId: Uint8Array, executorId?: Uint8Array): bigint {
  ensureCollectionId(counterId, 'counterId');
  if (executorId !== undefined && executorId !== null) {
    ensureUint8Array(executorId, 'executorId');
  }

  const status = Number(
    jsCrdtCounterGetExecutorCount(counterId, REGISTER_ID, executorId ?? undefined)
  );
  if (status < 0) {
    decodeError('counterGetExecutorCount');
  }

  const value = readBigUint64();
  return value;
}

// PNCounter functions (signed PN-Counter)

export function pncounterNew(): Uint8Array {
  const status = Number(jsCrdtPncounterNew(REGISTER_ID));
  if (status < 0) {
    decodeError('pncounterNew');
  }

  const id = readRegisterBytes();
  if (id.length !== COLLECTION_ID_LENGTH) {
    throw new Error(`[storage] pncounterNew returned invalid id length (${id.length})`);
  }
  return id;
}

export function pncounterIncrement(counterId: Uint8Array): void {
  ensureCollectionId(counterId, 'counterId');

  const status = Number(jsCrdtPncounterIncrement(counterId));
  if (status < 0) {
    decodeError('pncounterIncrement');
  }
}

export function pncounterDecrement(counterId: Uint8Array): void {
  ensureCollectionId(counterId, 'counterId');

  const status = Number(jsCrdtPncounterDecrement(counterId));
  if (status < 0) {
    decodeError('pncounterDecrement');
  }
}

export function pncounterValue(counterId: Uint8Array): bigint {
  ensureCollectionId(counterId, 'counterId');

  const status = Number(jsCrdtPncounterValue(counterId, REGISTER_ID));
  if (status < 0) {
    decodeError('pncounterValue');
  }

  // PN-Counter values are signed (increments minus decrements).
  return readBigInt64();
}

export function pncounterGetExecutorCount(counterId: Uint8Array, executorId?: Uint8Array): bigint {
  ensureCollectionId(counterId, 'counterId');
  if (executorId !== undefined && executorId !== null) {
    ensureUint8Array(executorId, 'executorId');
  }

  const status = Number(
    jsCrdtPncounterGetExecutorCount(counterId, REGISTER_ID, executorId ?? undefined)
  );
  if (status < 0) {
    decodeError('pncounterGetExecutorCount');
  }

  // Per-executor net (positive - negative) is signed.
  return readBigInt64();
}

// RGA functions (replicated growable array / text)

export function rgaNew(): Uint8Array {
  const status = Number(jsCrdtRgaNew(REGISTER_ID));
  if (status < 0) {
    decodeError('rgaNew');
  }

  const id = readRegisterBytes();
  if (id.length !== COLLECTION_ID_LENGTH) {
    throw new Error(`[storage] rgaNew returned invalid id length (${id.length})`);
  }
  return id;
}

export function rgaInsert(rgaId: Uint8Array, index: number, value: Uint8Array): void {
  ensureCollectionId(rgaId, 'rgaId');
  ensureUint8Array(value, 'value');
  if (!Number.isInteger(index) || index < 0) {
    throw new TypeError('index must be a non-negative integer');
  }

  const status = Number(jsCrdtRgaInsert(rgaId, index, value));
  if (status < 0) {
    decodeError('rgaInsert');
  }
}

export function rgaDelete(rgaId: Uint8Array, index: number): void {
  ensureCollectionId(rgaId, 'rgaId');
  if (!Number.isInteger(index) || index < 0) {
    throw new TypeError('index must be a non-negative integer');
  }

  const status = Number(jsCrdtRgaDelete(rgaId, index));
  if (status < 0) {
    decodeError('rgaDelete');
  }
}

export function rgaGetText(rgaId: Uint8Array): Uint8Array {
  ensureCollectionId(rgaId, 'rgaId');

  const status = Number(jsCrdtRgaGetText(rgaId, REGISTER_ID));
  if (status < 0) {
    decodeError('rgaGetText');
  }

  return readRegisterBytes();
}

export function rgaLen(rgaId: Uint8Array): number {
  ensureCollectionId(rgaId, 'rgaId');

  const status = Number(jsCrdtRgaLen(rgaId, REGISTER_ID));
  if (status < 0) {
    decodeError('rgaLen');
  }

  return Number(readBigUint64());
}

// SortedMap functions (ordered iteration; same API as UnorderedMap)

export function sortedMapNew(): Uint8Array {
  const status = Number(jsCrdtSortedMapNew(REGISTER_ID));
  if (status < 0) {
    decodeError('sortedMapNew');
  }

  const id = readRegisterBytes();
  if (id.length !== COLLECTION_ID_LENGTH) {
    throw new Error(`[storage] sortedMapNew returned invalid id length (${id.length})`);
  }
  return id;
}

export function sortedMapGet(mapId: Uint8Array, key: Uint8Array): Uint8Array | null {
  ensureCollectionId(mapId, 'mapId');
  ensureUint8Array(key, 'key');

  const status = Number(jsCrdtSortedMapGet(mapId, key, REGISTER_ID));
  if (status < 0) {
    decodeError('sortedMapGet');
  }
  if (status === 0) {
    return null;
  }

  return readRegisterBytes();
}

export function sortedMapInsert(
  mapId: Uint8Array,
  key: Uint8Array,
  value: Uint8Array
): Uint8Array | null {
  ensureCollectionId(mapId, 'mapId');
  ensureUint8Array(key, 'key');
  ensureUint8Array(value, 'value');

  const status = Number(jsCrdtSortedMapInsert(mapId, key, value, REGISTER_ID));
  if (status < 0) {
    decodeError('sortedMapInsert');
  }

  if (status === 0) {
    return null;
  }

  return readRegisterBytes();
}

export function sortedMapRemove(mapId: Uint8Array, key: Uint8Array): Uint8Array | null {
  ensureCollectionId(mapId, 'mapId');
  ensureUint8Array(key, 'key');

  const status = Number(jsCrdtSortedMapRemove(mapId, key, REGISTER_ID));
  if (status < 0) {
    decodeError('sortedMapRemove');
  }

  if (status === 1) {
    return readRegisterBytes();
  }

  return null;
}

export function sortedMapContains(mapId: Uint8Array, key: Uint8Array): boolean {
  ensureCollectionId(mapId, 'mapId');
  ensureUint8Array(key, 'key');

  const status = Number(jsCrdtSortedMapContains(mapId, key));
  if (status < 0) {
    decodeError('sortedMapContains');
  }
  return status === 1;
}

export function sortedMapEntries(mapId: Uint8Array): Array<[Uint8Array, Uint8Array]> {
  ensureCollectionId(mapId, 'mapId');

  const status = Number(jsCrdtSortedMapIter(mapId, REGISTER_ID));
  if (status < 0) {
    decodeError('sortedMapIter');
  }

  const payload = readRegisterBytes();
  if (payload.length === 0) {
    return [];
  }
  if (payload.length < 4) {
    throw new Error('[storage] sortedMapIter payload too small');
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let offset = 0;
  const count = view.getUint32(offset, true);
  offset += 4;

  const entries: Array<[Uint8Array, Uint8Array]> = [];
  for (let index = 0; index < count; index += 1) {
    if (offset + 4 > payload.length) {
      throw new Error('[storage] sortedMapIter payload truncated (key length)');
    }
    const keyLen = view.getUint32(offset, true);
    offset += 4;
    const keyEnd = offset + keyLen;
    if (keyEnd > payload.length) {
      throw new Error('[storage] sortedMapIter payload truncated (key bytes)');
    }
    const keyBytes = payload.slice(offset, keyEnd);
    offset = keyEnd;

    if (offset + 4 > payload.length) {
      throw new Error('[storage] sortedMapIter payload truncated (value length)');
    }
    const valueLen = view.getUint32(offset, true);
    offset += 4;
    const valueEnd = offset + valueLen;
    if (valueEnd > payload.length) {
      throw new Error('[storage] sortedMapIter payload truncated (value bytes)');
    }
    const valueBytes = payload.slice(offset, valueEnd);
    offset = valueEnd;

    entries.push([keyBytes, valueBytes]);
  }

  if (offset !== payload.length) {
    throw new Error('[storage] sortedMapIter payload has trailing bytes');
  }

  return entries;
}

// SortedSet functions (ordered iteration; same API as UnorderedSet)

export function sortedSetNew(): Uint8Array {
  const status = Number(jsCrdtSortedSetNew(REGISTER_ID));
  if (status < 0) {
    decodeError('sortedSetNew');
  }

  const id = readRegisterBytes();
  if (id.length !== COLLECTION_ID_LENGTH) {
    throw new Error(`[storage] sortedSetNew returned invalid id length (${id.length})`);
  }
  return id;
}

export function sortedSetInsert(setId: Uint8Array, value: Uint8Array): boolean {
  ensureCollectionId(setId, 'setId');
  ensureUint8Array(value, 'value');

  const status = Number(jsCrdtSortedSetInsert(setId, value));
  if (status < 0) {
    decodeError('sortedSetInsert');
  }
  return status === 1;
}

export function sortedSetContains(setId: Uint8Array, value: Uint8Array): boolean {
  ensureCollectionId(setId, 'setId');
  ensureUint8Array(value, 'value');

  const status = Number(jsCrdtSortedSetContains(setId, value));
  if (status < 0) {
    decodeError('sortedSetContains');
  }
  return status === 1;
}

export function sortedSetRemove(setId: Uint8Array, value: Uint8Array): boolean {
  ensureCollectionId(setId, 'setId');
  ensureUint8Array(value, 'value');

  const status = Number(jsCrdtSortedSetRemove(setId, value));
  if (status < 0) {
    decodeError('sortedSetRemove');
  }
  return status === 1;
}

export function sortedSetLen(setId: Uint8Array): number {
  ensureCollectionId(setId, 'setId');

  const status = Number(jsCrdtSortedSetLen(setId, REGISTER_ID));
  if (status < 0) {
    decodeError('sortedSetLen');
  }

  return Number(readBigUint64());
}

export function sortedSetValues(setId: Uint8Array): Uint8Array[] {
  ensureCollectionId(setId, 'setId');

  const status = Number(jsCrdtSortedSetIter(setId, REGISTER_ID));
  if (status < 0) {
    decodeError('sortedSetIter');
  }

  const payload = readRegisterBytes();
  if (payload.length === 0) {
    return [];
  }
  if (payload.length < 4) {
    throw new Error('[storage] sortedSetIter payload too small');
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let offset = 0;
  const count = view.getUint32(offset, true);
  offset += 4;

  const values: Uint8Array[] = [];
  for (let index = 0; index < count; index += 1) {
    if (offset + 4 > payload.length) {
      throw new Error('[storage] sortedSetIter payload truncated (length header)');
    }

    const valueLen = view.getUint32(offset, true);
    offset += 4;
    const end = offset + valueLen;
    if (end > payload.length) {
      throw new Error('[storage] sortedSetIter payload truncated (value bytes)');
    }

    values.push(payload.slice(offset, end));
    offset = end;
  }

  if (offset !== payload.length) {
    throw new Error('[storage] sortedSetIter payload has trailing bytes');
  }

  return values;
}

export function sortedSetClear(setId: Uint8Array): void {
  ensureCollectionId(setId, 'setId');

  const status = Number(jsCrdtSortedSetClear(setId));
  if (status < 0) {
    decodeError('sortedSetClear');
  }
}

// UserStorage functions

export function userStorageNew(): Uint8Array {
  const status = Number(jsUserStorageNew(REGISTER_ID));
  if (status < 0) {
    decodeError('userStorageNew');
  }

  const id = readRegisterBytes();
  if (id.length !== COLLECTION_ID_LENGTH) {
    throw new Error(`[storage] userStorageNew returned invalid id length (${id.length})`);
  }
  return id;
}

export function userStorageInsert(storageId: Uint8Array, value: Uint8Array): Uint8Array | null {
  ensureCollectionId(storageId, 'storageId');
  ensureUint8Array(value, 'value');

  const status = Number(jsUserStorageInsert(storageId, value, REGISTER_ID));
  if (status < 0) {
    decodeError('userStorageInsert');
  }

  if (status === 0) {
    return null;
  }

  const previous = readRegisterBytes();
  return previous;
}

export function userStorageGet(storageId: Uint8Array): Uint8Array | null {
  ensureCollectionId(storageId, 'storageId');

  const status = Number(jsUserStorageGet(storageId, REGISTER_ID));
  if (status < 0) {
    decodeError('userStorageGet');
  }
  if (status === 0) {
    return null;
  }

  const value = readRegisterBytes();
  return value;
}

export function userStorageGetForUser(
  storageId: Uint8Array,
  userKey: Uint8Array
): Uint8Array | null {
  ensureCollectionId(storageId, 'storageId');
  ensureUint8Array(userKey, 'userKey');
  if (userKey.length !== 32) {
    throw new TypeError('userKey must be 32 bytes');
  }

  const status = Number(jsUserStorageGetForUser(storageId, userKey, REGISTER_ID));
  if (status < 0) {
    decodeError('userStorageGetForUser');
  }
  if (status === 0) {
    return null;
  }

  const value = readRegisterBytes();
  return value;
}

export function userStorageRemove(storageId: Uint8Array): Uint8Array | null {
  ensureCollectionId(storageId, 'storageId');

  const status = Number(jsUserStorageRemove(storageId, REGISTER_ID));
  if (status < 0) {
    decodeError('userStorageRemove');
  }

  if (status === 1) {
    const previous = readRegisterBytes();
    return previous;
  }

  return null;
}

export function userStorageContains(storageId: Uint8Array): boolean {
  ensureCollectionId(storageId, 'storageId');

  const status = Number(jsUserStorageContains(storageId));
  if (status < 0) {
    decodeError('userStorageContains');
  }

  return status === 1;
}

export function userStorageContainsUser(storageId: Uint8Array, userKey: Uint8Array): boolean {
  ensureCollectionId(storageId, 'storageId');
  ensureUint8Array(userKey, 'userKey');
  if (userKey.length !== 32) {
    throw new TypeError('userKey must be 32 bytes');
  }

  const status = Number(jsUserStorageContainsUser(storageId, userKey));
  if (status < 0) {
    decodeError('userStorageContainsUser');
  }

  return status === 1;
}

// FrozenStorage functions

export function frozenStorageNew(): Uint8Array {
  const status = Number(jsFrozenStorageNew(REGISTER_ID));
  if (status < 0) {
    decodeError('frozenStorageNew');
  }

  const id = readRegisterBytes();
  if (id.length !== COLLECTION_ID_LENGTH) {
    throw new Error(`[storage] frozenStorageNew returned invalid id length (${id.length})`);
  }
  return id;
}

export function frozenStorageAdd(storageId: Uint8Array, value: Uint8Array): Uint8Array {
  ensureCollectionId(storageId, 'storageId');
  ensureUint8Array(value, 'value');

  const status = Number(jsFrozenStorageAdd(storageId, value, REGISTER_ID));
  if (status < 0) {
    decodeError('frozenStorageAdd');
  }

  // The hash is returned in the register
  const hash = readRegisterBytes();
  if (hash.length !== 32) {
    throw new Error(`[storage] frozenStorageAdd returned invalid hash length (${hash.length})`);
  }
  return hash;
}

export function frozenStorageGet(storageId: Uint8Array, hash: Uint8Array): Uint8Array | null {
  ensureCollectionId(storageId, 'storageId');
  ensureUint8Array(hash, 'hash');
  if (hash.length !== 32) {
    throw new TypeError('hash must be 32 bytes');
  }

  const status = Number(jsFrozenStorageGet(storageId, hash, REGISTER_ID));
  if (status < 0) {
    decodeError('frozenStorageGet');
  }
  if (status === 0) {
    return null;
  }

  const value = readRegisterBytes();
  return value;
}

export function frozenStorageContains(storageId: Uint8Array, hash: Uint8Array): boolean {
  ensureCollectionId(storageId, 'storageId');
  ensureUint8Array(hash, 'hash');
  if (hash.length !== 32) {
    throw new TypeError('hash must be 32 bytes');
  }

  const status = Number(jsFrozenStorageContains(storageId, hash));
  if (status < 0) {
    decodeError('frozenStorageContains');
  }

  return status === 1;
}
