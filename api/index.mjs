/**
 * Vercel serverless entry point.
 * Static import of the pre-built bundle (produced by `npm run build`).
 * Vercel runs buildCommand before deploying, so the bundle is always present.
 */
import app from '../.vercel/bundle.mjs';

export default app;
