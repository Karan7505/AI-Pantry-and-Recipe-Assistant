-- AI Pantry & Recipe Assistant — initial schema + Row Level Security.
-- Apply in Supabase → SQL Editor (or via `supabase db push`).

create extension if not exists "pgcrypto";

-- ── pantry_items ─────────────────────────────────────────────────────────────
create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  normalized_name text not null,
  quantity numeric,
  unit text,
  category text,
  expiration_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_name)
);

-- ── scans ────────────────────────────────────────────────────────────────────
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  image_url text,
  detected_data jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- ── recipes ──────────────────────────────────────────────────────────────────
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  recipe_data jsonb not null,
  created_at timestamptz not null default now()
);

-- ── grocery_lists ────────────────────────────────────────────────────────────
create table if not exists public.grocery_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'My grocery list',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── grocery_items ────────────────────────────────────────────────────────────
create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  grocery_list_id uuid not null references public.grocery_lists (id) on delete cascade,
  name text not null,
  normalized_name text not null,
  quantity numeric,
  unit text,
  completed boolean not null default false,
  source_recipe_title text,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists pantry_items_user_idx on public.pantry_items (user_id);
create index if not exists pantry_items_user_norm_idx on public.pantry_items (user_id, normalized_name);
create index if not exists scans_user_idx on public.scans (user_id);
create index if not exists recipes_user_idx on public.recipes (user_id);
create index if not exists grocery_lists_user_idx on public.grocery_lists (user_id);
create index if not exists grocery_items_list_idx on public.grocery_items (grocery_list_id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pantry_items_touch on public.pantry_items;
create trigger pantry_items_touch before update on public.pantry_items
  for each row execute function public.set_updated_at();

drop trigger if exists grocery_lists_touch on public.grocery_lists;
create trigger grocery_lists_touch before update on public.grocery_lists
  for each row execute function public.set_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.pantry_items enable row level security;
alter table public.scans enable row level security;
alter table public.recipes enable row level security;
alter table public.grocery_lists enable row level security;
alter table public.grocery_items enable row level security;

-- User-scoped policies: a user can only touch their own rows.
create policy "pantry_items_own" on public.pantry_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "scans_own" on public.scans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "recipes_own" on public.recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "grocery_lists_own" on public.grocery_lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- grocery_items are scoped through their parent list's owner.
create policy "grocery_items_select" on public.grocery_items
  for select using (
    exists (select 1 from public.grocery_lists l where l.id = grocery_list_id and l.user_id = auth.uid())
  );
create policy "grocery_items_insert" on public.grocery_items
  for insert with check (
    exists (select 1 from public.grocery_lists l where l.id = grocery_list_id and l.user_id = auth.uid())
  );
create policy "grocery_items_update" on public.grocery_items
  for update using (
    exists (select 1 from public.grocery_lists l where l.id = grocery_list_id and l.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.grocery_lists l where l.id = grocery_list_id and l.user_id = auth.uid())
  );
create policy "grocery_items_delete" on public.grocery_items
  for delete using (
    exists (select 1 from public.grocery_lists l where l.id = grocery_list_id and l.user_id = auth.uid())
  );
