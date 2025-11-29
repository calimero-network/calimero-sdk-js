#!/usr/bin/env node

/**
 * Script to generate TypeScript client from ABI using abi-codegen
 * Usage: node scripts/generate-client.js <abi-json-path> <output-dir> [client-name]
 *
 * Note: Filters out state_root for abi-codegen compatibility, while keeping
 * the original abi.json intact with all fields for runtime use.
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ABI_FILE = process.argv[2] || 'build/abi.json';
const OUTPUT_DIR = process.argv[3] || 'build/generated';
const CLIENT_NAME = process.argv[4];

if (!fs.existsSync(ABI_FILE)) {
  console.error(`❌ Error: ABI file not found: ${ABI_FILE}`);
  console.error('');
  console.error(
    'Usage: node scripts/generate-client.js <abi-json-path> <output-dir> [client-name]'
  );
  console.error('');
  console.error('Example:');
  console.error(
    '  node scripts/generate-client.js examples/counter/build/abi.json examples/counter/build/generated CounterClient'
  );
  process.exit(1);
}

console.log('📦 Generating TypeScript client from ABI...');
console.log(`   Input:  ${ABI_FILE}`);
console.log(`   Output: ${OUTPUT_DIR}`);

// Read ABI and filter out state_root for abi-codegen (it doesn't support this field)
const abi = JSON.parse(fs.readFileSync(ABI_FILE, 'utf-8'));
const { state_root, ...filteredAbi } = abi;

// Create temporary file for filtered ABI
const tempDir = require('os').tmpdir();
const tempAbiPath = path.join(tempDir, `calimero-abi-${Date.now()}.json`);

try {
  fs.writeFileSync(tempAbiPath, JSON.stringify(filteredAbi, null, 2));

  // Build abi-codegen command
  const args = ['-i', tempAbiPath, '-o', OUTPUT_DIR];
  if (CLIENT_NAME) {
    args.push('--client-name', CLIENT_NAME);
  }

  // Spawn abi-codegen process
  const codegen = spawn('npx', ['@calimero-network/abi-codegen', ...args], {
    stdio: 'inherit',
  });

  codegen.on('close', code => {
    // Clean up temporary file
    try {
      fs.unlinkSync(tempAbiPath);
    } catch (err) {
      // Ignore cleanup errors
    }

    if (code !== 0) {
      process.exit(code);
    }

    console.log('');
    console.log('✅ Client generation completed!');
    console.log(`   Generated files are in: ${OUTPUT_DIR}`);
  });
} catch (error) {
  // Clean up temporary file on error
  try {
    if (fs.existsSync(tempAbiPath)) {
      fs.unlinkSync(tempAbiPath);
    }
  } catch (err) {
    // Ignore cleanup errors
  }

  console.error('❌ Error:', error.message);
  process.exit(1);
}
