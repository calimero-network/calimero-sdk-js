import { State, Logic, Init, View } from '@calimero/sdk';
import { UnorderedMap, UnorderedSet, Vector } from '@calimero/sdk/collections';
import * as env from '@calimero/sdk/env';

@State
export class NestedCollectionsTest {
  // Test Map<Map<Set>> pattern (like message reactions)
  mapMapSet: UnorderedMap<string, UnorderedMap<string, UnorderedSet<string>>>;

  // Test Map<Set> pattern (like user groups)
  mapSet: UnorderedMap<string, UnorderedSet<string>>;

  // Test Map<Vector> pattern
  mapVector: UnorderedMap<string, Vector<string>>;

  // Test Vector<Map> pattern (Vector as parent)
  vectorMap: Vector<UnorderedMap<string, string>>;

  // Test Set<Map> pattern (Set as parent)
  setMap: UnorderedSet<UnorderedMap<string, string>>;

  constructor() {
    this.mapMapSet = new UnorderedMap();
    this.mapSet = new UnorderedMap();
    this.mapVector = new UnorderedMap();
    this.vectorMap = new Vector();
    this.setMap = new UnorderedSet();
  }
}

@Logic(NestedCollectionsTest)
export class NestedCollectionsTestLogic extends NestedCollectionsTest {
  @Init
  static init(): NestedCollectionsTest {
    env.log('Initializing nested collections test');
    return new NestedCollectionsTest();
  }

  // Now this works automatically without manual re-serialization!
  // Test Map<Map<Set>> operations (3-level nesting)
  addToMapMapSet(args: { outerKey: string; innerKey: string; value: string }): void {
    const { outerKey, innerKey, value } = args;
    env.log(`Adding ${value} to mapMapSet[${outerKey}][${innerKey}]`);

    // Get or create the inner map
    let innerMap = this.mapMapSet.get(outerKey);
    if (!innerMap) {
      innerMap = new UnorderedMap<string, UnorderedSet<string>>();
      this.mapMapSet.set(outerKey, innerMap);
    }

    // Get or create the set
    let set = innerMap.get(innerKey);
    if (!set) {
      set = new UnorderedSet<string>();
      innerMap.set(innerKey, set);
    }

    // Add the value - changes automatically propagate thanks to nested tracking!
    set.add(value);
    env.log(`Added successfully`);
  }

  // Test nested delete operations
  removeFromMapMapSet(args: { outerKey: string; innerKey: string; value: string }): void {
    const { outerKey, innerKey, value } = args;
    env.log(`Removing ${value} from mapMapSet[${outerKey}][${innerKey}]`);

    const innerMap = this.mapMapSet.get(outerKey);
    if (!innerMap) return;

    const set = innerMap.get(innerKey);
    if (!set) return;

    // Remove the value - changes automatically propagate thanks to nested tracking!
    set.delete(value);

    // Clean up empty sets
    if (set.size() === 0) {
      innerMap.remove(innerKey);
    }
    env.log(`Removed successfully`);
  }

  // Test Map<Set> operations
  addToMapSet(args: { key: string; value: string }): void {
    const { key, value } = args;
    env.log(`Adding ${value} to mapSet[${key}]`);

    let set = this.mapSet.get(key);
    if (!set) {
      set = new UnorderedSet<string>();
      this.mapSet.set(key, set);
    }

    // Add value - changes automatically propagate thanks to nested tracking!
    set.add(value);
    env.log(`Added ${value} to set, set now has ${set.size()} items`);
  }

  @View()
  getMapMapSet(args: { outerKey: string } | string): string {
    // Handle both object and string parameter formats for @View methods
    const outerKey = typeof args === 'string' ? args : args.outerKey;

    const innerMap = this.mapMapSet.get(outerKey);
    if (!innerMap) {
      return JSON.stringify({});
    }

    const result: Record<string, string[]> = {};
    for (const [innerKey, set] of innerMap.entries()) {
      result[innerKey] = set.toArray();
    }

    return JSON.stringify(result);
  }

  @View()
  getMapSet(args: { key: string } | string): string {
    // Handle both object and string parameter formats for @View methods
    const key = typeof args === 'string' ? args : args.key;
    const set = this.mapSet.get(key);
    return JSON.stringify(set ? set.toArray() : []);
  }

