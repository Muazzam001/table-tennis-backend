# Backend — Vercel Deployment Guide

Deploy the Express API (`backend/`) as a **separate Vercel project** from the frontend. The app uses **Supabase PostgreSQL** (not MySQL).

## Prerequisites

- [Vercel](https://vercel.com) account
- Supabase project with schema applied (`npm run db:migrate` from repo root)
- Git repository (monorepo root or standalone `backend/` repo)

## Architecture

```
Frontend (Vercel)  ──►  Backend (Vercel serverless)  ──►  Supabase PostgreSQL
     │                           │
     └── VITE_API_BASE_URL       └── pg via transaction pooler (port 6543)
```

## Vercel environment variables (required)

Your deployment at **https://table-tennis-backend.vercel.app** needs these in the Vercel dashboard (**Settings → Environment Variables**). Copy values from your local `backend/.env`:

| Variable | Notes |
|----------|--------|
| `SUPABASE_DB_PASSWORD` | From Supabase → Database settings |
| `SUPABASE_PROJECT_REF` | `zhbyslleexcktjpcdjxq` |
| `SUPABASE_POOLER_HOST` | `aws-1-ap-northeast-1.pooler.supabase.com` |
| `DATABASE_URL_POOLER` | Recommended: transaction pooler URL on port **6543** with `?pgbouncer=true` |
| `SUPABASE_URL` | `https://zhbyslleexcktjpcdjxq.supabase.co` |
| `SUPABASE_SECRET_KEY` | Service role key (backend only) |
| `JWT_SECRET` | Same as local |
| `JWT_EXPIRES_IN` | `7d` |
| `CORS_ORIGIN` | Your frontend URL when deployed (e.g. `https://your-frontend.vercel.app`) |

After adding variables, **Redeploy** from the Vercel dashboard. A `404 NOT_FOUND` usually means the build did not run (`npm run build` must produce `api/index.mjs`). A `500 FUNCTION_INVOCATION_FAILED` usually means missing env vars or a runtime crash.

## Step 1: Create the Vercel project

1. **Add New Project** in the [Vercel dashboard](https://vercel.com/dashboard)
2. Import your Git repository
3. Configure:

| Setting | Value |
|---------|--------|
| **Root Directory** | `.` if this repo is only `backend/`; `backend` if deploying from the monorepo root |
| **Framework Preset** | Other |
| **Install Command** | `npm install` |
| **Build Command** | `npm run build` *(must produce `api/index.mjs`)* |
| **Output Directory** | *(leave empty)* |

`vercel.json` rewrites all routes to `/api`. `npm run build` bundles `server.js` into `api/index.mjs` (esbuild inlines `@shared` imports). `server.js` exports the Express app and skips `app.listen()` when `VERCEL=1`.

## Step 2: Environment variables

In **Settings → Environment Variables**, add these for **Production** (and Preview if needed):

```env
# CORS — exact frontend origin (no trailing slash)
CORS_ORIGIN=https://your-frontend.vercel.app

# Supabase PostgreSQL (transaction pooler — required for serverless)
DATABASE_URL_POOLER=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@[POOLER_HOST]:6543/postgres?pgbouncer=true

# Or use discrete vars (pooler URL is built automatically):
SUPABASE_DB_PASSWORD=your-db-password
SUPABASE_PROJECT_REF=your-project-ref
SUPABASE_POOLER_HOST=aws-1-ap-northeast-1.pooler.supabase.com

# Supabase API (backend only — never expose to frontend)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-service-role-key

# JWT
JWT_SECRET=generate-with-openssl-rand-base64-32
JWT_EXPIRES_IN=7d

NODE_ENV=production
```

**Important**

- Use the **transaction pooler** on port **6543** with `?pgbouncer=true` on Vercel. Session pooler (5432) can exhaust connections across serverless instances.
- `CORS_ORIGIN` must match the deployed frontend URL exactly.
- Redeploy after changing environment variables.

## Step 3: Database setup (run locally or CI — not on Vercel)

```bash
# From repo root — apply supabase/migrations/
npm run db:migrate

# Create admin user (once)
cd backend && npm run create-admin
```

## Step 4: Deploy

**Dashboard:** push to the connected branch, or click **Redeploy**.

**CLI:**

```bash
cd backend
npx vercel          # preview
npx vercel --prod   # production
```

## Step 5: Verify

Production URL: **https://table-tennis-backend.vercel.app**

```bash
curl https://table-tennis-backend.vercel.app/api/health
```

Expected:

```json
{ "status": "OK", "message": "Table Tennis Tournament API is running" }
```

Check **Deployments → Functions → Logs** if the health check fails (usually missing DB env vars).

## Step 6: Connect the frontend

Set on the **frontend** Vercel project:

```env
VITE_API_BASE_URL=https://your-backend.vercel.app/api
```

Redeploy the frontend after changing this. See `frontend/DEPLOYMENT.md`.

## Shared code (`@shared` alias)

`backend/shared/` must be present in the deployed repo. `npm run build` runs `sync:shared`, which copies from `../shared` when that folder exists. Commit `backend/shared/` if you deploy only the backend repository.

`npm run build` runs esbuild via `scripts/build-vercel.mjs`, which bundles `server.js` into `api/index.mjs` with `@shared` resolved at build time. Commit `backend/shared/` if you deploy only the backend repository.

## Troubleshooting

### 404 NOT_FOUND on all routes

- Confirm **Build Command** is `npm run build` (set in `vercel.json` and Vercel dashboard)
- Open the latest deployment **Build Logs** — you should see `Vercel bundle written to api/index.mjs`
- If the backend is its own Git repo, **Root Directory** must be `.` (not `backend`)
- Redeploy after pushing `vercel.json` changes

### Database connection failed

- Confirm `DATABASE_URL_POOLER` or `SUPABASE_DB_PASSWORD` + pooler host are set in Vercel
- Use port **6543** (transaction mode), not 5432
- Ensure migrations ran: `npm run db:migrate`
- Check Supabase **Database → Connection pooling** settings in the dashboard

### CORS errors

- Set `CORS_ORIGIN` to the exact frontend URL (scheme + host, no path)
- Redeploy backend after updating

### Function timeout

Free tier: 10s per invocation. Optimize slow queries or upgrade to Pro (60s).

### Build fails on `@shared` imports

- Run `npm run build` locally in `backend/` to reproduce
- Ensure `backend/shared/tournament/` is committed
- Build output must exist at `api/index.mjs` after `npm run build`

## Security checklist

- [ ] Strong `JWT_SECRET` (not the example value)
- [ ] `SUPABASE_SECRET_KEY` only on backend — never in frontend env
- [ ] `CORS_ORIGIN` restricted to your frontend domain
- [ ] `.env` not committed (already in `.gitignore`)
- [ ] Admin password changed after `create-admin`

## Related docs

- [Frontend deployment](../frontend/DEPLOYMENT.md)
- [Supabase schema migration](../docs/supabase-migration/DEPLOYMENT_GUIDE.md)
- [Vercel Node.js docs](https://vercel.com/docs/functions/runtimes/node-js)
