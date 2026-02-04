/**
 * Validate command implementation
 *
 * Validates Calimero service contracts for:
 * - Decorator usage (@State, @Logic, @Init, @View, @Event)
 * - State structure (CRDT types, proper fields)
 * - ABI compatibility (method signatures, types)
 * - Known anti-patterns
 */

import signale from 'signale';
import * as fs from 'fs';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

const traverse = (traverseModule as any).default || traverseModule;
const { Signale } = signale;

interface ValidateOptions {
  verbose: boolean;
}

interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  line?: number;
  suggestion?: string;
}

interface ValidationContext {
  stateClasses: Map<string, StateClassInfo>;
  logicClasses: Map<string, LogicClassInfo>;
  eventClasses: Set<string>;
  issues: ValidationIssue[];
  hasInitMethod: boolean;
  sourceCode: string;
}

interface StateClassInfo {
  name: string;
  fields: FieldInfo[];
  line: number;
}

interface LogicClassInfo {
  name: string;
  stateClass: string | null;
  methods: MethodInfo[];
  line: number;
  extendsClass: string | null;
}

interface FieldInfo {
  name: string;
  type: string;
  isCrdt: boolean;
  line: number;
}

interface MethodInfo {
  name: string;
  isInit: boolean;
  isView: boolean;
  isStatic: boolean;
  isPrivate: boolean;
  params: string[];
  returnType: string | null;
  line: number;
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

// Primitive types that should be wrapped in CRDT types for state
const PRIMITIVE_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'bigint',
  'String',
  'Number',
  'Boolean',
  'BigInt',
]);

export async function validateCommand(source: string, options: ValidateOptions): Promise<void> {
  const logger = new Signale({ scope: 'validate', interactive: !options.verbose });

  try {
    logger.await(`Validating ${source}...`);

    // Check if file exists
    if (!fs.existsSync(source)) {
      throw new Error(`Source file not found: ${source}`);
    }

    // Check file extension
    const ext = source.split('.').pop();
    if (!['ts', 'js'].includes(ext || '')) {
      throw new Error('Source must be a .ts or .js file');
    }

    // Read and parse source file
    const sourceCode = fs.readFileSync(source, 'utf-8');
    const ast = parse(sourceCode, {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy', 'classProperties'],
    });

    // Initialize validation context
    const ctx: ValidationContext = {
      stateClasses: new Map(),
      logicClasses: new Map(),
      eventClasses: new Set(),
      issues: [],
      hasInitMethod: false,
      sourceCode,
    };

    // First pass: collect all decorated classes
    collectDecoratedClasses(ast, ctx);

    // Second pass: validate decorator usage
    validateDecoratorUsage(ctx, options);

    // Third pass: validate state structure
    validateStateStructure(ctx, options);

    // Fourth pass: validate ABI compatibility
    validateAbiCompatibility(ctx, options);

    // Fifth pass: check for anti-patterns
    checkAntiPatterns(ctx, options);

    // Report results
    reportResults(ctx, logger, options);

    // Exit with appropriate code
    const hasErrors = ctx.issues.some(issue => issue.type === 'error');
    if (hasErrors) {
      process.exit(1);
    }
  } catch (error) {
    logger.error('Validation failed:', error);
    process.exit(1);
  }
}

/**
 * Collect all decorated classes from the AST
 */
function collectDecoratedClasses(ast: any, ctx: ValidationContext): void {
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
}

/**
 * Analyze a class declaration
 */
function analyzeClass(classNode: any, ctx: ValidationContext): void {
  const className = classNode.id?.name;
  if (!className) return;

  const decorators = classNode.decorators || [];
  const line = classNode.loc?.start?.line || 0;

  // Check for @State decorator
  const hasStateDecorator = decorators.some((d: any) => isCalimeroDecorator(d, 'State'));

  // Check for @Logic decorator
  const logicDecorator = decorators.find((d: any) => isCalimeroDecorator(d, 'Logic'));
  const hasLogicDecorator = !!logicDecorator;

  // Check for @Event decorator
  const hasEventDecorator = decorators.some((d: any) => isCalimeroDecorator(d, 'Event'));

  // Get superclass (for extends relationship)
  const extendsClass = classNode.superClass?.name || null;

  if (hasStateDecorator) {
    const fields = extractFields(classNode);
    ctx.stateClasses.set(className, {
      name: className,
      fields,
      line,
    });
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

    // Check for @Init method
    if (methods.some(m => m.isInit)) {
      ctx.hasInitMethod = true;
    }
  }

  if (hasEventDecorator) {
    ctx.eventClasses.add(className);
  }
}

