/**
 * ABI Emitter for JavaScript/TypeScript applications
 *
 * This module provides build-time ABI generation similar to Rust's approach.
 * It analyzes TypeScript/JavaScript source code and generates ABI manifests
 * that describe the application's state, methods, and events.
 */

import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as fs from 'fs';
import * as path from 'path';

const traverse = (traverseModule as any).default || traverseModule;

export interface AbiManifest {
  schema_version: string;
  types: Record<string, TypeDef>;
  methods: Method[];
  events: Event[];
  state_root?: string;
}

export interface TypeDef {
  kind: 'record' | 'variant' | 'bytes' | 'alias';
  fields?: Field[];
  variants?: Variant[];
  size?: number;
  encoding?: string;
  target?: TypeRef;
}

export interface Field {
  name: string;
  type: TypeRef;
  nullable?: boolean;
}

export interface Variant {
  name: string;
  code?: string;
  payload?: TypeRef;
}

export interface Method {
  name: string;
  params: Parameter[];
  returns?: TypeRef;
  is_init?: boolean;
  is_view?: boolean;
}

export interface Parameter {
  name: string;
  type: TypeRef;
}

export interface Event {
  name: string;
  fields: Field[];
}

export interface TypeRef {
  kind: 'scalar' | 'option' | 'vector' | 'map' | 'set' | 'reference' | 'bytes';
  scalar?: ScalarType;
  inner?: TypeRef;
  key?: TypeRef;
  value?: TypeRef;
  name?: string;
  size?: number; // For bytes type
}

export type ScalarType =
  | 'bool'
  | 'u8'
  | 'u16'
  | 'u32'
  | 'u64'
  | 'u128'
  | 'i8'
  | 'i16'
  | 'i32'
  | 'i64'
  | 'i128'
  | 'f32'
  | 'f64'
  | 'string'
  | 'bytes'
  | 'unit';

export class AbiEmitter {
  private types: Map<string, TypeDef> = new Map();
  private methods: Method[] = [];
  private events: Event[] = [];
  private stateRoot?: string;

  /**
   * Analyze a JavaScript/TypeScript file and generate ABI manifest
   */
  public analyzeFile(filePath: string): AbiManifest {
    const sourceCode = fs.readFileSync(filePath, 'utf-8');
    return this.analyzeSource(sourceCode, filePath);
  }

  /**
   * Analyze multiple files and generate ABI manifest
   * This is needed to extract all type definitions across the project
   */
  public analyzeFiles(filePaths: string[]): AbiManifest {
    // Reset state
    this.types.clear();
    this.methods = [];
    this.events = [];
    this.stateRoot = undefined;

    // First pass: Extract all type aliases and interfaces from all files
    for (const filePath of filePaths) {
      const sourceCode = fs.readFileSync(filePath, 'utf-8');
      const ast = parse(sourceCode, {
        sourceType: 'module',
        plugins: ['typescript', 'decorators-legacy', 'classProperties'],
      });

      traverse(ast, {
        TSTypeAliasDeclaration: (nodePath: any) => {
          this.analyzeTypeAlias(nodePath.node);
        },
        TSInterfaceDeclaration: (nodePath: any) => {
          this.analyzeInterface(nodePath.node);
        },
        ExportNamedDeclaration: (nodePath: any) => {
          if (nodePath.node.declaration?.type === 'TSTypeAliasDeclaration') {
            this.analyzeTypeAlias(nodePath.node.declaration);
          } else if (nodePath.node.declaration?.type === 'TSInterfaceDeclaration') {
            this.analyzeInterface(nodePath.node.declaration);
          }
        },
      });
    }

    // Second pass: Find decorated classes from all files
    // Track analyzed classes to avoid duplicates (exported classes appear in both ClassDeclaration and ExportNamedDeclaration)
    const analyzedClasses = new Set<string>();
    for (const filePath of filePaths) {
      const sourceCode = fs.readFileSync(filePath, 'utf-8');
      const ast = parse(sourceCode, {
        sourceType: 'module',
        plugins: ['typescript', 'decorators-legacy', 'classProperties'],
      });

      traverse(ast, {
        ClassDeclaration: (nodePath: any) => {
          const className = nodePath.node.id?.name;
          if (className && !analyzedClasses.has(className)) {
            analyzedClasses.add(className);
            this.analyzeClass(nodePath.node);
          }
        },
        ExportNamedDeclaration: (nodePath: any) => {
          if (nodePath.node.declaration?.type === 'ClassDeclaration') {
            const className = nodePath.node.declaration.id?.name;
            if (className && !analyzedClasses.has(className)) {
              analyzedClasses.add(className);
              this.analyzeClass(nodePath.node.declaration);
            }
          }
        },
      });
    }

    return this.generateManifest();
  }

