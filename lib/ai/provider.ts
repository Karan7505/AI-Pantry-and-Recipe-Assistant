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

export interface StructuredRequest {
  system: string;
  user: string;
  /** base64 data URLs (data:image/png;base64,…) */
  images?: string[];
  /** use the vision model (only when images are present) */
  vision?: boolean;
}

export async function callStructured<T>(req: StructuredRequest): Promise<T> {
  const cfg = getProviderConfig();
  const raw = cfg.provider === "openai" ? await callOpenAI(cfg, req) : await callGemini(cfg, req);
  const parsed = extractJson(raw);
  if (parsed === null) {
    throw new AiError(
      "Model returned content that is not valid JSON.",
      "invalid_response",
      truncate(raw, 300),
    );
  }
  return parsed as T;
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

async function callOpenAI(cfg: ProviderConfig, req: StructuredRequest): Promise<string> {
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
  }).then((json) => {
    const msg = json?.choices?.[0]?.message?.content;
    if (typeof msg !== "string") {
      throw new AiError("Unexpected OpenAI response shape.", "invalid_response");
    }
    return msg;
  });
}

// ── Gemini ────────────────────────────────────────────────────────────────────

async function callGemini(cfg: ProviderConfig, req: StructuredRequest): Promise<string> {
  const model = req.vision ? cfg.visionModel : cfg.textModel;
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
    `:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;

  const parts: unknown[] = [{ text: req.user }];
  for (const img of req.images ?? []) {
    // data:image/png;base64,XXXX → mimeType + base64
    const [meta, b64] = img.split(",");
    const mime = (meta.match(/data:(.*?);/) || [])[1] || "image/png";
    parts.push({ inline_data: { mime_type: mime, data: b64 } });
  }

  return await fetchJson<GeminiResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.4,
      },
    }),
    mapHttpError: mapGeminiError,
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
}

async function fetchJson<T>(url: string, opts: FetchOpts): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { method: opts.method, headers: opts.headers, body: opts.body, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new AiError("The AI request timed out.", "timeout");
    }
    throw new AiError("Could not reach the AI provider.", "network", (err as Error).message);
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

function mapOpenAiError(status: number, text: string): AiError {
  const code = statusToCode(status);
  let detail = "";
  try {
    detail = (JSON.parse(text)?.error?.message as string) ?? "";
  } catch {
    /* ignore */
  }
  return new AiError(detail || `OpenAI returned ${status}.`, code, truncate(detail, 300));
}

function mapGeminiError(status: number, text: string): AiError {
  const code = statusToCode(status);
  let detail = "";
  try {
    detail = (JSON.parse(text)?.error?.message as string) ?? "";
  } catch {
    /* ignore */
  }
  return new AiError(detail || `Gemini returned ${status}.`, code, truncate(detail, 300));
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
