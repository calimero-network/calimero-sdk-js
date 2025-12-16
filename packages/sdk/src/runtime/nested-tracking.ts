/**
 * Nested Collection Tracking System
 *
 * Automatically tracks changes in nested collections and propagates them
 * to parent collections for proper synchronization.
 */

import { hasRegisteredCollection, snapshotCollection } from './collections';
import { flushDelta } from '../env/api';

interface CollectionTracker {
  id: string;
  type: string;
  parents: Set<CollectionParent>;
  children: Set<string>;
}

interface CollectionParent {
  collection: any;
  key: any;
}

class NestedCollectionTracker {
  private trackers = new Map<string, CollectionTracker>();
  private pendingUpdates = new Set<string>();
  private updateScheduled = false;

  /**
   * Register a collection and its nested relationships
   */
  registerCollection(collection: any, parentCollection?: any, parentKey?: any): void {
    const snapshot = snapshotCollection(collection);
    if (!snapshot) return;

    let tracker = this.trackers.get(snapshot.id);
    if (!tracker) {
      tracker = {
        id: snapshot.id,
        type: snapshot.type,
        parents: new Set(),
        children: new Set(),
      };
      this.trackers.set(snapshot.id, tracker);
    }

    // Register parent relationship
    if (parentCollection) {
      const parentSnapshot = snapshotCollection(parentCollection);
      if (parentSnapshot) {
        tracker.parents.add({ collection: parentCollection, key: parentKey });

        const parentTracker = this.trackers.get(parentSnapshot.id);
        if (parentTracker) {
          parentTracker.children.add(snapshot.id);
        }
      }
    }

    // Collection is now registered for tracking
  }

  /**
   * Notify that a collection has been modified
   */
  notifyCollectionModified(collection: any): void {
    const snapshot = snapshotCollection(collection);
    if (snapshot) {
      this.markForUpdate(snapshot.id);
    }
  }

  /**
   * Mark a collection for update and propagate changes synchronously.
   *
   * Note: We use synchronous propagation instead of microtasks because
   * QuickJS (used in WASM) may not process microtasks before the method
   * returns and state is saved. This ensures changes are properly
   * propagated to parent collections before state persistence.
   */
  private markForUpdate(collectionId: string): void {
    this.pendingUpdates.add(collectionId);

    // Propagate changes synchronously to ensure they're captured
    // before state is saved. Using microtasks doesn't work reliably
    // in QuickJS/WASM environment.
    if (!this.updateScheduled) {
      this.updateScheduled = true;
      this.propagateUpdates();
      this.updateScheduled = false;
    }
  }

  /**
   * Propagate updates to parent collections.
   * Uses a loop to handle cascading updates (when forceParentUpdate adds new pending updates).
   */
  private propagateUpdates(): void {
    const processedParents = new Set<string>();
    const maxIterations = 100; // Prevent infinite loops
    let iterations = 0;

    while (this.pendingUpdates.size > 0 && iterations < maxIterations) {
      iterations++;

      // Get the current set of pending updates and clear it
      const currentUpdates = new Set(this.pendingUpdates);
      this.pendingUpdates.clear();

      // Track collections processed in THIS iteration only
      // This allows collections to be reprocessed in subsequent iterations
      // if they're re-marked for update (e.g., via forceParentUpdate)
      const processedThisIteration = new Set<string>();

      for (const collectionId of currentUpdates) {
        // Skip if we've already processed this collection in this iteration
        if (processedThisIteration.has(collectionId)) continue;
        processedThisIteration.add(collectionId);

        const tracker = this.trackers.get(collectionId);
        if (!tracker) continue;

        // Notify all parent collections
        for (const parent of tracker.parents) {
          const parentSnapshot = snapshotCollection(parent.collection);
          if (!parentSnapshot || processedParents.has(parentSnapshot.id)) continue;

          // Force parent to re-serialize by calling set with the same key/value
          this.forceParentUpdate(parent.collection, parent.key, tracker.id);
          processedParents.add(parentSnapshot.id);
        }
      }
    }
  }

  /**
   * Force a parent collection to update by re-setting the nested collection
   */
  private forceParentUpdate(parentCollection: any, key: any, _childId: string): void {
    const parentSnapshot = snapshotCollection(parentCollection);
    if (!parentSnapshot) return;

    if (parentSnapshot.type === 'UnorderedMap' && parentCollection.get && parentCollection.set) {
      const currentValue = parentCollection.get(key);
      if (currentValue) {
        // Temporarily unwrap to avoid infinite recursion
        const originalSet = Object.getPrototypeOf(parentCollection).set;
        originalSet.call(parentCollection, key, currentValue);

        // Mark parent for update too
        this.markForUpdate(parentSnapshot.id);
      }
    } else if (parentSnapshot.type === 'UserStorage') {
      // UserStorage uses insert() for setting values, and the key is always the executor's PublicKey
      // For nested collections inside UserStorage, we need to re-insert to propagate changes
      if (parentCollection.get && parentCollection.insert) {
        const currentValue = parentCollection.get();
        if (currentValue) {
          // CRITICAL: Flush nested collection's changes to storage before re-inserting
          // This ensures the nested map's internal state (entries) is persisted
          // before we serialize it as a collection reference for UserStorage
          flushDelta();
          const originalInsert = Object.getPrototypeOf(parentCollection).insert;
          originalInsert.call(parentCollection, currentValue);
          this.markForUpdate(parentSnapshot.id);
        }
      }
    } else if (parentSnapshot.type === 'FrozenStorage') {
      // FrozenStorage is immutable, nested collections shouldn't change
      // Just mark for update to ensure consistency
      this.markForUpdate(parentSnapshot.id);
    } else if (parentSnapshot.type === 'Vector') {
      // For Vector, we can't modify individual elements in-place since it's append-only.
      // The nested collection change will still be tracked and propagated through
      // the normal CRDT synchronization mechanism, but we mark the parent for update
      // to ensure proper propagation timing.
      this.markForUpdate(parentSnapshot.id);
    } else if (
      parentSnapshot.type === 'UnorderedSet' &&
      parentCollection.has &&
      parentCollection.add &&
      parentCollection.delete
    ) {
      // For UnorderedSet, we need to remove and re-add the nested collection
      // The 'key' in this case is the nested collection itself
      if (parentCollection.has(key)) {
        const originalDelete = Object.getPrototypeOf(parentCollection).delete;
        const originalAdd = Object.getPrototypeOf(parentCollection).add;

        originalDelete.call(parentCollection, key);
        originalAdd.call(parentCollection, key);

        // Mark parent for update too
        this.markForUpdate(parentSnapshot.id);
      }
    }
  }

  /**
   * Scan an object for nested collections and register them
   */
  scanForNestedCollections(obj: any, parentCollection?: any, parentKey?: any): void {
    if (!obj || typeof obj !== 'object') return;

    if (hasRegisteredCollection(obj)) {
      this.registerCollection(obj, parentCollection, parentKey);
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        this.scanForNestedCollections(item, parentCollection, index);
      });
    } else {
      Object.entries(obj).forEach(([key, value]) => {
        this.scanForNestedCollections(value, parentCollection, key);
      });
    }
  }
}

// Global instance
export const nestedTracker = new NestedCollectionTracker();
