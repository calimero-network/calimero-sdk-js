/**
 * Rga tests - Replicated Growable Array (collaborative text editing CRDT)
 *
 * Rga corresponds to Rust's `ReplicatedGrowableArray`.
 * CrdtType: CrdtType::Rga
 */

import '../setup';
import { Rga } from '../../collections/Rga';
import { clearStorage } from '../setup';

describe('Rga', () => {
  beforeEach(() => {
    clearStorage();
  });

  describe('basic operations', () => {
    it('should start empty', () => {
      const rga = new Rga();
      expect(rga.getText()).toBe('');
      expect(rga.length()).toBe(0);
      expect(rga.isEmpty()).toBe(true);
    });

    it('should insert text', () => {
      const rga = new Rga();
      rga.insert(0, 'Hello');
      expect(rga.getText()).toBe('Hello');
      expect(rga.length()).toBe(5);
    });

    it('should insert at position', () => {
      const rga = new Rga();
      rga.insert(0, 'Hello');
      rga.insert(5, ' World');
      expect(rga.getText()).toBe('Hello World');
    });

    it('should insert in the middle', () => {
      const rga = new Rga();
      rga.insert(0, 'HelloWorld');
      rga.insert(5, ' ');
      expect(rga.getText()).toBe('Hello World');
    });

    it('should delete a character', () => {
      const rga = new Rga();
      rga.insert(0, 'Hello');
      rga.delete(4);
      expect(rga.getText()).toBe('Hell');
    });

    it('should delete a range', () => {
      const rga = new Rga();
      rga.insert(0, 'Hello World');
      rga.deleteRange(5, 6); // Delete " World"
      expect(rga.getText()).toBe('Hello');
    });

    it('should clear all text', () => {
      const rga = new Rga();
      rga.insert(0, 'Hello World');
      rga.clear();
      expect(rga.getText()).toBe('');
      expect(rga.isEmpty()).toBe(true);
    });

    it('should set text (replace all)', () => {
      const rga = new Rga();
      rga.insert(0, 'Hello');
      rga.setText('World');
      expect(rga.getText()).toBe('World');
    });
  });

  describe('insertChar', () => {
    it('should insert a single character', () => {
      const rga = new Rga();
      rga.insertChar(0, 'H');
      rga.insertChar(1, 'i');
      expect(rga.getText()).toBe('Hi');
    });

    it('should reject multiple characters', () => {
      const rga = new Rga();
      expect(() => rga.insertChar(0, 'Hi')).toThrow();
    });
  });

  describe('validation', () => {
    it('should reject negative positions', () => {
      const rga = new Rga();
      expect(() => rga.insert(-1, 'test')).toThrow();
      expect(() => rga.delete(-1)).toThrow();
    });

    it('should reject non-integer positions', () => {
      const rga = new Rga();
      expect(() => rga.insert(1.5, 'test')).toThrow();
      expect(() => rga.delete(1.5)).toThrow();
    });

    it('should reject negative range lengths', () => {
      const rga = new Rga();
      rga.insert(0, 'Hello');
      expect(() => rga.deleteRange(0, -1)).toThrow();
    });
  });

  describe('persistence', () => {
    it('should persist across instances', () => {
      const rga1 = new Rga();
      rga1.insert(0, 'Hello');

      const rga2 = new Rga({ id: rga1.id() });
      expect(rga2.getText()).toBe('Hello');
    });

    it('should accumulate edits', () => {
      const rga1 = new Rga();
      rga1.insert(0, 'Hello');

      const rga2 = new Rga({ id: rga1.id() });
      rga2.insert(5, ' World');

      const rga3 = new Rga({ id: rga1.id() });
      expect(rga3.getText()).toBe('Hello World');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string insert', () => {
      const rga = new Rga();
      rga.insert(0, '');
      expect(rga.getText()).toBe('');
    });

    it('should handle zero-length deleteRange', () => {
      const rga = new Rga();
      rga.insert(0, 'Hello');
      rga.deleteRange(0, 0);
      expect(rga.getText()).toBe('Hello');
    });

    it('should handle unicode characters', () => {
      const rga = new Rga();
      rga.insert(0, '🎉Hello世界');
      expect(rga.getText()).toBe('🎉Hello世界');
    });
  });
});
