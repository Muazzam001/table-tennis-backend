/**
 * Bundle server.js for Vercel — resolves @shared imports at build time so no
 * custom ESM loader is needed at runtime (register/NODE_OPTIONS often fail on Vercel).
 */
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(backendRoot, 'dist', 'server.mjs');

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
