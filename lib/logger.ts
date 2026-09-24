/**
 * Minimal structured logger — JSON lines to stdout.
 *
 * This is the single observability seam: if a real stack (Sentry, APM,
 * log shipping) is added later, only this file changes.
 *
 * NEVER log: API keys, passwords, email addresses, image payloads, or raw
 * model output (error DETAILS are logged elsewhere with truncation for a
 * reason — keep it that way).
 */
type LogFields = Record<string, string | number | boolean | null | undefined>;

function emit(level: "info" | "error", tag: string, msg: string, fields?: LogFields) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, tag, msg, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}

export function logError(tag: string, msg: string, fields?: LogFields) {
  emit("error", tag, msg, fields);
}

export function logInfo(tag: string, msg: string, fields?: LogFields) {
  emit("info", tag, msg, fields);
}
