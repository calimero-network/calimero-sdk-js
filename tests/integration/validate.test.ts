/**
 * Integration tests for validate command
 *
 * Tests the validation functionality for Calimero service contracts
 */

import * as path from 'path';
import * as fs from 'fs';
import { parse } from '@babel/parser';

// Import validation helper types
interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  line?: number;
  suggestion?: string;
}

interface ValidationContext {
  stateClasses: Map<string, any>;
  logicClasses: Map<string, any>;
  eventClasses: Set<string>;
  issues: ValidationIssue[];
  hasInitMethod: boolean;
  sourceCode: string;
}

// Known CRDT types from the SDK
const CRDT_TYPES = new Set([
  'Counter',
  'UnorderedMap',
  'UnorderedSet',
  'Vector',
  'LwwRegister',
  'UserStorage',
  'FrozenStorage',
]);

// Helper function to validate source code (mimics validate command logic)
function validateSource(source: string): ValidationContext {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'decorators-legacy', 'classProperties'],
  });

  const ctx: ValidationContext = {
    stateClasses: new Map(),
    logicClasses: new Map(),
    eventClasses: new Set(),
    issues: [],
    hasInitMethod: false,
    sourceCode: source,
  };

  // Traverse and collect decorated classes
  const traverse = require('@babel/traverse').default || require('@babel/traverse');

  traverse(ast, {
    ClassDeclaration(nodePath: any) {
      analyzeClass(nodePath.node, ctx);
    },
    ExportNamedDeclaration(nodePath: any) {
      if (nodePath.node.declaration?.type === 'ClassDeclaration') {
        analyzeClass(nodePath.node.declaration, ctx);
      }
    },
  });

  // Run validations
  validateDecoratorUsage(ctx);
  validateStateStructure(ctx);
  checkAntiPatterns(ctx);

  return ctx;
}

function analyzeClass(classNode: any, ctx: ValidationContext): void {
  const className = classNode.id?.name;
  if (!className) return;

  const decorators = classNode.decorators || [];
  const line = classNode.loc?.start?.line || 0;

  const hasStateDecorator = decorators.some((d: any) => isCalimeroDecorator(d, 'State'));
  const logicDecorator = decorators.find((d: any) => isCalimeroDecorator(d, 'Logic'));
  const hasLogicDecorator = !!logicDecorator;
  const hasEventDecorator = decorators.some((d: any) => isCalimeroDecorator(d, 'Event'));

  const extendsClass = classNode.superClass?.name || null;

  if (hasStateDecorator) {
    const fields = extractFields(classNode);
    ctx.stateClasses.set(className, { name: className, fields, line });
  }

  if (hasLogicDecorator) {
    const stateClass = extractLogicStateClass(logicDecorator);
    const methods = extractMethods(classNode);
    ctx.logicClasses.set(className, {
      name: className,
      stateClass,
      methods,
      line,
      extendsClass,
    });

    if (methods.some((m: any) => m.isInit)) {
      ctx.hasInitMethod = true;
    }
  }

  if (hasEventDecorator) {
    ctx.eventClasses.add(className);
  }
}

function extractLogicStateClass(decorator: any): string | null {
  const expr = decorator.expression;
  if (expr?.type === 'CallExpression' && expr.arguments?.length > 0) {
    const arg = expr.arguments[0];
    if (arg.type === 'Identifier') {
      return arg.name;
    }
  }
  return null;
}

function extractFields(classNode: any): any[] {
  const fields: any[] = [];
  classNode.body?.body?.forEach((member: any) => {
    if (member.type === 'ClassProperty' || member.type === 'PropertyDefinition') {
      const fieldName = member.key?.name;
      if (fieldName && !fieldName.startsWith('_')) {
        const typeInfo = extractTypeInfo(member.typeAnnotation);
        fields.push({
          name: fieldName,
          type: typeInfo.typeName,
          isCrdt: typeInfo.isCrdt,
          line: member.loc?.start?.line || 0,
        });
      }
    }
  });
  return fields;
}

