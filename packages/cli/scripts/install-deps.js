/**
 * Installs the build toolchain (qjsc, QuickJS source, WASI-SDK, Binaryen) into ../deps.
 * Every asset is pinned by sha256 in toolchain.json; all are verified before deps/ is replaced.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEPS_DIR = join(SCRIPT_DIR, '..', 'deps');
const MANIFEST = JSON.parse(readFileSync(join(SCRIPT_DIR, 'toolchain.json'), 'utf8'));
const PLATFORM = `${process.platform}-${process.arch}`;
const MAX_ATTEMPTS = 3;

function pinnedAsset(tool) {
  const asset = MANIFEST[tool][PLATFORM] ?? MANIFEST[tool]['*'];
  if (!asset) {
    throw new Error(`No pinned ${tool} build for ${PLATFORM}`);
  }
  return asset;
}

async function fetchBytes(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw error;
      }
      console.warn(`Download attempt ${attempt} failed, retrying: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function fetchVerified({ url, sha256 }) {
  const bytes = await fetchBytes(url);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== sha256) {
    throw new Error(`sha256 mismatch for ${url}: expected ${sha256}, got ${actual}`);
  }
  return bytes;
}

function extract(dir, bytes, name, stripComponents) {
  const archive = join(dir, `${name}.tar.gz`);
  const target = join(dir, name);
  writeFileSync(archive, bytes);
  mkdirSync(target);
  execFileSync('tar', ['xzf', archive, `--strip-components=${stripComponents}`, '-C', target]);
  rmSync(archive);
}

function install(dir, bytes) {
  writeFileSync(join(dir, 'qjsc'), bytes.qjsc, { mode: 0o755 });
  extract(dir, bytes.quickjs, 'quickjs', 1);
  extract(dir, bytes['wasi-sdk'], 'wasi-sdk', 1);
  extract(dir, bytes.binaryen, 'binaryen', 0);
}

async function main() {
  const tools = Object.keys(MANIFEST);
  const assets = tools.map(pinnedAsset);
  const bytes = {};
  for (const [i, tool] of tools.entries()) {
    bytes[tool] = await fetchVerified(assets[i]);
  }

  // Staged next to deps/ so the final rename stays on one filesystem.
  const staging = mkdtempSync(join(dirname(DEPS_DIR), '.deps-'));
  try {
    chmodSync(staging, 0o755);
    install(staging, bytes);
    rmSync(DEPS_DIR, { recursive: true, force: true });
    renameSync(staging, DEPS_DIR);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  console.log(`Build toolchain installed in ${DEPS_DIR}`);
}

main().catch(error => {
  console.error(`Build toolchain install failed: ${error.message}`);
  process.exit(1);
});
