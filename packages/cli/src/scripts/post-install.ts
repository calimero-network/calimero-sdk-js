/**
 * Post-install script
 *
 * Downloads QuickJS, WASI-SDK, and Binaryen tools
 */

import signaleDefault from 'signale';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const { Signale } = signaleDefault;
const signale = new Signale({ scope: 'postinstall', interactive: true });

const PLATFORM = os.platform();
const ARCH = os.arch();

console.log(`Platform: ${PLATFORM}, Architecture: ${ARCH}`);

const SUPPORTED_PLATFORMS = ['linux', 'darwin'];
const SUPPORTED_ARCH = ['x64', 'arm64'];

if (!SUPPORTED_PLATFORMS.includes(PLATFORM)) {
  console.error(`Platform ${PLATFORM} is not supported`);
  process.exit(1);
}

if (!SUPPORTED_ARCH.includes(ARCH)) {
  console.error(`Architecture ${ARCH} is not supported`);
  process.exit(1);
}

// Create deps directory
// In ES modules, use import.meta.url instead of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const depsDir = path.join(__dirname, '../../deps');
if (fs.existsSync(depsDir)) {
  fs.rmSync(depsDir, { recursive: true, force: true });
}
fs.mkdirSync(depsDir, { recursive: true });

/**
 * Downloads a file from URL
 */
async function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, response => {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', error => {
        fs.unlinkSync(dest);
        reject(error);
      });
  });
}

async function installQuickJS(): Promise<void> {
  signale.await('Installing QuickJS...');

  const version = '0.1.3';
  const versionTag = `v${version}`;
  const systemName = PLATFORM === 'darwin' ? 'macOS' : 'Linux';
  const archName = ARCH === 'x64' ? 'X64' : 'arm64';

  const qjscBinary = `qjsc-${systemName}-${archName}`;
  const sourceTar = `${versionTag}.tar.gz`;

  const quickjsDir = path.join(depsDir, 'quickjs');
  fs.mkdirSync(quickjsDir, { recursive: true });

  // Download qjsc binary
  const qjscUrl = `https://github.com/near/quickjs/releases/download/${versionTag}/${qjscBinary}`;
  const qjscDest = path.join(depsDir, 'qjsc');

  await download(qjscUrl, qjscDest);
  fs.chmodSync(qjscDest, 0o755);

  // Download QuickJS source
  const sourceUrl = `https://github.com/near/quickjs/archive/refs/tags/${sourceTar}`;
  const sourceDest = path.join(depsDir, sourceTar);

  await download(sourceUrl, sourceDest);

  // Extract source
  execSync(`tar xzf ${sourceTar} --strip-components=1 -C ${quickjsDir}`, {
    cwd: depsDir,
    stdio: 'pipe',
  });

  fs.unlinkSync(sourceDest);

  signale.success('QuickJS installed');
}

async function installWasiSDK(): Promise<void> {
  signale.await('Installing WASI-SDK...');

  const version = '11.0';
  const systemName = PLATFORM === 'darwin' ? 'macos' : 'linux';
  const tarName = `wasi-sdk-${version}-${systemName}.tar.gz`;

  const wasiDir = path.join(depsDir, 'wasi-sdk');
  fs.mkdirSync(wasiDir, { recursive: true });

  const url = `https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-11/${tarName}`;
  const dest = path.join(depsDir, tarName);

  await download(url, dest);

  // Extract
  execSync(`tar xzf ${tarName} --strip-components=1 -C ${wasiDir}`, {
    cwd: depsDir,
    stdio: 'pipe',
  });

  fs.unlinkSync(dest);

  signale.success('WASI-SDK installed');
}

async function installBinaryen(): Promise<void> {
  signale.await('Installing Binaryen...');

  const version = '0.1.16';
  const versionTag = `v${version}`;
  const systemName = PLATFORM === 'darwin' ? 'macOS' : 'Linux';
  const archName = ARCH === 'x64' ? 'X64' : 'ARM64';
  const tarName = `binaryen-${systemName}-${archName}.tar.gz`;

  const binaryenDir = path.join(depsDir, 'binaryen');
  fs.mkdirSync(binaryenDir, { recursive: true });

  const url = `https://github.com/ailisp/binaryen/releases/download/${versionTag}/${tarName}`;
  const dest = path.join(depsDir, tarName);

  await download(url, dest);

  // Extract
  execSync(`tar xzf ${tarName} -C ${binaryenDir}`, {
    cwd: depsDir,
    stdio: 'pipe',
  });

  fs.unlinkSync(dest);

  signale.success('Binaryen installed');
}

// Main installation
(async () => {
  try {
    await installQuickJS();
    await installWasiSDK();
    await installBinaryen();
    signale.success('All dependencies installed successfully!');
  } catch (error) {
    signale.error('Installation failed:', error);
    process.exit(1);
  }
})();
