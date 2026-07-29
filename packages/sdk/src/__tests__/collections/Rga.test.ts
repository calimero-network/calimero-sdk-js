/**
 * Rga tests
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
      expect(rga.len()).toBe(0);
      expect(rga.getText()).toBe('');
    });

    it('should insert text and read it back', () => {
      const rga = new Rga();

      rga.insert(0, 'hello');
      expect(rga.getText()).toBe('hello');
      expect(rga.len()).toBe(1);
    });

    it('should insert at an index', () => {
      const rga = new Rga();

      rga.insert(0, 'a');
      rga.insert(1, 'c');
      rga.insert(1, 'b');

      expect(rga.getText()).toBe('abc');
      expect(rga.len()).toBe(3);
    });

    it('should delete by index', () => {
      const rga = new Rga();

      rga.insert(0, 'a');
      rga.insert(1, 'b');
      rga.insert(2, 'c');

      rga.delete(1);

      expect(rga.getText()).toBe('ac');
      expect(rga.len()).toBe(2);
    });

    it('should round-trip multi-byte UTF-8 text', () => {
      const rga = new Rga();

      rga.insert(0, 'héllo');
      rga.insert(1, ' 🌐');

      expect(rga.getText()).toBe('héllo 🌐');
    });
  });

  describe('factory', () => {
    it('should build from initial text', () => {
      const rga = Rga.fromText('seed');
      expect(rga.getText()).toBe('seed');
    });
  });

  describe('persistence', () => {
    it('should persist across instances', () => {
      const rga1 = new Rga();
      rga1.insert(0, 'shared');

      const rga2 = new Rga({ id: rga1.id() });
      expect(rga2.getText()).toBe('shared');
    });
  });
});
