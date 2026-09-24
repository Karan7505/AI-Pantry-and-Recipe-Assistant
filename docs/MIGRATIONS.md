# Database Migrations

There is **no migration runner** in this repo — migrations are plain SQL files applied **manually** in the Supabase Dashboard (SQL Editor) or via `supabase db push` if you later set up local Supabase linking.

## Files & order

| File | Purpose | When to run |
|---|---|---|
| `supabase/migrations/0001_init.sql` | 5 tables, indexes, `updated_at` triggers, RLS + policies (already includes the corrected grocery UPDATE policy) | **Fresh projects** — run once |
| `supabase/migrations/0002_grocery_items_update_policy.sql` | Adds `with check` to the `grocery_items` UPDATE policy (closes an RLS re-parenting gap) | **Existing projects** created from the *original* 0001 (before 2026-09-21). Fresh projects that ran the current 0001 already have it — running 0002 is still harmless (it drops + recreates the policy identically) |
| `supabase/migrations/0003_grocery_upsert_support.sql` | Adds `grocery_items.unit_key` (generated `COALESCE(unit,'')`), dedupes rows corrupted by the old insert-duplicate bug, adds `UNIQUE (grocery_list_id, normalized_name, unit_key)` (the app's upsert target), drops dead `scans.image_url` | **All projects** after the app code that uses the upsert is deployed |

## How to run

1. Supabase Dashboard → your project → **SQL Editor** → New query.
2. Paste the file contents → **Run**.
3. Check the "Rows affected" / no-error output.

All three files are written to be **idempotent** (safe to re-run).

## Deployment ordering (important for 0003)

1. **Deploy the app code first.** The current code:
   - stops writing `scans.image_url` (safe either way),
   - uses `upsert … onConflict (grocery_list_id, normalized_name, unit_key)` — **this 500s if the constraint doesn't exist yet**, so the grocery "add" feature will fail on a DB that hasn't run 0003.
2. **Then run 0003** in the SQL Editor.

If you run 0003 *before* deploying the new code, the old app's plain `INSERT`s still work (the constraint is not violated by single distinct rows) but duplicates can re-accumulate — so prefer code-first.

## Verifying after 0003

```sql
-- must return 0 rows (no duplicate groups remain):
select grocery_list_id, normalized_name, unit_key, count(*)
from public.grocery_items
group by 1,2,3 having count(*) > 1;

-- the constraint must exist:
select conname from pg_constraint where conname = 'grocery_items_list_name_unit_key_unique';

-- the dead column must be gone:
select count(*) from information_schema.columns
where table_name = 'scans' and column_name = 'image_url';  -- → 0
```

## Known data nuance

If a list contains the same ingredient under two raw unit spellings (e.g. `cup` and `cups`), both rows survive the unique constraint (the key is the raw unit string). The app merges by *canonical* unit, so going forward it keeps one raw spelling per group; only legacy rows need manual cleanup:

```sql
-- inspect:
select grocery_list_id, normalized_name, unit, sum(quantity)
from public.grocery_items group by 1,2,3 having count(*) > 1;
```
