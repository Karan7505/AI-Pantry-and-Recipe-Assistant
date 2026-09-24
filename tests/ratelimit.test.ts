import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, RULES } from "../lib/ratelimit";

// The limiter is per-process; use unique uids per test to isolate state.
let uidSeq = 0;
const uid = () => `user-${++uidSeq}`;

describe("rateLimit", () => {
  it("allows calls up to the limit within the window", () => {
    const u = uid();
    const t0 = 1_000_000;
    for (let i = 0; i < RULES.nutrition.limit; i++) {
      expect(rateLimit(u, "nutrition", t0 + i)).toBe(true);
    }
    expect(rateLimit(u, "nutrition", t0 + 50)).toBe(false);
  });

  it("resets after the window expires", () => {
    const u = uid();
    const t0 = 2_000_000;
    for (let i = 0; i < RULES.scan.limit; i++) rateLimit(u, "scan", t0);
    expect(rateLimit(u, "scan", t0 + 10)).toBe(false);
    expect(rateLimit(u, "scan", t0 + RULES.scan.windowMs + 1)).toBe(true);
  });

  it("keeps limits independent per user and per route", () => {
    const a = uid();
    const b = uid();
    const t0 = 3_000_000;
    for (let i = 0; i < RULES.scan.limit; i++) rateLimit(a, "scan", t0);
    expect(rateLimit(a, "scan", t0)).toBe(false);
    expect(rateLimit(b, "scan", t0)).toBe(true); // other user unaffected
    expect(rateLimit(a, "recipes", t0)).toBe(true); // other route unaffected
  });

  it("allows unknown routes (not limited)", () => {
    expect(rateLimit(uid(), "not-a-route")).toBe(true);
  });
});