  /**
   * Analyze source code and generate ABI manifest
   */
  public analyzeSource(sourceCode: string, _filePath?: string): AbiManifest {
    const ast = parse(sourceCode, {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy', 'classProperties'],
    });

    // Reset state
    this.types.clear();
    this.methods = [];
    this.events = [];
    this.stateRoot = undefined;

    // First pass: Extract type aliases and interfaces
    traverse(ast, {
      TSTypeAliasDeclaration: (nodePath: any) => {
        this.analyzeTypeAlias(nodePath.node);
      },
      TSInterfaceDeclaration: (nodePath: any) => {
        this.analyzeInterface(nodePath.node);
      },
      ExportNamedDeclaration: (nodePath: any) => {
        if (nodePath.node.declaration?.type === 'TSTypeAliasDeclaration') {
          this.analyzeTypeAlias(nodePath.node.declaration);
        } else if (nodePath.node.declaration?.type === 'TSInterfaceDeclaration') {
          this.analyzeInterface(nodePath.node.declaration);
        }
      },
    });

    // Second pass: Find all classes (decorated and referenced)
    // Track analyzed classes to avoid duplicates (exported classes appear in both ClassDeclaration and ExportNamedDeclaration)
    const analyzedClasses = new Set<string>();

    // First, analyze decorated classes (State, Logic, Event)
    traverse(ast, {
      ClassDeclaration: (nodePath: any) => {
        const className = nodePath.node.id?.name;
        if (className && !analyzedClasses.has(className)) {
          analyzedClasses.add(className);
          this.analyzeClass(nodePath.node);
        }
      },
      ExportNamedDeclaration: (nodePath: any) => {
        if (nodePath.node.declaration?.type === 'ClassDeclaration') {
          const className = nodePath.node.declaration.id?.name;
          if (className && !analyzedClasses.has(className)) {
            analyzedClasses.add(className);
            this.analyzeClass(nodePath.node.declaration);
          }
        }
      },
    });

    // Third pass: Analyze variant patterns (abstract classes with concrete subclasses)
    // This handles patterns like abstract class Status with Status_Active, Status_Pending, etc.
    const variantBases = new Map<string, any[]>(); // base class name -> variant classes
    traverse(ast, {
      ClassDeclaration: (nodePath: any) => {
        const className = nodePath.node.id?.name;
        if (className && nodePath.node.superClass?.type === 'Identifier') {
          const superClassName = nodePath.node.superClass.name;
          if (!variantBases.has(superClassName)) {
            variantBases.set(superClassName, []);
          }
          variantBases.get(superClassName)!.push(nodePath.node);
        }
      },
      ExportNamedDeclaration: (nodePath: any) => {
        if (nodePath.node.declaration?.type === 'ClassDeclaration') {
          const className = nodePath.node.declaration.id?.name;
          if (className && nodePath.node.declaration.superClass?.type === 'Identifier') {
            const superClassName = nodePath.node.declaration.superClass.name;
            if (!variantBases.has(superClassName)) {
              variantBases.set(superClassName, []);
            }
            variantBases.get(superClassName)!.push(nodePath.node.declaration);
          }
        }
      },
    });

    // Analyze variant bases and their variants
    // Use a Set to track analyzed bases to avoid duplicates
    const analyzedBases = new Set<string>();
    for (const [baseName, variants] of variantBases.entries()) {
      if (analyzedBases.has(baseName)) continue;
      analyzedBases.add(baseName);

      const baseClass = this.findClassInAst(ast, baseName);
      if (baseClass && baseClass.abstract) {
        this.analyzeVariantPattern(baseClass, variants);
      }
    }

    return this.generateManifest();
  }

  private analyzeClass(classNode: any): void {
    const className = classNode.id?.name;
    if (!className) return;

    const decorators = classNode.decorators || [];

    // Check for @State decorator
    const hasStateDecorator = decorators.some((d: any) => this.isCalimeroDecorator(d, 'State'));

    // Check for @Logic decorator
    const hasLogicDecorator = decorators.some((d: any) => this.isCalimeroDecorator(d, 'Logic'));

    // Check for @Event decorator (for event classes)
    const hasEventDecorator = decorators.some((d: any) => this.isCalimeroDecorator(d, 'Event'));

    if (hasStateDecorator) {
      this.stateRoot = className;
      this.analyzeStateClass(classNode);
    }

    if (hasLogicDecorator) {
      this.analyzeLogicClass(classNode);
    }

    if (hasEventDecorator) {
      this.analyzeEventClass(classNode);
    }

    // Also analyze classes that are referenced but not decorated (e.g., Profile, Status variants)
    // These are used as types in state fields or method parameters
    if (!hasStateDecorator && !hasLogicDecorator && !hasEventDecorator) {
      // Check if it's a variant pattern (abstract class with static factory methods)
      if (classNode.superClass && classNode.superClass.type === 'Identifier') {
        // This might be a variant class (e.g., Status_Active extends Status)
        // We'll handle variants separately
        return;
      }

      // Check if it's a regular record class (has properties but no decorators)
      // Only analyze if it has properties (not abstract/empty)
      if (!classNode.abstract && classNode.body?.body?.length > 0) {
        const hasProperties = classNode.body.body.some(
          (member: any) =>
            (member.type === 'ClassProperty' || member.type === 'PropertyDefinition') &&
            !member.key?.name?.startsWith('_')
        );
        if (hasProperties) {
          this.analyzeStateClass(classNode);
        }
      }
    }
  }

  private analyzeStateClass(classNode: any): void {
    const className = classNode.id?.name;
    if (!className) return;

    const fields: Field[] = [];

    // Analyze class properties
    classNode.body.body.forEach((member: any) => {
      if (member.type === 'ClassProperty' || member.type === 'PropertyDefinition') {
        const fieldName = member.key?.name;
        if (fieldName && !fieldName.startsWith('_')) {
          const typeRef = this.extractTypeFromAnnotation(member.typeAnnotation);
          fields.push({
            name: fieldName,
            type: typeRef,
          });
        }
      }
    });

    // Only add if not already present (to avoid overwriting variants)
    if (!this.types.has(className)) {
      this.types.set(className, {
        kind: 'record',
        fields,
      });
    }
  }

  private findClassInAst(ast: any, className: string): any {
    let found: any = null;
    traverse(ast, {
      ClassDeclaration: (nodePath: any) => {
        if (nodePath.node.id?.name === className) {
          found = nodePath.node;
        }
      },
      ExportNamedDeclaration: (nodePath: any) => {
        if (
          nodePath.node.declaration?.type === 'ClassDeclaration' &&
          nodePath.node.declaration.id?.name === className
        ) {
          found = nodePath.node.declaration;
        }
      },
    });
    return found;
  }

