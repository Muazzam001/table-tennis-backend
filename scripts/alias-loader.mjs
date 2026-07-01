import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sharedRoot = path.join(backendRoot, 'shared');

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@shared/')) {
    const relativePath = specifier.slice('@shared/'.length);
    const fileUrl = pathToFileURL(path.join(sharedRoot, relativePath)).href;
    return nextResolve(fileUrl, context);
  }

  return nextResolve(specifier, context);
}