function extractTypeInfo(typeAnnotation: any): { typeName: string; isCrdt: boolean } {
  if (!typeAnnotation?.typeAnnotation) {
    return { typeName: 'unknown', isCrdt: false };
  }
  const type = typeAnnotation.typeAnnotation;
  switch (type.type) {
    case 'TSStringKeyword':
      return { typeName: 'string', isCrdt: false };
    case 'TSNumberKeyword':
      return { typeName: 'number', isCrdt: false };
    case 'TSBooleanKeyword':
      return { typeName: 'boolean', isCrdt: false };
    case 'TSTypeReference': {
      const typeName = type.typeName?.name || 'unknown';
      const isCrdt = CRDT_TYPES.has(typeName);
      return { typeName, isCrdt };
    }
    case 'TSArrayType':
      return { typeName: 'Array', isCrdt: false };
    default:
      return { typeName: 'unknown', isCrdt: false };
  }
}

function extractMethods(classNode: any): any[] {
  const methods: any[] = [];
  classNode.body?.body?.forEach((member: any) => {
    if (member.type === 'ClassMethod' || member.type === 'MethodDefinition') {
      const methodName = member.key?.name;
      if (methodName) {
        const decorators = member.decorators || [];
        const isInit = decorators.some((d: any) => isCalimeroDecorator(d, 'Init'));
        const isView = decorators.some((d: any) => isCalimeroDecorator(d, 'View'));
        const isStatic = member.static === true;
        const isPrivate = methodName.startsWith('_') || member.accessibility === 'private';
        methods.push({
          name: methodName,
          isInit,
          isView,
          isStatic,
          isPrivate,
          line: member.loc?.start?.line || 0,
        });
      }
    }
  });
  return methods;
}

function isCalimeroDecorator(decorator: any, name: string): boolean {
  const expr = decorator.expression;
  if (expr?.type === 'Identifier') {
    return expr.name === name;
  }
  if (expr?.type === 'CallExpression') {
    return expr.callee?.name === name;
  }
  return false;
}

function validateDecoratorUsage(ctx: ValidationContext): void {
  if (ctx.stateClasses.size === 0) {
    ctx.issues.push({
      type: 'error',
      message: 'No @State decorated class found',
    });
  }

  if (ctx.logicClasses.size === 0) {
    ctx.issues.push({
      type: 'error',
      message: 'No @Logic decorated class found',
    });
  }

  for (const [logicName, logicInfo] of ctx.logicClasses) {
    if (logicInfo.stateClass) {
      if (!ctx.stateClasses.has(logicInfo.stateClass)) {
        ctx.issues.push({
          type: 'error',
          message: `@Logic(${logicInfo.stateClass}) references unknown state class`,
          line: logicInfo.line,
        });
      }
    } else {
      ctx.issues.push({
        type: 'error',
        message: `@Logic decorator on ${logicName} is missing state class argument`,
        line: logicInfo.line,
      });
    }
  }

  if (!ctx.hasInitMethod) {
    ctx.issues.push({
      type: 'error',
      message: 'No @Init method found in any logic class',
    });
  }

  for (const [, logicInfo] of ctx.logicClasses) {
    const initMethods = logicInfo.methods.filter((m: any) => m.isInit);
    for (const initMethod of initMethods) {
      if (!initMethod.isStatic) {
        ctx.issues.push({
          type: 'error',
          message: `@Init method '${initMethod.name}' must be static`,
          line: initMethod.line,
        });
      }
    }
  }
}

function validateStateStructure(ctx: ValidationContext): void {
  const PRIMITIVE_TYPES = new Set(['string', 'number', 'boolean', 'bigint']);

  for (const [stateName, stateInfo] of ctx.stateClasses) {
    for (const field of stateInfo.fields) {
      if (!field.isCrdt && PRIMITIVE_TYPES.has(field.type)) {
        ctx.issues.push({
          type: 'warning',
          message: `State field '${field.name}' uses primitive type '${field.type}'`,
          line: field.line,
        });
      }

      if (field.type === 'Map') {
        ctx.issues.push({
          type: 'warning',
          message: `State field '${field.name}' uses native Map`,
          line: field.line,
        });
      }

      if (field.type === 'Set') {
        ctx.issues.push({
          type: 'warning',
          message: `State field '${field.name}' uses native Set`,
          line: field.line,
        });
      }

      if (field.type === 'Array') {
        ctx.issues.push({
          type: 'warning',
          message: `State field '${field.name}' uses native Array`,
          line: field.line,
        });
      }
    }

    if (stateInfo.fields.length === 0) {
      ctx.issues.push({
        type: 'warning',
        message: `State class '${stateName}' has no fields`,
        line: stateInfo.line,
      });
    }
  }
}

