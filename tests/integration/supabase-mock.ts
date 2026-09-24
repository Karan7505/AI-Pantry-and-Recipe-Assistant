/**
 * In-memory stand-in for the Supabase PostgREST builder, shaped exactly around
 * the query chains `lib/db.ts` actually issues (integration tests).
 *
 * Fidelity notes:
 * - Builders are thenable (PostgREST builders are awaited directly).
 * - `.single()` with 0 rows returns an error (PGRST116) like the real API.
 * - upsert honors the migration 0002/0003 conflict keys:
 *     pantry_items:   (user_id, normalized_name)
 *     grocery_items:  (grocery_list_id, normalized_name, unit_key)
 *   where unit_key mirrors the generated column COALESCE(unit, '').
 */
import { randomUUID } from "node:crypto";

export type Row = Record<string, unknown>;
export interface PostgrestError {
  message: string;
  code?: string;
}
export interface QueryResult {
  data: Row | Row[] | null;
  error: PostgrestError | null;
}

function applyDefaults(table: string, row: Row, now: string): void {
  if (row.id == null) row.id = randomUUID();
  if (row.created_at == null) row.created_at = now;
  if (table === "pantry_items" || table === "grocery_lists") {
    if (row.updated_at == null) row.updated_at = now;
  }
  // Mirror the STORED generated column from migration 0003.
  if (table === "grocery_items") row.unit_key = row.unit ?? "";
}

export class MockSupabase {
  tables: Record<string, Row[]> = {
    pantry_items: [],
    scans: [],
    recipes: [],
    grocery_lists: [],
    grocery_items: [],
  };
  uid: string | null;
  /** When set, every query returns this error (regression: no driver text may leak). */
  failWith: PostgrestError | null = null;

  constructor(uid: string | null) {
    this.uid = uid;
  }

  auth = {
    getUser: async () => ({
      data: { user: this.uid ? { id: this.uid } : null },
      error: null,
    }),
  };

  from(table: string): QueryBuilder {
    return new QueryBuilder(this, table);
  }
}

class QueryBuilder {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private conflictCols: string[] | null = null;
  private filters: [string, unknown][] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private limitN: number | null = null;
  private terminal: "list" | "single" | "maybeSingle" = "list";
  private returnRows = false;

  constructor(private db: MockSupabase, private table: string) {}

  select(_columns: string): this {
    if (this.op !== "select") this.returnRows = true; // e.g. .insert(...).select("id")
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ col: column, asc: opts?.ascending ?? true });
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  insert(row: Row | Row[]): this {
    this.op = "insert";
    this.payload = row;
    return this;
  }
  upsert(rows: Row[], opts: { onConflict: string }): this {
    this.op = "upsert";
    this.payload = rows;
    this.conflictCols = opts.onConflict.split(",").map((c) => c.trim());
    return this;
  }
  update(patch: Row): this {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  single(): this {
    this.terminal = "single";
    return this;
  }
  maybeSingle(): this {
    this.terminal = "maybeSingle";
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute(): QueryResult {
    if (this.db.failWith) return { data: null, error: this.db.failWith };
    let rows = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);
    const now = new Date().toISOString();
    const matches = (r: Row) => this.filters.every(([col, val]) => r[col] === val);

    if (this.op === "select") {
      let out = rows.filter(matches);
      // Stable sorts applied last-order-first → first-specified order is primary.
      for (const { col, asc } of [...this.orders].reverse()) {
        out = [...out].sort((a, b) => {
          const av = (a[col] ?? "") as string;
          const bv = (b[col] ?? "") as string;
          return av < bv ? (asc ? -1 : 1) : av > bv ? (asc ? 1 : -1) : 0;
        });
      }
      if (this.limitN != null) out = out.slice(0, this.limitN);
      if (this.terminal === "single") {
        if (out.length === 1) return { data: out[0], error: null };
        return { data: null, error: { message: "expected 1 row, found another number of rows", code: "PGRST116" } };
      }
      if (this.terminal === "maybeSingle") {
        if (out.length <= 1) return { data: out[0] ?? null, error: null };
        return { data: null, error: { message: "expected at most 1 row, found more", code: "PGRST116" } };
      }
      return { data: out, error: null };
    }

    if (this.op === "insert") {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      for (const r of incoming) {
        applyDefaults(this.table, r, now);
        rows.push(r);
      }
      if (!this.returnRows) return { data: null, error: null };
      if (this.terminal === "single") {
        if (incoming.length === 1) return { data: incoming[0], error: null };
        return { data: null, error: { message: "expected 1 row, found another number of rows", code: "PGRST116" } };
      }
      if (this.terminal === "maybeSingle") return { data: incoming[0] ?? null, error: null };
      return { data: incoming, error: null };
    }

    if (this.op === "upsert") {
      const keyCols = this.conflictCols ?? ["id"];
      const keyVal = (r: Row, col: string) =>
        col === "unit_key" && r.unit_key === undefined ? (r.unit ?? "") : r[col];
      for (const r of this.payload as Row[]) {
        applyDefaults(this.table, r, now);
        const existing = rows.find((x) => keyCols.every((c) => x[c] === keyVal(r, c)));
        if (existing) Object.assign(existing, r, { id: existing.id, created_at: existing.created_at });
        else rows.push(r);
      }
      return { data: this.returnRows ? (this.payload as Row[]) : null, error: null };
    }

    if (this.op === "update") {
      const patch = this.payload as Row;
      for (const r of rows) {
        if (matches(r)) {
          Object.assign(r, patch);
          if (r.updated_at !== undefined) r.updated_at = now;
        }
      }
      return { data: null, error: null };
    }

    // delete
    const keep = rows.filter((r) => !matches(r));
    this.db.tables[this.table] = keep;
    return { data: null, error: null };
  }
}
