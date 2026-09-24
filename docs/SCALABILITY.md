# Scalability

## Current architecture (single instance)

- Stateless Next.js server (pages, 15 server actions, 3 API routes, proxy) — horizontally scalable **as-is** behind a load balancer.
- **One stateful element: the in-memory rate-limit map** (`lib/ratelimit.ts`). It is per-process: with N replicas the effective per-user limit becomes N × the configured value, and a restart resets counters. This is the only thing that *weakens* (it does not break) under horizontal scale.
- Sessions live in Supabase (cookie + their refresh store) — not app memory.
- DB connection pooling is Supabase's (PostgREST), not the app's.
- No queues, no websockets, no local filesystem, no file storage.

## Hard ceilings (in order of likelihood)

1. **AI provider quotas/billing** — one shared key per provider; every scan/recipe is a paid call. Provider RPM/TPM limits become the global throughput cap; cost scales linearly with usage.
2. **Request body size** — scans are up to ~28 MB; many serverless platforms reject this by default (deployment constraint, not a code one).
3. **Auth fan-out** — `supabase.auth.getUser()` runs in the proxy + every RSC page + every action; there is no token cache, so high RPS multiplies authenticated round-trips.
4. **Per-user pantry size** — `getUserPantry` is unbounded and feeds the LLM prompt (linear prompt growth; KI-12 in the handover).
5. **Postgres** — trivial at MVP scale; plan-based ceiling.

## Growth triggers (what to watch, in order)

| Signal / trigger | Change to make | Kind |
|---|---|---|
| > 1 replica needed | Move rate limits to Upstash Redis or a Postgres counter table (call sites are already isolated in `lib/ratelimit.ts`) | Code (small) + infra |
| Provider 429s during normal traffic, or spend surprises | Queue AI calls (per-user concurrency 1, backoff, idempotency keys) + multi-key pool / budgeting in the queue worker | Code + infra |
| p95 page latency degrades with traffic | Per-request (or short-TTL) cache of `getUser()` results | Code (small) |
| Pantry > ~500 items for active users | Server-side cap on pantry rows + prompt truncation | Code |
| Supabase free-tier storage/app requests | Upgrade to Pro | Infra only |
| Grocery list growth anomalies | Already prevented by the 0003 unique constraint + true upsert (code done) | — |

## What breaks first (MVP → growth)

1. AI provider rate limits / billing (bursts).
2. Rate-limit guarantees across replicas (silent, abuse-side only).
3. Auth round-trip fan-out latency.
4. Postgres plan ceiling.

**No load tests exist** — all of the above is architectural inference, not measurement. Before committing to any scale target, run a k6/Artillery mixed profile (≈10% scans, 20% recipe generations, 70% page views) at 10/50/200 virtual users and record p50/p95 per route, provider 429 rate, and per-instance memory.

## Proposed future architecture (NOT current)

```
Users → CDN/TLS edge → Load balancer → N × Next instances (stateless)
                                     ├→ Shared rate limits (Upstash Redis / Postgres)
                                     ├→ Supabase Auth (per-instance token cache)
                                     ├→ Supabase Postgres (Pro, RLS)
                                     └→ AI queue (workers, per-user concurrency 1,
                                          backoff, idempotency, multi-key pool) → OpenAI / Gemini
```
