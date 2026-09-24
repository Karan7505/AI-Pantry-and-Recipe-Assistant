#!/usr/bin/env node
/**
 * Production smoke test (blueprint P2) — run against a DEPLOYED instance.
 *
 *   node scripts/smoke-test.mjs                              # unauthenticated checks only
 *   SMOKE_COOKIE="sb-access-token=…" node scripts/smoke-test.mjs   # + authenticated checks
 *
 * Env:
 *   SMOKE_BASE_URL  base URL to probe (default: http://localhost:3000)
 *   SMOKE_COOKIE    raw Cookie header value of a signed-in user
 *
 * NOTE: the authenticated checks consume ~12 of the account's 10/hour scan
 * rate-limit slots (the 429 is the point). Run them at most once per hour,
 * with an account that has a fresh rate-limit window.
 *
 * Exit code: 0 = all hard checks passed, 1 = at least one failed.
 */
const BASE = (process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const COOKIE = process.env.SMOKE_COOKIE || "";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
}
function warn(name, detail) {
  console.log(`INFO  ${name}  — ${detail}`);
}

async function req(path, { method = "GET", body, auth = false } = {}) {
  const headers = {};
  if (auth) headers["Cookie"] = COOKIE;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(BASE + path, { method, headers, body, redirect: "manual" });
}

console.log(`Smoke-testing ${BASE}\n`);

// ── Unauthenticated checks ────────────────────────────────────────────────────
{
  const res = await req("/");
  const html = await res.text();
  check("landing page serves (200 + content)", res.status === 200 && html.includes("AI Pantry"), `status ${res.status}`);

  check("content-security-policy header present", /frame-ancestors 'none'/.test(res.headers.get("content-security-policy") || ""));
  check("x-frame-options is DENY", (res.headers.get("x-frame-options") || "").toUpperCase() === "DENY");
  check("x-content-type-options is nosniff", (res.headers.get("x-content-type-options") || "") === "nosniff");
  check("referrer-policy header present", Boolean(res.headers.get("referrer-policy")));
  check("permissions-policy header present", Boolean(res.headers.get("permissions-policy")));

  const login = await req("/login");
  await login.text();
  check("login page serves (200)", login.status === 200, `status ${login.status}`);

  const dash = await req("/dashboard");
  await dash.text();
  const loc = dash.headers.get("location") || "";
  check(
    "unauthenticated /dashboard redirects to /login",
    dash.status >= 300 && dash.status < 400 && loc.includes("/login"),
    `status ${dash.status} → ${loc}`,
  );

  const scan = await req("/api/pantry/scan", { method: "POST", body: JSON.stringify({ images: ["x"] }) });
  await scan.text();
  check("unauthenticated scan rejected with 401", scan.status === 401, `status ${scan.status}`);
}

// ── Authenticated checks (optional) ───────────────────────────────────────────
if (!COOKIE) {
  console.log("\nSMOKE_COOKIE not set — skipping authenticated checks (run again with SMOKE_COOKIE to cover 413/429).");
} else {
  const dash = await req("/dashboard", { auth: true });
  await dash.text();
  check("authenticated /dashboard serves (200)", dash.status === 200, `status ${dash.status}`);

  // Oversized body: server cap is 28M chars (app) / platform limit (edge).
  const big = JSON.stringify({ images: ["data:image/png;base64," + "A".repeat(28_100_000)] });
  const over = await req("/api/pantry/scan", { method: "POST", body: big, auth: true });
  await over.text();
  check("oversized scan body rejected with 413", over.status === 413, `status ${over.status}`);

  // Rate limit: 11 invalid-image POSTs (rejected with 400, no AI calls).
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    const r = await req("/api/pantry/scan", { method: "POST", body: JSON.stringify({ images: ["not-an-image"] }), auth: true });
    statuses.push(r.status);
    await r.text();
  }
  check("scan rate limit triggers 429", statuses.includes(429), `statuses: ${statuses.join(",")}`);
  if (!statuses.includes(400)) warn("no 400 seen", "the scan rate-limit window was already partially used before this run");
}

console.log(failures === 0 ? "\nSMOKE: ALL CHECKS PASSED" : `\nSMOKE: ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
