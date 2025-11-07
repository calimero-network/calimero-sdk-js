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
  // Logging
  log_utf8(msg: Uint8Array): void;

  // Storage
  storage_read(key: Uint8Array, register_id: bigint): bigint;
  storage_write(key: Uint8Array, value: Uint8Array, register_id: bigint): bigint;
  storage_remove(key: Uint8Array, register_id: bigint): bigint;

  // Context
  context_id(register_id: bigint): void;
  executor_id(register_id: bigint): void;

  // Events
  emit(kind: Uint8Array, data: Uint8Array): void;
  emit_with_handler(kind: Uint8Array, data: Uint8Array, handler: Uint8Array): void;

  // Registers
  register_len(register_id: bigint): bigint;
  read_register(register_id: bigint, buf: Uint8Array): boolean;

  // Delta
  commit(root: Uint8Array, artifact: Uint8Array): void;

  // Time
  time_now(buf: Uint8Array): void;

  // Blobs
  blob_create(): bigint;
  blob_open(blob_id: Uint8Array): bigint;
  blob_read(fd: bigint, buffer: Uint8Array): bigint;
  blob_write(fd: bigint, data: Uint8Array): bigint;
  blob_close(fd: bigint, blob_id_buf: Uint8Array): boolean;
}

