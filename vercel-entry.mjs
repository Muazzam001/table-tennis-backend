/**
 * Vercel serverless entry — registers @shared aliases before loading the Express app.
 * Static imports in server.js run before register-aliases.js would execute, so we
 * register the loader here and dynamic-import server.js.
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