  private analyzeVariantPattern(baseClass: any, variantClasses: any[]): void {
    const baseName = baseClass.id?.name;
    if (!baseName) return;

    const variants: any[] = [];
    const seenVariants = new Set<string>();

    // Analyze each variant class
    for (const variantClass of variantClasses) {
      const variantName = variantClass.id?.name;
      if (!variantName) continue;

      // Extract variant name (e.g., "Status_Active_Variant" -> "Active", "Status_Pending" -> "Pending")
      // Handle both patterns: Status_Active_Variant and Status_Active
      let nameParts = variantName.split('_');
      // Remove base name (first part) and "_Variant" suffix if present
      if (nameParts.length > 1 && nameParts[0] === baseName) {
        nameParts = nameParts.slice(1);
      }
      // Remove "_Variant" suffix if present
      if (nameParts[nameParts.length - 1] === 'Variant') {
        nameParts = nameParts.slice(0, -1);
      }
      const variantDisplayName = nameParts.join('_') || variantName;

      // Skip duplicates
      if (seenVariants.has(variantDisplayName)) {
        continue;
      }
      seenVariants.add(variantDisplayName);

      // Check if variant has payload (constructor parameters or properties)
      const fields: Field[] = [];

      // Check constructor parameters first (TypeScript pattern: constructor(public field: type))
      if (variantClass.body?.body) {
        variantClass.body.body.forEach((member: any) => {
          // Check for constructor with parameters
          if (member.type === 'ClassMethod' || member.type === 'MethodDefinition') {
            if (member.key?.name === 'constructor' && member.params) {
              member.params.forEach((param: any) => {
                // Handle TSParameterProperty (TypeScript parameter property: constructor(public field: type))
                if (param.type === 'TSParameterProperty' && param.accessibility === 'public') {
                  const innerParam = param.parameter;
                  const fieldName = innerParam.name;
                  const typeRef = this.extractTypeFromAnnotation(innerParam.typeAnnotation);
                  fields.push({
                    name: fieldName,
                    type: typeRef,
                  });
                }
                // Handle regular Identifier (fallback)
                else if (param.type === 'Identifier' && param.accessibility === 'public') {
                  const fieldName = param.name;
                  const typeRef = this.extractTypeFromAnnotation(param.typeAnnotation);
                  fields.push({
                    name: fieldName,
                    type: typeRef,
                  });
                }
              });
            }
          }
          // Check for class properties
          if (member.type === 'ClassProperty' || member.type === 'PropertyDefinition') {
            const fieldName = member.key?.name;
            if (fieldName && !fieldName.startsWith('_')) {
              const typeRef = this.extractTypeFromAnnotation(member.typeAnnotation);
              fields.push({
                name: fieldName,
                type: typeRef,
              });
            }
          }
        });
      }

      if (fields.length > 0) {
        // Variant with payload - create a record type for the payload
        const payloadTypeName = `${baseName}_${variantDisplayName}`;
        this.types.set(payloadTypeName, {
          kind: 'record',
          fields,
        });
        variants.push({
          name: variantDisplayName,
          payload: { $ref: payloadTypeName },
        });
      } else {
        // Variant without payload
        variants.push({
          name: variantDisplayName,
        });
      }
    }

    // Add variant type (only if not already present)
    if (!this.types.has(baseName)) {
      this.types.set(baseName, {
        kind: 'variant',
        variants,
      });
    }
  }

  private analyzeLogicClass(classNode: any): void {
    classNode.body.body.forEach((member: any) => {
      // Babel uses 'ClassMethod', TypeScript uses 'MethodDefinition'
      if (
        (member.type === 'MethodDefinition' || member.type === 'ClassMethod') &&
        member.key?.name
      ) {
        const methodName = member.key.name;

        // Skip private methods and constructor
        if (methodName.startsWith('_') || methodName === 'constructor') {
          return;
        }

        const decorators = member.decorators || [];
        const isInit = decorators.some((d: any) => this.isCalimeroDecorator(d, 'Init'));
        const isView = decorators.some((d: any) => this.isCalimeroDecorator(d, 'View'));
        const isStatic = member.static;

        // Extract parameters
        // Babel uses 'params' directly, TypeScript uses 'value.params'
        const methodParams = member.params || member.value?.params || [];
        const params: Parameter[] = [];
        methodParams.forEach((param: any, index: number) => {
          if (param.type === 'Identifier' || param.type === 'Pattern') {
            let paramName = param.name || param.left?.name;
            const typeAnnotation = param.typeAnnotation || param.left?.typeAnnotation;
            const isOptional = param.optional || false;

            // Strip leading underscore from parameter names (convention for unused params)
            if (paramName && paramName.startsWith('_')) {
              paramName = paramName.substring(1);
            }

            // Extract type with context for type inference from method name
            const typeRef = this.extractTypeFromAnnotation(typeAnnotation, {
              methodName,
              isReturn: false,
            });

            // Skip 'this' parameter for non-static methods
            if (index === 0 && !isStatic && paramName === 'this') {
              return;
            }

            if (paramName) {
              const paramObj: any = {
                name: paramName,
                type: typeRef,
              };
              if (isOptional) {
                paramObj.nullable = true;
              }
              params.push(paramObj);
            }
          }
        });

        // Extract return type
        // Babel uses 'returnType', TypeScript uses 'value.returnType'
        let returns: TypeRef | undefined;

        // Init methods always return unit in Rust ABI format
        if (isInit) {
          returns = { kind: 'scalar', scalar: 'unit' } as any;
        } else {
          const returnType = member.returnType || member.value?.returnType;
          let returnsNullable = false;

          if (returnType) {
            // Check if return type is a union with undefined/null
            if (
              returnType.typeAnnotation?.type === 'TSUnionType' &&
              returnType.typeAnnotation.types
            ) {
              const hasUndefined = returnType.typeAnnotation.types.some(
                (t: any) => t.type === 'TSUndefinedKeyword' || t.type === 'TSNullKeyword'
              );
              if (hasUndefined) {
                returnsNullable = true;
              }
            }

            returns = this.extractTypeFromAnnotation(returnType, {
              methodName,
              isReturn: true,
            });
          }

          // Handle void return type - check if return type is explicitly void
          const returnTypeNode = member.returnType || member.value?.returnType;
          if (returnTypeNode?.typeAnnotation?.type === 'TSVoidKeyword') {
            returns = { kind: 'scalar', scalar: 'unit' } as any;
          } else if (!returns) {
            // If no return type annotation, assume void for methods without explicit return
            // But check the actual return statement to be more accurate
            // For now, leave undefined and let Rust format serializer handle it
          }

          // Store nullable flag for return type
          if (returnsNullable) {
            (returns as any).nullable = true;
          }
        }

        this.methods.push({
          name: methodName,
          params,
          returns,
          is_init: isInit,
          is_view: isView,
        });
      }
    });
  }

