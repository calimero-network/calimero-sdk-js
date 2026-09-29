#!/usr/bin/env node

/**
 * Checks that a built wasm carries exactly one calimero_abi_v1 section, the
 * one the node reads, and that it declares exactly the given handlers.
 *
 * Usage: node scripts/check-abi-section.js <wasm> [handler...]
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');

const [wasmPath, ...expected] = process.argv.slice(2);
if (!wasmPath) {
  console.error('Usage: node scripts/check-abi-section.js <wasm> [handler...]');
  process.exit(2);
}

const wasm = new WebAssembly.Module(fs.readFileSync(wasmPath));
const sections = WebAssembly.Module.customSections(wasm, 'calimero_abi_v1');
if (sections.length !== 1) {
  console.error(`${wasmPath}: expected one calimero_abi_v1 section, found ${sections.length}`);
  process.exit(1);
}

const manifest = JSON.parse(Buffer.from(sections[0]).toString('utf-8'));
const handlers = manifest.methods.filter(method => method.handler).map(method => method.name);
if (handlers.join(',') !== [...expected].sort().join(',')) {
  console.error(`${wasmPath}: declared handlers [${handlers}], expected [${[...expected].sort()}]`);
  process.exit(1);
}

console.log(`${wasmPath}: calimero_abi_v1 declares handlers [${handlers}]`);
