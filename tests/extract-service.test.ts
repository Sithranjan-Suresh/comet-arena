import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { createImageResolver } from "@/lib/extract/resolve-image";
import { EmptyInputError, runExtraction } from "@/lib/extract/service";
import { loadFlyerCases } from "@/lib/fixtures";
import { SourceError, type VisionModel } from "@/lib/sources";
import { mockVision } from "@/lib/sources/mock/adapters";
import { Chaos } from "@/lib/sources/mock/chaos";
import { mockFlyerUrl } from "@/lib/sources/mock/constants";

vi.mock("server-only", () => ({}));

const now = new Date("2026-11-10T15:00:00Z");
const deps = (vision: VisionModel = mockVision(Chaos.none())) => ({
  vision,
  mode: "mock" as const,
  maxImages: 3,
  resolveImage: createImageResolver(),
  now,
});

describe("runExtraction over every fixture post", () => {
  for (const c of loadFlyerCases()) {
    it(`${c.id}: ${c.expected.kind}`, async () => {
      const out = await runExtraction(
        { images: c.images.map(mockFlyerUrl), caption: c.caption, posted_at: c.posted_at },
        deps(),
      );
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.extraction.kind).toBe(c.expected.kind);
      if (c.expected.kind === "competition") expect(out.extraction.title).toBe(c.expected.title);
    });
  }
});

describe("runExtraction behavior", () => {
  const byId = (id: string) => loadFlyerCases().find((c) => c.id === id)!;
  const run = (id: string, vision?: VisionModel) => {
    const c = byId(id);
    return runExtraction(
      { images: c.images.map(mockFlyerUrl), caption: c.caption, posted_at: c.posted_at },
      deps(vision),
    );
  };

  it("publishes a clean flyer and reports no penalties", async () => {
    const out = await run("f01-ais-case");
    if (!out.ok) throw new Error("expected ok");
    expect(out.meta).toMatchObject({ publishable: true, penalties: [], repaired: false });
    expect(out.extraction.confidence).toBe(0.92);
  });

  it("applies penalties and lists the missing fields for a flyer without a link", async () => {
    const out = await run("f05-pitch-night");
    if (!out.ok) throw new Error("expected ok");
    expect(out.extraction.confidence).toBe(0.78);
    expect(out.meta.publishable).toBe(false);
    expect(out.extraction.missing_fields).toContain("register_url");
  });

  it("flags inferred years and reports adjustments", async () => {
    const out = await run("f06-no-year");
    if (!out.ok) throw new Error("expected ok");
    expect(out.meta.yearInferred).toBe(true);
    expect(out.extraction.confidence).toBe(0.8);
  });

  it("recovers from injected malformed output through the repair call", async () => {
    const chaos = new Chaos({
      latencyMs: [0, 0],
      sleep: async () => {},
      malformedRate: 1,
      timeoutRate: 0,
      rateLimitAtCall: 0,
    });
    const out = await run("f01-ais-case", mockVision(chaos));
    if (!out.ok) throw new Error("expected ok");
    expect(out.meta.repaired).toBe(true);
  });

  it("returns kind:error when the model never produces valid JSON", async () => {
    const broken: VisionModel = { complete: async () => "not json" };
    const out = await run("f01-ais-case", broken);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe("error");
  });

  it("propagates infrastructure failures for the caller's failure handling", async () => {
    const down: VisionModel = {
      complete: async () => {
        throw new SourceError("groq", "rate_limit", "429", 3000);
      },
    };
    await expect(run("f01-ais-case", down)).rejects.toMatchObject({
      kind: "rate_limit",
      retryAfterMs: 3000,
    });
  });

  it("rejects empty input", async () => {
    await expect(runExtraction({ images: [] }, deps())).rejects.toBeInstanceOf(EmptyInputError);
    await expect(runExtraction({ images: [], caption: "   " }, deps())).rejects.toBeInstanceOf(
      EmptyInputError,
    );
  });

  it("works from a caption alone (feeds) and skips unresolvable images", async () => {
    const out = await runExtraction(
      { images: [], caption: "Hackathon on Dec 5. Register: https://example.com/r" },
      deps(),
    );
    expect(out.ok).toBe(true);
    const partial = await runExtraction(
      {
        images: ["mock://flyers/does-not-exist.png", mockFlyerUrl(byId("f01-ais-case").images[0])],
        caption: "x",
      },
      deps(),
    );
    expect(partial.meta.skippedImages).toEqual([
      { ref: "mock://flyers/does-not-exist.png", reason: "unresolvable" },
    ]);
  });

  it("fails clearly when no image can be read and there is no caption", async () => {
    const out = await runExtraction({ images: ["mock://flyers/nope.png"] }, deps());
    expect(out.ok).toBe(false);
  });

  it("sends cleaned image bytes (data URLs) to the model in live mode, capped at maxImages", async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#123" } })
      .png()
      .toBuffer();
    const complete = vi.fn(async () => JSON.stringify(byId("f01-ais-case").expected));
    const out = await runExtraction(
      { images: ["a", "b", "c", "d"], caption: "x" },
      { vision: { complete }, mode: "live", maxImages: 3, resolveImage: async () => png, now },
    );
    expect(out.ok).toBe(true);
    const sent = (complete.mock.calls[0] as unknown as [{ images: string[] }])[0].images;
    expect(sent).toHaveLength(3);
    for (const url of sent) expect(url).toMatch(/^data:image\/png;base64,/);
    expect(out.meta.skippedImages).toEqual([{ ref: "d", reason: "over_limit" }]);
  });
});

describe("createImageResolver", () => {
  it("rejects unsupported references and path traversal", async () => {
    const resolve = createImageResolver({ downloadStorage: async () => Buffer.from("x") });
    await expect(resolve("ftp://x/y")).rejects.toThrow();
    await expect(resolve("storage:flyers/../secrets")).rejects.toThrow(/invalid storage path/);
    await expect(resolve("storage:nobucket")).rejects.toThrow();
    expect((await resolve("storage:flyers/a/b.png")).toString()).toBe("x");
  });

  it("refuses private URLs before any network call", async () => {
    await expect(createImageResolver()("https://169.254.169.254/latest/meta-data")).rejects.toThrow(
      /private/,
    );
  });
});
