#!/usr/bin/env node

// Wraps a built wasm in a dev-signed application bundle (.mpk), the only form
// current nodes install. Needs `cargo mero` on PATH.

/* eslint-disable @typescript-eslint/no-var-requires */
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const [wasmPath, outPath, appVersion, pkg, name] = process.argv.slice(2);
if (!name) {
  console.error(
    'Usage: node scripts/make-bundle.js <wasm> <out.mpk> <appVersion> <package> <name>'
  );
  process.exit(2);
}

const wasm = fs.readFileSync(wasmPath);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'calimero-bundle-'));
fs.writeFileSync(path.join(dir, 'app.wasm'), wasm);
fs.writeFileSync(
  path.join(dir, 'manifest.json'),
  JSON.stringify({
    version: '1.0',
    package: pkg,
    appVersion,
    minRuntimeVersion: '0.1.0',
    metadata: { name, tags: [] },
    links: {},
    wasm: {
      path: 'app.wasm',
      size: wasm.length,
      hash: crypto.createHash('sha256').update(wasm).digest('hex'),
    },
  })
);

try {
  execFileSync('cargo', ['mero', 'sign', '--dev', path.join(dir, 'manifest.json')], {
    stdio: 'inherit',
  });
  execFileSync('tar', ['czf', path.resolve(outPath), '-C', dir, 'manifest.json', 'app.wasm']);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
