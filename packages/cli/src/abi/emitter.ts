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
  | 'bytes';

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
  public analyzeSource(sourceCode: string, filePath?: string): AbiManifest {
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
      if (member.type === 'MethodDefinition' && member.key?.name) {
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
        const params: Parameter[] = [];
        if (member.value?.params) {
          member.value.params.forEach((param: any, index: number) => {
            if (param.type === 'Identifier') {
              const paramName = param.name;
              const typeRef = this.extractTypeFromAnnotation(param.typeAnnotation);

              // Skip 'this' parameter for non-static methods
              if (index === 0 && !isStatic && paramName === 'this') {
                return;
              }

              params.push({
                name: paramName,
                type: typeRef,
              });
            }
          });
        }

        // Extract return type
        let returns: TypeRef | undefined;
        if (member.value?.returnType) {
          returns = this.extractTypeFromAnnotation(member.value.returnType);
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

    const fields: Field[] = [];

    // Analyze constructor parameters as event fields
    const constructor = classNode.body.body.find(
      (member: any) => member.type === 'MethodDefinition' && member.kind === 'constructor'
    );

    if (constructor?.value?.params) {
      constructor.value.params.forEach((param: any) => {
        if (param.type === 'Identifier') {
          const fieldName = param.name;
          const typeRef = this.extractTypeFromAnnotation(param.typeAnnotation);
          fields.push({
            name: fieldName,
            type: typeRef,
          });
        }
      });
    }

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
        return { kind: 'string' } as any;
      case 'TSNumberKeyword':
        return { kind: 'f64' } as any;
      case 'TSBooleanKeyword':
        return { kind: 'bool' } as any;
      case 'TSBigIntKeyword':
        return { kind: 'u64' } as any;
      case 'TSTypeReference':
        return this.extractTypeReference(type);
      case 'TSArrayType':
        return {
          kind: 'list',
          items: this.extractTypeFromAnnotation({ typeAnnotation: type.elementType }),
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
            kind: 'list',
            items: this.extractTypeFromAnnotation({
              typeAnnotation: type.typeParameters.params[0],
            }),
          } as any;
        }
        break;
      case 'Vector':
        if (type.typeParameters?.params?.length >= 1) {
          return {
            kind: 'list',
            items: this.extractTypeFromAnnotation({
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

    // Handle custom types - use $ref format to match Rust schema
    return { $ref: typeName } as any;
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

      // Add as an alias type
      this.types.set(typeName, {
        kind: 'alias',
        target: targetType,
      });
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

  private generateManifest(): AbiManifest {
    return {
      schema_version: 'wasm-abi/1',
      types: Object.fromEntries(this.types),
      methods: this.methods,
      events: this.events,
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
