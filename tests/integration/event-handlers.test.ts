/**
 * The node runs an event's handler only if the app's embedded ABI marks that
 * method `handler: true`, so the build records `@Handler()` and checks its use.
 */

import { AbiEmitter } from '../../packages/cli/src/abi/emitter';

interface RustMethod {
  name: string;
  handler?: boolean;
}

interface RustAbi {
  methods: RustMethod[];
}

function rustAbi(source: string): RustAbi {
  const emitter = new AbiEmitter();
  emitter.analyzeSource(source);
  return emitter.generateManifestRustFormat();
}

function app(body: string): string {
  return `
    import { State, Logic, Init, View, Event, Handler, emitWithHandler } from '@calimero-network/calimero-sdk-js';

    @Event
    export class Pinged {
      constructor(public who: string) {}
    }

    @State
    export class S {}

    @Logic(S)
    export class L extends S {
      @Init
      static init(): S {
        return new S();
      }

      ${body}
    }
  `;
}

describe('event handlers in the ABI', () => {
  it('marks a @Handler() method handler: true and leaves others unmarked', () => {
    const abi = rustAbi(
      app(`
        ping(who: string): void {
          emitWithHandler(new Pinged(who), 'onPinged');
        }

        @Handler()
        onPinged(event: Pinged): void {}
      `)
    );

    const byName = Object.fromEntries(abi.methods.map(m => [m.name, m]));
    expect(byName.onPinged.handler).toBe(true);
    expect(byName.ping).not.toHaveProperty('handler');
    expect(byName.init).not.toHaveProperty('handler');
  });

  it('fails the build when emitWithHandler names an undeclared method', () => {
    const source = app(`
      ping(who: string): void {
        emitWithHandler(new Pinged(who), 'onPinged');
      }

      onPinged(event: Pinged): void {}
    `);

    expect(() => rustAbi(source)).toThrow(/emitWithHandler names 'onPinged'.*@Handler\(\)/);
  });

  it('fails the build when emitWithHandler names a method that does not exist', () => {
    const source = app(`
      ping(who: string): void {
        emitWithHandler(new Pinged(who), 'missing');
      }
    `);

    expect(() => rustAbi(source)).toThrow(/emitWithHandler names 'missing'/);
  });

  it('accepts a handler name it cannot see, leaving the check to emit time', () => {
    const abi = rustAbi(
      app(`
        ping(who: string, handler: string): void {
          emitWithHandler(new Pinged(who), handler);
        }
      `)
    );

    expect(abi.methods.some(m => m.handler)).toBe(false);
  });

  it('rejects @Handler() on a @View() method', () => {
    const source = app(`
      @View()
      @Handler()
      peek(): string {
        return '';
      }
    `);

    expect(() => rustAbi(source)).toThrow(/@Handler\(\) has no meaning on read-only 'peek'/);
  });

  it('rejects @Handler() on the @Init method', () => {
    const source = app('').replace('@Init', '@Init\n      @Handler()');

    expect(() => rustAbi(source)).toThrow(/@Handler\(\) has no meaning on initializer 'init'/);
  });

  it('fails the build when the node would ignore an ABI that declares handlers', () => {
    const source = app(`
      @Handler()
      onPinged(event: Pinged): void {}

      pick<T>(value: T): void {}
    `);

    expect(() => rustAbi(source)).toThrow(/node would ignore this ABI.*'T'/);
  });
});
