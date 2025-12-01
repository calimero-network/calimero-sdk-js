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
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as tar from 'tar';

const { Signale } = signaleDefault;
const signale = new Signale({ scope: 'postinstall', interactive: true });

const PLATFORM = os.platform();
const ARCH = os.arch();

console.log(`Platform: ${PLATFORM}, Architecture: ${ARCH}`);

const SUPPORTED_PLATFORMS = ['linux', 'darwin', 'win32'];
const SUPPORTED_ARCH = ['x64', 'arm64'];

if (!SUPPORTED_PLATFORMS.includes(PLATFORM)) {
  signale.error(`Platform ${PLATFORM} is not supported`);
  signale.info('Supported platforms: Linux, macOS, Windows');
  process.exit(1);
}

if (!SUPPORTED_ARCH.includes(ARCH)) {
  signale.error(`Architecture ${ARCH} is not supported`);
  signale.info('Supported architectures: x64, arm64');
  process.exit(1);
}

if (PLATFORM === 'win32') {
  signale.warn('Windows support is experimental');
  signale.info('Note: QuickJS, WASI-SDK, and Binaryen binaries may not be available for Windows');
  signale.info('Consider using WSL (Windows Subsystem for Linux) for full support');
}

// Create deps directory
// Calculate path: from lib/scripts/post-install.js, go up to package root, then to src/deps
// This matches the shell script which uses scripts/../src/deps
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// If we're in lib/scripts, go to package root (../../), then to src/deps
// If we're in src/scripts (dev), go to package root (../..), then to src/deps
let packageRoot: string;
if (__dirname.includes('/lib/')) {
  packageRoot = path.join(__dirname, '../..');
} else {
  packageRoot = path.join(__dirname, '../..');
}
const depsDir = path.join(packageRoot, 'src', 'deps');
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
        // Check for redirects (3xx status codes)
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
          file.close();
          fs.unlinkSync(dest);
          if (response.headers.location) {
            return download(response.headers.location, dest).then(resolve).catch(reject);
          }
          return reject(new Error(`Redirect without location header: ${response.statusCode}`));
        }

        // Check for errors
        if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
          file.close();
          fs.unlinkSync(dest);
          return reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage || 'Unknown error'}`));
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', error => {
        file.close();
        if (fs.existsSync(dest)) {
          fs.unlinkSync(dest);
        }
        reject(error);
      });
  });
}

async function installQuickJS(): Promise<void> {
  signale.await('Installing QuickJS...');

  const version = '0.1.3';
  const versionTag = `v${version}`;
  const systemName = PLATFORM === 'darwin' ? 'macOS' : PLATFORM === 'win32' ? 'Windows' : 'Linux';
  const archName = ARCH === 'x64' ? 'X64' : 'arm64';

  const qjscBinary = `qjsc-${systemName}-${archName}`;
  const sourceTar = `${versionTag}.tar.gz`;

  const quickjsDir = path.join(depsDir, 'quickjs');
  fs.mkdirSync(quickjsDir, { recursive: true });

  // Download qjsc binary
  const qjscUrl = `https://github.com/near/quickjs/releases/download/${versionTag}/${qjscBinary}`;
  const qjscDest = path.join(depsDir, PLATFORM === 'win32' ? 'qjsc.exe' : 'qjsc');

  try {
    await download(qjscUrl, qjscDest);
    if (PLATFORM !== 'win32') {
      fs.chmodSync(qjscDest, 0o755);
    }
  } catch (error) {
    if (PLATFORM === 'win32') {
      signale.error('QuickJS Windows binary not available');
      signale.info('Windows binaries may not be available for QuickJS');
      signale.info('Consider using WSL (Windows Subsystem for Linux) for full support');
      throw error;
    }
    throw error;
  }

  // Download QuickJS source
  const sourceUrl = `https://github.com/near/quickjs/archive/refs/tags/${sourceTar}`;
  const sourceDest = path.join(depsDir, sourceTar);

  await download(sourceUrl, sourceDest);

  // Verify file exists and has content
  const stats = fs.statSync(sourceDest);
  if (stats.size === 0) {
    throw new Error(`Downloaded file is empty: ${sourceDest}`);
  }

  // Extract source using tar library (cross-platform)
  // Explicitly enable gzip for .tar.gz files
  await tar.extract({
    file: path.resolve(sourceDest),
    cwd: path.resolve(quickjsDir),
    strip: 1,
    gzip: true,
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

  // Verify file exists and has content
  const stats = fs.statSync(dest);
  if (stats.size === 0) {
    throw new Error(`Downloaded file is empty: ${dest}`);
  }

  // Extract using tar library (cross-platform)
  await tar.extract({
    file: path.resolve(dest),
    cwd: path.resolve(wasiDir),
    strip: 1,
    gzip: true,
  });

  fs.unlinkSync(dest);

  signale.success('WASI-SDK installed');
}

async function installBinaryen(): Promise<void> {
  signale.await('Installing Binaryen...');

  const version = '0.1.16';
  const versionTag = `v${version}`;
  const systemName = PLATFORM === 'darwin' ? 'macOS' : PLATFORM === 'win32' ? 'Windows' : 'Linux';
  const archName = ARCH === 'x64' ? 'X64' : 'ARM64';
  const tarName = `binaryen-${systemName}-${archName}.tar.gz`;

  const binaryenDir = path.join(depsDir, 'binaryen');
  fs.mkdirSync(binaryenDir, { recursive: true });

  const url = `https://github.com/ailisp/binaryen/releases/download/${versionTag}/${tarName}`;
  const dest = path.join(depsDir, tarName);

  await download(url, dest);

  // Verify file exists and has content
  const stats = fs.statSync(dest);
  if (stats.size === 0) {
    throw new Error(`Downloaded file is empty: ${dest}`);
  }

  // Extract using tar library (cross-platform)
  await tar.extract({
    file: path.resolve(dest),
    cwd: path.resolve(binaryenDir),
    gzip: true,
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
