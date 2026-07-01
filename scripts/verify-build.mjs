/**
 * Validates that every @shared module referenced by the backend resolves after sync.
 * Used by `npm run build` before deploy.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipDirs = new Set(['node_modules', 'shared', '.git', '._alias_test']);

function collectSharedImports(dir) {
  const imports = new Set();

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      for (const specifier of collectSharedImports(entryPath)) {
        imports.add(specifier);
      }
      continue;
    }

    if (!/\.(js|mjs)$/.test(entry.name)) {
      continue;
    }

    const source = fs.readFileSync(entryPath, 'utf8');
    for (const match of source.matchAll(/@shared\/[A-Za-z0-9_./-]+/g)) {
      imports.add(match[0]);
    }
  }

  return imports;
}

const modules = [...collectSharedImports(backendRoot)].sort();

for (const specifier of modules) {
  await import(specifier);
}

console.log(`Backend build OK — ${modules.length} shared modules verified`);
