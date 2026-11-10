import { describe, expect, it, vi } from "vitest";
import { createOpenAICompatibleEmbedder } from "@/lib/sources/live/embeddings";
import { EMBEDDING_DIM, cosine, hashEmbed, mockEmbedder } from "@/lib/sources/mock/embedder";

const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

describe("mock embedder", () => {
  it("returns a 768-dimension unit vector, deterministically", async () => {
    const e = mockEmbedder();
    const a = await e.embed("AIS Fall Case Competition | AIS | 2026-12-05 | case_competition");
    const b = await e.embed("AIS Fall Case Competition | AIS | 2026-12-05 | case_competition");
    expect(a).toHaveLength(EMBEDDING_DIM);
    expect(norm(a)).toBeCloseTo(1, 6);
    expect(a).toEqual(b);
  });

  it("handles empty and punctuation-only text without NaN", () => {
    for (const t of ["", "   ", "!!!"]) {
      const v = hashEmbed(t);
      expect(v.every(Number.isFinite)).toBe(true);
      expect(norm(v)).toBeCloseTo(1, 6);
    }
  });

  it("ranks the same competition posted by different clubs far above unrelated ones", () => {
    const text = (title: string, host: string, d: string, cats: string) =>
      `${title} | ${host} | ${d} | ${cats}`;
    const orig = hashEmbed(
      text("AIS Fall Case Competition", "AIS", "2026-12-05", "case_competition, finance"),
    );
    const repost = hashEmbed(
      text(
        "AIS Fall Case Competition",
        "Association for Information Systems",
        "2026-12-05",
        "case_competition",
      ),
    );
    const other = hashEmbed(
      text("HackUTD Spring 24h Hackathon", "HackUTD", "2027-02-07", "hackathon"),
    );
    // A differently worded host can land in the ambiguous dedupe band; the dedupe eval (Task 106) tunes the cut-offs.
    expect(cosine(orig, repost)).toBeGreaterThan(0.7);
    expect(cosine(orig, repost)).toBeGreaterThan(cosine(orig, other) + 0.4);
    expect(cosine(orig, other)).toBeLessThan(0.3);
    expect(cosine(orig, orig)).toBeCloseTo(1, 6);
  });
});

const vec = (n = EMBEDDING_DIM) => Array.from({ length: n }, (_, i) => i / n);
const ok = (embedding: unknown) =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ data: [{ embedding }] }),
  }) as Response;
const fail = (status: number, headers: Record<string, string> = {}) =>
  ({ ok: false, status, headers: new Headers(headers), json: async () => ({}) }) as Response;

describe("OpenAI-compatible embedder", () => {
  it("posts model and dimensions=768 to the configured base URL", async () => {
    const fetchImpl = vi.fn(async () => ok(vec()));
    const e = createOpenAICompatibleEmbedder({
      apiKey: "k",
      baseUrl: "https://emb.example/v1/",
      model: "m",
      fetchImpl,
    });
    expect(await e.embed("hello")).toHaveLength(EMBEDDING_DIM);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://emb.example/v1/embeddings");
    expect(JSON.parse(init.body as string)).toEqual({
      model: "m",
      input: "hello",
      dimensions: 768,
    });
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer k");
  });

  it("rejects wrong-sized or non-numeric vectors as malformed", async () => {
    for (const bad of [vec(10), "nope", [...vec().slice(1), "x"], null]) {
      const e = createOpenAICompatibleEmbedder({
        apiKey: "k",
        fetchImpl: vi.fn(async () => ok(bad)),
      });
      await expect(e.embed("x")).rejects.toMatchObject({ kind: "malformed" });
    }
  });

  it("maps 429 and server errors to typed errors", async () => {
    const limited = createOpenAICompatibleEmbedder({
      apiKey: "k",
      fetchImpl: vi.fn(async () => fail(429, { "retry-after": "2" })),
    });
    await expect(limited.embed("x")).rejects.toMatchObject({
      kind: "rate_limit",
      retryAfterMs: 2000,
    });
    const down = createOpenAICompatibleEmbedder({
      apiKey: "k",
      fetchImpl: vi.fn(async () => fail(500)),
    });
    await expect(down.embed("x")).rejects.toMatchObject({ kind: "unavailable" });
    const net = createOpenAICompatibleEmbedder({
      apiKey: "k",
      fetchImpl: vi.fn(async () => Promise.reject(new Error("boom"))),
    });
    await expect(net.embed("x")).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("times out", async () => {
    const hang = createOpenAICompatibleEmbedder({
      apiKey: "k",
      timeoutMs: 20,
      fetchImpl: ((_u: string, init: RequestInit) =>
        new Promise((_r, rej) =>
          init.signal!.addEventListener("abort", () => rej(new Error("aborted"))),
        )) as unknown as typeof fetch,
    });
    await expect(hang.embed("x")).rejects.toMatchObject({ kind: "timeout" });
  });
});
