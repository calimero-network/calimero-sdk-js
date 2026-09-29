/**
 * The node runs an event's handler only if the app's embedded ABI marks that
 * method `handler: true`, so the build records `@Handler()` and checks its use.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AbiEmitter,
  generateAbiManifestRustFormat,
  generateAbiManifestRustFormatWithStateSchema,
} from '../../packages/cli/src/abi/emitter';

interface RustMethod {
  name: string;
  handler?: boolean;
}

interface RustAbi {
  types: Record<string, unknown>;
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

  it('names the handler with a template literal', () => {
    const source = app(`
      ping(who: string): void {
        emitWithHandler(new Pinged(who), \`onPinged\`);
      }
    `);

    expect(() => rustAbi(source)).toThrow(/emitWithHandler names 'onPinged'/);
  });

  it('checks a call through a namespace import of the SDK', () => {
    const source = app(`
      ping(who: string): void {
        sdk.emitWithHandler(new Pinged(who), 'onPinged');
      }
    `).replace(
      'import {',
      "import * as sdk from '@calimero-network/calimero-sdk-js';\n    import {"
    );

    expect(() => rustAbi(source)).toThrow(/emitWithHandler names 'onPinged'/);
  });

  it('ignores an emitWithHandler that is not the SDK one', () => {
    const source = app(`
      ping(bus: { emitWithHandler(e: unknown, h: string): void }): void {
        bus.emitWithHandler({}, 'notAHandler');
      }
    `).replace('emitWithHandler }', '}');

    expect(() => rustAbi(source)).not.toThrow();
  });

  it('fails the build on a map key the node rejects when the app declares handlers', () => {
    const source = app(`
      @Handler()
      onPinged(event: Pinged): void {}
    `)
      .replace(
        'import {',
        "import { UserStorage } from '@calimero-network/calimero-sdk-js/collections';\n    import {"
      )
      .replace(
        'export class S {}',
        'export class S {\n      owned: UserStorage<string> = new UserStorage();\n    }'
      );

    expect(() => rustAbi(source)).toThrow(
      /node would ignore this ABI.*map whose key is not a string/
    );
  });
});

describe('event handlers on the build path', () => {
  let root: string;

  // The build analyzes every .ts file under the project root (generateAbiManifestRustFormat).
  function project(files: Record<string, string>): string {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'calimero-handlers-'));
    fs.writeFileSync(path.join(root, 'package.json'), '{}');
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), content);
    }
    return path.join(root, 'src/index.ts');
  }

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const handlerApp = app(`
    ping(who: string): void {
      emitWithHandler(new Pinged(who), 'onPinged');
    }

    @Handler()
    onPinged(event: Pinged): void {}
  `);

  it('records the handler and its event parameter type', () => {
    const abi: RustAbi = generateAbiManifestRustFormat(project({ 'src/index.ts': handlerApp }));

    expect(abi.methods.find(m => m.name === 'onPinged')!.handler).toBe(true);
    expect(abi.types).toHaveProperty('Pinged');
  });

  it('fails when an app file names an undeclared handler', () => {
    const entry = project({ 'src/index.ts': handlerApp.replace("'onPinged');", "'missing');") });

    expect(() => generateAbiManifestRustFormat(entry)).toThrow(/emitWithHandler names 'missing'/);
  });

  it('ignores emitWithHandler calls in test files', () => {
    const testFile = `
      import { emitWithHandler } from '@calimero-network/calimero-sdk-js';
      emitWithHandler({}, 'notAHandler');
    `;
    const entry = project({
      'src/index.ts': handlerApp,
      'src/index.test.ts': testFile,
      'src/__tests__/helpers.ts': testFile,
    });

    expect(() => generateAbiManifestRustFormat(entry)).not.toThrow();
  });

  it('builds the state schema from the entry file alone, with handlers in another file', () => {
    const entry = project({
      'src/index.ts': `
        import { State, Event, emitWithHandler } from '@calimero-network/calimero-sdk-js';

        @Event
        export class Pinged {}

        @State
        export class S {}

        export function notify(): void {
          emitWithHandler(new Pinged(), 'onPinged');
        }
      `,
      'src/logic.ts': `
        import { Logic, Init, Handler } from '@calimero-network/calimero-sdk-js';
        import { S, Pinged } from './index';

        @Logic(S)
        export class L extends S {
          @Init
          static init(): S {
            return new S();
          }

          @Handler()
          onPinged(event: Pinged): void {}
        }
      `,
    });

    expect(() => generateAbiManifestRustFormat(entry)).not.toThrow();
    expect(() => generateAbiManifestRustFormatWithStateSchema(entry, 'S')).not.toThrow();
  });
});