  private analyzeEventClass(classNode: any): void {
    const className = classNode.id?.name;
    if (!className) return;

    // Check if event already exists (avoid duplicates)
    if (this.events.some(e => e.name === className)) {
      return;
    }

    const fields: Field[] = [];

    // Analyze constructor parameters as event fields
    // Babel uses 'ClassMethod' with kind='constructor', TypeScript uses 'MethodDefinition'
    const constructor = classNode.body.body.find(
      (member: any) =>
        (member.type === 'MethodDefinition' || member.type === 'ClassMethod') &&
        member.kind === 'constructor'
    );

    // Babel uses 'params' directly, TypeScript uses 'value.params'
    const constructorParams = constructor?.params || constructor?.value?.params || [];
    constructorParams.forEach((param: any) => {
      // Handle regular parameters: Identifier or Pattern
      if (param.type === 'Identifier' || param.type === 'Pattern') {
        const fieldName = param.name || param.left?.name;
        const typeAnnotation = param.typeAnnotation || param.left?.typeAnnotation;
        if (fieldName) {
          const typeRef = this.extractTypeFromAnnotation(typeAnnotation);
          fields.push({
            name: fieldName,
            type: typeRef,
          });
        }
      }
      // Handle TypeScript parameter properties with visibility modifiers: constructor(public payload: string)
      // These produce TSParameterProperty nodes in Babel's AST
      else if (param.type === 'TSParameterProperty') {
        const actualParam = param.parameter;
        const fieldName = actualParam?.name || actualParam?.left?.name;
        const typeAnnotation = actualParam?.typeAnnotation || actualParam?.left?.typeAnnotation;
        if (fieldName) {
          const typeRef = this.extractTypeFromAnnotation(typeAnnotation);
          fields.push({
            name: fieldName,
            type: typeRef,
          });
        }
      }
    });

    this.events.push({
      name: className,
      fields,
    });

    // If event has multiple fields, create a record type for the payload
    // This ensures the Event_${className} type exists when referenced in serializeEventsToRustFormat
    if (fields.length > 1) {
      const eventTypeName = `Event_${className}`;
      this.types.set(eventTypeName, {
        kind: 'record',
        fields,
      });
    }
  }

  private extractTypeFromAnnotation(
    typeAnnotation: any,
    context?: { methodName?: string; isReturn?: boolean }
  ): TypeRef {
    if (!typeAnnotation?.typeAnnotation) {
      return { kind: 'string' } as any; // Default fallback
    }

    const type = typeAnnotation.typeAnnotation;

    switch (type.type) {
      case 'TSStringKeyword':
        return { kind: 'scalar', scalar: 'string' } as any;
      case 'TSNumberKeyword': {
        // Infer type from method name if available (e.g., echo_i32 -> i32, echo_f64 -> f64)
        if (context?.methodName) {
          const methodName = context.methodName;
          if (methodName.includes('_i32') || methodName.includes('_i64')) {
            return methodName.includes('_i64')
              ? ({ kind: 'scalar', scalar: 'i64' } as any)
              : ({ kind: 'scalar', scalar: 'i32' } as any);
          }
          if (methodName.includes('_f32') || methodName.includes('_f64')) {
            return methodName.includes('_f64')
              ? ({ kind: 'scalar', scalar: 'f64' } as any)
              : ({ kind: 'scalar', scalar: 'f32' } as any);
          }
        }
        // Default to u32 for numbers
        return { kind: 'scalar', scalar: 'u32' } as any;
      }
      case 'TSBooleanKeyword':
        return { kind: 'scalar', scalar: 'bool' } as any;
      case 'TSBigIntKeyword': {
        // Infer signed vs unsigned from method name
        if (context?.methodName && context.methodName.includes('_i64')) {
          return { kind: 'scalar', scalar: 'i64' } as any;
        }
        return { kind: 'scalar', scalar: 'u64' } as any;
      }
      case 'TSUnionType': {
        // Handle union types like T | null | undefined
        let hasNullable = false;
        let nonNullType: any = null;
        if (type.types && Array.isArray(type.types)) {
          for (const unionMember of type.types) {
            // Skip null and undefined types but mark as nullable
            if (unionMember.type === 'TSNullKeyword' || unionMember.type === 'TSUndefinedKeyword') {
              hasNullable = true;
              continue;
            }
            // Extract the first non-null type
            if (!nonNullType) {
              nonNullType = this.extractTypeFromAnnotation(
                { typeAnnotation: unionMember },
                context
              );
            }
          }
        }
        if (nonNullType) {
          // Mark as nullable if union contained null/undefined
          if (hasNullable && context?.isReturn) {
            (nonNullType as any).nullable = true;
          }
          return nonNullType;
        }
        // If all types are null/undefined (shouldn't happen), fall through to default
        return { kind: 'string' } as any;
      }
      case 'TSTypeReference':
        return this.extractTypeReference(type);
      case 'TSArrayType':
        return {
          kind: 'vector',
          inner: this.extractTypeFromAnnotation({ typeAnnotation: type.elementType }, context),
        } as any;
      default:
        return { kind: 'string' } as any;
    }
  }

