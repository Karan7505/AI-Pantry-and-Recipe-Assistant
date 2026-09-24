import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../lib/config", () => ({
  getProviderConfig: () => ({
    provider: "openai" as const,
    apiKey: "sk-test",
    visionModel: "gpt-4o",
    textModel: "gpt-4o",
  }),
}));

import { callStructured } from "../lib/ai/provider";
import { isAiError } from "../lib/ai/errors";

function okResponse(content: string) {
  return Promise.resolve(
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function statusResponse(status: number) {
  return Promise.resolve(new Response(JSON.stringify({ error: { message: `err ${status}` } }), { status }));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("callStructured retry policy", () => {
  it("retries once on 429 then succeeds (1s backoff)", async () => {
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(statusResponse(429))
      .mockReturnValueOnce(okResponse('{"ingredients": []}'));
    vi.stubGlobal("fetch", fetchMock);

    const p = callStructured<{ ingredients: unknown[] }>({ system: "s", user: "u" });
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await p;

    expect(result.ingredients).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries twice on 5xx (1s + 2s) then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(statusResponse(503))
      .mockReturnValueOnce(statusResponse(500))
      .mockReturnValueOnce(okResponse('{"ok": true}'));
    vi.stubGlobal("fetch", fetchMock);

    const p = callStructured<{ ok: boolean }>({ system: "s", user: "u" });
    await vi.advanceTimersByTimeAsync(3_000);
    const result = await p;

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up after max attempts and throws the last error", async () => {
    // fresh Response per call — a Response body can only be consumed once
    const fetchMock = vi.fn().mockImplementation(() => statusResponse(503));
    vi.stubGlobal("fetch", fetchMock);

    const p = callStructured({ system: "s", user: "u" });
    const assertion = expect(p).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === "model_error");
    await vi.advanceTimersByTimeAsync(3_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("does NOT retry auth errors (401)", async () => {
    const fetchMock = vi.fn().mockReturnValue(statusResponse(401));
    vi.stubGlobal("fetch", fetchMock);

    const p = callStructured({ system: "s", user: "u" });
    const assertion = expect(p).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === "auth");
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry 4xx model errors (400)", async () => {
    const fetchMock = vi.fn().mockReturnValue(statusResponse(400));
    vi.stubGlobal("fetch", fetchMock);

    const p = callStructured({ system: "s", user: "u" });
    const assertion = expect(p).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === "model_error");
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry invalid JSON (200 with garbage) — avoids double-billing", async () => {
    const fetchMock = vi.fn().mockReturnValue(
      Promise.resolve(new Response("no json here", { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    const p = callStructured({ system: "s", user: "u" });
    const assertion = expect(p).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === "invalid_response");
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries network failures then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockReturnValueOnce(okResponse('{"a": 1}'));
    vi.stubGlobal("fetch", fetchMock);

    const p = callStructured<{ a: number }>({ system: "s", user: "u" });
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await p;

    expect(result.a).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry after a timeout (budget already spent)", async () => {
    // Fetch that only rejects when its AbortController fires (60s per attempt).
    const fetchMock = vi.fn((_: string, opts: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const p = callStructured({ system: "s", user: "u" });
    const assertion = expect(p).rejects.toSatisfy((e: unknown) => isAiError(e) && e.code === "timeout");
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
