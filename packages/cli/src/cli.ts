#!/usr/bin/env node

/**
 * Calimero SDK CLI
 *
 * Main entry point for the build tools
 */

import { Command } from 'commander';
import { buildCommand } from './commands/build.js';
import { validateCommand } from './commands/validate.js';

const program = new Command();

program
  .name('calimero-sdk')
  .description('CLI tools for building Calimero P2P applications')
  .version('0.1.0');

program
  .command('build')
  .description('Build a Calimero service to WebAssembly')
  .argument('<source>', 'Source file (e.g., src/index.ts)')
  .option('-o, --output <path>', 'Output path for WASM file', 'build/service.wasm')
  .option('--verbose', 'Show detailed build output', false)
  .option('--no-optimize', 'Skip WASM optimization')
  .action(buildCommand);

program
  .command('validate')
  .description('Validate a Calimero service')
  .argument('<source>', 'Source file to validate')
  .option('--verbose', 'Show detailed output', false)
  .action(validateCommand);

program
  .command('init')
  .description('Initialize a new Calimero project')
  .argument('[name]', 'Project name', 'my-calimero-app')
  .option('--template <template>', 'Project template (counter, kv-store)', 'counter')
  .action((name: string, options: { template: string }) => {
    console.log(`Initializing project: ${name} with template: ${options.template}`);
    console.log('TODO: Implement project initialization');
  });

program.parse();
