# Row Level Security

## Model

Every table is protected by RLS (`alter table … enable row level security`). Ownership is derived from the authenticated user (`auth.uid()`); grocery items are scoped **through their parent list** because `grocery_items` has no direct `user_id` column.

| Table | Policy shape |
|---|---|
| `pantry_items` | `for all using (auth.uid() = user_id) with check (auth.uid() = user_id)` |
| `scans` | `for all using (auth.uid() = user_id) with check (auth.uid() = user_id)` |
| `recipes` | `for all using (auth.uid() = user_id) with check (auth.uid() = user_id)` |
| `grocery_lists` | `for all using (auth.uid() = user_id) with check (auth.uid() = user_id)` |
| `grocery_items` | select/insert/update/delete via `exists (select 1 from grocery_lists l where l.id = grocery_list_id and l.user_id = auth.uid())`; UPDATE additionally has `with check (… same exists …)` (migration 0002) so an item can never be re-parented into another user's list |

## Defense in depth (beyond RLS)

The app does **not** rely on RLS alone:

1. Every server action derives `uid` from the session (`requireUid()`) — the client never supplies an id.
2. Every query in `lib/db.ts` adds `.eq("user_id", uid)` (or resolves the list via `getDefaultGroceryList(uid)`) before touching a table.
3. Grocery item ids are UUID-format-checked and always combined with the caller's own list id.
4. No service-role key exists in the app — nothing can bypass RLS even if the server process is compromised.

## Two-account verification matrix (manual)

Requires: two Supabase users (User A, User B) on the live project. Run this once after every schema/policy change and before launch.

| # | As User B, attempt… | Expected |
|---|---|---|
| 1 | `select * from pantry_items where user_id = <A's id>` (via SQL as B's anon session, or the API with B's cookie) | 0 rows |
| 2 | `update pantry_items set name='x' where id = <A's row>` | 0 rows updated |
| 3 | `delete from pantry_items where id = <A's row>` | 0 rows deleted |
| 4 | `insert into pantry_items (user_id, name, normalized_name) values (<A's id>, 'sneaky', 'sneaky')` | 0 rows (with check fails) |
| 5 | Read a recipe id belonging to A via the app (`/recipes/<A-recipe-id>` with B logged in) | 404 |
| 6 | Toggle one of A's grocery items via the app with B's session | no-op (item not in B's list) + 0 rows changed |
| 7 | `update grocery_items set grocery_list_id = <A's list> where id = <B's item>` (raw SQL as B) | 0 rows (0002 `with check`) |
| 8 | Insert a grocery item with `grocery_list_id = <A's list>` (raw SQL as B) | 0 rows (insert `with check`) |

Fastest way to exercise 1–4 and 7–8: Supabase SQL Editor with **two browser profiles** signed into A and B is not possible (SQL Editor uses the service role). Instead, from the app as B, use DevTools → Network to copy the `sb-…-auth-token` cookie and call PostgREST directly:

```bash
curl -s "https://<project-ref>.supabase.co/rest/v1/pantry_items?user_id=<A-uuid>" \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <B-access-token>"
# expected: [] for A's rows when B queries without the user_id filter being B's own
```

Or simply trust the policy SQL + rely on the query-level scoping (layers 1–3 above) which is unit-covered by the action/db review. **At minimum, perform #5 and #6 in the UI before launch.**

## When RLS fails (what to do)

- If a policy was never applied (fresh project, migrations skipped): the app still mostly works *for reads* only because queries are uid-scoped — but a crafted PostgREST call could read others' data. **Running 0001 is a launch blocker.**
- If `0002` was not run on an old project: `with check` gap on grocery UPDATE (see #7/#8).
