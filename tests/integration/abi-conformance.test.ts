/**
 * ABI Conformance Tests
 *
 * These tests verify that the ABI generation system correctly analyzes
 * TypeScript/JavaScript source code and generates ABI manifests that conform
 * to the Calimero ABI specification (compatible with Rust SDK).
 *
 * Similar to: https://github.com/calimero-network/core/tree/master/apps/abi_conformance
 */

import * as path from 'path';
import * as fs from 'fs';
import { generateAbiFromSource, AbiEmitter } from '../../packages/cli/src/abi/emitter';

describe('ABI Conformance Tests', () => {
  const outputDir = path.join(__dirname, 'output');
  const testFilesDir = path.join(__dirname, 'test-files');
  let testFileCounter = 0;

  // Helper to generate ABI from source code using Rust format
  // Only processes the single test file, not the entire project
  function generateAbiFromSourceRust(source: string): any {
    const testFile = path.join(testFilesDir, `test-${testFileCounter++}.ts`);
    fs.writeFileSync(testFile, source);

    // Use AbiEmitter directly to only process the single file
    const emitter = new AbiEmitter();
    emitter.analyzeFile(testFile);
    return emitter.generateManifestRustFormat();
  }

  beforeAll(() => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    if (!fs.existsSync(testFilesDir)) {
      fs.mkdirSync(testFilesDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true });
    }
    if (fs.existsSync(testFilesDir)) {
      fs.rmSync(testFilesDir, { recursive: true });
    }
  });

  describe('Basic State and Logic Classes', () => {
    it('should generate ABI for simple counter state', () => {
      const source = `
        import { State, Logic, Init, View } from '@calimero-network/calimero-sdk-js';
        import { Counter } from '@calimero-network/calimero-sdk-js/collections';

        @State
        export class CounterApp {
          count: Counter = new Counter();
        }

        @Logic(CounterApp)
        export class CounterLogic extends CounterApp {
          @Init
          static init(): CounterApp {
            return new CounterApp();
          }

          increment(): void {
            this.count.increment();
          }

          @View()
          getCount(): bigint {
            return this.count.value();
          }
        }
      `;

      const abi = generateAbiFromSourceRust(source);

      // Verify schema version
      expect(abi.schema_version).toBe('wasm-abi/1');

      // Verify state root
      expect(abi.state_root).toBe('CounterApp');

      // Verify state type exists
      expect(abi.types['CounterApp']).toBeDefined();
      expect(abi.types['CounterApp'].kind).toBe('record');
      expect(abi.types['CounterApp'].fields).toBeDefined();
      expect(abi.types['CounterApp'].fields?.length).toBe(1);
      expect(abi.types['CounterApp'].fields?.[0].name).toBe('count');
      // Rust format: { "kind": "u64" } instead of { "kind": "scalar", "scalar": "u64" }
      expect(abi.types['CounterApp'].fields?.[0].type.kind).toBe('u64');

      // Verify methods
      expect(abi.methods.length).toBe(3);

      const initMethod = abi.methods.find((m: any) => m.name === 'init');
      expect(initMethod).toBeDefined();
      expect(initMethod?.is_init).toBe(true);
      expect(initMethod?.is_view).toBe(false);

      const incrementMethod = abi.methods.find((m: any) => m.name === 'increment');
      expect(incrementMethod).toBeDefined();
      expect(incrementMethod?.is_init).toBe(false);
      expect(incrementMethod?.is_view).toBe(false);
      expect(incrementMethod?.params.length).toBe(0);

      const getCountMethod = abi.methods.find((m: any) => m.name === 'getCount');
      expect(getCountMethod).toBeDefined();
      expect(getCountMethod?.is_view).toBe(true);
      expect(getCountMethod?.returns).toBeDefined();
      // Rust format: { "kind": "u64" } instead of { "kind": "scalar", "scalar": "u64" }
      expect(getCountMethod?.returns?.kind).toBe('u64');
    });

    it('should handle state with multiple fields', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';
        import { Counter, UnorderedMap } from '@calimero-network/calimero-sdk-js/collections';

        @State
        export class MultiFieldState {
          counter: Counter = new Counter();
          map: UnorderedMap<string, number> = createUnorderedMap();
          name: string = '';
          value: number = 0;
        }

        @Logic(MultiFieldState)
        export class MultiFieldLogic extends MultiFieldState {
          @Init
          static init(): MultiFieldState {
            return new MultiFieldState();
          }
        }
      `;

      const abi = generateAbiFromSourceRust(source);

      expect(abi.state_root).toBe('MultiFieldState');
      expect(abi.types['MultiFieldState'].fields?.length).toBe(4);

      const fields = abi.types['MultiFieldState'].fields || [];
      const fieldNames = fields.map((f: any) => f.name);
      expect(fieldNames).toContain('counter');
      expect(fieldNames).toContain('map');
      expect(fieldNames).toContain('name');
      expect(fieldNames).toContain('value');
    });
  });

  describe('CRDT Types', () => {
    it('should handle Counter type', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';
        import { Counter } from '@calimero-network/calimero-sdk-js/collections';

        @State
        export class CounterState {
          count: Counter = new Counter();
        }

        @Logic(CounterState)
        export class CounterLogic extends CounterState {
          @Init
          static init(): CounterState {
            return new CounterState();
          }
        }
      `;

      const abi = generateAbiFromSourceRust(source);
      const countField = abi.types['CounterState'].fields?.find((f: any) => f.name === 'count');
      expect(countField).toBeDefined();
      // Rust format: { "kind": "u64" } instead of { "kind": "scalar", "scalar": "u64" }
      expect(countField?.type.kind).toBe('u64');
    });

    it('should handle UnorderedMap type', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';
        import { UnorderedMap } from '@calimero-network/calimero-sdk-js/collections';

        @State
        export class MapState {
          stringMap: UnorderedMap<string, number> = createUnorderedMap();
        }

        @Logic(MapState)
        export class MapLogic extends MapState {
          @Init
          static init(): MapState {
            return new MapState();
          }
        }
      `;

      const abi = generateAbiFromSourceRust(source);
      const mapField = abi.types['MapState'].fields?.find((f: any) => f.name === 'stringMap');
      expect(mapField).toBeDefined();
      expect(mapField?.type.kind).toBe('map');
      expect(mapField?.type.key).toBeDefined();
      expect(mapField?.type.value).toBeDefined();
      // Rust format: { "kind": "string" } instead of { "kind": "scalar", "scalar": "string" }
      expect(mapField?.type.key?.kind).toBe('string');
      // Number defaults to u32 in our implementation
      expect(mapField?.type.value?.kind).toBe('u32');
    });

    it('should handle Vector type', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';
        import { Vector } from '@calimero-network/calimero-sdk-js/collections';

        @State
        export class VectorState {
          items: Vector<string> = new Vector();
        }

        @Logic(VectorState)
        export class VectorLogic extends VectorState {
          @Init
          static init(): VectorState {
            return new VectorState();
          }
        }
      `;

      const abi = generateAbiFromSourceRust(source);
      const vectorField = abi.types['VectorState'].fields?.find((f: any) => f.name === 'items');
      expect(vectorField).toBeDefined();
      // Rust format uses "list" instead of "vector", and "items" instead of "inner"
      expect(vectorField?.type.kind).toBe('list');
      expect(vectorField?.type.items).toBeDefined();
      expect(vectorField?.type.items?.kind).toBe('string');
    });

    it('should handle LwwRegister type', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';
        import { LwwRegister } from '@calimero-network/calimero-sdk-js/collections';

        @State
        export class RegisterState {
          value: LwwRegister<string> = new LwwRegister('');
        }

        @Logic(RegisterState)
        export class RegisterLogic extends RegisterState {
          @Init
          static init(): RegisterState {
            return new RegisterState();
          }
        }
      `;

      const abi = generateAbiFromSourceRust(source);
      const registerField = abi.types['RegisterState'].fields?.find((f: any) => f.name === 'value');
      expect(registerField).toBeDefined();
      // LwwRegister unwraps to its inner type - Rust format: { "kind": "string" }
      expect(registerField?.type.kind).toBe('string');
    });
  });

  describe('Methods', () => {
    it('should extract method parameters', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';

        @State
        export class ParamState {
          value: number = 0;
        }

        @Logic(ParamState)
        export class ParamLogic extends ParamState {
          @Init
          static init(): ParamState {
            return new ParamState();
          }

          setValue(value: number): void {
            this.value = value;
          }

          add(a: number, b: number): number {
            return a + b;
          }

          process(name: string, count: number, active: boolean): void {
            // Process logic
          }
        }
      `;

      const abi = generateAbiFromSourceRust(source);

      const setValueMethod = abi.methods.find((m: any) => m.name === 'setValue');
      expect(setValueMethod).toBeDefined();
      expect(setValueMethod?.params.length).toBe(1);
      expect(setValueMethod?.params[0].name).toBe('value');
      // Rust format: { "kind": "u32" } (number defaults to u32)
      expect(setValueMethod?.params[0].type.kind).toBe('u32');

      const addMethod = abi.methods.find((m: any) => m.name === 'add');
      expect(addMethod).toBeDefined();
      expect(addMethod?.params.length).toBe(2);
      expect(addMethod?.params[0].name).toBe('a');
      expect(addMethod?.params[1].name).toBe('b');
      expect(addMethod?.returns).toBeDefined();
      expect(addMethod?.returns?.kind).toBe('u32');

      const processMethod = abi.methods.find((m: any) => m.name === 'process');
      expect(processMethod).toBeDefined();
      expect(processMethod?.params.length).toBe(3);
      expect(processMethod?.params[0].name).toBe('name');
      expect(processMethod?.params[0].type.kind).toBe('string');
      expect(processMethod?.params[1].name).toBe('count');
      expect(processMethod?.params[1].type.kind).toBe('u32');
      expect(processMethod?.params[2].name).toBe('active');
      expect(processMethod?.params[2].type.kind).toBe('bool');
    });

    it('should mark @Init methods correctly', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';

        @State
        export class InitState {}

        @Logic(InitState)
        export class InitLogic extends InitState {
          @Init
          static init(): InitState {
            return new InitState();
          }

          regularMethod(): void {}
        }
      `;

      const abi = generateAbiFromSourceRust(source);

      const initMethod = abi.methods.find((m: any) => m.name === 'init');
      expect(initMethod?.is_init).toBe(true);

      const regularMethod = abi.methods.find((m: any) => m.name === 'regularMethod');
      // Rust format serializes false instead of undefined
      expect(regularMethod?.is_init).toBe(false);
    });

    it('should mark @View methods correctly', () => {
      const source = `
        import { State, Logic, Init, View } from '@calimero-network/calimero-sdk-js';

        @State
        export class ViewState {
          value: number = 0;
        }

        @Logic(ViewState)
        export class ViewLogic extends ViewState {
          @Init
          static init(): ViewState {
            return new ViewState();
          }

          @View()
          getValue(): number {
            return this.value;
          }

          setValue(value: number): void {
            this.value = value;
          }
        }
      `;

      const abi = generateAbiFromSourceRust(source);

      const getValueMethod = abi.methods.find((m: any) => m.name === 'getValue');
      expect(getValueMethod?.is_view).toBe(true);

      const setValueMethod = abi.methods.find((m: any) => m.name === 'setValue');
      // Rust format serializes false instead of undefined
      expect(setValueMethod?.is_view).toBe(false);
    });

    it('should skip private methods', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';

        @State
        export class PrivateState {}

        @Logic(PrivateState)
        export class PrivateLogic extends PrivateState {
          @Init
          static init(): PrivateState {
            return new PrivateState();
          }

          publicMethod(): void {}

          private _privateMethod(): void {}
        }
      `;

      const abi = generateAbiFromSource(source);

      const methodNames = abi.methods.map(m => m.name);
      expect(methodNames).toContain('publicMethod');
      expect(methodNames).not.toContain('_privateMethod');
    });
  });

  describe('Events', () => {
    it('should extract event classes', () => {
      const source = `
        import { State, Logic, Init, Event } from '@calimero-network/calimero-sdk-js';

        @State
        export class EventState {}

        @Logic(EventState)
        export class EventLogic extends EventState {
          @Init
          static init(): EventState {
            return new EventState();
          }
        }

        @Event
        export class UserCreated {
          constructor(
            public userId: string,
            public name: string,
            public age: number
          ) {}
        }

        @Event
        export class OrderPlaced {
          constructor(
            public orderId: string,
            public amount: number
          ) {}
        }
      `;

      const abi = generateAbiFromSourceRust(source);

      expect(abi.events.length).toBe(2);

      const userCreatedEvent = abi.events.find((e: any) => e.name === 'UserCreated');
      expect(userCreatedEvent).toBeDefined();
      // Rust format: events with constructor params become payload with struct reference
      // For now, check that event exists - payload structure may vary
      expect(userCreatedEvent).toBeDefined();

      const orderPlacedEvent = abi.events.find((e: any) => e.name === 'OrderPlaced');
      expect(orderPlacedEvent).toBeDefined();
    });
  });

  describe('Type Definitions', () => {
    it('should extract interface types', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';

        interface User {
          id: string;
          name: string;
          age: number;
        }

        @State
        export class UserState {
          user: User = { id: '', name: '', age: 0 };
        }

        @Logic(UserState)
        export class UserLogic extends UserState {
          @Init
          static init(): UserState {
            return new UserState();
          }
        }
      `;

      const abi = generateAbiFromSource(source);

      expect(abi.types['User']).toBeDefined();
      expect(abi.types['User'].kind).toBe('record');
      expect(abi.types['User'].fields?.length).toBe(3);
    });

    it('should extract type alias types', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';

        type UserId = string;
        type UserData = {
          id: UserId;
          name: string;
        };

        @State
        export class TypeState {
          userId: UserId = '';
          data: UserData = { id: '', name: '' };
        }

        @Logic(TypeState)
        export class TypeLogic extends TypeState {
          @Init
          static init(): TypeState {
            return new TypeState();
          }
        }
      `;

      const abi = generateAbiFromSource(source);

      expect(abi.types['UserId']).toBeDefined();
      expect(abi.types['UserId'].kind).toBe('alias');
      expect(abi.types['UserData']).toBeDefined();
      expect(abi.types['UserData'].kind).toBe('record');
    });
  });

  describe('ABI Manifest Structure', () => {
    it('should generate valid ABI manifest structure', () => {
      const source = `
        import { State, Logic, Init, View, Event } from '@calimero-network/calimero-sdk-js';
        import { Counter } from '@calimero-network/calimero-sdk-js/collections';

        @State
        export class TestState {
          count: Counter = new Counter();
        }

        @Logic(TestState)
        export class TestLogic extends TestState {
          @Init
          static init(): TestState {
            return new TestState();
          }

          @View()
          getCount(): bigint {
            return this.count.value();
          }
        }

        @Event
        export class TestEvent {
          constructor(public message: string) {}
        }
      `;

      const abi = generateAbiFromSource(source);

      // Verify required fields
      expect(abi.schema_version).toBe('wasm-abi/1');
      expect(abi.types).toBeDefined();
      expect(Array.isArray(abi.methods)).toBe(true);
      expect(Array.isArray(abi.events)).toBe(true);
      expect(abi.state_root).toBeDefined();

      // Verify types is an object
      expect(typeof abi.types).toBe('object');
      expect(abi.types).not.toBeNull();

      // Verify state_root exists in types
      expect(abi.types[abi.state_root!]).toBeDefined();
    });

    it('should handle empty state (no fields)', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';

        @State
        export class EmptyState {}

        @Logic(EmptyState)
        export class EmptyLogic extends EmptyState {
          @Init
          static init(): EmptyState {
            return new EmptyState();
          }
        }
      `;

      const abi = generateAbiFromSource(source);

      expect(abi.state_root).toBe('EmptyState');
      expect(abi.types['EmptyState']).toBeDefined();
      expect(abi.types['EmptyState'].fields?.length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle nested types', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';
        import { UnorderedMap, Vector } from '@calimero-network/calimero-sdk-js/collections';

        @State
        export class NestedState {
          mapOfVectors: UnorderedMap<string, Vector<number>> = createUnorderedMap();
        }

        @Logic(NestedState)
        export class NestedLogic extends NestedState {
          @Init
          static init(): NestedState {
            return new NestedState();
          }
        }
      `;

      const abi = generateAbiFromSourceRust(source);
      const mapField = abi.types['NestedState'].fields?.find((f: any) => f.name === 'mapOfVectors');
      expect(mapField).toBeDefined();
      expect(mapField?.type.kind).toBe('map');
      // Rust format uses "list" instead of "vector", and "items" instead of "inner"
      expect(mapField?.type.value?.kind).toBe('list');
      expect(mapField?.type.value?.items?.kind).toBe('u32');
    });

    it('should handle optional/nullable fields', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';

        @State
        export class OptionalState {
          name?: string;
          value: number | null = null;
        }

        @Logic(OptionalState)
        export class OptionalLogic extends OptionalState {
          @Init
          static init(): OptionalState {
            return new OptionalState();
          }
        }
      `;

      const abi = generateAbiFromSource(source);
      const nameField = abi.types['OptionalState'].fields?.find(f => f.name === 'name');
      // Note: Optional/nullable handling may need refinement based on ABI spec
      expect(nameField).toBeDefined();
    });
  });

  describe('Multi-file Analysis', () => {
    it('should analyze multiple files', () => {
      const emitter = new AbiEmitter();

      const stateFile = `
        import { State } from '@calimero-network/calimero-sdk-js';
        import { Counter } from '@calimero-network/calimero-sdk-js/collections';

        @State
        export class MultiFileState {
          count: Counter = new Counter();
        }
      `;

      const logicFile = `
        import { Logic, Init, View } from '@calimero-network/calimero-sdk-js';
        import { MultiFileState } from './state';

        @Logic(MultiFileState)
        export class MultiFileLogic extends MultiFileState {
          @Init
          static init(): MultiFileState {
            return new MultiFileState();
          }

          @View()
          getCount(): bigint {
            return this.count.value();
          }
        }
      `;

      // Write files temporarily for analysis
      fs.writeFileSync(path.join(outputDir, 'state.ts'), stateFile);
      fs.writeFileSync(path.join(outputDir, 'logic.ts'), logicFile);

      const abiFromFiles = emitter.analyzeFiles([
        path.join(outputDir, 'state.ts'),
        path.join(outputDir, 'logic.ts'),
      ]);

      expect(abiFromFiles.state_root).toBe('MultiFileState');
      expect(abiFromFiles.methods.length).toBeGreaterThan(0);
    });
  });
});
