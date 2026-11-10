import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GROQ_MAX_IMAGES,
  DEFAULT_GROQ_MODEL,
  createGroqVision,
} from "@/lib/sources/live/groq";

const ok = (content: string | null) =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ choices: [{ message: { content } }] }),
  }) as Response;
const status = (code: number, headers: Record<string, string> = {}) =>
  ({ ok: false, status: code, headers: new Headers(headers), json: async () => ({}) }) as Response;
const input = {
  system: "sys",
  user: "usr",
  images: ["https://x/1.png", "https://x/2.png", "https://x/3.png", "https://x/4.png"],
};

describe("createGroqVision", () => {
  it("sends temperature 0, JSON mode, the system prompt and at most the image limit", async () => {
    const fetchImpl = vi.fn(async () => ok('{"a":1}'));
    const out = await createGroqVision({ apiKey: "k", fetchImpl }).complete(input);
    expect(out).toBe('{"a":1}');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: DEFAULT_GROQ_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
    });
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
    const parts = body.messages[1].content as { type: string }[];
    expect(parts.filter((p) => p.type === "image_url")).toHaveLength(DEFAULT_GROQ_MAX_IMAGES);
    expect(parts[0]).toEqual({ type: "text", text: "usr" });
  });

  it("honors a configured model and image cap", async () => {
    const fetchImpl = vi.fn(async () => ok("{}"));
    await createGroqVision({ apiKey: "k", model: "other/model", maxImages: 1, fetchImpl }).complete(
      input,
    );
    const body = JSON.parse(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.model).toBe("other/model");
    expect(
      body.messages[1].content.filter((p: { type: string }) => p.type === "image_url"),
    ).toHaveLength(1);
  });

  it("maps 429 to a rate_limit error carrying retry-after", async () => {
    const v = createGroqVision({
      apiKey: "k",
      fetchImpl: vi.fn(async () => status(429, { "retry-after": "7" })),
    });
    await expect(v.complete(input)).rejects.toMatchObject({
      kind: "rate_limit",
      retryAfterMs: 7000,
    });
  });

  it("maps auth, server and other failures to unavailable", async () => {
    for (const code of [401, 403, 500, 503, 400]) {
      const v = createGroqVision({ apiKey: "k", fetchImpl: vi.fn(async () => status(code)) });
      await expect(v.complete(input)).rejects.toMatchObject({ kind: "unavailable" });
    }
  });

  it("maps network errors to unavailable and aborts to timeout", async () => {
    const down = createGroqVision({
      apiKey: "k",
      fetchImpl: vi.fn(async () => Promise.reject(new Error("ECONNRESET"))),
    });
    await expect(down.complete(input)).rejects.toMatchObject({ kind: "unavailable" });

    const hang = createGroqVision({
      apiKey: "k",
      timeoutMs: 20,
      fetchImpl: ((_u: string, init: RequestInit) =>
        new Promise((_res, rej) =>
          init.signal!.addEventListener("abort", () => rej(new Error("aborted"))),
        )) as unknown as typeof fetch,
    });
    await expect(hang.complete(input)).rejects.toMatchObject({ kind: "timeout" });
  });

  it("treats an empty completion as malformed", async () => {
    for (const c of [null, ""]) {
      const v = createGroqVision({ apiKey: "k", fetchImpl: vi.fn(async () => ok(c)) });
      await expect(v.complete(input)).rejects.toMatchObject({ kind: "malformed" });
    }
  });
});
