# Pantry — AI Pantry & Recipe Assistant

Photograph your fridge or pantry, confirm the detected ingredients, and get
recipes ranked by what you already own, a grocery list for the gap, and
per-serving nutrition — all persisted per user.

## Stack

- **Next.js 14 (App Router) + TypeScript** — pages, server actions, API routes
- **Supabase** — Auth (email/password), Postgres (RLS), `@supabase/ssr` session cookies
- **AI (provider-agnostic)** — direct typed fetch calls to **OpenAI** or **Google Gemini**,
  auto-selected from env; every AI response validated with **Zod** (never trusted raw)
- **Tailwind CSS** — warm herb/tomato/cream design system (no default purple)
- **@tremor/react** — nutrition macronutrient chart + summary cards
- **Vitest** — 48 offline unit tests (normalization, merge, scoring, schemas, mocked AI)

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in real values
npm run dev                  # http://localhost:3000
```

### 1. Supabase

1. Create a project at supabase.com.
2. **SQL Editor → run** `supabase/migrations/0001_init.sql` (tables + RLS).
3. Put the values in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; keep secret)
4. Auth: email/password is enabled by default. If you require email
   confirmation, sign-ups will show a "check your inbox" notice until confirmed.

### 2. AI provider (one is enough)

| Provider | Env vars | Default models |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | `gpt-4o` (vision + text) |
| Gemini | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-1.5-flash` |

Set `VISION_PROVIDER=openai|gemini` to force one when both keys exist
(otherwise the first available key wins). Models are overridable via
`OPENAI_VISION_MODEL`, `OPENAI_TEXT_MODEL`, `GEMINI_VISION_MODEL`, `GEMINI_TEXT_MODEL`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `next lint` |
| `npm test` | Vitest (48 tests, offline) |

## Architecture

```
app/
  page.tsx               Landing (public)
  login/ signup/         Auth pages (public)
  (app)/                 Protected group — Shell layout + auth gate
    dashboard/ pantry/ scan/ recipes/ recipes/[id]/ grocery/ settings/
  api/
    pantry/scan/         POST → vision detection (Zod-validated)
    recipes/             POST → recipe generation against live pantry
    nutrition/           POST → per-serving nutrition estimate
middleware.ts            Session refresh + route protection (302 → /login)
lib/
  types.ts               Domain model
  ingredients.ts         Name normalization, singularization, unit-aware merge
  match.ts               Pantry match scoring + recipe ranking
  config.ts              Provider resolution (env-driven)
  ai/
    errors.ts            AiError — typed, user-safe messages
    schemas.ts           Zod contracts for AI output + API inputs
    prompts.ts           System/user prompt builders
    provider.ts          fetch + timeout + rate-limit mapping + JSON extraction
    services.ts          analyzePantryImage / generateRecipes / generateNutrition / normalizeIngredients
  supabase/              browser + server clients
  auth.ts  actions.ts    session helpers + "use server" auth actions
  actions-data.ts        "use server" data actions (pantry/recipe/grocery)
  db.ts                  Server-only, user-scoped queries
supabase/migrations/     0001_init.sql — schema + RLS policies
components/              UI kit, shell, page feature components
tests/                   Vitest suites (utils + mocked AI)
```

### Key behaviors

- **Normalization/dedupe**: `tomato` / `Tomato` / `Tomatoes` collapse to one
  pantry entry (unique on `user_id + normalized_name`; upsert merges).
- **Match score**: % of a recipe's distinct ingredients found in the pantry
  (name-based, quantity not trusted). Recipes sort by score → fewer missing → shorter time.
- **Grocery merge**: duplicates with **compatible units** sum
  (2 pieces + 3 pieces = 5); incompatible units are never merged
  (1 cup + 200 g stay separate). "Add missing to grocery list" never adds items you own.
- **AI safety**: every model response passes a Zod schema; failures map to
  typed `AiError` codes (`config`, `auth`, `rate_limit`, `timeout`, `network`,
  `model_error`, `invalid_response`, `empty`) with user-safe messages — no raw
  stack traces in the UI. Image payloads are client-compressed (≤1024px JPEG)
  before upload; format (JPG/PNG/WebP) and size (default 8 MB) validated.
- **Security**: RLS scopes every table to the authenticated user;
  `middleware.ts` redirects unauthenticated visits to `/login?next=…`;
  server actions re-verify the session; service-role key is server-only.
  `.env*` is gitignored.

## Verification status

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | PASS |
| Lint | `npm run lint` | PASS |
| Production build | `npm run build` | PASS (12 routes) |
| Unit tests | `npm test` | PASS (48/48, offline) |
| Supabase auth / DB / AI live flows | — | **NOT LIVE VERIFIED** (`.env` placeholders; fill keys + run migration, then exercise in browser) |

To live-verify: fill `.env.local`, run the migration SQL, `npm run dev`,
create an account, scan a photo, confirm ingredients, generate recipes,
save one, add missing items to the grocery list, check items off, and
view nutrition on a recipe page.
