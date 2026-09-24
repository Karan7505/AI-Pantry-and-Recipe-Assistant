import { describe, it, expect } from "vitest";
import { sanitizeNextPath } from "../lib/utils";
import { scanInputSchema, recipeFiltersSchema } from "../lib/ai/schemas";

describe("sanitizeNextPath (audit M-1)", () => {
  it("accepts normal same-origin paths", () => {
    expect(sanitizeNextPath("/dashboard")).toBe("/dashboard");
    expect(sanitizeNextPath("/recipes/abc-123")).toBe("/recipes/abc-123");
    expect(sanitizeNextPath(null)).toBe("/dashboard");
    expect(sanitizeNextPath("")).toBe("/dashboard");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(sanitizeNextPath("https://evil.com")).toBe("/dashboard");
    expect(sanitizeNextPath("http://evil.com/path")).toBe("/dashboard");
    expect(sanitizeNextPath("//evil.com")).toBe("/dashboard");
    expect(sanitizeNextPath("javascript:alert(1)")).toBe("/dashboard");
  });

  it("rejects tricky encodings and control characters", () => {
    expect(sanitizeNextPath("/%2F%2Fevil.com")).toBe("/dashboard"); // starts with / but contains // after decode? keep strict: raw check
    expect(sanitizeNextPath("/a b")).toBe("/dashboard");
    expect(sanitizeNextPath("/a\\b")).toBe("/dashboard");
  });
});

const b64 = "A".repeat(100);

describe("scanInputSchema hardening (audit H-1)", () => {
  it("accepts valid jpeg/png/webp data URLs", () => {
    for (const mime of ["jpeg", "png", "webp"]) {
      expect(scanInputSchema.safeParse({ images: [`data:image/${mime};base64,${b64}`] }).success).toBe(true);
    }
  });

  it("rejects non-image MIME types (e.g. data:text/html)", () => {
    expect(scanInputSchema.safeParse({ images: [`data:text/html;base64,${b64}`] }).success).toBe(false);
    expect(scanInputSchema.safeParse({ images: [`data:application/pdf;base64,${b64}`] }).success).toBe(false);
  });

  it("rejects URLs and malformed data URLs", () => {
    expect(scanInputSchema.safeParse({ images: ["https://x.com/a.png"] }).success).toBe(false);
    expect(scanInputSchema.safeParse({ images: ["data:image/png;"] }).success).toBe(false);
  });

  it("enforces the per-image size cap", () => {
    const huge = "A".repeat(4_500_001);
    expect(scanInputSchema.safeParse({ images: [`data:image/png;base64,${huge}`] }).success).toBe(false);
  });
});

describe("recipeFiltersSchema caps (audit M-3)", () => {
  it("caps excluded array length and item length", () => {
    expect(recipeFiltersSchema.safeParse({ excluded: new Array(31).fill("x") }).success).toBe(false);
    expect(recipeFiltersSchema.safeParse({ excluded: ["x".repeat(61)] }).success).toBe(false);
    expect(recipeFiltersSchema.safeParse({ excluded: ["garlic", "milk"] }).success).toBe(true);
  });
});
