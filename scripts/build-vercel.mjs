/**
 * Bundle server.js for Vercel — resolves @shared imports at build time.
 * Output: api/index.mjs (Vercel serverless entry, created during deploy build).
 */
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(backendRoot, 'api');
const outfile = path.join(apiDir, 'index.mjs');

fs.mkdirSync(apiDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(backendRoot, 'server.js')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile,
  packages: 'external',
  alias: {
    '@shared': path.join(backendRoot, 'shared'),
  },
  logLevel: 'info',
});

console.log(`Vercel bundle written to ${path.relative(backendRoot, outfile)}`);
