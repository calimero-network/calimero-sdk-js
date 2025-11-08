import { State, Logic, Init, Event, emitWithHandler } from '@calimero/sdk';
import { UnorderedMap, UnorderedSet, LwwRegister, Counter } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

@Event
export class ItemInserted {
  constructor(public key: string, public value: string) {}
}

@Event
export class ItemUpdated {
  constructor(public key: string, public value: string) {}
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

  set(key: string, value: string): void {
    const register = this.ensureItemRegister(key);
    const previous = register.get();
    register.set(value);

    if (previous === null) {
      emitWithHandler(new ItemInserted(key, value), 'insertHandler');
    } else {
      emitWithHandler(new ItemUpdated(key, value), 'updateHandler');
    }
  }

  setWithTags(key: string, value: string, tags: string[]): void {
    this.set(key, value);
    const tagSet = new UnorderedSet<string>({ initialValues: tags });
    this.tags.set(key, tagSet);
  }

  setValue(value: number): void {
    this.set('counter', value.toString());
  }

  entries(): string {
    const result: Record<string, string> = Object.create(null);
    for (const [key, register] of this.safeItemEntries()) {
      const value = register.get();
      if (value !== null) {
        result[key] = value;
      }
    }
    return this.respond(result);
  }

  len(): string {
    return this.respond({ length: this.safeItemEntries().length });
  }

  get(key: string): string {
    const register = this.safeGetItem(key);
    return this.respond({ value: register ? register.get() : null });
  }

  getValue(): string {
    const register = this.safeGetItem('counter');
    return this.respond({ value: register ? register.get() : null });
  }

  getTags(key: string): string {
    const tagSet = this.safeGetTagSet(key);
    return this.respond({ tags: tagSet ? tagSet.toArray() : [] });
  }

  remove(key: string): void {
    if (!this.safeHasItem(key)) {
      return;
    }
    this.safeRemoveItem(key);
    this.safeRemoveTag(key);
    emitWithHandler(new ItemRemoved(key), 'removeHandler');
  }

  clear(): void {
    for (const [key] of this.safeItemEntries()) {
      this.safeRemoveItem(key);
    }
    for (const [key] of this.safeTagEntries()) {
      this.safeRemoveTag(key);
    }
    emitWithHandler(new StoreCleared(), 'clearHandler');
  }

  has(key: string): string {
    return this.respond({ has: this.safeHasItem(key) });
  }

  getHandlersCalled(): string {
    const handlers = this.safeHandlerValues()
      .map((register: LwwRegister<string>) => register.get())
      .filter((value: string | null): value is string => value !== null)
      .sort();
    return this.respond({ handlers });
  }

  getHandlerExecutionCount(): string {
    return this.respond({ count: Number(this.safeCounterValue()) });
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

  private ensureItemRegister(key: string): LwwRegister<string> {
    let register: LwwRegister<string> | null = null;
    try {
      register = this.items.get(key);
    } catch (error) {
      this.items = new UnorderedMap<string, LwwRegister<string>>();
      register = null;
    }
    if (!register) {
      register = new LwwRegister<string>();
      this.writeItem(key, register);
    }
    return register;
  }

  private respond<T>(payload: T): string {
    return JSON.stringify(payload);
  }

  private logHandlerCall(handler: string, details: string): void {
    this.safeIncrementCounter();
    const sequence = this.safeCounterValue().toString();
    const key = `${handler}_${sequence}`;
    const register = new LwwRegister<string>({ initialValue: details });
    this.writeHandlerRecord(key, register);
  }

  private writeItem(key: string, register: LwwRegister<string>): void {
    try {
      this.items.set(key, register);
    } catch (error) {
      this.items = new UnorderedMap<string, LwwRegister<string>>();
      this.items.set(key, register);
    }
  }

  private writeHandlerRecord(key: string, register: LwwRegister<string>): void {
    try {
      this.handlersCalled.set(key, register);
    } catch (error) {
      this.handlersCalled = new UnorderedMap<string, LwwRegister<string>>();
      this.handlersCalled.set(key, register);
    }
  }

  private safeIncrementCounter(): void {
    try {
      this.handlerCounter.increment();
    } catch (error) {
      this.handlerCounter = new Counter();
      this.handlerCounter.increment();
    }
  }

  private safeCounterValue(): bigint {
    try {
      return this.handlerCounter.value();
    } catch (error) {
      this.handlerCounter = new Counter();
      return this.handlerCounter.value();
    }
  }

  private safeItemEntries(): Array<[string, LwwRegister<string>]> {
    try {
      return this.items.entries();
    } catch (error) {
      this.items = new UnorderedMap<string, LwwRegister<string>>();
      return [];
    }
  }

  private safeTagEntries(): Array<[string, UnorderedSet<string>]> {
    try {
      return this.tags.entries();
    } catch (error) {
      this.tags = new UnorderedMap<string, UnorderedSet<string>>();
      return [];
    }
  }

  private safeHasItem(key: string): boolean {
    try {
      return this.items.has(key);
    } catch (error) {
      this.items = new UnorderedMap<string, LwwRegister<string>>();
      return false;
    }
  }

  private safeRemoveItem(key: string): void {
    try {
      this.items.remove(key);
    } catch (error) {
      this.items = new UnorderedMap<string, LwwRegister<string>>();
    }
  }

  private safeRemoveTag(key: string): void {
    try {
      this.tags.remove(key);
    } catch (error) {
      this.tags = new UnorderedMap<string, UnorderedSet<string>>();
    }
  }

  private safeGetTagSet(key: string): UnorderedSet<string> | null {
    try {
      return this.tags.get(key);
    } catch (error) {
      this.tags = new UnorderedMap<string, UnorderedSet<string>>();
      return null;
    }
  }

  private safeGetItem(key: string): LwwRegister<string> | null {
    try {
      return this.items.get(key);
    } catch (error) {
      this.items = new UnorderedMap<string, LwwRegister<string>>();
      return null;
    }
  }

  private safeHandlerValues(): LwwRegister<string>[] {
    try {
      return this.handlersCalled.values();
    } catch (error) {
      this.handlersCalled = new UnorderedMap<string, LwwRegister<string>>();
      return [];
    }
  }
}

