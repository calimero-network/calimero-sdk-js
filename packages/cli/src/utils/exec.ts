/**
 * Execution utilities
 */

import { execSync } from 'child_process';

/**
 * Executes a command and returns output
 *
 * @param command - Command to execute
 * @param verbose - Whether to show output
 */
export function executeCommand(command: string, verbose: boolean = false): string {
  try {
    return execSync(command, {
      stdio: verbose ? 'inherit' : 'pipe',
      encoding: 'utf-8'
    });
  } catch (error) {
    throw new Error(`Command failed: ${command}\n${error}`);
  }
}

