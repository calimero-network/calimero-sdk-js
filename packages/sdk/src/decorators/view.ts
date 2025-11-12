import { markMethodNonMutating } from '../runtime/method-registry';

export function View(): MethodDecorator {
  return (target, propertyKey) => {
    if (typeof propertyKey !== 'string') {
      return;
    }
    const ctor = target && (target as any).constructor;
    if (typeof ctor !== 'function') {
      return;
    }
    markMethodNonMutating(ctor, propertyKey);
  };
}

