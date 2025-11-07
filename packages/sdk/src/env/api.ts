/**
 * Environment API
 *
 * Provides access to Calimero host functions for logging, storage,
 * context information, and more.
 */

import type { HostEnv } from './bindings';

// This will be provided by QuickJS runtime via builder.c
declare const env: HostEnv;

const REGISTER_ID = 0n;

/**
 * Logs a message to the runtime
 *
 * @param message - Message to log
 *
 * @example
 * ```typescript
 * env.log('Application started');
 * env.log(`Processing item: ${itemId}`);
 * ```
 */
export function log(message: string): void {
  const encoder = new TextEncoder();
  env.log_utf8(encoder.encode(message));
}

/**
 * Gets the current context ID
 *
 * @returns 32-byte context ID
 */
export function contextId(): Uint8Array {
  env.context_id(REGISTER_ID);
  const len = Number(env.register_len(REGISTER_ID));
  const buf = new Uint8Array(len);
  env.read_register(REGISTER_ID, buf);
  return buf;
}

/**
 * Gets the current executor ID
 *
 * @returns 32-byte executor ID
 */
export function executorId(): Uint8Array {
  env.executor_id(REGISTER_ID);
  const len = Number(env.register_len(REGISTER_ID));
  const buf = new Uint8Array(len);
  env.read_register(REGISTER_ID, buf);
  return buf;
}

/**
 * Reads a value from storage
 *
 * @param key - Storage key
 * @returns Value if exists, null otherwise
 */
export function storageRead(key: Uint8Array): Uint8Array | null {
  const exists = env.storage_read(key, REGISTER_ID);
  if (!exists) return null;

  const len = Number(env.register_len(REGISTER_ID));
  const buf = new Uint8Array(len);
  env.read_register(REGISTER_ID, buf);
  return buf;
}

/**
 * Writes a value to storage
 *
 * @param key - Storage key
 * @param value - Value to store
 */
export function storageWrite(key: Uint8Array, value: Uint8Array): void {
  env.storage_write(key, value, REGISTER_ID);
}

/**
 * Removes a value from storage
 *
 * @param key - Storage key
 * @returns true if key existed, false otherwise
 */
export function storageRemove(key: Uint8Array): boolean {
  return Boolean(env.storage_remove(key, REGISTER_ID));
}

/**
 * Commits the current delta to storage
 *
 * @param rootHash - Root hash of the Merkle tree
 * @param artifact - Serialized delta artifact
 */
export function commitDelta(rootHash: Uint8Array, artifact: Uint8Array): void {
  env.commit(rootHash, artifact);
}

/**
 * Gets the current timestamp
 *
 * @returns Current timestamp in nanoseconds
 */
export function timeNow(): bigint {
  const buf = new Uint8Array(8);
  env.time_now(buf);
  return new DataView(buf.buffer).getBigUint64(0, true);
}

/**
 * Creates a new blob for writing
 *
 * @returns File descriptor
 */
export function blobCreate(): bigint {
  return env.blob_create();
}

/**
 * Opens a blob for reading
 *
 * @param blobId - 32-byte blob ID
 * @returns File descriptor, or 0 if not found
 */
export function blobOpen(blobId: Uint8Array): bigint {
  return env.blob_open(blobId);
}

/**
 * Reads data from a blob
 *
 * @param fd - File descriptor
 * @param buffer - Buffer to read into
 * @returns Number of bytes read
 */
export function blobRead(fd: bigint, buffer: Uint8Array): bigint {
  return env.blob_read(fd, buffer);
}

/**
 * Writes data to a blob
 *
 * @param fd - File descriptor
 * @param data - Data to write
 * @returns Number of bytes written
 */
export function blobWrite(fd: bigint, data: Uint8Array): bigint {
  return env.blob_write(fd, data);
}

/**
 * Closes a blob
 *
 * @param fd - File descriptor
 * @returns Blob ID (32 bytes)
 */
export function blobClose(fd: bigint): Uint8Array {
  const blobId = new Uint8Array(32);
  const success = env.blob_close(fd, blobId);
  if (!success) {
    throw new Error('Failed to close blob');
  }
  return blobId;
}

