-- Fix audit M-4: the original grocery_items UPDATE policy only constrained the
-- OLD row (`using`), so a user could re-parent their own grocery item into
-- another user's list by changing `grocery_list_id`.
-- This adds a `with check` clause so the NEW row's list must also be owned.
--
-- Apply in Supabase → SQL Editor (or `supabase db push`).

drop policy if exists "grocery_items_update" on public.grocery_items;

create policy "grocery_items_update"
  on public.grocery_items
  for update
  to authenticated
  using (
    exists (
      select 1 from public.grocery_lists l
      where l.id = grocery_items.grocery_list_id
        and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.grocery_lists l
      where l.id = grocery_items.grocery_list_id
        and l.user_id = auth.uid()
    )
  );
