/**
 * Find the package root directory by looking for package.json
 * This works both in development and when installed as a dependency
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Finds the package root by walking up the directory tree
 * looking for package.json with the correct package name
 */
export function findPackageRoot(): string {
  const packageName = '@calimero-network/calimero-cli-js';
  
  // Start from the current file's directory
  const __filename = fileURLToPath(import.meta.url);
  let currentDir = path.dirname(__filename);
  
  // Walk up the directory tree
  while (currentDir !== path.dirname(currentDir)) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (packageJson.name === packageName) {
          return currentDir;
        }
      } catch {
        // Continue searching
      }
    }
    
    currentDir = path.dirname(currentDir);
  }
  
  // Fallback: if we can't find it, assume we're in lib/compiler or lib/utils
  // and go up to package root
  const __filename2 = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename2);
  
  // If we're in lib/, go up one level
  if (__dirname.includes('/lib/')) {
    return path.join(__dirname, '../..');
  }
  
  // Otherwise, go up from lib to package root
  return path.join(__dirname, '../../..');
}

