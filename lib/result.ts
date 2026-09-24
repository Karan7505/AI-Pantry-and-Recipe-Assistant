import { logError } from "./logger";

/**
 * Result returned by every data server action (blueprint P1).
 * Actions never throw across the wire: the UI decides how to display
 * `error`, and unknown failures are genericized so nothing internal leaks.
 *
 * The success member carries the action's return value (e.g. the id of a
 * saved recipe): `res.value` is only reachable when `res.ok === true`.
 */
export type ActionResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const GENERIC = "Something went wrong. Please try again.";

// Error messages the app itself throws — safe to show verbatim.
const KNOWN_SAFE = new Set([
  "Invalid request.",
  "Too many requests. Please slow down.",
  "A database operation failed. Please try again.",
  "You need to be signed in to do that.",
]);

export function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  return Promise.resolve()
    .then(fn)
    .then(
      (value) => ({ ok: true, value } as const),
      (e: unknown) => {
        const message = e instanceof Error ? e.message : GENERIC;
        logError("action", "server action failed", {
          error: `${e instanceof Error ? e.name : "Error"}: ${message}`,
        });
        return { ok: false, error: KNOWN_SAFE.has(message) ? message : GENERIC };
      },
    );
}