  @View()
  getAllMapSet(): string {
    const result: Record<string, string[]> = {};
    for (const [key, set] of this.mapSet.entries()) {
      result[key] = set.toArray();
    }
    return JSON.stringify(result);
  }

  // Test UnorderedSet operations: delete and clear (testing missing notifications)
  testSetOperations(args: {
    key: string;
    value: string;
    operation: 'add' | 'delete' | 'clear';
  }): void {
    const { key, value, operation } = args;
    env.log(`Testing set operation: ${operation} on key=${key}, value=${value}`);

    let set = this.mapSet.get(key);
    if (!set) {
      set = new UnorderedSet<string>();
      this.mapSet.set(key, set);
    }

    if (operation === 'add') {
      set.add(value);
      env.log(`Added ${value} to set ${key}`);
    } else if (operation === 'delete') {
      const deleted = set.delete(value);
      env.log(`Deleted ${value} from set ${key}, result: ${deleted}`);
    } else if (operation === 'clear') {
      set.clear();
      env.log(`Cleared set ${key}`);
    }
  }

  // Test UnorderedMap remove operation (testing missing notification)
  testMapRemove(args: { outerKey: string; innerKey: string }): void {
    const { outerKey, innerKey } = args;
    env.log(`Testing map remove: outerKey=${outerKey}, innerKey=${innerKey}`);

    const innerMap = this.mapMapSet.get(outerKey);
    if (innerMap) {
      innerMap.remove(innerKey);
      env.log(`Removed innerKey ${innerKey} from outerKey ${outerKey}`);
    }
  }

  // Test Vector operations: push and pop (testing missing notifications)
  testVectorOperations(args: { key: string; value: string; operation: 'push' | 'pop' }): void {
    const { key, value, operation } = args;
    env.log(`Testing vector operation: ${operation} on key=${key}, value=${value}`);

    let vector = this.mapVector.get(key);
    if (!vector) {
      vector = new Vector<string>();
      this.mapVector.set(key, vector);
    }

    if (operation === 'push') {
      vector.push(value);
      env.log(`Pushed ${value} to vector ${key}, length now: ${vector.len()}`);
    } else if (operation === 'pop') {
      const popped = vector.pop();
      env.log(`Popped ${popped} from vector ${key}, length now: ${vector.len()}`);
    }
  }

  // Test Vector as parent (Vector<UnorderedMap>) - testing parent type support
  testVectorParent(args: { index: number; key: string; value: string }): void {
    const { index, key, value } = args;
    env.log(`Testing vector parent: index=${index}, key=${key}, value=${value}`);

    // Ensure we have enough maps in the vector
    while (this.vectorMap.len() <= index) {
      this.vectorMap.push(new UnorderedMap<string, string>());
    }

    const map = this.vectorMap.get(index);
    if (map) {
      map.set(key, value);
      env.log(`Set ${key}=${value} in vector map at index ${index}`);
    }
  }

  // Test UnorderedSet as parent (UnorderedSet<UnorderedMap>) - testing parent type support
  testSetParent(args: { mapId: string; key: string; value: string }): void {
    const { mapId, key, value } = args;
    env.log(`Testing set parent: mapId=${mapId}, key=${key}, value=${value}`);

    // Create a map with a unique identifier
    const map = new UnorderedMap<string, string>();
    map.set('_id', mapId); // Use this as identifier
    map.set(key, value);

    this.setMap.add(map);
    env.log(`Added map ${mapId} with ${key}=${value} to set`);
  }

  @View()
  getAllTestResults(): string {
    const results = {
      mapVector: {} as Record<string, string[]>,
      vectorMap: [] as Record<string, string>[],
      setMap: [] as Record<string, string>[],
    };

    // Collect mapVector
    for (const [key, vector] of this.mapVector.entries()) {
      results.mapVector[key] = vector.toArray();
    }

    // Collect vectorMap
    for (let i = 0; i < this.vectorMap.len(); i++) {
      const map = this.vectorMap.get(i);
      if (map) {
        const mapData: Record<string, string> = {};
        for (const [key, value] of map.entries()) {
          mapData[key] = value;
        }
        results.vectorMap.push(mapData);
      }
    }

    // Collect setMap
    for (const map of this.setMap.toArray()) {
      const mapData: Record<string, string> = {};
      for (const [key, value] of map.entries()) {
        mapData[key] = value;
      }
      results.setMap.push(mapData);
    }

    return JSON.stringify(results);
  }
}
