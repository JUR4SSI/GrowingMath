import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const packageJsonPath = path.resolve('package.json');
const versioningRoot = path.resolve('versionamento');
const releaseDir = path.resolve('release');
const productName = 'Growing Math';

function parseVersion(version) {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`Invalid semantic version: ${version}`);
  }
  return parts;
}

function bumpPatch(version) {
  const [major, minor, patch] = parseVersion(version);
  return `${major}.${minor}.${patch + 1}`;
}

function moveIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) return false;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.renameSync(sourcePath, targetPath);
  return true;
}

function archiveCurrentRelease(currentVersion) {
  if (!fs.existsSync(releaseDir)) return;

  const archiveDir = path.join(versioningRoot, `v${currentVersion}`);
  fs.mkdirSync(archiveDir, { recursive: true });

  const installerBaseName = `${productName} Setup ${currentVersion}.exe`;
  const moved = [];

  const candidates = [
    installerBaseName,
    `${installerBaseName}.blockmap`,
    'builder-debug.yml',
    'builder-effective-config.yaml',
    'latest.yml',
  ];

  for (const fileName of candidates) {
    const sourcePath = path.join(releaseDir, fileName);
    const targetPath = path.join(archiveDir, fileName);
    if (moveIfExists(sourcePath, targetPath)) {
      moved.push(fileName);
    }
  }

  if (moved.length === 0) {
    console.log(`No release artifacts found for v${currentVersion} in ${releaseDir}.`);
    return;
  }

  console.log(`Archived ${moved.length} artifact(s) to ${archiveDir}:`);
  for (const item of moved) {
    console.log(`- ${item}`);
  }
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const currentVersion = packageJson.version;
const newVersion = bumpPatch(currentVersion);

archiveCurrentRelease(currentVersion);

packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
console.log(`Version updated: ${currentVersion} -> ${newVersion}`);

console.log('Building installer...');
execSync('npm run pack:installer:base', { stdio: 'inherit' });
console.log('Installer build completed.');