  private extractTypeReference(type: any): TypeRef {
    const typeName = type.typeName?.name;

    if (!typeName) {
      return { kind: 'string' } as any;
    }

    // Handle Calimero CRDT types
    switch (typeName) {
      case 'UnorderedMap':
        if (type.typeParameters?.params?.length >= 2) {
          return {
            kind: 'map',
            key: this.extractTypeFromAnnotation({ typeAnnotation: type.typeParameters.params[0] }),
            value: this.extractTypeFromAnnotation({
              typeAnnotation: type.typeParameters.params[1],
            }),
          };
        }
        break;
      case 'UnorderedSet':
        // Rust schema doesn't support "set", so convert to list
        if (type.typeParameters?.params?.length >= 1) {
          return {
            kind: 'vector',
            inner: this.extractTypeFromAnnotation({
              typeAnnotation: type.typeParameters.params[0],
            }),
          } as any;
        }
        break;
      case 'Vector':
        if (type.typeParameters?.params?.length >= 1) {
          return {
            kind: 'vector',
            inner: this.extractTypeFromAnnotation({
              typeAnnotation: type.typeParameters.params[0],
            }),
          } as any;
        }
        break;
      case 'Counter':
        // Counter returns u64 value, but is stored as collection reference (32 bytes)
        // ABI represents the logical type (u64), deserializer handles the storage format
        return { kind: 'u64' } as any;
      case 'LwwRegister':
        if (type.typeParameters?.params?.length >= 1) {
          return this.extractTypeFromAnnotation({ typeAnnotation: type.typeParameters.params[0] });
        }
        break;
      case 'Map':
        // Handle JavaScript native Map<K, V> type
        if (type.typeParameters?.params?.length >= 2) {
          return {
            kind: 'map',
            key: this.extractTypeFromAnnotation({ typeAnnotation: type.typeParameters.params[0] }),
            value: this.extractTypeFromAnnotation({
              typeAnnotation: type.typeParameters.params[1],
            }),
          };
        }
        break;
    }

    // Handle Uint8Array as bytes
    if (typeName === 'Uint8Array') {
      return { kind: 'scalar', scalar: 'bytes' } as any;
    }

    // Handle custom types - use reference format
    return { kind: 'reference', name: typeName } as any;
  }

  private analyzeTypeAlias(typeAlias: any): void {
    const typeName = typeAlias.id?.name;
    if (!typeName) return;

    const typeAnnotation = typeAlias.typeAnnotation;

    // Check if it's an object type literal (type X = { ... })
    if (typeAnnotation?.type === 'TSTypeLiteral') {
      // Extract as a record type
      const fields: Field[] = [];

      if (typeAnnotation.members) {
        typeAnnotation.members.forEach((member: any) => {
          if (member.type === 'TSPropertySignature' && member.key?.name) {
            const fieldName = member.key.name;
            const typeRef = this.extractTypeFromAnnotation(member.typeAnnotation);
            const nullable = member.optional || undefined;

            fields.push({
              name: fieldName,
              type: typeRef,
              nullable: nullable ? true : undefined,
            });
          }
        });
      }

      // Add as a record type
      this.types.set(typeName, {
        kind: 'record',
        fields,
      });
    } else {
      // It's a simple alias (type X = Y)
      const targetType = this.extractTypeFromAnnotation({ typeAnnotation });

      // Special handling for Uint8Array aliases (bytes)
      if (
        typeAnnotation?.type === 'TSTypeReference' &&
        typeAnnotation.typeName?.name === 'Uint8Array'
      ) {
        // For bytes aliases, check if there's a size constraint
        // Check for size annotation in type name (e.g., UserId32 -> 32)
        // This is a convention: if type name ends with digits, use as size
        const sizeMatch = typeName.match(/(\d+)$/);
        const size = sizeMatch ? parseInt(sizeMatch[1], 10) : undefined;

        // Also check comment for explicit size annotation (e.g., // bytes[32])
        let explicitSize = size;
        if (typeAlias.leadingComments) {
          for (const comment of typeAlias.leadingComments) {
            const commentText = comment.value || '';
            const sizeMatchComment = commentText.match(/bytes\[(\d+)\]/);
            if (sizeMatchComment) {
              explicitSize = parseInt(sizeMatchComment[1], 10);
              break;
            }
          }
        }

        // Use 'bytes' kind directly, not 'scalar'
        const targetType: any = {
          kind: 'bytes',
        };
        if (explicitSize !== undefined) {
          targetType.size = explicitSize;
        }

        this.types.set(typeName, {
          kind: 'alias',
          target: targetType,
        });
      } else {
        // Add as an alias type
        this.types.set(typeName, {
          kind: 'alias',
          target: targetType,
        });
      }
    }
  }

  private analyzeInterface(interfaceNode: any): void {
    const interfaceName = interfaceNode.id?.name;
    if (!interfaceName) return;

    const fields: Field[] = [];

    // Extract interface properties
    if (interfaceNode.body?.body) {
      interfaceNode.body.body.forEach((member: any) => {
        if (member.type === 'TSPropertySignature' && member.key?.name) {
          const fieldName = member.key.name;
          const typeRef = this.extractTypeFromAnnotation(member.typeAnnotation);
          const nullable = member.optional || undefined;
          fields.push({
            name: fieldName,
            type: typeRef,
            nullable: nullable ? true : undefined,
          });
        }
      });
    }

    // Add as a record type
    this.types.set(interfaceName, {
      kind: 'record',
      fields,
    });
  }

  private isCalimeroDecorator(decorator: any, name: string): boolean {
    if (decorator.expression?.type === 'Identifier') {
      return decorator.expression.name === name;
    }
    if (decorator.expression?.type === 'CallExpression') {
      return decorator.expression.callee?.name === name;
    }
    return false;
  }

