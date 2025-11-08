export interface CollectionSnapshot {
  type: string;
  id: string;
}

type CollectionLoader = (snapshot: CollectionSnapshot) => any;

const registry = new Map<string, CollectionLoader>();

export function registerCollectionType(type: string, loader: CollectionLoader): void {
  registry.set(type, loader);
}

export function instantiateCollection(snapshot: CollectionSnapshot): any {
  const loader = registry.get(snapshot.type);
  if (!loader) {
    throw new Error(`Unknown collection type '${snapshot.type}'`);
  }
  return loader(snapshot);
}

export function hasRegisteredCollection(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const json = typeof (value as any).toJSON === 'function' ? (value as any).toJSON() : null;
  if (!json || typeof json !== 'object') {
    return false;
  }

  const type = (json as any).__calimeroCollection;
  return typeof type === 'string' && registry.has(type);
}

export function snapshotCollection(value: any): CollectionSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const json = typeof value.toJSON === 'function' ? value.toJSON() : null;
  if (!json || typeof json !== 'object') {
    return null;
  }

  const type = (json as any).__calimeroCollection;
  const id = (json as any).id;
  if (typeof type !== 'string' || typeof id !== 'string') {
    return null;
  }

  if (!registry.has(type)) {
    return null;
  }

  return { type, id };
}

