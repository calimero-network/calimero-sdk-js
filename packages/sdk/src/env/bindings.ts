/**
 * Host environment bindings
 *
 * TypeScript definitions for QuickJS-provided host functions.
 * These will be injected by builder.c at runtime.
 */

/**
 * Host environment interface provided by QuickJS runtime
 */
export interface HostEnv {
  panic_utf8(message: Uint8Array): never;
  // Logging
  log_utf8(msg: Uint8Array): void;
  value_return(value: Uint8Array): void;

  // Storage
  storage_read(key: Uint8Array, register_id: bigint): bigint;
  storage_write(key: Uint8Array, value: Uint8Array, register_id: bigint): bigint;
  storage_remove(key: Uint8Array, register_id: bigint): bigint;
  xcall(context_id: Uint8Array, function_name: Uint8Array, params: Uint8Array): void;
  js_crdt_map_new(register_id: bigint): number;
  js_crdt_map_get(mapId: Uint8Array, key: Uint8Array, register_id: bigint): number;
  js_crdt_map_insert(mapId: Uint8Array, key: Uint8Array, value: Uint8Array, register_id: bigint): number;
  js_crdt_map_remove(mapId: Uint8Array, key: Uint8Array, register_id: bigint): number;
  js_crdt_map_contains(mapId: Uint8Array, key: Uint8Array): number;
  js_crdt_map_iter(mapId: Uint8Array, register_id: bigint): number;
  js_crdt_vector_new(register_id: bigint): number;
  js_crdt_vector_len(vectorId: Uint8Array, register_id: bigint): number;
  js_crdt_vector_push(vectorId: Uint8Array, value: Uint8Array): number;
  js_crdt_vector_get(vectorId: Uint8Array, index: bigint, register_id: bigint): number;
  js_crdt_vector_pop(vectorId: Uint8Array, register_id: bigint): number;
  js_crdt_set_new(register_id: bigint): number;
  js_crdt_set_insert(setId: Uint8Array, value: Uint8Array): number;
  js_crdt_set_contains(setId: Uint8Array, value: Uint8Array): number;
  js_crdt_set_remove(setId: Uint8Array, value: Uint8Array): number;
  js_crdt_set_len(setId: Uint8Array, register_id: bigint): number;
  js_crdt_set_iter(setId: Uint8Array, register_id: bigint): number;
  js_crdt_set_clear(setId: Uint8Array): number;
  js_crdt_lww_new(register_id: bigint): number;
  js_crdt_lww_set(registerId: Uint8Array, value: Uint8Array | null): number;
  js_crdt_lww_get(registerId: Uint8Array, register_id: bigint): number;
  js_crdt_lww_timestamp(registerId: Uint8Array, register_id: bigint): number;
  js_crdt_counter_new(register_id: bigint): number;
  js_crdt_counter_increment(counterId: Uint8Array): number;
  js_crdt_counter_value(counterId: Uint8Array, register_id: bigint): number;
  js_crdt_counter_get_executor_count(counterId: Uint8Array, register_id: bigint, executorId?: Uint8Array): number;

  // Context
  context_id(register_id: bigint): void;
  executor_id(register_id: bigint): void;

  // Events
  emit(kind: Uint8Array, data: Uint8Array): void;
  emit_with_handler(kind: Uint8Array, data: Uint8Array, handler: Uint8Array): void;

  // Registers
  input(register_id: bigint): void;
  register_len(register_id: bigint): bigint;
  read_register(register_id: bigint, buf: Uint8Array): boolean;

  // Delta
  commit(root: Uint8Array, artifact: Uint8Array): void;
  persist_root_state(doc: Uint8Array, createdAt: number, updatedAt: number): void;
  read_root_state(register: bigint): number;
  apply_storage_delta(delta: Uint8Array): void;
  flush_delta(): number;

  // Time
  time_now(buf: Uint8Array): void;

  // Blobs
  blob_create(): bigint;
  blob_open(blob_id: Uint8Array): bigint;
  blob_read(fd: bigint, buffer: Uint8Array): bigint;
  blob_write(fd: bigint, data: Uint8Array): bigint;
  blob_close(fd: bigint, blob_id_buf: Uint8Array): boolean;
  blob_announce_to_context(blob_id: Uint8Array, context_id: Uint8Array): number;
  random_bytes(buffer: Uint8Array): void;
}

