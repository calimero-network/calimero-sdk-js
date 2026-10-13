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
 *   - a writer can add another member via `addWriter` (hex-encoded account id,
 *     see `myAccount`), after which that member may write too.
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

@State
export class TeamConfig {
  // A single shared config string. The initial writer set is the context
  // creator's account (assigned here, where the account id is available). On fresh
  // state the cell is re-opened at a deterministic id so every replica addresses
  // the same entity; on load it is rehydrated from the persisted snapshot.
  config: SharedStorage<string>;

  constructor() {
    this.config = new SharedStorage<string>({ writers: [env.accountId()] });
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
    emit(new ConfigUpdated(value, env.bytesToHex(env.accountId())));
  }

  /** Read the current config value, or null before the first write. */
  @View()
  getConfig(): string | null {
    return this.config.get();
  }

  /** The current writer set, as hex-encoded 32-byte account ids. */
  @View()
  configWriters(): string[] {
    return this.config.writers().map(env.bytesToHex);
  }

  /** The calling account, hex-encoded: the id `addWriter` takes. */
  @View()
  myAccount(): string {
    return env.bytesToHex(env.accountId());
  }

  /** Whether the calling account may write to the config. */
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
   * Add a writer (hex-encoded 32-byte account id) to the config's writer set.
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
    if (current.some(w => env.bytesToHex(w) === target)) {
      env.log('[shared-storage] addWriter: already a writer, skipping');
      return;
    }
    this.config.rotateWriters([...current, publicKeyHex]);
    emit(new WriterAdded(publicKeyHex));
  }
}
