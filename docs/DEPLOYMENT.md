# Deployment

## Prerequisites

- **Node 22** (Next 16 requirement; 20.19 minimum).
- A Supabase project with **0001 + 0002 (+ 0003 once the upsert code is live)** applied — see `docs/MIGRATIONS.md`.
- Supabase dashboard: Auth → minimum password length **≥ 8**; decide email confirmation on/off; auth rate limits at defaults.
- At least one AI provider key (OpenAI **or** Google Gemini) with billing enabled.
- HTTPS at the edge (required for `Secure` cookies — Next sets them when `NODE_ENV=production`).

## Option A — Vercel (recommended)

1. Vercel → **Add New → Project** → import `Karan7505/AI-Pantry-and-Recipe-Assistant`, branch `dev` (or `main`).
2. Framework preset: **Next.js** (auto-detected). Build command `npm run build`, output `.next`.
3. Environment variables (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY` and/or `GOOGLE_GENERATIVE_AI_API_KEY`
   - `VISION_PROVIDER` (optional)
   - `NEXT_PUBLIC_MAX_IMAGE_MB` (optional, default 8)
   - `NODE_ENV=production` is set by Vercel automatically.
4. **Body limit (critical):** the scan endpoint accepts up to ~28 MB of base64. **Vercel Hobby caps request bodies at 4.5 MB** → scans will 413. You need **Vercel Pro** (or a non-serverless host, Option B) for the full 6-photo scan design. On a hobby/free host, lower `NEXT_PUBLIC_MAX_IMAGE_MB` to ~1 and expect the server cap to still accept it.
5. **Function timeout:** set the platform function/timeout to **≥ 70 s** (the app allows 60 s of AI time + overhead).
6. Deploy. Migrations are NOT run automatically — they live in Supabase, not in the deploy.

## Option B — Container host (Render / Railway / Fly / ECS)

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "start"]
```

- Request body limit on the host/LB: **≥ 30 MB** (e.g. nginx `client_max_body_size 30m`).
- TLS termination at the LB (cert manager / host default).
- Set the same env vars as Option A.
- Scale: run N replicas behind the LB — the app is stateless **except the in-memory rate limiter** (see `docs/SCALABILITY.md`; with >1 replica the effective per-user limits loosen proportionally).

## Rollback

Keep the previous container image / Vercel deploy. Code rollbacks are always safe: migrations 0002/0003 are additive or policy-recreating (0003's `unit_key` column and constraint are not removed by a code rollback, and the old code's plain inserts still work against a 0003-applied DB).

## Post-deploy smoke checklist

### Automated — `scripts/smoke-test.mjs`

```bash
# Unauthenticated: landing page, security headers, /dashboard redirect, unauthenticated scan 401
node scripts/smoke-test.mjs

# Authenticated (add 413 oversized-body + 429 rate-limit checks).
# NOTE: consumes ~12 of the account's 10/hour scan rate-limit slots — use an
# account with a fresh window, at most once per hour.
SMOKE_BASE_URL=https://your-app.example.com \
SMOKE_COOKIE="sb-access-token=…" \
node scripts/smoke-test.mjs
```

The script exits non-zero on any failed check, so it can be wired into deploy pipelines.

### Manual (user-facing flows the script cannot exercise)

- [ ] Sign up + login works (confirm email flow if enabled)
- [ ] Scan 1 photo → detection → confirm → pantry shows it
- [ ] Re-add the same ingredient → quantity **accumulates** (2 + 1 → 3)
- [ ] Generate recipes → save → detail renders → "Add missing" → grocery list has **no duplicates**; adding the same recipe twice doesn't duplicate rows
- [ ] Toggle purchased → refresh → still checked; "Add missing" again does **not** resurrect it as pending unless its quantity changed
- [ ] No `console.error` spam in the server logs for normal flows (errors are now JSON lines: `{ts, level, tag, msg, …}`)
