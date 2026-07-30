/**
 * SharedStorage Example — a group-writable config value with a rotatable
 * writer set (Phase 2b CRDT-type expansion).
 *
 * `SharedStorage<V>` holds a single value that any member of its *writer set*
 * may overwrite; writes from different writers converge last-write-wins. The
 * writer set is managed at runtime and enforced by the host — a non-writer's
 * `set`/`rotateWriters` is rejected.
 *
 * This app models a shared team configuration string:
 *   - the context creator becomes the sole initial writer,
 *   - any writer can `setConfig`,
 *   - a writer can add another member via `addWriter` (hex-encoded key), after
 *     which that member may write too.
 */

import { State, Logic, Init, Event, View, emit } from '@calimero-network/calimero-sdk-js';
import { SharedStorage } from '@calimero-network/calimero-sdk-js/collections';
import * as env from '@calimero-network/calimero-sdk-js/env';

@Event
export class ConfigUpdated {
  constructor(
    public value: string,
    public by: string
  ) {}
}

@Event
export class WriterAdded {
  constructor(public writer: string) {}
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

@State
export class TeamConfig {
  // A single shared config string. The initial writer set is the context
  // creator (assigned here, where the executor identity is available). On fresh
  // state the cell is re-opened at a deterministic id so every replica addresses
  // the same entity; on load it is rehydrated from the persisted snapshot.
  config: SharedStorage<string>;

  constructor() {
    this.config = new SharedStorage<string>({ writers: [env.executorId()] });
  }
}

@Logic(TeamConfig)
export class TeamConfigLogic extends TeamConfig {
  @Init
  static init(): TeamConfig {
    env.log('[shared-storage] Initializing TeamConfig');
    return new TeamConfig();
  }

  /** Overwrite the shared config value. Writer-gated. */
  setConfig(value: string): void {
    env.log(`[shared-storage] setConfig("${value}")`);
    this.config.set(value);
    emit(new ConfigUpdated(value, env.executorIdHex()));
  }

  /** Read the current config value, or null before the first write. */
  @View()
  getConfig(): string | null {
    return this.config.get();
  }

  /** The current writer set, as hex-encoded 32-byte public keys. */
  @View()
  configWriters(): string[] {
    return this.config.writers().map(toHex);
  }

  /** Whether the calling executor may write to the config. */
  @View()
  canWrite(): boolean {
    return this.config.writableByMe();
  }

  /** Whether the config cell is frozen (immutable). */
  @View()
  isConfigFrozen(): boolean {
    return this.config.isFrozen();
  }

  /**
   * Add a writer (hex-encoded 32-byte public key) to the config's writer set.
   * Writer-gated: only a current writer may rotate the set.
   */
  addWriter(publicKeyHex: string): void {
    env.log(`[shared-storage] addWriter(${publicKeyHex.slice(0, 16)}…)`);
    const target = publicKeyHex.toLowerCase();
    const current = this.config.writers();
    // Skip if already a writer — `rotateWriters` replaces the whole set, so a
    // blind append would duplicate the key. Note this read-modify-write is not
    // atomic across concurrent writers: `rotateWriters` is last-write-wins on
    // the whole set, so two concurrent `addWriter` calls can drop one addition.
    // A single admin performing rotations avoids that; a production app would
    // serialise writer-set changes through one identity.
    if (current.some(w => toHex(w) === target)) {
      env.log('[shared-storage] addWriter: already a writer, skipping');
      return;
    }
    this.config.rotateWriters([...current, publicKeyHex]);
    emit(new WriterAdded(publicKeyHex));
  }

  /**
   * Add a writer given a base58-encoded public key — the form node tooling and
   * workflows surface member keys in. Decodes to raw bytes and delegates to the
   * same writer-gated rotation as {@link addWriter}.
   */
  addWriterBase58(publicKeyBase58: string): void {
    const bytes = env.base58ToBytes(publicKeyBase58);
    this.addWriter(toHex(bytes));
  }
}
