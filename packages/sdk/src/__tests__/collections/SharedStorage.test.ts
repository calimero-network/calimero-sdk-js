/**
 * SharedStorage tests
 */

import '../setup';
import { SharedStorage } from '../../collections/SharedStorage';
import { clearStorage, setExecutorId, resetExecutorId } from '../setup';

// Default mock executor is a 32-byte key of 0x01; a second member is 0x02.
const ME = new Uint8Array(32).fill(1);
const OTHER = new Uint8Array(32).fill(2);

describe('SharedStorage', () => {
  beforeEach(() => {
    clearStorage();
    resetExecutorId();
  });

  describe('construction', () => {
    it('requires a writer set to create a cell', () => {
      expect(() => new SharedStorage<string>({})).toThrow(/writers/i);
    });

    it('rejects a writer key that is not 32 bytes', () => {
      expect(() => new SharedStorage<string>({ writers: [new Uint8Array(16)] })).toThrow();
    });

    it('accepts hex-string writer keys', () => {
      const hex = Array.from(ME)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      const cell = new SharedStorage<string>({ writers: [hex] });
      expect(cell.writers()).toHaveLength(1);
      expect(cell.writers()[0]).toEqual(ME);
    });

    it('creates a cell at a deterministic id when one is supplied', () => {
      const id = new Uint8Array(32).fill(7);
      const cell = new SharedStorage<string>({ writers: [ME], id });
      expect(cell.idBytes()).toEqual(id);
    });
  });

  describe('read / write', () => {
    it('returns null before the first write', () => {
      const cell = new SharedStorage<string>({ writers: [ME] });
      expect(cell.get()).toBeNull();
    });

    it('round-trips a value through a writer', () => {
      const cell = new SharedStorage<string>({ writers: [ME] });
      cell.set('hello');
      expect(cell.get()).toBe('hello');
    });

    it('round-trips a structured value', () => {
      const cell = new SharedStorage<{ n: number; s: string }>({ writers: [ME] });
      cell.set({ n: 42, s: 'x' });
      expect(cell.get()).toEqual({ n: 42, s: 'x' });
    });

    it('overwrites on repeated set (last-write-wins)', () => {
      const cell = new SharedStorage<string>({ writers: [ME] });
      cell.set('a');
      cell.set('b');
      expect(cell.get()).toBe('b');
    });
  });

  describe('writer gating', () => {
    it('reports the current writer set', () => {
      const cell = new SharedStorage<string>({ writers: [ME, OTHER] });
      const writers = cell.writers();
      expect(writers).toHaveLength(2);
      expect(writers[0]).toEqual(ME);
      expect(writers[1]).toEqual(OTHER);
    });

    it('reports writableByMe for a writer and a non-writer', () => {
      const cell = new SharedStorage<string>({ writers: [ME] });
      expect(cell.writableByMe()).toBe(true);
      setExecutorId(OTHER);
      expect(cell.writableByMe()).toBe(false);
    });

    it('rejects set from a non-writer', () => {
      const cell = new SharedStorage<string>({ writers: [ME] });
      setExecutorId(OTHER);
      expect(() => cell.set('nope')).toThrow(/writer/i);
    });
  });

  describe('writer rotation', () => {
    it('lets a writer add a new writer, who can then write', () => {
      const cell = new SharedStorage<string>({ writers: [ME] });
      cell.rotateWriters([ME, OTHER]);
      expect(cell.writers()).toHaveLength(2);

      setExecutorId(OTHER);
      expect(cell.writableByMe()).toBe(true);
      cell.set('from-other');
      expect(cell.get()).toBe('from-other');
    });

    it('can remove a writer, who then loses write access', () => {
      const cell = new SharedStorage<string>({ writers: [ME, OTHER] });
      cell.rotateWriters([ME]);

      setExecutorId(OTHER);
      expect(cell.writableByMe()).toBe(false);
      expect(() => cell.set('nope')).toThrow(/writer/i);
    });

    it('rejects rotation from a non-writer', () => {
      const cell = new SharedStorage<string>({ writers: [ME] });
      setExecutorId(OTHER);
      expect(() => cell.rotateWriters([OTHER])).toThrow(/writer/i);
    });

    it('rejects an empty writer set', () => {
      const cell = new SharedStorage<string>({ writers: [ME] });
      expect(() => cell.rotateWriters([])).toThrow();
    });
  });

  describe('frozen cells', () => {
    it('reports isFrozen', () => {
      expect(new SharedStorage<string>({ writers: [ME] }).isFrozen()).toBe(false);
      expect(new SharedStorage<string>({ writers: [ME], frozen: true }).isFrozen()).toBe(true);
    });

    it('rejects writes and rotation on a frozen cell', () => {
      const cell = new SharedStorage<string>({ writers: [ME], frozen: true });
      expect(cell.writableByMe()).toBe(false);
      expect(() => cell.set('nope')).toThrow(/frozen/i);
      expect(() => cell.rotateWriters([ME, OTHER])).toThrow(/frozen/i);
    });
  });

  describe('identity & rehydration', () => {
    it('exposes id() as hex and idBytes() as a copy', () => {
      const cell = new SharedStorage<string>({ writers: [ME] });
      expect(cell.id()).toMatch(/^[0-9a-f]{64}$/);
      const bytes = cell.idBytes();
      bytes[0] ^= 0xff;
      expect(cell.idBytes()[0]).not.toBe(bytes[0]);
    });

    it('rehydrates via fromId and shares the same cell', () => {
      const cell = new SharedStorage<string>({ writers: [ME] });
      cell.set('shared');
      const reopened = SharedStorage.fromId<string>(cell.idBytes());
      expect(reopened.get()).toBe('shared');
      expect(reopened.id()).toBe(cell.id());
    });

    it('serializes to a collection sentinel via toJSON', () => {
      const cell = new SharedStorage<string>({ writers: [ME] });
      expect(cell.toJSON()).toEqual({
        __calimeroCollection: 'SharedStorage',
        id: cell.id(),
      });
    });
  });
});
