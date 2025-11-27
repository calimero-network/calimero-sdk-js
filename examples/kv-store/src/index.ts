import {
  State,
  Logic,
  Init,
  Event,
  View,
  emitWithHandler,
} from '@calimero-network/calimero-sdk-js';
import {
  UnorderedMap,
  UnorderedSet,
  LwwRegister,
  Counter,
} from '@calimero-network/calimero-sdk-js/collections';
import * as env from '@calimero-network/calimero-sdk-js/env';

@Event
export class ItemInserted {
  constructor(
    public key: string,
    public value: string
  ) {}
}

@Event
export class ItemUpdated {
  constructor(
    public key: string,
    public value: string
  ) {}
}

@Event
export class ItemRemoved {
  constructor(public key: string) {}
}

@Event
export class StoreCleared {}

@State
export class KvStore {
  items: UnorderedMap<string, LwwRegister<string>>;
  tags: UnorderedMap<string, UnorderedSet<string>>;
  handlersCalled: UnorderedMap<string, LwwRegister<string>>;
  handlerCounter: Counter;

  constructor() {
    this.items = new UnorderedMap<string, LwwRegister<string>>();
    this.tags = new UnorderedMap<string, UnorderedSet<string>>();
    this.handlersCalled = new UnorderedMap<string, LwwRegister<string>>();
    this.handlerCounter = new Counter();
  }
}

@Logic(KvStore)
export class KvStoreLogic extends KvStore {
  @Init
  static init(): KvStore {
    return new KvStore();
  }

  set(arg1: { key: string; value: string } | string, maybeValue?: string): void {
    const key = typeof arg1 === 'string' ? arg1 : arg1.key;
    const value = typeof arg1 === 'string' ? (maybeValue ?? '') : arg1.value;

    let register = this.items.get(key);
    if (!register) {
      register = new LwwRegister<string>();
    }

    const previous = register.get();
    register.set(value);
    this.items.set(key, register);

    const current = register.get();
    env.log(`[kv-store] set key=${key} value=${value} previous=${previous}`);
    env.log(`[kv-store] post-set key=${key} current=${current}`);

    if (previous === null) {
      emitWithHandler(new ItemInserted(key, value), 'insertHandler');
    } else {
      emitWithHandler(new ItemUpdated(key, value), 'updateHandler');
    }
  }

  setWithTags(
    arg1: { key: string; value: string; tags: string[] } | string,
    valueOrTags?: string | string[],
    maybeTags?: string[]
  ): void {
    const key = typeof arg1 === 'string' ? arg1 : arg1.key;
    const value = typeof arg1 === 'string' ? (valueOrTags as string) : arg1.value;
    const tags =
      typeof arg1 === 'string'
        ? Array.isArray(valueOrTags)
          ? valueOrTags
          : (maybeTags ?? [])
        : arg1.tags;

    this.set({ key, value });
    const tagSet = new UnorderedSet<string>({ initialValues: tags });
    this.tags.set(key, tagSet);
  }

  setValue(payload: { value: number } | number): void {
    const value = typeof payload === 'number' ? payload : payload.value;
    env.log(`[kv-store] setValue payload=${value}`);
    this.set({ key: 'counter', value: value.toString() });
  }

  @View()
  entries(): string {
    const result: Record<string, string> = Object.create(null);
    for (const [key, register] of this.items.entries()) {
      const value = register.get();
      if (value !== null) {
        result[key] = value;
      }
    }
    return this.respond(result);
  }

  @View()
  len(): string {
    return this.respond({ length: this.items.entries().length });
  }

  @View()
  get(key: string): string {
    const register = this.items.get(key);
    return this.respond({ value: register ? register.get() : null });
  }

  @View()
  getValue(): string {
    const register = this.items.get('counter');
    return this.respond({ value: register ? register.get() : null });
  }

  @View()
  getTags(key: string): string {
    const tagSet = this.tags.get(key);
    return this.respond({ tags: tagSet ? tagSet.toArray() : [] });
  }

  remove(key: string): void {
    if (!this.items.has(key)) {
      return;
    }
    this.items.remove(key);
    this.tags.remove(key);
    emitWithHandler(new ItemRemoved(key), 'removeHandler');
  }

  clear(): void {
    for (const [key] of this.items.entries()) {
      this.items.remove(key);
    }
    for (const [key] of this.tags.entries()) {
      this.tags.remove(key);
    }
    emitWithHandler(new StoreCleared(), 'clearHandler');
  }

  @View()
  has(key: string): string {
    return this.respond({ has: this.items.has(key) });
  }

  @View()
  getHandlersCalled(): string {
    const handlers = this.handlersCalled
      .values()
      .map((register: LwwRegister<string>) => register.get())
      .filter((value: string | null): value is string => value !== null)
      .sort();
    return this.respond({ handlers });
  }

  @View()
  getHandlerExecutionCount(): string {
    return this.respond({ count: Number(this.handlerCounter.value()) });
  }

  insertHandler(event: ItemInserted): void {
    this.logHandlerCall('insert_handler', `key=${event.key},value=${event.value}`);
  }

  updateHandler(event: ItemUpdated): void {
    this.logHandlerCall('update_handler', `key=${event.key},value=${event.value}`);
  }

  removeHandler(event: ItemRemoved): void {
    this.logHandlerCall('remove_handler', `key=${event.key}`);
  }

  clearHandler(_event: StoreCleared): void {
    this.logHandlerCall('clear_handler', 'all items cleared');
  }

  private respond<T>(payload: T): string {
    return JSON.stringify(payload);
  }

  private logHandlerCall(handler: string, details: string): void {
    this.handlerCounter.increment();
    const sequence = this.handlerCounter.value().toString();
    const key = `${handler}_${sequence}`;

    let register = this.handlersCalled.get(key);
    if (!register) {
      register = new LwwRegister<string>();
    }

    register.set(details);
    this.handlersCalled.set(key, register);
    env.log(
      `[kv-store] handler_invocation handler=${handler} sequence=${sequence} details=${details}`
    );
  }
}