  /**
   * Convert TypeRef to Rust ABI format
   * Rust format uses { "kind": "u32" } for scalars, not { "kind": "scalar", "scalar": "u32" }
   */
  private serializeTypeRefToRustFormat(typeRef: TypeRef): any {
    // Handle bytes type directly (from alias) - check early before type narrowing
    if (typeRef.kind === 'bytes') {
      const result: any = { kind: 'bytes' };
      if (typeRef.size !== undefined) {
        result.size = typeRef.size;
      }
      return result;
    }

    if (typeRef.kind === 'scalar' && typeRef.scalar) {
      // Handle bytes type (can be scalar)
      if (typeRef.scalar === 'bytes') {
        const result: any = { kind: 'bytes' };
        // Preserve size if present
        if ((typeRef as any).size !== undefined) {
          result.size = (typeRef as any).size;
        }
        return result;
      }
      // Rust format: { "kind": "u32" } instead of { "kind": "scalar", "scalar": "u32" }
      // Special case: "unit" should stay as "unit"
      if (typeRef.scalar === 'unit') {
        return { kind: 'unit' };
      }
      return { kind: typeRef.scalar };
    }

    if (typeRef.kind === 'vector' && typeRef.inner) {
      // Rust format uses "list" not "vector", and "items" not "inner"
      return {
        kind: 'list',
        items: this.serializeTypeRefToRustFormat(typeRef.inner),
      };
    }

    if (typeRef.kind === 'map' && typeRef.key && typeRef.value) {
      return {
        kind: 'map',
        key: this.serializeTypeRefToRustFormat(typeRef.key),
        value: this.serializeTypeRefToRustFormat(typeRef.value),
      };
    }

    if (typeRef.kind === 'set' && typeRef.inner) {
      // Rust format uses "list" for sets, and "items" not "inner"
      return {
        kind: 'list',
        items: this.serializeTypeRefToRustFormat(typeRef.inner),
        crdt_type: 'unordered_set',
      };
    }

    if (typeRef.kind === 'option' && typeRef.inner) {
      return {
        kind: 'option',
        inner: this.serializeTypeRefToRustFormat(typeRef.inner),
      };
    }

    if (typeRef.kind === 'reference' && typeRef.name) {
      // Rust format uses $ref for references
      return { $ref: typeRef.name };
    }

    // Handle $ref format (already in Rust format)
    if ((typeRef as any).$ref) {
      return { $ref: (typeRef as any).$ref };
    }

    // Fallback: return as-is (for string, etc.)
    if (typeRef.kind === 'scalar') {
      return { kind: typeRef.scalar || 'string' };
    }

    return typeRef as any;
  }

