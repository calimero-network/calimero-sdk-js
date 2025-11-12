"use strict";

import { State, Logic, Init, View, createPrivateEntry } from '@calimero/sdk';
import { UnorderedMap } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

type PrivateNote = {
  note: string;
  updatedAt: bigint;
};

function executorHex(): string {
  const bytes = env.executorId();
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function privateNoteHandle() {
  const key = `private:note:${executorHex()}`;
  return createPrivateEntry<PrivateNote>(key);
}

@State
export class PrivateDataState {
  owner: string = '';
  publicNotes: UnorderedMap<string, string> = new UnorderedMap<string, string>();
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

  setPublicNote(title: string, content: string): void {
    this.publicNotes.set(title, content);
    env.log(`[private-data] set public note title=${title}`);
  }

  @View()
  getPublicNote(title: string): string | null {
    return this.publicNotes.get(title);
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
      }),
    );
    env.log('[private-data] private note updated');
  }

  @View()
  getPrivateNote(): PrivateNote | null {
    const entry = privateNoteHandle();
    return entry.get();
  }

  clearPrivateNote(): void {
    const entry = privateNoteHandle();
    if (entry.remove()) {
      env.log('[private-data] cleared private note');
    }
  }
}

