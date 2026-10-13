import './setup';
import { clearStorage, getPrivateStorage, getStorage } from './setup';
import { createPrivateEntry } from '../state/private';
import { sha256 } from '../utils/sha256';

describe('PrivateEntryHandle', () => {
  beforeEach(() => {
    clearStorage();
  });

  it('writes and reads values', () => {
    const entry = createPrivateEntry<{ message: string }>('private:hello');

    expect(entry.get()).toBeNull();

    entry.set({ message: 'hello world' });
    expect(entry.get()).toEqual({ message: 'hello world' });
  });

  it('supports getOrInit and modify', () => {
    const entry = createPrivateEntry<{ counter: number }>('private:counter');

    const initial = entry.getOrInit(() => ({ counter: 1 }));
    expect(initial.counter).toBe(1);

    entry.modify(
      value => {
        value.counter += 5;
      },
      () => ({ counter: 0 })
    );

    expect(entry.get()).toEqual({ counter: 6 });
  });

  it('removes values', () => {
    const entry = createPrivateEntry<number>('private:temp');
    entry.set(42);
    expect(entry.remove()).toBe(true);
    expect(entry.get()).toBeNull();
    expect(entry.remove()).toBe(false);
  });

  it('getOrDefault persists default when absent', () => {
    const entry = createPrivateEntry<number>('private:default');
    const value = entry.getOrDefault(7);
    expect(value).toBe(7);
    expect(entry.get()).toBe(7);
  });

  it('keeps entries in node-local storage under the tagged key hash', () => {
    createPrivateEntry<string>('private:hello').set('secret');

    const material = new TextEncoder().encode('private:hello');
    const expected = Array.from([0xff, ...sha256(material)]).join(',');
    expect(getStorage().size).toBe(0);
    expect([...getPrivateStorage().keys()]).toEqual([expected]);
  });
});
