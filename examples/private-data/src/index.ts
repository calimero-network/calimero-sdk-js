'use strict';

import { State, Logic, Init, View, createPrivateEntry, createUnorderedMap } from '@calimero/sdk';
import { UnorderedMap } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

type PrivateNote = {
  note: string;
  updatedAt: bigint;
};

const PRIVATE_NOTE_PREFIX = new TextEncoder().encode('priv_note:');

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function executorHex(): string {
  return toHex(env.executorId());
}

function privateNoteKey(): Uint8Array {
  const executor = env.executorId();
  const buffer = new Uint8Array(32);
  const prefixLength = Math.min(PRIVATE_NOTE_PREFIX.length, buffer.length);
  buffer.set(PRIVATE_NOTE_PREFIX.subarray(0, prefixLength));

  const remaining = buffer.length - prefixLength;
  if (remaining > 0) {
    buffer.set(executor.subarray(0, remaining), prefixLength);
  }

  return buffer;
}

function privateNoteHandle() {
  const key = privateNoteKey();
  return createPrivateEntry<PrivateNote>(key);
}

@State
export class PrivateDataState {
  owner: string = '';
  publicNotes: UnorderedMap<string, string> = createUnorderedMap<string, string>();
}

@Logic(PrivateDataState)
export class PrivateDataLogic extends PrivateDataState {
  @Init
  static init(): PrivateDataState {
    const state = new PrivateDataState();
    const ownerId = executorHex();
    state.owner = ownerId;
    env.log(`[private-data] init owner=${ownerId}`);
    return state;
  }

  setPublicNote(payload: { title: string; content: string } | string, maybeContent?: string): void {
    const { title, content } =
      typeof payload === 'string' ? { title: payload, content: maybeContent ?? '' } : payload;

    if (!title) {
      throw new Error('setPublicNote requires a title');
    }

    this.publicNotes.set(title, content);
    const size = this.publicNotes.entries().length;
    env.log(`[private-data] set public note title=${title} size=${size}`);
  }

  @View()
  getPublicNote(payload: { title: string } | string): { value: string } | null {
    const title = typeof payload === 'string' ? payload : payload?.title;
    const value = title ? (this.publicNotes.get(title) ?? null) : null;
    env.log(
      `[private-data] get public note title=${title ?? 'undefined'} value=${value ?? 'null'}`
    );
    return value === null ? null : { value };
  }

  setPrivateNote(note: string): void {
    const entry = privateNoteHandle();
    entry.modify(
      value => {
        value.note = note;
        value.updatedAt = env.timeNow();
      },
      () => ({
        note,
        updatedAt: env.timeNow(),
      })
    );
    env.log('[private-data] private note updated');
  }

  @View()
  getPrivateNote(): PrivateNote | null {
    const entry = privateNoteHandle();
    const result = entry.get();
    env.log(
      `[private-data] get private note executor=${executorHex()} value=${result?.note ?? 'null'}`
    );
    return result;
  }

  clearPrivateNote(): void {
    const entry = privateNoteHandle();
    if (entry.remove()) {
      env.log('[private-data] cleared private note');
    }
  }
}
