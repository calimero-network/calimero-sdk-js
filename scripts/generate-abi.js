#!/usr/bin/env node

/**
 * Helper script to generate ABI from TypeScript source
 * Used by verify-abi.sh
 * Similar to: calimero-abi extract in Rust core
 */

const fs = require('fs');
const path = require('path');

const sourceFile = process.argv[2];
const outputFile = process.argv[3];

if (!sourceFile || !outputFile) {
  console.error('Usage: node generate-abi.js <source-file> <output-file>');
  console.error('');
  console.error('Example:');
  console.error(
    '  node scripts/generate-abi.js examples/abi-conformance/src/index.ts /tmp/abi.json'
  );
  process.exit(1);
}

(async () => {
  try {
    const resolvedSource = path.resolve(sourceFile);
    if (!fs.existsSync(resolvedSource)) {
      console.error(`❌ Error: Source file not found: ${resolvedSource}`);
      process.exit(1);
    }

    console.log(`Generating ABI from: ${resolvedSource}`);
    // Use Rust format for compatibility - dynamic import for ESM module
    const { generateAbiManifestRustFormat } = await import('../packages/cli/lib/abi/emitter.js');
    const abi = generateAbiManifestRustFormat(resolvedSource);

    // Ensure output directory exists
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, JSON.stringify(abi, null, 2));
    console.log(`✓ ABI generated successfully: ${outputFile}`);
  } catch (error) {
    console.error('❌ Error generating ABI:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
})();
