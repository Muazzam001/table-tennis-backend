/**
 * Vercel serverless entry — loads the Express app.
 * @shared aliases are registered via NODE_OPTIONS=--import ./register-aliases.js in vercel.json.
 */
const { default: app } = await import('./server.js');

export default app;
