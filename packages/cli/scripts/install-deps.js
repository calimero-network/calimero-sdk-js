#!/usr/bin/env node

/**
 * Cross-platform install-deps script
 * Tries to use compiled JS if available, otherwise falls back to shell script
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliDir = join(__dirname, '..');
const compiledScript = join(cliDir, 'lib', 'scripts', 'post-install.js');
const shellScript = join(__dirname, 'install-deps.sh');

if (existsSync(compiledScript)) {
  // Use compiled TypeScript version if available
  console.log('Using compiled install script...');
  import(compiledScript);
} else {
  // Fall back to shell script (for local dev before build)
  console.log('Using shell script (compiled version not found)...');
  try {
    execSync(`bash "${shellScript}"`, { stdio: 'inherit', cwd: cliDir });
  } catch (error) {
    console.error('\n❌ Installation failed!');
    console.error('\nOn Windows, you may need to:');
    console.error('  1. Install WSL (Windows Subsystem for Linux), or');
    console.error('  2. Build the package first: pnpm build, then run install-deps again');
    console.error('\nAlternatively, dependencies will be installed automatically via postinstall after the package is built.');
    process.exit(1);
  }
}

