/**
 * Method extraction
 *
 * Extracts contract methods from bundled JavaScript and generates methods.h
 */

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generates methods.h header file with exported contract methods
 *
 * @param jsFile - Path to bundled JavaScript
 * @param outputDir - Output directory for methods.h
 */
export async function generateMethodsHeader(
  jsFile: string,
  outputDir: string
): Promise<void> {
  const jsCode = fs.readFileSync(jsFile, 'utf-8');

  // Parse JavaScript to AST
  const ast = parse(jsCode, {
    sourceType: 'module',
    plugins: ['typescript', 'decorators-legacy']
  });

  const methods: string[] = [];

  // Extract methods from @Logic decorated classes
  traverse(ast, {
    ClassDeclaration(nodePath) {
      const decorators = nodePath.node.decorators || [];

      // Check if class has @Logic decorator
      const hasLogic = decorators.some(decorator => {
        if (decorator.expression.type === 'CallExpression') {
          const callee = decorator.expression.callee;
          return callee.type === 'Identifier' && callee.name === 'Logic';
        }
        return false;
      });

      if (hasLogic) {
        // Extract method names
        nodePath.node.body.body.forEach(member => {
          if (
            member.type === 'ClassMethod' &&
            member.key.type === 'Identifier' &&
            member.kind === 'method'
          ) {
            methods.push(member.key.name);
          }
        });
      }
    }
  });

  // Generate C header
  const header = `
#ifndef METHODS_H
#define METHODS_H

// Auto-generated method exports
${methods.map(m => `DEFINE_CALIMERO_METHOD(${m})`).join('\n')}

#endif // METHODS_H
`;

  const outputFile = path.join(outputDir, 'methods.h');
  fs.writeFileSync(outputFile, header);
}

