import { registerMergeableType } from '../runtime/mergeable-registry';

export interface MergeableOptions {
  /**
   * Optional custom merge handler. Runs inside the QuickJS runtime during conflict resolution
   * and should return the reconciled value to persist.
   */
  merge?: (localValue: any, remoteValue: any) => any;
  /**
   * Override the type identifier recorded for this class. Defaults to the constructor name.
   */
  type?: string;
}

/**
 * Marks a data class as mergeable. Use on structs stored inside CRDT collections so the runtime
 * can reconcile concurrent updates deterministically.
 */
export function Mergeable(options: MergeableOptions = {}) {
  return function mergeableDecorator(ctor: new (...args: any[]) => any): void {
    const typeName = options.type ?? ctor.name;
    if (!typeName) {
      throw new Error(
        '@Mergeable requires the target class to have a name or an explicit type option'
      );
    }

    registerMergeableType(ctor as any, {
      type: typeName,
      merge: options.merge,
    });
  };
}