function checkAntiPatterns(ctx: ValidationContext): void {
  for (const [logicName, logicInfo] of ctx.logicClasses) {
    if (logicInfo.stateClass && logicInfo.extendsClass !== logicInfo.stateClass) {
      ctx.issues.push({
        type: 'warning',
        message: `Logic class '${logicName}' does not extend state class '${logicInfo.stateClass}'`,
        line: logicInfo.line,
      });
    }
  }
}

describe('Validate Command', () => {
  describe('Decorator Usage Validation', () => {
    it('should detect missing @State decorator', () => {
      const source = `
        import { Logic, Init } from '@calimero-network/calimero-sdk-js';

        class MyApp {
          value: number = 0;
        }

        @Logic(MyApp)
        export class MyAppLogic extends MyApp {
          @Init
          static init(): MyApp {
            return new MyApp();
          }
        }
      `;

      const result = validateSource(source);

      const stateError = result.issues.find(
        i => i.type === 'error' && i.message.includes('No @State decorated class found')
      );
      expect(stateError).toBeDefined();
    });

    it('should detect missing @Logic decorator', () => {
      const source = `
        import { State, Init } from '@calimero-network/calimero-sdk-js';

        @State
        export class MyApp {
          value: number = 0;
        }

        export class MyAppLogic extends MyApp {
          @Init
          static init(): MyApp {
            return new MyApp();
          }
        }
      `;

      const result = validateSource(source);

      const logicError = result.issues.find(
        i => i.type === 'error' && i.message.includes('No @Logic decorated class found')
      );
      expect(logicError).toBeDefined();
    });

    it('should detect missing @Init method', () => {
      const source = `
        import { State, Logic } from '@calimero-network/calimero-sdk-js';

        @State
        export class MyApp {
          value: number = 0;
        }

        @Logic(MyApp)
        export class MyAppLogic extends MyApp {
          setValue(value: number): void {
            this.value = value;
          }
        }
      `;

      const result = validateSource(source);

      const initError = result.issues.find(
        i => i.type === 'error' && i.message.includes('No @Init method found')
      );
      expect(initError).toBeDefined();
    });

    it('should detect non-static @Init method', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';

        @State
        export class MyApp {
          value: number = 0;
        }

        @Logic(MyApp)
        export class MyAppLogic extends MyApp {
          @Init
          init(): MyApp {
            return new MyApp();
          }
        }
      `;

      const result = validateSource(source);

      const staticError = result.issues.find(
        i => i.type === 'error' && i.message.includes('must be static')
      );
      expect(staticError).toBeDefined();
    });

    it('should detect @Logic referencing unknown state class', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';

        @State
        export class MyApp {
          value: number = 0;
        }

        @Logic(UnknownClass)
        export class MyAppLogic {
          @Init
          static init(): MyApp {
            return new MyApp();
          }
        }
      `;

      const result = validateSource(source);

      const unknownError = result.issues.find(
        i => i.type === 'error' && i.message.includes('references unknown state class')
      );
      expect(unknownError).toBeDefined();
    });

    it('should pass validation for valid contract', () => {
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

      const result = validateSource(source);

      const errors = result.issues.filter(i => i.type === 'error');
      expect(errors.length).toBe(0);
    });
  });

  describe('State Structure Validation', () => {
    it('should warn about primitive state fields', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';

        @State
        export class MyApp {
          name: string = '';
          count: number = 0;
          active: boolean = false;
        }

        @Logic(MyApp)
        export class MyAppLogic extends MyApp {
          @Init
          static init(): MyApp {
            return new MyApp();
          }
        }
      `;

      const result = validateSource(source);

      const primitiveWarnings = result.issues.filter(
        i => i.type === 'warning' && i.message.includes('uses primitive type')
      );
      expect(primitiveWarnings.length).toBe(3);
    });

    it('should warn about native collections', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';

        @State
        export class MyApp {
          items: Map<string, number> = new Map();
          tags: Set<string> = new Set();
          list: Array<string> = [];
        }

        @Logic(MyApp)
        export class MyAppLogic extends MyApp {
          @Init
          static init(): MyApp {
            return new MyApp();
          }
        }
      `;

      const result = validateSource(source);

      const mapWarning = result.issues.find(
        i => i.type === 'warning' && i.message.includes('uses native Map')
      );
      const setWarning = result.issues.find(
        i => i.type === 'warning' && i.message.includes('uses native Set')
      );
      const arrayWarning = result.issues.find(
        i => i.type === 'warning' && i.message.includes('uses native Array')
      );

      expect(mapWarning).toBeDefined();
      expect(setWarning).toBeDefined();
      expect(arrayWarning).toBeDefined();
    });

    it('should not warn about CRDT types', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';
        import { Counter, UnorderedMap, Vector, LwwRegister } from '@calimero-network/calimero-sdk-js/collections';

        @State
        export class MyApp {
          count: Counter = new Counter();
          items: UnorderedMap<string, string> = new UnorderedMap();
          list: Vector<string> = new Vector();
          value: LwwRegister<string> = new LwwRegister();
        }

        @Logic(MyApp)
        export class MyAppLogic extends MyApp {
          @Init
          static init(): MyApp {
            return new MyApp();
          }
        }
      `;

      const result = validateSource(source);

      const primitiveWarnings = result.issues.filter(
        i => i.type === 'warning' && i.message.includes('uses primitive type')
      );
      expect(primitiveWarnings.length).toBe(0);
    });

    it('should warn about empty state class', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';

        @State
        export class EmptyApp {}

        @Logic(EmptyApp)
        export class EmptyLogic extends EmptyApp {
          @Init
          static init(): EmptyApp {
            return new EmptyApp();
          }
        }
      `;

      const result = validateSource(source);

      const emptyWarning = result.issues.find(
        i => i.type === 'warning' && i.message.includes('has no fields')
      );
      expect(emptyWarning).toBeDefined();
    });
  });

  describe('Anti-Pattern Detection', () => {
    it('should warn when logic class does not extend state class', () => {
      const source = `
        import { State, Logic, Init } from '@calimero-network/calimero-sdk-js';
        import { Counter } from '@calimero-network/calimero-sdk-js/collections';

        @State
        export class CounterApp {
          count: Counter = new Counter();
        }

        @Logic(CounterApp)
        export class CounterLogic {
          @Init
          static init(): CounterApp {
            return new CounterApp();
          }
        }
      `;

      const result = validateSource(source);

      const extendsWarning = result.issues.find(
        i => i.type === 'warning' && i.message.includes('does not extend state class')
      );
      expect(extendsWarning).toBeDefined();
    });
  });

  describe('Event Validation', () => {
    it('should detect @Event decorated classes', () => {
      const source = `
        import { State, Logic, Init, Event } from '@calimero-network/calimero-sdk-js';
        import { Counter } from '@calimero-network/calimero-sdk-js/collections';

        @State
        export class MyApp {
          count: Counter = new Counter();
        }

        @Logic(MyApp)
        export class MyAppLogic extends MyApp {
          @Init
          static init(): MyApp {
            return new MyApp();
          }
        }

        @Event
        export class CounterIncremented {
          constructor(public value: bigint) {}
        }

        @Event
        export class CounterReset {}
      `;

      const result = validateSource(source);

      expect(result.eventClasses.size).toBe(2);
      expect(result.eventClasses.has('CounterIncremented')).toBe(true);
      expect(result.eventClasses.has('CounterReset')).toBe(true);
    });
  });
});
