import { describe, expect, it, vi } from "vitest";
import { buildExtractionPrompt } from "@/lib/extract/prompt";
import { extractWithRepair, formatZodError, parseModelJson } from "@/lib/extract/validate";
import { loadFlyerCases } from "@/lib/fixtures";
import { extractionSchema } from "@/lib/schemas";
import { SourceError, type VisionModel } from "@/lib/sources";
import { mockVision } from "@/lib/sources/mock/adapters";
import { Chaos } from "@/lib/sources/mock/chaos";
import { mockFlyerUrl } from "@/lib/sources/mock/constants";

const sample = loadFlyerCases()[0];
const good = JSON.stringify(sample.expected);
const prompt = buildExtractionPrompt({ now: new Date("2026-11-10T15:00:00Z"), imageCount: 1 });
const images = [mockFlyerUrl(sample.images[0])];
const fake = (
  ...answers: (string | Error)[]
): VisionModel & { complete: ReturnType<typeof vi.fn> } => {
  const queue = [...answers];
  return {
    complete: vi.fn(async () => {
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next ?? "";
    }),
  };
};

describe("parseModelJson", () => {
  it("parses plain JSON, code fences and prose-wrapped objects", () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('Sure! Here you go: {"a":1} Hope that helps')).toEqual({ a: 1 });
  });

  it("throws on truncated or empty output", () => {
    expect(() => parseModelJson('{"a": tru')).toThrow();
    expect(() => parseModelJson("")).toThrow();
  });
});

describe("extractWithRepair", () => {
  it("returns a valid first answer without a repair call", async () => {
    const vision = fake(good);
    const out = await extractWithRepair({ vision, prompt, images });
    expect(out.repaired).toBe(false);
    expect(vision.complete).toHaveBeenCalledTimes(1);
    expect(extractionSchema.safeParse(out.result).success).toBe(true);
  });

  it("repairs once when the first answer is malformed, sending the error and previous output", async () => {
    const vision = fake(good.slice(0, 40), good);
    const out = await extractWithRepair({ vision, prompt, images });
    expect(out.repaired).toBe(true);
    expect("kind" in out.result && out.result.kind).toBe("competition");
    expect(vision.complete).toHaveBeenCalledTimes(2);
    const repairCall = vision.complete.mock.calls[1][0] as { user: string; images: string[] };
    expect(repairCall.user).toContain("Your previous output was invalid");
    expect(repairCall.user).toContain("not valid JSON");
    expect(repairCall.images).toEqual(images); // the repair still sees the flyer
  });

  it("repairs schema violations and reports which field was wrong", async () => {
    const bad = JSON.stringify({ ...sample.expected, confidence: 7 });
    const vision = fake(bad, good);
    await extractWithRepair({ vision, prompt, images });
    expect((vision.complete.mock.calls[1][0] as { user: string }).user).toContain("confidence");
  });

  it("returns kind:error after two invalid answers (no third call)", async () => {
    const vision = fake("nope", "still nope", good);
    const out = await extractWithRepair({ vision, prompt, images });
    expect(out.result).toMatchObject({ kind: "error" });
    expect(vision.complete).toHaveBeenCalledTimes(2);
  });

  it("treats an empty completion (malformed SourceError) as repairable", async () => {
    const vision = fake(new SourceError("groq", "malformed"), good);
    const out = await extractWithRepair({ vision, prompt, images });
    expect(out.repaired).toBe(true);
    expect(out.result).toMatchObject({ kind: "competition" });
  });

  it("does NOT swallow timeouts, rate limits or outages", async () => {
    for (const kind of ["timeout", "rate_limit", "unavailable"] as const) {
      const vision = fake(new SourceError("groq", kind));
      await expect(extractWithRepair({ vision, prompt, images })).rejects.toMatchObject({ kind });
      expect(vision.complete).toHaveBeenCalledTimes(1);
    }
  });

  it("recovers from the mock's injected malformed JSON via repair", async () => {
    // First call corrupted by chaos, repair call is never corrupted by the mock.
    const chaos = new Chaos({
      latencyMs: [0, 0],
      sleep: async () => {},
      rateLimitAtCall: 0,
      malformedRate: 1,
      timeoutRate: 0,
    });
    const out = await extractWithRepair({ vision: mockVision(chaos), prompt, images });
    expect(out.repaired).toBe(true);
    expect(out.result).toMatchObject({ title: sample.expected.title });
  });
});

describe("formatZodError", () => {
  it("lists paths and caps the number of issues", () => {
    const r = extractionSchema.safeParse({ confidence: 9, is_competition: "yes", kind: "x" });
    if (r.success) throw new Error("expected failure");
    const text = formatZodError(r.error, 2);
    expect(text.split("\n")).toHaveLength(2);
    expect(text).toMatch(/^- /);
  });
});
