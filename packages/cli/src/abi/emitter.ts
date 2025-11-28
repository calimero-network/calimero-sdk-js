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
  kind: 'scalar' | 'option' | 'vector' | 'map' | 'set' | 'reference';
  scalar?: ScalarType;
  inner?: TypeRef;
  key?: TypeRef;
  value?: TypeRef;
  name?: string;
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
    for (const filePath of filePaths) {
      const sourceCode = fs.readFileSync(filePath, 'utf-8');
      const ast = parse(sourceCode, {
        sourceType: 'module',
        plugins: ['typescript', 'decorators-legacy', 'classProperties'],
      });

      traverse(ast, {
        ClassDeclaration: (nodePath: any) => {
          this.analyzeClass(nodePath.node);
        },
        ExportNamedDeclaration: (nodePath: any) => {
          if (nodePath.node.declaration?.type === 'ClassDeclaration') {
            this.analyzeClass(nodePath.node.declaration);
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

    // Second pass: Find decorated classes
    traverse(ast, {
      ClassDeclaration: (nodePath: any) => {
        this.analyzeClass(nodePath.node);
      },
      ExportNamedDeclaration: (nodePath: any) => {
        if (nodePath.node.declaration?.type === 'ClassDeclaration') {
          this.analyzeClass(nodePath.node.declaration);
        }
      },
    });

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

    this.types.set(className, {
      kind: 'record',
      fields,
    });
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
            const paramName = param.name || param.left?.name;
            const typeAnnotation = param.typeAnnotation || param.left?.typeAnnotation;
            const typeRef = this.extractTypeFromAnnotation(typeAnnotation);

            // Skip 'this' parameter for non-static methods
            if (index === 0 && !isStatic && paramName === 'this') {
              return;
            }

            if (paramName) {
              params.push({
                name: paramName,
                type: typeRef,
              });
            }
          }
        });

        // Extract return type
        // Babel uses 'returnType', TypeScript uses 'value.returnType'
        let returns: TypeRef | undefined;
        const returnType = member.returnType || member.value?.returnType;
        if (returnType) {
          returns = this.extractTypeFromAnnotation(returnType);
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
      if (param.type === 'Identifier' || param.type === 'Pattern') {
        const fieldName = param.name || param.left?.name;
        const typeAnnotation = param.typeAnnotation || param.left?.typeAnnotation;
        if (fieldName) {
          const typeRef = this.extractTypeFromAnnotation(typeAnnotation);
          // For events, if there's only one field named 'payload', use it as payload
          // Otherwise use fields array
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
  }

  private extractTypeFromAnnotation(typeAnnotation: any): TypeRef {
    if (!typeAnnotation?.typeAnnotation) {
      return { kind: 'string' } as any; // Default fallback
    }

    const type = typeAnnotation.typeAnnotation;

    switch (type.type) {
      case 'TSStringKeyword':
        return { kind: 'scalar', scalar: 'string' } as any;
      case 'TSNumberKeyword':
        // Default to u32 for numbers (can be overridden with explicit types)
        // TODO: Infer u32 vs i32 vs f64 from context or type annotations
        return { kind: 'scalar', scalar: 'u32' } as any;
      case 'TSBooleanKeyword':
        return { kind: 'scalar', scalar: 'bool' } as any;
      case 'TSBigIntKeyword':
        return { kind: 'scalar', scalar: 'u64' } as any;
      case 'TSTypeReference':
        return this.extractTypeReference(type);
      case 'TSArrayType':
        return {
          kind: 'vector',
          inner: this.extractTypeFromAnnotation({ typeAnnotation: type.elementType }),
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
        // For now, treat as variable-size bytes
        this.types.set(typeName, {
          kind: 'alias',
          target: { kind: 'scalar', scalar: 'bytes' },
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
          fields.push({
            name: fieldName,
            type: typeRef,
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
    if (typeRef.kind === 'scalar' && typeRef.scalar) {
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

    // Fallback: return as-is (for string, bytes, etc.)
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

    for (const [typeName, typeDef] of this.types.entries()) {
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
        params: method.params.map(param => ({
          name: param.name,
          type: this.serializeTypeRefToRustFormat(param.type),
          nullable: (param.type as any).nullable,
        })),
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

      // Always set is_init and is_view (default to false)
      result.is_init = method.is_init === true;
      result.is_view = method.is_view === true;
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
