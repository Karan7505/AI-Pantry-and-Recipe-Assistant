import { AiError } from "./errors";
import { getProviderConfig, type ProviderConfig } from "../config";

/**
 * Provider-agnostic structured-output client.
 *
 * Sends a system + user prompt (optionally with images) and returns the parsed
 * JSON object. Handles timeouts, rate limits, auth errors, network failures,
 * and tolerant extraction of JSON from loosely-formatted model text.
 */

const REQUEST_TIMEOUT_MS = 60_000;
// Retry policy (blueprint P1): up to 2 retries with 1s/2s backoff, only for
// transient failures (429 / 5xx / network), and only while enough of the 60s
// total budget remains for the next attempt. Timeouts, auth, config,
// invalid_response and empty results are NEVER retried (no double-billing,
// no pointless retries).
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1_000, 2_000];
const MIN_ATTEMPT_BUDGET_MS = 15_000;

export interface StructuredRequest {
  system: string;
  user: string;
  /** base64 data URLs (data:image/png;base64,…) */
  images?: string[];
  /** use the vision model (only when images are present) */
  vision?: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callStructured<T>(req: StructuredRequest): Promise<T> {
  const cfg = getProviderConfig();
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const remaining = Math.max(1_000, deadline - Date.now());
    try {
      const raw =
        cfg.provider === "openai"
          ? await callOpenAI(cfg, req, remaining)
          : await callGemini(cfg, req, remaining);
      const parsed = extractJson(raw);
      if (parsed === null) {
        throw new AiError(
          "Model returned content that is not valid JSON.",
          "invalid_response",
          truncate(raw, 300),
        );
      }
      return parsed as T;
    } catch (err) {
      lastError = err;
      if (attempt === MAX_ATTEMPTS - 1) break;
      const backoff = BACKOFF_MS[attempt];
      // Give up if the error is not transient or the budget can't cover
      // backoff + a minimal next attempt.
      if (!isRetryable(err) || deadline - Date.now() < MIN_ATTEMPT_BUDGET_MS + backoff) break;
      await delay(backoff);
    }
  }
  throw lastError instanceof AiError
    ? lastError
    : new AiError("The AI provider returned an error. Please try again.", "model_error");
}

function isRetryable(err: unknown): boolean {
  return err instanceof AiError && err.retryable === true;
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

async function callOpenAI(cfg: ProviderConfig, req: StructuredRequest, timeoutMs: number): Promise<string> {
  const model = req.vision ? cfg.visionModel : cfg.textModel;
  const content: unknown[] = [{ type: "text", text: req.user }];
  for (const img of req.images ?? []) {
    content.push({ type: "image_url", image_url: { url: img } });
  }

  return await fetchJson<OpenAiResponse>("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      // Enforce JSON output (models that ignore this still get client-side parsing).
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: req.system },
        { role: "user", content },
      ],
    }),
    mapHttpError: mapOpenAiError,
    timeoutMs,
  }).then((json) => {
    const msg = json?.choices?.[0]?.message?.content;
    if (typeof msg !== "string") {
      throw new AiError("Unexpected OpenAI response shape.", "invalid_response");
    }
    return msg;
  });
}

// ── Gemini ────────────────────────────────────────────────────────────────────

async function callGemini(cfg: ProviderConfig, req: StructuredRequest, timeoutMs: number): Promise<string> {
  const model = req.vision ? cfg.visionModel : cfg.textModel;
  // Key goes in a header, never the URL (audit M-5): URLs are far more likely
  // to be persisted in proxy/access/retry logs than headers.
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
    `:generateContent`;

  const parts: unknown[] = [{ text: req.user }];
  for (const img of req.images ?? []) {
    // data:image/png;base64,XXXX → mimeType + base64
    const [meta, b64] = img.split(",");
    const mime = (meta.match(/data:(.*?);/) || [])[1] || "image/png";
    parts.push({ inline_data: { mime_type: mime, data: b64 } });
  }

  return await fetchJson<GeminiResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.4,
      },
    }),
    mapHttpError: mapGeminiError,
    timeoutMs,
  }).then((json) => {
    const text: string | undefined = json?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("");
    if (!text) {
      throw new AiError("Empty Gemini response.", "invalid_response");
    }
    return text;
  });
}

// ── Shared fetch with timeout + status mapping ───────────────────────────────

interface FetchOpts {
  method: string;
  headers: Record<string, string>;
  body: string;
  mapHttpError: (status: number, text: string) => AiError;
  timeoutMs: number;
}

async function fetchJson<T>(url: string, opts: FetchOpts): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { method: opts.method, headers: opts.headers, body: opts.body, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      // Not retryable: the attempt already consumed its time budget.
      throw new AiError("The AI request timed out.", "timeout");
    }
    throw new AiError("Could not reach the AI provider.", "network", (err as Error).message, true);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) throw opts.mapHttpError(res.status, text);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiError("AI provider did not return valid JSON.", "invalid_response", truncate(text, 300));
  }
}

// Minimal response shapes (only the fields we read — never trust more).
interface OpenAiResponse {
  choices?: { message?: { content?: unknown } }[];
}
interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

function statusToCode(status: number): "rate_limit" | "auth" | "model_error" {
  if (status === 429) return "rate_limit";
  if (status === 401 || status === 403) return "auth";
  return "model_error";
}

// 429 and 5xx are transient (retryable); 4xx like 400/404 would just burn
// budget and money if retried.
function isTransientStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function mapOpenAiError(status: number, text: string): AiError {
  const code = statusToCode(status);
  let detail = "";
  try {
    detail = (JSON.parse(text)?.error?.message as string) ?? "";
  } catch {
    /* ignore */
  }
  return new AiError(detail || `OpenAI returned ${status}.`, code, truncate(detail, 300), isTransientStatus(status));
}

function mapGeminiError(status: number, text: string): AiError {
  const code = statusToCode(status);
  let detail = "";
  try {
    detail = (JSON.parse(text)?.error?.message as string) ?? "";
  } catch {
    /* ignore */
  }
  return new AiError(detail || `Gemini returned ${status}.`, code, truncate(detail, 300), isTransientStatus(status));
}

/**
 * Tolerant JSON extraction: try strict parse first, then strip markdown fences
 * and isolate the first balanced {…} block (handles "Here is the JSON: {…}").
 */
export function extractJson(raw: string): unknown {
  const cleaned = raw.trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through */
  }
  const unFenced = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  if (unFenced !== cleaned) {
    try {
      return JSON.parse(unFenced);
    } catch {
      /* fall through */
    }
  }
  const start = unFenced.indexOf("{");
  const end = unFenced.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(unFenced.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
