import { AiError } from "./ai/errors";

export type Provider = "openai" | "gemini";

export interface ProviderConfig {
  provider: Provider;
  visionModel: string;
  textModel: string;
  /** The key, server-side only. Never return this to the client. */
  apiKey: string;
}

const DEFAULTS = {
  openai: { vision: "gpt-4o", text: "gpt-4o" },
  gemini: { vision: "gemini-1.5-flash", text: "gemini-1.5-flash" },
} as const;

/**
 * Resolve which vision/text provider to use. Order of precedence:
 *   1. explicit `force` argument
 *   2. VISION_PROVIDER env
 *   3. first available API key (OpenAI preferred)
 *
 * Server-side only. Throws AiError("config") when nothing usable is present.
 */
export function getProviderConfig(force?: Provider): ProviderConfig {
  const env = process.env;
  const openaiKey = (env.OPENAI_API_KEY || "").trim();
  const geminiKey = (env.GOOGLE_GENERATIVE_AI_API_KEY || "").trim();

  const wanted =
    force ??
    ((env.VISION_PROVIDER || "").trim().toLowerCase() as Provider | "");

  let provider: Provider | null = null;
  if (wanted === "openai" || wanted === "gemini") provider = wanted;
  else if (openaiKey) provider = "openai";
  else if (geminiKey) provider = "gemini";

  if (!provider) {
    throw new AiError(
      "No AI provider configured. Set OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY in .env.",
      "config",
    );
  }

  if (provider === "openai") {
    if (!openaiKey) {
      throw new AiError("OpenAI selected but OPENAI_API_KEY is empty.", "config");
    }
    return {
      provider,
      visionModel: (env.OPENAI_VISION_MODEL || "").trim() || DEFAULTS.openai.vision,
      textModel: (env.OPENAI_TEXT_MODEL || "").trim() || DEFAULTS.openai.text,
      apiKey: openaiKey,
    };
  }

  if (!geminiKey) {
    throw new AiError("Gemini selected but GOOGLE_GENERATIVE_AI_API_KEY is empty.", "config");
  }
  return {
    provider,
    visionModel: (env.GEMINI_VISION_MODEL || "").trim() || DEFAULTS.gemini.vision,
    textModel: (env.GEMINI_TEXT_MODEL || "").trim() || DEFAULTS.gemini.text,
    apiKey: geminiKey,
  };
}

/** True if at least one provider key is present (used to gate UI hints). */
export function hasAnyProvider(): boolean {
  return Boolean(
    (process.env.OPENAI_API_KEY || "").trim() ||
      (process.env.GOOGLE_GENERATIVE_AI_API_KEY || "").trim(),
  );
}
