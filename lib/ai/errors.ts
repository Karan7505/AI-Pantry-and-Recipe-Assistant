export type AiErrorCode =
  | "config"
  | "auth"
  | "rate_limit"
  | "timeout"
  | "model_error"
  | "network"
  | "invalid_response"
  | "empty";

/**
 * Typed, user-safe error for all AI operations. The `message` is safe to show
 * in the UI (no raw stack traces / vendor error bodies).
 */
export class AiError extends Error {
  code: AiErrorCode;
  /** Internal: safe to retry (429 / 5xx / network). Never surfaced to the UI. */
  constructor(
    message: string,
    code: AiErrorCode,
    readonly details?: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AiError";
    this.code = code;
  }

  /** Human-friendly message suitable for a UI toast / inline error. */
  get userMessage(): string {
    switch (this.code) {
      case "config":
        return "AI service is not configured. Please check the provider API key in .env.";
      case "auth":
        return "AI provider rejected the API key. Check the key in .env.";
      case "rate_limit":
        return "You've hit the AI provider's rate limit. Please wait a moment and try again.";
      case "timeout":
        return "The AI request timed out. Please try again.";
      case "network":
        return "Could not reach the AI provider. Check your connection and try again.";
      case "model_error":
        return "The AI provider returned an error. Please try again.";
      case "invalid_response":
        return "The AI returned data we couldn't understand. Please try again.";
      case "empty":
        return "No ingredients could be detected in the image(s).";
      default:
        return "Something went wrong while talking to the AI. Please try again.";
    }
  }
}

export function isAiError(err: unknown): err is AiError {
  return err instanceof AiError;
}
