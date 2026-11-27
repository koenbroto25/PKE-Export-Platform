# PKE deployment alternatives to Vercel

## Current recommendation: Render (separate frontend and API services)

This repository is a monorepo: the API is the root Node/Express service and the SPA is under `frontend/`. Neon remains the database/Auth provider; do not provision another database or apply migrations as part of hosting setup.

### API Web Service

- Repository: `koenbroto25/PKE-Export-Platform`
- Root directory: repository root
- Runtime: Docker
- Dockerfile: `./Dockerfile`
- Health check: `/api/v1/health`
- Required environment variables:
  - `NODE_ENV=production`
  - `PORT` (host platform supplies this)
  - `DATABASE_URL` (Neon runtime connection string; secret)
  - `NEON_AUTH_BASE_URL`
  - `NEON_AUTH_JWKS_URL`
  - `CORS_ALLOWED_ORIGINS` (exact deployed frontend origin)
  - `NEON_AUTH_WEBHOOK_ENABLED` only if webhook functionality is intentionally enabled
- Never place Neon secrets in frontend environment variables.

The Dockerfile is multi-stage. It compiles the backend and runs the compiled entrypoint. A source audit corrected the runtime command from `dist/src/index.js` to `dist/index.js`, consistent with `tsconfig.json`'s `rootDir=src` and `outDir=dist`.

### Frontend Static Site

- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- Build-time environment:
  - `VITE_NEON_AUTH_URL`: the correct Neon Auth endpoint for the project/branch
  - `VITE_API_BASE`: absolute API prefix, e.g. `https://<api-host>/api/v1`
- Ensure API `CORS_ALLOWED_ORIGINS` contains the frontend's exact HTTPS origin.
- Neon Auth's allowed-origin configuration must also include the deployed frontend origin.

### Release safety

1. Deploy a preview/staging frontend and API first.
2. Confirm `/api/v1/health` responds.
3. Test login, logout, password reset, role-bound routes, and API CORS.
4. Run the PM appointment-first workflow against an isolated UAT branch only after explicit approval.
5. Do not apply Migration 113 to Production as part of a deploy.
6. Only promote the hosting environment after all GitHub Actions checks pass.

## Railway alternative

Railway can deploy from the GitHub repository using the root Dockerfile for the API. Create a second service with root directory `frontend` and build the SPA as a static site, or serve the built SPA through a separate static service. Set the same environment variables and origins described above. Railway's GitHub and Docker deployment paths are documented in its Express guide.

## Known limitation

Hosting provider setup requires account authorization, environment secrets, domain configuration, and Neon Auth allowed-origin changes. Those are external account actions and must not be fabricated or committed as secrets.
