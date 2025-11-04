import { State, Logic, Init, Event, emit } from '@calimero/sdk';
import { UnorderedMap } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

@Event
export class ItemAdded {
  constructor(
    public key: string,
    public value: string
  ) {}
}

@Event
export class ItemRemoved {
  constructor(public key: string) {}
}

@State
export class KvStore {
  items: UnorderedMap<string, string>;

  constructor() {
    this.items = new UnorderedMap();
  }
}

@Logic(KvStore)
export class KvStoreLogic {
  @Init
  static initialize(): KvStore {
    env.log('Initializing KV store');
    return new KvStore();
  }

  set(key: string, value: string): void {
    env.log(`Setting ${key} = ${value}`);
    this.items.set(key, value);
    emit(new ItemAdded(key, value));
  }

  get(key: string): string | null {
    env.log(`Getting ${key}`);
    return this.items.get(key);
  }

  remove(key: string): void {
    env.log(`Removing ${key}`);
    this.items.remove(key);
    emit(new ItemRemoved(key));
  }

  has(key: string): boolean {
    return this.items.has(key);
  }
}

