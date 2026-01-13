#!/usr/bin/env node
/**
 * Update package.json version without npm validation
 * This bypasses npm's workspace protocol validation issues
 */

const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) {
  console.error('Usage: node update-version.js <version>');
  process.exit(1);
}

const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

packageJson.version = version;

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
console.log(`Updated version to ${version}`);