/**
 * Extract the state class from @Logic decorator
 */
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

/**
 * Extract fields from a class
 */
function extractFields(classNode: any): FieldInfo[] {
  const fields: FieldInfo[] = [];

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

/**
 * Extract type information from a type annotation
 */
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
    case 'TSBigIntKeyword':
      return { typeName: 'bigint', isCrdt: false };
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

/**
 * Extract methods from a class
 */
function extractMethods(classNode: any): MethodInfo[] {
  const methods: MethodInfo[] = [];

  classNode.body?.body?.forEach((member: any) => {
    if (member.type === 'ClassMethod' || member.type === 'MethodDefinition') {
      const methodName = member.key?.name;
      if (methodName) {
        const decorators = member.decorators || [];
        const isInit = decorators.some((d: any) => isCalimeroDecorator(d, 'Init'));
        const isView = decorators.some((d: any) => isCalimeroDecorator(d, 'View'));
        const isStatic = member.static === true;
        const isPrivate = methodName.startsWith('_') || member.accessibility === 'private';

        const params = (member.params || []).map((p: any) => {
          if (p.type === 'Identifier') {
            return p.name;
          }
          if (p.type === 'TSParameterProperty') {
            return p.parameter?.name || 'unknown';
          }
          if (p.type === 'ObjectPattern') {
            return 'params';
          }
          return 'unknown';
        });

        const returnType = extractReturnType(member.returnType || member.value?.returnType);

        methods.push({
          name: methodName,
          isInit,
          isView,
          isStatic,
          isPrivate,
          params,
          returnType,
          line: member.loc?.start?.line || 0,
        });
      }
    }
  });

  return methods;
}

/**
 * Extract return type from a type annotation
 */
function extractReturnType(returnType: any): string | null {
  if (!returnType?.typeAnnotation) {
    return null;
  }

  const type = returnType.typeAnnotation;

  switch (type.type) {
    case 'TSVoidKeyword':
      return 'void';
    case 'TSStringKeyword':
      return 'string';
    case 'TSNumberKeyword':
      return 'number';
    case 'TSBooleanKeyword':
      return 'boolean';
    case 'TSBigIntKeyword':
      return 'bigint';
    case 'TSTypeReference':
      return type.typeName?.name || 'unknown';
    default:
      return 'unknown';
  }
}

/**
 * Check if a decorator is a Calimero decorator
 */
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

/**
 * Validate decorator usage
 */
function validateDecoratorUsage(ctx: ValidationContext, _options: ValidateOptions): void {
  // Check for at least one @State class
  if (ctx.stateClasses.size === 0) {
    ctx.issues.push({
      type: 'error',
      message: 'No @State decorated class found',
      suggestion: 'Add @State decorator to your state class: @State export class MyApp { ... }',
    });
  }

  // Check for at least one @Logic class
  if (ctx.logicClasses.size === 0) {
    ctx.issues.push({
      type: 'error',
      message: 'No @Logic decorated class found',
      suggestion:
        'Add @Logic decorator to your logic class: @Logic(MyApp) export class MyAppLogic extends MyApp { ... }',
    });
  }

  // Validate @Logic decorator references valid @State class
  for (const [logicName, logicInfo] of ctx.logicClasses) {
    if (logicInfo.stateClass) {
      if (!ctx.stateClasses.has(logicInfo.stateClass)) {
        ctx.issues.push({
          type: 'error',
          message: `@Logic(${logicInfo.stateClass}) references unknown state class`,
          line: logicInfo.line,
          suggestion: `Ensure ${logicInfo.stateClass} is decorated with @State`,
        });
      }
    } else {
      ctx.issues.push({
        type: 'error',
        message: `@Logic decorator on ${logicName} is missing state class argument`,
        line: logicInfo.line,
        suggestion: 'Use @Logic(StateClassName) with the state class name',
      });
    }
  }

  // Check for @Init method
  if (!ctx.hasInitMethod) {
    ctx.issues.push({
      type: 'error',
      message: 'No @Init method found in any logic class',
      suggestion:
        'Add a static initialization method with @Init decorator: @Init static init(): MyApp { return new MyApp(); }',
    });
  }

  // Validate @Init methods
  for (const [, logicInfo] of ctx.logicClasses) {
    const initMethods = logicInfo.methods.filter(m => m.isInit);
    for (const initMethod of initMethods) {
      if (!initMethod.isStatic) {
        ctx.issues.push({
          type: 'error',
          message: `@Init method '${initMethod.name}' must be static`,
          line: initMethod.line,
          suggestion: 'Add static keyword: @Init static init(): StateClass { ... }',
        });
      }
    }

    // Warn if multiple @Init methods
    if (initMethods.length > 1) {
      ctx.issues.push({
        type: 'warning',
        message: `Multiple @Init methods found in ${logicInfo.name}`,
        line: logicInfo.line,
        suggestion: 'Only one @Init method should be defined per logic class',
      });
    }
  }
}

/**
 * Validate state structure
 */
function validateStateStructure(ctx: ValidationContext, _options: ValidateOptions): void {
  for (const [stateName, stateInfo] of ctx.stateClasses) {
    // Check that state fields use CRDT types
    for (const field of stateInfo.fields) {
      if (!field.isCrdt && PRIMITIVE_TYPES.has(field.type)) {
        ctx.issues.push({
          type: 'warning',
          message: `State field '${field.name}' uses primitive type '${field.type}'`,
          line: field.line,
          suggestion: `Consider using a CRDT type like LwwRegister<${field.type}> for conflict-free replication`,
        });
      }

      // Check for JavaScript native collections
      if (field.type === 'Map') {
        ctx.issues.push({
          type: 'warning',
          message: `State field '${field.name}' uses native Map`,
          line: field.line,
          suggestion: 'Use UnorderedMap from @calimero-network/calimero-sdk-js/collections instead',
        });
      }

      if (field.type === 'Set') {
        ctx.issues.push({
          type: 'warning',
          message: `State field '${field.name}' uses native Set`,
          line: field.line,
          suggestion: 'Use UnorderedSet from @calimero-network/calimero-sdk-js/collections instead',
        });
      }

      if (field.type === 'Array') {
        ctx.issues.push({
          type: 'warning',
          message: `State field '${field.name}' uses native Array`,
          line: field.line,
          suggestion: 'Use Vector from @calimero-network/calimero-sdk-js/collections instead',
        });
      }
    }

    // Check that state class has at least one field
    if (stateInfo.fields.length === 0) {
      ctx.issues.push({
        type: 'warning',
        message: `State class '${stateName}' has no fields`,
        line: stateInfo.line,
        suggestion: 'Add fields to your state class to store application data',
      });
    }
  }
}

/**
 * Validate ABI compatibility
 */
function validateAbiCompatibility(ctx: ValidationContext, _options: ValidateOptions): void {
  for (const [, logicInfo] of ctx.logicClasses) {
    for (const method of logicInfo.methods) {
      // Skip private methods and constructor
      if (method.isPrivate || method.name === 'constructor') {
        continue;
      }

      // Check for @View on methods that don't modify state
      // This is a heuristic based on method name patterns
      const getterPatterns = /^(get|is|has|count|len|entries|keys|values)/i;
      if (
        getterPatterns.test(method.name) &&
        !method.isView &&
        !method.isInit &&
        method.returnType !== 'void'
      ) {
        ctx.issues.push({
          type: 'warning',
          message: `Method '${method.name}' appears to be a getter but lacks @View decorator`,
          line: method.line,
          suggestion: 'Add @View() decorator if this method does not modify state',
        });
      }

      // Validate @Init method return type
      if (method.isInit) {
        if (logicInfo.stateClass && method.returnType) {
          if (method.returnType !== logicInfo.stateClass) {
            ctx.issues.push({
              type: 'warning',
              message: `@Init method '${method.name}' should return ${logicInfo.stateClass}`,
              line: method.line,
              suggestion: `Change return type to ${logicInfo.stateClass}`,
            });
          }
        }
      }
    }
  }
}

/**
 * Check for known anti-patterns
 */
function checkAntiPatterns(ctx: ValidationContext, _options: ValidateOptions): void {
  for (const [logicName, logicInfo] of ctx.logicClasses) {
    // Check that logic class extends state class
    if (logicInfo.stateClass && logicInfo.extendsClass !== logicInfo.stateClass) {
      ctx.issues.push({
        type: 'warning',
        message: `Logic class '${logicName}' does not extend state class '${logicInfo.stateClass}'`,
        line: logicInfo.line,
        suggestion: `Change to: class ${logicName} extends ${logicInfo.stateClass} { ... }`,
      });
    }

    // Check for methods that might accidentally expose private data
    for (const method of logicInfo.methods) {
      // Methods named with common password/secret patterns
      const sensitivePatterns = /^(password|secret|private|token|key|auth)/i;
      if (sensitivePatterns.test(method.name) && !method.isPrivate) {
        ctx.issues.push({
          type: 'warning',
          message: `Method '${method.name}' has a sensitive name but is publicly exposed`,
          line: method.line,
          suggestion: 'Prefix with underscore to make private, or ensure this is intentional',
        });
      }
    }

    // Check for public methods that should probably be private
    const publicMethods = logicInfo.methods.filter(
      m => !m.isPrivate && !m.isInit && !m.isView && m.name !== 'constructor'
    );
    const helperPatterns = /^(helper|internal|_|respond|serialize|deserialize|validate|check)/i;
    for (const method of publicMethods) {
      if (helperPatterns.test(method.name)) {
        ctx.issues.push({
          type: 'warning',
          message: `Method '${method.name}' appears to be a helper/internal method but is publicly exposed`,
          line: method.line,
          suggestion: 'Prefix with underscore to make private: _' + method.name,
        });
      }
    }
  }

  // Check for event classes without @Event decorator
  // This is detected by looking for classes that end with Event/Events
  // and are not already in the eventClasses set
  // Note: This is a heuristic and may have false positives
}

/**
 * Report validation results
 */
function reportResults(
  ctx: ValidationContext,
  logger: ReturnType<typeof Signale>,
  options: ValidateOptions
): void {
  const errors = ctx.issues.filter(i => i.type === 'error');
  const warnings = ctx.issues.filter(i => i.type === 'warning');

  if (options.verbose || ctx.issues.length > 0) {
    console.log(''); // Empty line for readability
  }

  // Report errors
  for (const issue of errors) {
    const location = issue.line ? ` (line ${issue.line})` : '';
    logger.error(`${issue.message}${location}`);
    if (issue.suggestion && options.verbose) {
      console.log(`  Suggestion: ${issue.suggestion}`);
    }
  }

  // Report warnings
  for (const issue of warnings) {
    const location = issue.line ? ` (line ${issue.line})` : '';
    logger.warn(`${issue.message}${location}`);
    if (issue.suggestion && options.verbose) {
      console.log(`  Suggestion: ${issue.suggestion}`);
    }
  }

  // Summary
  if (options.verbose || ctx.issues.length > 0) {
    console.log(''); // Empty line for readability
  }

  if (errors.length > 0) {
    logger.error(`Validation failed: ${errors.length} error(s), ${warnings.length} warning(s)`);
  } else if (warnings.length > 0) {
    logger.warn(`Validation passed with ${warnings.length} warning(s)`);
  } else {
    logger.success('Contract validation passed');
  }

  // Print summary of found structures
  if (options.verbose) {
    console.log('');
    console.log('Validation summary:');
    console.log(`  State classes: ${Array.from(ctx.stateClasses.keys()).join(', ') || 'none'}`);
    console.log(`  Logic classes: ${Array.from(ctx.logicClasses.keys()).join(', ') || 'none'}`);
    console.log(`  Event classes: ${Array.from(ctx.eventClasses).join(', ') || 'none'}`);
    console.log(`  Has @Init: ${ctx.hasInitMethod ? 'yes' : 'no'}`);
  }
}
