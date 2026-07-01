/** True when running on Vercel/Lambda — do not call app.listen() or process.exit() at import time. */
export const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NOW_REGION
);
