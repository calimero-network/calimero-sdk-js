import { serialize, deserialize } from '../utils/serialize';
import {
  getMergeableDescriptor,
  getMergeableType,
  markMergeableInstance,
  cloneMergeableValue,
  type MergeableDescriptor,
} from './mergeable-registry';

function cloneForMerge<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  try {
    return deserialize<T>(serialize(value));
  } catch {
    return cloneMergeableValue(value);
  }
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeDefaultFields(
  descriptor: MergeableDescriptor,
  localValue: any,
  remoteValue: any,
): any {
  if (!isObjectLike(remoteValue)) {
    return remoteValue ?? localValue;
  }

  const result: Record<string, unknown> = Object.create(null);
  const keys = new Set<string>([
    ...Object.keys(isObjectLike(localValue) ? localValue : {}),
    ...Object.keys(remoteValue),
  ]);

  for (const key of keys) {
    const localField = isObjectLike(localValue) ? localValue[key] : undefined;
    const remoteField = remoteValue[key];

    const mergeableType = getMergeableType(remoteField ?? localField);
    if (mergeableType) {
      result[key] = mergeMergeableValues(localField, remoteField ?? localField);
      continue;
    }

    result[key] = remoteField !== undefined ? remoteField : localField;
  }

  markMergeableInstance(result, descriptor.type);
  return result;
}

export function mergeMergeableValues<T>(localValue: T, remoteValue: T): T {
  const mergeableType =
    getMergeableType(remoteValue) ??
    getMergeableType(localValue);

  if (!mergeableType) {
    return remoteValue;
  }

  const descriptor = getMergeableDescriptor(mergeableType);
  if (!descriptor) {
    return remoteValue;
  }

  if (descriptor.merge) {
    const merged = descriptor.merge(
      cloneForMerge(localValue),
      cloneForMerge(remoteValue),
    );
    if (isObjectLike(merged)) {
      markMergeableInstance(merged, mergeableType);
    }
    return merged;
  }

  return mergeDefaultFields(descriptor, localValue, remoteValue);
}

