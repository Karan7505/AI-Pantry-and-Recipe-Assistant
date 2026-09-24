-- Migration 0003 — grocery upsert support (fixes KI-1) + drop dead scans.image_url.
--
-- Run in: Supabase Dashboard → SQL Editor → paste → Run.
-- Idempotent: safe to run twice. Re-runnable even if partially applied.
--
-- IMPORTANT ORDERING (blueprint P0):
--   1. Deploy the new app code first (it stops writing `scans.image_url` and
--      upserts grocery_items on the new unique constraint).
--   2. THEN run this migration.
--   (Old app code + this migration = grocery inserts and scan rows fail;
--    new app code without this migration = grocery adds work but fall back
--    to the old duplicate-prone behavior until the constraint exists.)
--
-- What this does:
--   a) Adds grocery_items.unit_key, a STORED generated column = COALESCE(unit, '').
--      Postgres treats NULLs as distinct in UNIQUE constraints, so without this
--      two unit-less rows ("milk", "milk") would not collide.
--   b) Dedupes rows already corrupted by the KI-1 bug: per (list, normalized_name,
--      unit_key) group it keeps the OLDEST row, sums quantities (NULL if any row's
--      quantity is unknown — same rule as the app's mergeIngredients), marks the
--      group completed only if ALL rows were completed, then deletes the rest.
--   c) Adds the UNIQUE constraint the app's .upsert() onConflict targets.
--   d) Drops scans.image_url (always NULL — images are deliberately never stored).

-- (a) generated unit key
alter table public.grocery_items
  add column if not exists unit_key text
  generated always as (coalesce(unit, '')) stored;

-- (b) aggregate the keeper rows of every duplicate group
with groups as (
  select
    grocery_list_id,
    normalized_name,
    unit_key,
    min(id) as keep_id,
    bool_and(quantity is not null) as all_qty_known,
    sum(quantity) as qty_sum,
    bool_and(completed) as all_completed
  from public.grocery_items
  group by grocery_list_id, normalized_name, unit_key
  having count(*) > 1
)
update public.grocery_items g
set
  quantity  = case when gr.all_qty_known then gr.qty_sum else null end,
  completed = gr.all_completed
from groups gr
where g.id = gr.keep_id;

-- (b) delete the duplicate rows (keep the oldest per group)
with groups as (
  select
    grocery_list_id,
    normalized_name,
    unit_key,
    min(id) as keep_id
  from public.grocery_items
  group by grocery_list_id, normalized_name, unit_key
  having count(*) > 1
)
delete from public.grocery_items g
using groups gr
where g.grocery_list_id = gr.grocery_list_id
  and g.normalized_name = gr.normalized_name
  and g.unit_key = gr.unit_key
  and g.id <> gr.keep_id;

-- (c) unique constraint (the upsert conflict target)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'grocery_items_list_name_unit_key_unique'
  ) then
    alter table public.grocery_items
      add constraint grocery_items_list_name_unit_key_unique
      unique (grocery_list_id, normalized_name, unit_key);
  end if;
end$$;

-- (d) drop the dead column
alter table public.scans
  drop column if exists image_url;

-- Verification (run after): should return 0 rows
-- select grocery_list_id, normalized_name, unit_key, count(*)
-- from public.grocery_items
-- group by 1,2,3 having count(*) > 1;