  /**
   * Serialize types to Rust ABI format
   */
  private serializeTypesToRustFormat(): Record<string, any> {
    const result: Record<string, any> = {};

    // Sort types alphabetically for consistent output
    const sortedTypes = Array.from(this.types.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    for (const [typeName, typeDef] of sortedTypes) {
      const serialized: any = {
        kind: typeDef.kind,
      };

      if (typeDef.fields) {
        serialized.fields = typeDef.fields.map(field => ({
          name: field.name,
          type: this.serializeTypeRefToRustFormat(field.type),
          nullable: field.nullable,
        }));
      }

      if (typeDef.variants) {
        serialized.variants = typeDef.variants.map(variant => ({
          name: variant.name,
          code: variant.code,
          payload: variant.payload ? this.serializeTypeRefToRustFormat(variant.payload) : undefined,
        }));
      }

      if (typeDef.target) {
        serialized.target = this.serializeTypeRefToRustFormat(typeDef.target);
      }

      if (typeDef.size !== undefined) {
        serialized.size = typeDef.size;
      }

      result[typeName] = serialized;
    }

    return result;
  }

  /**
   * Serialize methods to Rust ABI format
   */
  private serializeMethodsToRustFormat(): any[] {
    return this.methods.map(method => {
      const result: any = {
        name: method.name,
        params: method.params.map(param => {
          const paramObj: any = {
            name: param.name,
            type: this.serializeTypeRefToRustFormat(param.type),
          };
          // Check nullable flag on param object (set during extraction)
          if ((param as any).nullable) {
            paramObj.nullable = true;
          }
          return paramObj;
        }),
      };

      if (method.returns) {
        const serializedReturn = this.serializeTypeRefToRustFormat(method.returns);
        // Rust uses "unit" kind for void, but we might have it as scalar
        if (serializedReturn.kind === 'unit') {
          result.returns = { kind: 'unit' };
        } else {
          result.returns = serializedReturn;
        }
      } else {
        // No return type means void/unit
        result.returns = { kind: 'unit' };
      }

      // Note: is_init and is_view are not included in Rust ABI format
      if ((method.returns as any)?.nullable) result.returns_nullable = true;

      return result;
    });
  }

  /**
   * Serialize events to Rust ABI format
   */
  private serializeEventsToRustFormat(): any[] {
    // Remove duplicates
    const uniqueEvents = Array.from(new Map(this.events.map(e => [e.name, e])).values());

    return uniqueEvents.map(event => {
      // Rust format: events can have just name, or name + payload
      if (event.fields.length === 0) {
        // No fields - just name
        return { name: event.name };
      }

      if (event.fields.length === 1 && event.fields[0].name === 'payload') {
        // Single payload field
        return {
          name: event.name,
          payload: this.serializeTypeRefToRustFormat(event.fields[0].type),
        };
      }

      if (event.fields.length === 1) {
        // Single field (not named payload) - use as payload
        return {
          name: event.name,
          payload: this.serializeTypeRefToRustFormat(event.fields[0].type),
        };
      }

      // Multiple fields - use fields array (though Rust typically uses payload)
      // For now, if all fields are in constructor, treat as single payload with struct
      return {
        name: event.name,
        payload: {
          $ref: `Event_${event.name}`,
        },
      };
    });
  }

  private generateManifest(): AbiManifest {
    // Note: This returns the internal format. Use serializeToRustFormat() for Rust-compatible output
    return {
      schema_version: 'wasm-abi/1',
      types: Object.fromEntries(this.types),
      methods: this.methods,
      events: this.events,
      state_root: this.stateRoot,
    };
  }

  /**
   * Generate manifest in Rust ABI format
   */
  public generateManifestRustFormat(): any {
    return {
      schema_version: 'wasm-abi/1',
      types: this.serializeTypesToRustFormat(),
      methods: this.serializeMethodsToRustFormat(),
      events: this.serializeEventsToRustFormat(),
      state_root: this.stateRoot,
    };
  }

  /**
   * Serialize type reference with CRDT metadata for state schema
   */
  private serializeTypeRefWithCrdtMetadata(typeAnnotation: any): any {
    if (!typeAnnotation) {
      return { kind: 'string' };
    }

    const type = typeAnnotation.typeAnnotation || typeAnnotation;
    const typeName = type.typeName?.name;

    if (!typeName) {
      // Handle scalar types
      if (type.type === 'TSStringKeyword') {
        return { kind: 'string' };
      }
      if (type.type === 'TSNumberKeyword') {
        return { kind: 'u32' };
      }
      if (type.type === 'TSBooleanKeyword') {
        return { kind: 'bool' };
      }
      if (type.type === 'TSBigIntKeyword') {
        return { kind: 'u64' };
      }
      return { kind: 'string' };
    }

    // Handle CRDT collection types
    switch (typeName) {
      case 'UnorderedMap': {
        if (type.typeParameters?.params?.length >= 2) {
          const keyType = this.serializeTypeRefWithCrdtMetadata({
            typeAnnotation: type.typeParameters.params[0],
          });
          const valueType = this.serializeTypeRefWithCrdtMetadata({
            typeAnnotation: type.typeParameters.params[1],
          });
          return {
            kind: 'map',
            key: keyType,
            value: valueType,
            crdt_type: 'unordered_map',
          };
        }
        break;
      }
      case 'UnorderedSet': {
        if (type.typeParameters?.params?.length >= 1) {
          const itemType = this.serializeTypeRefWithCrdtMetadata({
            typeAnnotation: type.typeParameters.params[0],
          });
          return {
            kind: 'list',
            items: itemType,
            crdt_type: 'unordered_set',
          };
        }
        break;
      }
      case 'Vector': {
        if (type.typeParameters?.params?.length >= 1) {
          const itemType = this.serializeTypeRefWithCrdtMetadata({
            typeAnnotation: type.typeParameters.params[0],
          });
          return {
            kind: 'list',
            items: itemType,
            crdt_type: 'vector',
          };
        }
        break;
      }
      case 'Counter': {
        return {
          kind: 'record',
          fields: [],
          crdt_type: 'counter',
        };
      }
      case 'LwwRegister': {
        if (type.typeParameters?.params?.length >= 1) {
          const innerType = this.serializeTypeRefWithCrdtMetadata({
            typeAnnotation: type.typeParameters.params[0],
          });
          return {
            kind: 'record',
            fields: [],
            crdt_type: 'lww_register',
            inner_type: innerType,
          };
        }
        break;
      }
      default: {
        // Handle type references (e.g., Person, Status)
        return { $ref: typeName };
      }
    }

    return { kind: 'string' };
  }

  /**
   * Generate state schema with CRDT metadata
   */
  public generateStateSchemaWithCrdtMetadata(sourceCode: string, stateRootTypeName: string): any {
    const stateRootType = this.types.get(stateRootTypeName);
    if (!stateRootType || stateRootType.kind !== 'record') {
      throw new Error(`State root type ${stateRootTypeName} not found or not a record`);
    }

    // Re-parse source to get CRDT metadata for state fields
    const ast = parse(sourceCode, {
      sourceType: 'module',
      plugins: ['typescript', 'classProperties', 'decorators-legacy'],
    });

    // Find the state class
    let stateClassNode: any = null;
    traverse(ast, {
      ClassDeclaration: (nodePath: any) => {
        const className = nodePath.node.id?.name;
        const decorators = nodePath.node.decorators || [];
        const hasStateDecorator = decorators.some((d: any) => {
          const expr = d.expression;
          return (
            (expr.type === 'Identifier' && expr.name === 'State') || expr.callee?.name === 'State'
          );
        });
        if (className === stateRootTypeName && hasStateDecorator) {
          stateClassNode = nodePath.node;
        }
      },
    });

    if (!stateClassNode) {
      throw new Error(`State class ${stateRootTypeName} not found in source`);
    }

    // Serialize state fields with CRDT metadata
    const fieldsWithCrdt: any[] = [];
    stateClassNode.body.body.forEach((member: any) => {
      if (member.type === 'ClassProperty' || member.type === 'PropertyDefinition') {
        const fieldName = member.key?.name;
        if (fieldName && !fieldName.startsWith('_')) {
          const typeRef = this.serializeTypeRefWithCrdtMetadata(member.typeAnnotation);
          fieldsWithCrdt.push({
            name: fieldName,
            type: typeRef,
          });
        }
      }
    });

    // Build types map with CRDT metadata
    const typesWithCrdt: Record<string, any> = {};

    // Add state root type with CRDT metadata
    typesWithCrdt[stateRootTypeName] = {
      kind: 'record',
      fields: fieldsWithCrdt,
    };

    // Re-analyze all classes to get CRDT metadata for their fields
    const allClasses = new Map<string, any>();
    traverse(ast, {
      ClassDeclaration: (nodePath: any) => {
        const className = nodePath.node.id?.name;
        if (className && className !== stateRootTypeName) {
          allClasses.set(className, nodePath.node);
        }
      },
      ExportNamedDeclaration: (nodePath: any) => {
        if (nodePath.node.declaration?.type === 'ClassDeclaration') {
          const className = nodePath.node.declaration.id?.name;
          if (className && className !== stateRootTypeName) {
            allClasses.set(className, nodePath.node.declaration);
          }
        }
      },
    });

    // Analyze classes with CRDT metadata
    for (const [className, classNode] of allClasses.entries()) {
      // Skip if already processed as variant
      if (this.types.has(className) && this.types.get(className)?.kind === 'variant') {
        continue;
      }

      const fieldsWithCrdtForClass: any[] = [];
      if (classNode.body?.body) {
        classNode.body.body.forEach((member: any) => {
          if (member.type === 'ClassProperty' || member.type === 'PropertyDefinition') {
            const fieldName = member.key?.name;
            if (fieldName && !fieldName.startsWith('_')) {
              const typeRef = this.serializeTypeRefWithCrdtMetadata(member.typeAnnotation);
              fieldsWithCrdtForClass.push({
                name: fieldName,
                type: typeRef,
              });
            }
          }
        });
      }

      if (fieldsWithCrdtForClass.length > 0) {
        typesWithCrdt[className] = {
          kind: 'record',
          fields: fieldsWithCrdtForClass,
        };
      }
    }

    // Add all other types (variants, aliases, interfaces) without CRDT metadata
    for (const [typeName, typeDef] of this.types.entries()) {
      if (typeName === stateRootTypeName) continue;
      // Skip classes already processed above
      if (typesWithCrdt[typeName]) continue;

      const serialized: any = {
        kind: typeDef.kind,
      };

      if (typeDef.fields) {
        serialized.fields = typeDef.fields.map((field: any) => ({
          name: field.name,
          type: this.serializeTypeRefToRustFormat(field.type),
          nullable: field.nullable,
        }));
      }

      if (typeDef.variants) {
        serialized.variants = typeDef.variants.map((variant: any) => ({
          name: variant.name,
          code: variant.code,
          payload: variant.payload ? this.serializeTypeRefToRustFormat(variant.payload) : undefined,
        }));
      }

      if (typeDef.target) {
        const targetSerialized = this.serializeTypeRefToRustFormat(typeDef.target);
        // Preserve size for bytes types
        if (targetSerialized.kind === 'bytes' && (typeDef.target as any).size !== undefined) {
          targetSerialized.size = (typeDef.target as any).size;
        }
        serialized.target = targetSerialized;
      }

      typesWithCrdt[typeName] = serialized;
    }

    return {
      schema_version: 'wasm-abi/1',
      types: typesWithCrdt,
      methods: [],
      events: [],
      state_root: stateRootTypeName,
    };
  }
}

/**
 * Generate ABI manifest in Rust format with state schema (CRDT metadata)
 */
export function generateAbiManifestRustFormatWithStateSchema(
  sourceFile: string,
  stateRootTypeName: string
): any {
  const sourceCode = fs.readFileSync(sourceFile, 'utf-8');
  const emitter = new AbiEmitter();
  emitter.analyzeSource(sourceCode, sourceFile);
  return emitter.generateStateSchemaWithCrdtMetadata(sourceCode, stateRootTypeName);
}

/**
 * Recursively find all TypeScript files in a directory
 */
function findTypeScriptFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules, .git, and other common ignore directories
      if (!file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
        findTypeScriptFiles(filePath, fileList);
      }
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

/**
 * Generate ABI manifest from a source file
 * Automatically finds and processes all TypeScript files in the same directory tree
 */
export function generateAbiManifest(filePath: string): AbiManifest {
  const emitter = new AbiEmitter();

  // Get the directory containing the entry file
  const entryDir = path.dirname(path.resolve(filePath));
  const projectRoot = findProjectRoot(entryDir);

  // Find all TypeScript files in the project
  const allTsFiles = findTypeScriptFiles(projectRoot);

  if (allTsFiles.length === 0) {
    // Fallback to single file if no other files found
    return emitter.analyzeFile(filePath);
  }

  // Ensure the entry file is included
  const resolvedEntryPath = path.resolve(filePath);
  if (!allTsFiles.includes(resolvedEntryPath)) {
    allTsFiles.push(resolvedEntryPath);
  }

  // Process all files
  return emitter.analyzeFiles(allTsFiles);
}

/**
 * Generate ABI manifest in Rust-compatible format
 */
export function generateAbiManifestRustFormat(filePath: string): any {
  const emitter = new AbiEmitter();

  // Get the directory containing the entry file
  const entryDir = path.dirname(path.resolve(filePath));
  const projectRoot = findProjectRoot(entryDir);

  // Find all TypeScript files in the project
  const allTsFiles = findTypeScriptFiles(projectRoot);

  if (allTsFiles.length === 0) {
    // Fallback to single file if no other files found
    emitter.analyzeFile(filePath);
    return emitter.generateManifestRustFormat();
  }

  // Ensure the entry file is included
  const resolvedEntryPath = path.resolve(filePath);
  if (!allTsFiles.includes(resolvedEntryPath)) {
    allTsFiles.push(resolvedEntryPath);
  }

  // Process all files
  emitter.analyzeFiles(allTsFiles);
  return emitter.generateManifestRustFormat();
}

/**
 * Find the project root (directory containing package.json or tsconfig.json)
 */
function findProjectRoot(startDir: string): string {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    const tsconfigPath = path.join(currentDir, 'tsconfig.json');

    if (fs.existsSync(packageJsonPath) || fs.existsSync(tsconfigPath)) {
      return currentDir;
    }

    currentDir = path.dirname(currentDir);
  }

  // If no package.json or tsconfig.json found, use the entry file's directory
  return startDir;
}

/**
 * Generate ABI manifest from source code
 */
export function generateAbiFromSource(sourceCode: string, filePath?: string): AbiManifest {
  const emitter = new AbiEmitter();
  return emitter.analyzeSource(sourceCode, filePath);
}
