# Pantry — AI Pantry & Recipe Assistant

**Photograph your fridge. Eat what you own.**

Pantry is a full-stack web app that turns photos of your fridge, pantry, or grocery bags into a living food inventory. It uses vision AI to detect ingredients, ranks recipes by how much you already have, builds a grocery list for the gap, and estimates per-serving nutrition — all persisted per user with strict row-level security.

> Built with Next.js 16 (App Router), TypeScript, Supabase, a provider-agnostic AI layer (OpenAI or Gemini), and Tremor for data visualization.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Core Workflow](#core-workflow)
- [Scripts](#scripts)
- [Testing](#testing)
- [Screenshots](#screenshots)
- [Contributing](#contributing)

---

## Features

### Scan & Detect
- Multi-image upload (JPG / PNG / WebP, up to 8 MB each, max 6 photos per scan)
- Client-side compression to ≤1024 px JPEG before upload
- Vision AI detection with per-item confidence scores
- Editable **confirmation screen**: rename, set quantity/unit/category, add, or remove any detected item before it enters the pantry
- Low-confidence items are flagged for review

### Pantry Management
- Full CRUD with ±1 quantity steppers
- **Name normalization & dedupe** — `tomato`, `Tomato`, and `Tomatoes` always collapse into a single entry; rescans merge into the existing pantry instead of duplicating
- Search + category filters (vegetable, fruit, meat, dairy, spice, …)
- Expiry tracking with "N days left" / "expired" badges

### Recipe Generation
- Optional filters: servings, meal type, max cook time, cuisine, dietary tags, and excluded ingredients
- Model is instructed to **prioritize ingredients you already own**
- Every recipe gets a **pantry match score** (e.g. `100%` / `66.7%` / `50%`) — the share of its distinct ingredients you have
- Results are sorted: best match → fewest missing → shortest cook time
- Full detail page: description, ingredients (with have/need flags), steps, cook times, servings, meal type, cuisine
- **"Add missing to grocery list"** — never adds items you already own

### Grocery List
- Generated from one recipe's missing items (with source attribution) or added manually
- **Unit-aware merge**: `2 tomatoes + 3 tomatoes = 5 tomatoes`, but `1 cup milk + 200 g milk` are kept as two lines (incompatible units are never combined)
- Check off / uncheck, delete, and "clear purchased" — state persists across refreshes

### Nutrition
- Per-serving estimate: calories, protein, carbs, fat, plus optional fiber, sugar, sodium, saturated fat
- Visualized with Tremor: macronutrient bar chart + summary stat cards
- Clearly labeled as an **AI estimate** on every screen

### Accounts & Security
- Supabase email/password auth with cookie-backed sessions (`@supabase/ssr`)
- Route protection via the Next.js [proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) file (unauthenticated → `/login?next=…`)
- **Row Level Security** on every table — a user can only ever read or write their own rows
- Provider-agnostic AI layer: typed `AiError` codes (`auth`, `rate_limit`, `timeout`, `network`, `invalid_response`, …) with user-safe messages; raw stack traces never reach the UI
- **Every AI response is validated with Zod** before it is stored or rendered — invalid model output is rejected, never trusted

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                            Browser                                  │
│  Pages (App Router) ── Server Components (data) + Client Components │
│  (interactions) ── "use server" Actions ── REST /api/* (AI calls)   │
└──────────────┬──────────────────────────────┬───────────────────────┘
               │ cookies / queries            │ fetch (session-verified)
┌──────────────▼──────────────┐   ┌───────────▼────────────────────────┐
│        Next.js Server       │   │        AI Service Layer            │
│  lib/db.ts (user-scoped)    │   │  services → provider → Zod validate│
│  lib/auth.ts (session)      │   │  (OpenAI | Gemini, auto by env)    │
│  lib/ingredients.ts (pure)  │   └─────────────────────┬──────────────┘
│  lib/match.ts (pure)        │                        │
└──────────────┬──────────────┘                        │
               │                                       │
┌──────────────▼──────────────────┐   ┌────────────────▼─────────────┐
│           Supabase              │   │        LLM APIs              │
│  Auth · Postgres (+RLS)         │   │  api.openai.com /            │
│  @supabase/ssr cookie sessions  │   │  generativelanguage.google…  │
└─────────────────────────────────┘   └──────────────────────────────┘
```

**Design principles**

1. **Server owns trust.** All DB access happens server-side through [lib/db.ts](lib/db.ts); RLS is the second wall. Server actions re-verify the session on every call.
2. **AI is a bounded, typed dependency.** [lib/ai/services.ts](lib/ai/services.ts) exposes four functions (`analyzePantryImage`, `generateRecipes`, `generateNutrition`, `normalizeIngredients`). Each maps raw model JSON through a Zod schema, falls back to deterministic logic where safe (e.g. normalization), and throws a typed `AiError` otherwise. The UI only ever sees typed data or a user-safe message.
3. **Deterministic logic is pure and tested.** Normalization, unit-aware merging, match scoring, and ranking live in framework-free modules ([lib/ingredients.ts](lib/ingredients.ts), [lib/match.ts](lib/match.ts)) with 60 offline unit tests.
4. **Provider portability.** [lib/config.ts](lib/config.ts) resolves OpenAI vs Gemini from environment variables; [lib/ai/provider.ts](lib/ai/provider.ts) isolates HTTP, timeouts (60 s), rate-limit/auth mapping, and JSON extraction (handles markdown fences and embedded objects).

**Data model** (see [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql))

| Table | Purpose |
|---|---|
| `pantry_items` | Confirmed inventory; unique on `(user_id, normalized_name)` so rescans upsert/merge |
| `scans` | Audit trail of each image scan + its AI result |
| `recipes` | Generated recipes as a JSONB `recipe_data` column (full structure) |
| `grocery_lists` | One default list per user (additional lists supported) |
| `grocery_items` | Line items with quantity, unit, source recipe, and `completed` state |

Every table is RLS-protected: `user_id = auth.uid()` for direct tables; grocery items are scoped through their parent list.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Server Components, Server Actions, proxy-based route protection) |
| Language | TypeScript 5 (strict mode) |
| Backend / DB / Auth | [Supabase](https://supabase.com) — Postgres, Row Level Security, `@supabase/ssr` |
| AI (vision + text) | OpenAI (`gpt-4o` default) **or** Google Gemini (`gemini-1.5-flash` default) — auto-selected, swappable via env |
| Validation | [Zod](https://zod.dev) — all AI output and API inputs |
| UI | React 18 + Tailwind CSS (custom herb/tomato/cream design system) |
| Data viz | [`@tremor/react`](https://tremor.so) — nutrition charts + stat cards |
| Testing | [Vitest](https://vitest.dev) — 60 offline unit tests |
| Lint | ESLint (`next/core-web-vitals`) |

---

## Installation

### Prerequisites

- **Node.js 20.19+** (Next 16 requirement; Node 22 LTS recommended — production should not run on an EOL runtime)
- A [Supabase](https://supabase.com) account (free tier works)
- An OpenAI **or** Google AI Studio API key

### Steps

```bash
# 1. Clone and install
git clone <your-repo-url>
cd ai-pantry-recipe-assistant
npm install

# 2. Configure environment
cp .env.example .env.local
#    → edit .env.local with your real values (table below)

# 3. Create the database schema
#    Supabase Dashboard → SQL Editor → paste & run:
#      supabase/migrations/0001_init.sql

# 4. Run
npm run dev
# → http://localhost:3000
```

### Production build

```bash
npm run build   # typecheck + lint + compile all routes
npm start
```

---

## Environment Variables

All variables live in `.env.local` (gitignored). Copy `.env.example` as a template.

### Required — Supabase

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL (`https://<ref>.supabase.co`). Exposed to the client. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key. Exposed to the client; RLS keeps it safe. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** service role key. Never exposed to the client. |

### Required — one AI provider (or both)

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Enables the OpenAI provider (default models: `gpt-4o`). |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Enables the Gemini provider (default models: `gemini-1.5-flash`). |
| `VISION_PROVIDER` | Optional. `openai` \| `gemini` to force a provider when both keys exist. Empty = first available key wins. |

### Optional — model overrides

| Variable | Default | Description |
|---|---|---|
| `OPENAI_VISION_MODEL` | `gpt-4o` | Any vision-capable OpenAI model for image detection. |
| `OPENAI_TEXT_MODEL` | `gpt-4o` | Any chat model for recipe/nutrition generation. |
| `GEMINI_VISION_MODEL` | `gemini-1.5-flash` | e.g. `gemini-1.5-pro` for higher-quality detection. |
| `GEMINI_TEXT_MODEL` | `gemini-1.5-flash` | e.g. `gemini-1.5-pro` for richer recipes. |

### Optional — upload limits

| Variable | Default | Description |
|---|---|---|
| `MAX_IMAGE_MB` | `8` | Client-side max file size for scan uploads (MB). |

> ⚠️ **Never commit `.env.local`.** It is covered by `.gitignore`. The service-role key must remain server-side — if it leaks, rotate it in the Supabase dashboard.

---

## Usage

### 1. Create an account

Open [http://localhost:3000](http://localhost:3000) → **Get started** → enter an email + password. If your Supabase project has "Confirm email" enabled, check your inbox before signing in.

### 2. Scan your pantry

Go to **Scan**, drop in 1–6 photos (fridge shelf, pantry door, grocery bags). Click **Analyze photos** — after a few seconds you land on the *Detected Ingredients* screen. Fix anything the AI got wrong, add what it missed, then **Confirm to pantry**.

### 3. Manage your pantry

The **Pantry** page shows everything you own. Add items manually with **Add item**, adjust quantities with the steppers, set expiry dates, and delete what you've used. Rescans automatically merge into existing entries.

### 4. Generate recipes

On **Recipes**, set any filters (e.g. "4 servings, dinner, under 40 min, no gluten") and click **Generate recipes**. Each card shows a match badge — green `You have everything`, amber/red `Missing N ingredients`. Open a recipe for the full page: ingredients flagged with have/need, step-by-step instructions, and a nutrition panel.

### 5. Shop the gap

On the recipe detail page, click **Add N missing items to grocery list**. On **Grocery list**, check items off as you buy them and use **Clear purchased** afterwards. Items from multiple recipes are merged automatically when units are compatible.

### 6. Re-scan to refresh

Restocked? Run another scan — quantities merge with what you already have. Cooked something? Remove it (or set its quantity to 0) and the recipes + match scores update next time you generate.

---

## Project Structure

```
├── app/
│   ├── layout.tsx                    # Root layout (fonts, metadata, global styles)
│   ├── page.tsx                      # Landing page (public)
│   ├── not-found.tsx                 # 404 page
│   ├── globals.css                   # Tailwind + design tokens
│   ├── login/  signup/               # Auth pages (public)
│   ├── (app)/                        # Protected group — Shell nav + auth gate
│   │   ├── layout.tsx                #   verifies session, redirects to /login
│   │   ├── dashboard/                #   overview: stats, expiring soon, recent recipes
│   │   ├── pantry/                   #   inventory CRUD
│   │   ├── scan/                     #   image upload → detection → confirmation
│   │   ├── recipes/                  #   generator with filters
│   │   ├── recipes/[id]/             #   detail: steps, nutrition, grocery CTA
│   │   ├── grocery/                  #   list: check off, merge, clear purchased
│   │   └── settings/                 #   account info, AI provider status, sign out
│   └── api/
│       ├── pantry/scan/route.ts      # POST → vision detection
│       ├── recipes/route.ts          # POST → recipe generation (live pantry context)
│       └── nutrition/route.ts        # POST → per-serving nutrition estimate
├── lib/
│   ├── types.ts                      # Domain types (shared by DB, AI, UI)
│   ├── config.ts                     # AI provider resolution from env
│   ├── ingredients.ts                # Normalization, singularization, unit-aware merge (pure)
│   ├── match.ts                      # Pantry match scoring + recipe ranking (pure)
│   ├── auth.ts                       # Session helpers
│   ├── actions.ts                    # "use server" — auth actions
│   ├── actions-data.ts               # "use server" — pantry / recipe / grocery actions
│   ├── db.ts                         # Server-only, user-scoped Supabase queries
│   ├── utils.ts                      # Formatting + helpers
│   ├── ai/
│   │   ├── errors.ts                 # AiError — typed, user-safe error codes
│   │   ├── schemas.ts                # Zod contracts for all AI output + API inputs
│   │   ├── prompts.ts                # System/user prompt builders
│   │   ├── provider.ts               # HTTP + timeout + rate-limit mapping + JSON extraction
│   │   └── services.ts               # The 4 public AI service functions
│   └── supabase/
│       ├── client.ts                 # Browser client (cookie sessions)
│       └── server.ts                 # Server client (requests + service role)
├── components/
│   ├── ui.tsx                        # Design-system primitives (Button, Card, Badge, …)
│   ├── shell.tsx                     # Responsive nav (desktop sidebar + mobile menu)
│   ├── auth-form.tsx                 # Login/signup form
│   ├── scan-flow.tsx                 # Upload → processing → confirmation editor
│   ├── pantry-manager.tsx            # Pantry CRUD UI
│   ├── recipe-generator.tsx          # Filters + ranked results
│   ├── nutrition-panel.tsx           # Tremor chart + stat cards
│   ├── add-to-grocery.tsx            # "Add missing to grocery list" CTA
│   └── grocery-manager.tsx           # Grocery list UI
├── supabase/
│   └── migrations/0001_init.sql      # Full schema + RLS policies
├── tests/                            # Vitest suites (offline, no keys needed)
│   ├── ingredients.test.ts           #   normalization + merge
│   ├── match.test.ts                 #   scoring + ranking
│   ├── schemas.test.ts               #   Zod contracts + JSON extraction
│   └── ai-services.test.ts           #   services with mocked model transport
├── proxy.ts                          # Session refresh + route protection (Next 16 proxy convention)
├── .env.example                      # Documented env template
├── next.config.mjs
├── tailwind.config.ts
└── vitest.config.ts
```

---

## Core Workflow

```
 photos ──► /api/pantry/scan ──► vision AI ──► Zod validate ──► confirmation UI
                                                                         │ user edits
                                                                         ▼
                        pantry_items (upsert by normalized_name) ◄── confirm
                                   │
                                   ▼
        /api/recipes ◄── filters + live pantry ──► recipe AI ──► Zod validate
                                   │
                                   ▼
        scoreRecipe() per recipe: match % = owned / required distinct ingredients
        rankRecipes(): score desc → missing asc → cook time asc
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                             ▼
            /recipes/[id]                  "Add missing to grocery"
        + /api/nutrition ──► nutrition AI    → mergeIngredients() (unit-aware)
          (Tremor chart,            │            → grocery_items (persisted)
           "AI estimate" label)     ▼
                          save recipe → recipes table
```

**Where the deterministic logic wins**

- *Dedupe*: `normalizeIngredientName("Tomatoes")` → `tomato`; the DB unique constraint + upsert make the merge race-safe.
- *Scoring*: `scoreRecipe()` counts distinct required ingredients present in the pantry (names normalized; quantities ignored — they're unreliable).
- *Grocery merge*: items with the same canonical name **and** compatible canonical unit sum their quantities; everything else stays separate.
- *Ranking*: score → fewer missing → shorter total time.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (http://localhost:3000) |
| `npm run build` | Typecheck + lint + production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `eslint .` (next/core-web-vitals) |
| `npm test` | Run all Vitest suites once |
| `npm run test:watch` | Vitest in watch mode |

---

## Testing

```bash
npm test
# Test Files  6 passed (6)
#      Tests  60 passed (60)
```

The suite is fully offline — no API keys or network required. It covers:

| Suite | Coverage |
|---|---|
| `tests/ingredients.test.ts` | Name normalization/casing/plurals, synonym folding, unit canonicalization, compatible-vs-incompatible merging, dedupe |
| `tests/match.test.ts` | Match scoring, availability flagging, ranking tie-breaks, label thresholds |
| `tests/schemas.test.ts` | Every Zod contract (valid/invalid), plus tolerant JSON extraction (fences, embedded objects, garbage) |
| `tests/ai-services.test.ts` | All four services with a mocked transport: happy paths, empty results, malformed model output, provider errors (rate limit, timeout), and deterministic fallbacks |
| `tests/ratelimit.test.ts` | Per-user/per-route window limits, expiry, isolation |
| `tests/security.test.ts` | Post-auth redirect sanitization (open-redirect guard), scan upload MIME/size caps, filter input caps |

---

## Security

Controls implemented (see [SECURITY_AUDIT.md](SECURITY_AUDIT.md) for the full audit + remediation log):

- **Session**: cookie is `HttpOnly`, `Secure` in production, `SameSite=Lax`, 30-day max age — set consistently in the server client, proxy, and browser client.
- **Authorization**: every server action re-verifies the session; uid is always server-derived; every id-based DB query is scoped to the user **at the query level** *and* by Row Level Security (defense in depth).
- **Input**: all API bodies Zod-validated; scan uploads have strict server-side MIME + per-image size caps with 413 on oversized bodies; recipe/pantry persistence re-validated server-side with field caps.
- **Abuse**: per-user, per-operation rate limits on all paid AI endpoints and high-fan-out actions (429 when exceeded).
- **Headers**: CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` on every route.
- **Secrets**: no service-role key in the app; privileged keys never inlined into client bundles; Gemini key sent via header, not URL.
- **AI output**: never trusted — every model response is Zod-validated; user-facing errors are canned and safe.

**Still required before launch (manual):** apply `supabase/migrations/0002_grocery_items_update_policy.sql` to any existing Supabase project, run the two-account RLS verification matrix against the live database, set Supabase auth password minimum ≥ 8 in the dashboard, and deploy on Node 22.

---

## Screenshots

> Capture these with `npm run dev` after configuring `.env.local`, and drop the files into `docs/screenshots/`.

| # | Page | Suggested file |
|---|---|---|
| 1 | Landing | `docs/screenshots/landing.png` |
| 2 | Scan — upload & processing | `docs/screenshots/scan-upload.png` |
| 3 | Detected Ingredients confirmation | `docs/screenshots/scan-confirm.png` |
| 4 | Pantry with search & expiry badges | `docs/screenshots/pantry.png` |
| 5 | Recipes ranked by match score | `docs/screenshots/recipes.png` |
| 6 | Recipe detail + nutrition chart | `docs/screenshots/recipe-detail.png` |
| 7 | Grocery list (checked off + merged) | `docs/screenshots/grocery.png` |

```markdown
<!-- Once captured, replace the table above with:
| Scan & confirm | Recipe ranking | Nutrition |
|---|---|---|
| ![Scan confirmation](docs/screenshots/scan-confirm.png) | ![Recipes](docs/screenshots/recipes.png) | ![Nutrition](docs/screenshots/recipe-detail.png)
-->
```

---

## Contributing

Contributions are welcome. Please keep changes focused and verified.

### Getting set up

```bash
git clone <your-repo-url>
cd ai-pantry-recipe-assistant
npm install
cp .env.example .env.local   # fill in your keys
npm run dev
```

Run the migration SQL (Section *Installation*, step 3) in a scratch Supabase project so you can exercise real flows.

```

### PR checklist

- [ ] New behavior has tests (pure logic → unit test; AI-touching → mocked-transport test)
- [ ] New AI output is validated by a Zod schema in [lib/ai/schemas.ts](lib/ai/schemas.ts) — **never render or store raw model output**
- [ ] New DB columns come with a migration in `supabase/migrations/` **and** matching RLS policies
- [ ] All DB access goes through [lib/db.ts](lib/db.ts) scoped by the authenticated user
- [ ] User-facing errors are friendly (`AiError` / action responses) — no raw stack traces
- [ ] UI states covered: loading, empty, error (see [components/ui.tsx](components/ui.tsx))
- [ ] Screenshots updated if the UI changed

---
