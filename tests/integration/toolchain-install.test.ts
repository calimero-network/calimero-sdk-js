/**
 * Runs the CLI toolchain installer against a copy of its scripts, with fetch stubbed to serve one local tarball.
 */

import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

const CLI_DIR = path.join(__dirname, '../../packages/cli');

type Manifest = Record<string, Record<string, { url: string; sha256: string }>>;

describe('toolchain installer', () => {
  let work: string;
  let cliDir: string;
  let asset: string;
  let stub: string;
  let realManifest: Manifest;

  beforeEach(() => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'toolchain-install-'));
    cliDir = path.join(work, 'cli');
    fs.mkdirSync(cliDir);
    fs.copyFileSync(path.join(CLI_DIR, 'package.json'), path.join(cliDir, 'package.json'));
    fs.cpSync(path.join(CLI_DIR, 'scripts'), path.join(cliDir, 'scripts'), { recursive: true });
    realManifest = JSON.parse(fs.readFileSync(path.join(cliDir, 'scripts/toolchain.json'), 'utf8'));

    const content = path.join(work, 'content');
    fs.mkdirSync(path.join(content, 'top/bin'), { recursive: true });
    fs.writeFileSync(path.join(content, 'top/bin/clang'), '#!/bin/sh\n');
    asset = path.join(work, 'asset.tar.gz');
    spawnSync('tar', ['czf', asset, '-C', content, 'top']);

    stub = path.join(work, 'stub-fetch.mjs');
    fs.writeFileSync(
      stub,
      `import { readFileSync } from 'node:fs';\n` +
        `globalThis.fetch = async () => new Response(readFileSync(${JSON.stringify(asset)}));\n`
    );
  });

  afterEach(() => {
    fs.rmSync(work, { recursive: true, force: true });
  });

  function writeManifest(manifest: Manifest): void {
    fs.writeFileSync(path.join(cliDir, 'scripts/toolchain.json'), JSON.stringify(manifest));
  }

  function install() {
    return spawnSync(
      process.execPath,
      ['--import', pathToFileURL(stub).href, path.join(cliDir, 'scripts/install-deps.js')],
      { encoding: 'utf8' }
    );
  }

  it('rejects an asset whose sha256 does not match the pinned one', () => {
    const result = install();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('sha256 mismatch');
    expect(fs.existsSync(path.join(cliDir, 'deps/qjsc'))).toBe(false);
  });

  it('installs assets that match their pinned sha256', () => {
    const sha256 = createHash('sha256').update(fs.readFileSync(asset)).digest('hex');
    for (const builds of Object.values(realManifest)) {
      for (const build of Object.values(builds)) {
        build.sha256 = sha256;
      }
    }
    writeManifest(realManifest);

    const result = install();

    expect([result.status, result.stderr]).toEqual([0, expect.any(String)]);
    expect(fs.statSync(path.join(cliDir, 'deps/qjsc')).mode & 0o111).not.toBe(0);
    expect(fs.existsSync(path.join(cliDir, 'deps/quickjs/bin/clang'))).toBe(true);
    expect(fs.existsSync(path.join(cliDir, 'deps/wasi-sdk/bin/clang'))).toBe(true);
    expect(fs.existsSync(path.join(cliDir, 'deps/binaryen/top/bin/clang'))).toBe(true);
  });

  it('fails before downloading when the platform has no pinned build', () => {
    delete realManifest.qjsc[`${process.platform}-${process.arch}`];
    writeManifest(realManifest);
    fs.mkdirSync(path.join(cliDir, 'deps'));
    fs.writeFileSync(path.join(cliDir, 'deps/qjsc'), 'previous');

    const result = install();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No pinned qjsc build');
    expect(fs.readFileSync(path.join(cliDir, 'deps/qjsc'), 'utf8')).toBe('previous');
  });
});
