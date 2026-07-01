/**
 * Keeps backend/shared in sync when a parent ../shared folder exists (optional).
 *
 * Standalone backend repo: shared/ is committed and used directly.
 * If ../shared is present locally, this script refreshes the vendored copy before dev/start.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceShared = path.resolve(backendRoot, '../shared');
const targetShared = path.resolve(backendRoot, 'shared');

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });

  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function syncShared() {
  try {
    await fs.access(sourceShared);
    await fs.rm(targetShared, { recursive: true, force: true });
    await copyDir(sourceShared, targetShared);
    console.log('Synced ../shared → backend/shared');
    return;
  } catch {
    // Standalone backend deploy — no parent shared folder.
  }

  try {
    await fs.access(targetShared);
    console.log('Using committed backend/shared');
    return;
  } catch {
    console.error(
      'Missing backend/shared. Run "npm run sync:shared" once where ../shared exists, then commit shared/.'
    );
    process.exit(1);
  }
}

syncShared();
