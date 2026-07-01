/**
 * Vercel serverless entry (committed to git).
 * `npm run build` produces `.vercel/bundle.mjs`; this file loads it at runtime.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = path.join(backendRoot, '.vercel', 'bundle.mjs');

if (!fs.existsSync(bundlePath)) {
  throw new Error(
    'Missing .vercel/bundle.mjs — run "npm run build" before deploy (Vercel buildCommand should do this).'
  );
}

const { default: app } = await import(pathToFileURL(bundlePath).href);
export default app;
