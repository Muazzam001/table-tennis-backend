/**
 * Vercel serverless entry — register @shared aliases, then load the Express app.
 * NODE_OPTIONS=--import ./register-aliases.js is also set in vercel.json as a fallback.
 */
import { register } from 'node:module';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const backendRoot = path.dirname(fileURLToPath(import.meta.url));

register(
  './scripts/alias-loader.mjs',
  pathToFileURL(path.join(backendRoot, 'vercel-entry.mjs'))
);

const { default: app } = await import('./server.js');

export default app;
