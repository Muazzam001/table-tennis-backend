import { register } from 'node:module';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const backendRoot = path.dirname(fileURLToPath(import.meta.url));
register(
  './scripts/alias-loader.mjs',
  pathToFileURL(path.join(backendRoot, 'register-aliases.js'))
);
