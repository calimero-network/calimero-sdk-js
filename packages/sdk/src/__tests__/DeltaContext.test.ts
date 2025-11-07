/**
 * DeltaContext tests
 */

import './setup';
import { DeltaContext } from '../collections/internal/DeltaContext';
import { clearStorage } from './setup';

describe('DeltaContext', () => {
  beforeEach(() => {
    clearStorage();
    DeltaContext.clear();
  });

  afterEach(() => {
    DeltaContext.clear();
  });

  it('should start empty', () => {
    expect(DeltaContext.getActions()).toHaveLength(0);
    expect(DeltaContext.hasActions()).toBe(false);
  });

  it('should track actions', () => {
    DeltaContext.addAction({
      type: 'Update',
      key: new Uint8Array([1, 2, 3]),
      value: new Uint8Array([4, 5, 6]),
      timestamp: Date.now()
    });

    expect(DeltaContext.hasActions()).toBe(true);
    expect(DeltaContext.getActions()).toHaveLength(1);
  });

  it('should compute root hash', () => {
    DeltaContext.addAction({
      type: 'Update',
      key: new Uint8Array([1, 2, 3]),
      value: new Uint8Array([4, 5, 6]),
      timestamp: 1000
    });

    const hash = DeltaContext.computeRootHash();
    expect(hash).toBeInstanceOf(Uint8Array);
    expect(hash.length).toBe(32);
  });

  it('should serialize artifact', () => {
    DeltaContext.addAction({
      type: 'Update',
      key: new Uint8Array([1, 2, 3]),
      value: new Uint8Array([4, 5, 6]),
      timestamp: 1000
    });

    const artifact = DeltaContext.serializeArtifact();
    expect(artifact).toBeInstanceOf(Uint8Array);

    const decoded = JSON.parse(new TextDecoder().decode(artifact));
    expect(decoded).toHaveLength(1);
    expect(decoded[0].type).toBe('Update');
  });

  it('should clear actions', () => {
    DeltaContext.addAction({
      type: 'Update',
      key: new Uint8Array([1]),
      timestamp: Date.now()
    });

    expect(DeltaContext.hasActions()).toBe(true);

    DeltaContext.clear();

    expect(DeltaContext.hasActions()).toBe(false);
    expect(DeltaContext.getActions()).toHaveLength(0);
  });

  it('should track multiple actions', () => {
    for (let i = 0; i < 5; i++) {
      DeltaContext.addAction({
        type: 'Update',
        key: new Uint8Array([i]),
        value: new Uint8Array([i * 2]),
        timestamp: Date.now() + i
      });
    }

    expect(DeltaContext.getActions()).toHaveLength(5);
  });
});

