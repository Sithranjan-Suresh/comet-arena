import { describe, expect, it, vi } from "vitest";
import type { DedupeResult } from "@/lib/dedupe";
import type { ExtractOutcome } from "@/lib/extract/service";
import { loadFlyerCases } from "@/lib/fixtures";
import { UnsafeUrlError } from "@/lib/net/ssrf";
import type { Extraction } from "@/lib/schemas";
import { SourceError } from "@/lib/sources";
import { MESSAGES, type SubmitDeps, handleSubmission } from "@/lib/submit/handle";
import { MAX_UPLOAD_BYTES } from "@/lib/submit/sniff";

const USER = "00000000-0000-4000-8000-0000000000a1";
const NOW = new Date("2026-11-10T15:00:00Z");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(1)]);
const PNG = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  ...new Array(64).fill(1),
]);
const HEIC = new Uint8Array([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0,
]);
const comp: Extraction = loadFlyerCases()[0].expected;
const okOutcome = (ex: Extraction = comp): ExtractOutcome => ({
  ok: true,
  extraction: ex,
  meta: {
    repaired: false,
    yearInferred: false,
    adjustments: [],
    penalties: [],
    modelScore: 0.92,
    publishable: true,
    skippedImages: [],
  },
});

function deps(over: Partial<SubmitDeps> = {}) {
  const created: Parameters<SubmitDeps["submissions"]["create"]>[0][] = [];
  const uploads: { kind: string; size: number }[] = [];
  const d: SubmitDeps = {
    storage: {
      upload: async (_u, bytes, kind) => (
        uploads.push({ kind, size: bytes.length }),
        { ref: `storage:flyers/submissions/${USER}/x.${kind}`, publicUrl: "https://cdn.example/x" }
      ),
    },
    fetchPage: async () => ({
      kind: "html",
      html: "<title>T</title>",
      finalUrl: "https://example.com/p",
    }),
    fetchImageBytes: async () => PNG,
    extract: vi.fn(async () => okOutcome()),
    dedupe: async (): Promise<DedupeResult> => ({ action: "new", embedding: [1], deferred: false }),
    submissions: { create: async (row) => (created.push(row), { id: "sub-1" }) },
    now: NOW,
    ...over,
  };
  return { d, created, uploads };
}

describe("input validation", () => {
  it("requires exactly one of link or image", async () => {
    const { d } = deps();
    expect(await handleSubmission({ userId: USER }, d)).toMatchObject({
      status: 400,
      body: { message: MESSAGES.empty },
    });
    expect(await handleSubmission({ userId: USER, url: "  " }, d)).toMatchObject({ status: 400 });
    expect(
      await handleSubmission({ userId: USER, url: "https://x.example", image: { bytes: JPEG } }, d),
    ).toMatchObject({ status: 400, body: { error: "both_inputs" } });
  });

  it("rejects images over 10 MB with 413, before storing anything", async () => {
    const { d, uploads } = deps();
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(await handleSubmission({ userId: USER, image: { bytes: big } }, d)).toMatchObject({
      status: 413,
    });
    expect(uploads).toHaveLength(0);
    expect((await handleSubmission({ userId: USER, image: { bytes: JPEG } }, d)).status).toBe(200);
  });

  it("rejects non-images by content (a renamed HTML file) and explains HEIC", async () => {
    const { d } = deps();
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect(await handleSubmission({ userId: USER, image: { bytes: html } }, d)).toMatchObject({
      status: 415,
      body: { error: "not_an_image" },
    });
    expect(await handleSubmission({ userId: USER, image: { bytes: HEIC } }, d)).toMatchObject({
      status: 415,
      body: { error: "heic", message: MESSAGES.heic },
    });
  });
});

describe("happy paths", () => {
  it("uploaded flyer: stores it, extracts from the stored reference and records a pending submission", async () => {
    const { d, created, uploads } = deps();
    const r = await handleSubmission({ userId: USER, image: { bytes: JPEG } }, d);
    expect(r.status).toBe(200);
    if (r.status !== 200 || !("extracted" in r.body) || !r.body.extracted)
      throw new Error("expected extraction");
    expect(r.body.extracted.title).toBe(comp.title);
    expect(r.body.image_url).toBe("https://cdn.example/x");
    expect(uploads).toEqual([{ kind: "jpeg", size: JPEG.length }]);
    expect(d.extract).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [`storage:flyers/submissions/${USER}/x.jpeg`],
        posted_at: NOW.toISOString(),
      }),
    );
    expect(created[0]).toMatchObject({
      user_id: USER,
      raw_url: null,
      status: "pending",
      image_path: expect.stringContaining("storage:flyers/"),
    });
  });

  it("link: reads the page, uses its caption and og:image (copied into storage), and keeps the source URL", async () => {
    const html = `<meta property="og:title" content="AIS Case"><meta property="og:description" content="Register by Nov 20"><meta property="og:image" content="https://cdn.example/flyer.png">`;
    const { d, created, uploads } = deps({
      fetchPage: async () => ({ kind: "html", html, finalUrl: "https://example.com/p" }),
    });
    const r = await handleSubmission({ userId: USER, url: "https://example.com/p" }, d);
    expect(r.status).toBe(200);
    expect(uploads).toHaveLength(1);
    expect(d.extract).toHaveBeenCalledWith(
      expect.objectContaining({
        caption: "AIS Case\nRegister by Nov 20",
        source_url: "https://example.com/p",
      }),
    );
    expect(created[0]).toMatchObject({ raw_url: "https://example.com/p" });
  });

  it("a direct link to an image is treated as an upload", async () => {
    const { d, uploads } = deps({
      fetchPage: async () => ({
        kind: "image",
        bytes: JPEG,
        finalUrl: "https://example.com/f.jpg",
      }),
    });
    expect(
      (await handleSubmission({ userId: USER, url: "https://example.com/f.jpg" }, d)).status,
    ).toBe(200);
    expect(uploads[0].kind).toBe("jpeg");
  });

  it("a text-only page still works when its image cannot be fetched", async () => {
    const html = `<title>Hack Night</title><meta property="og:image" content="https://cdn.example/gone.png"><p>Hack night Dec 4</p>`;
    const { d } = deps({
      fetchPage: async () => ({ kind: "html", html, finalUrl: "https://example.com/p" }),
      fetchImageBytes: async () => {
        throw new Error("404");
      },
    });
    const r = await handleSubmission({ userId: USER, url: "https://example.com/p" }, d);
    expect(r.status).toBe(200);
    expect(d.extract).toHaveBeenCalledWith(expect.objectContaining({ images: [] }));
  });
});

describe("link failures", () => {
  it("unreadable and unsafe links get friendly 422s", async () => {
    const empty = deps({
      fetchPage: async () => ({
        kind: "html",
        html: "<html></html>",
        finalUrl: "https://example.com/p",
      }),
    });
    expect(
      await handleSubmission({ userId: USER, url: "https://example.com/p" }, empty.d),
    ).toMatchObject({ status: 422, body: { message: MESSAGES.unreadableLink } });

    const unsafe = deps({
      fetchPage: async () => {
        throw new UnsafeUrlError("resolves to a private address");
      },
    });
    expect(
      await handleSubmission({ userId: USER, url: "http://169.254.169.254/" }, unsafe.d),
    ).toMatchObject({ status: 422, body: { error: "unsafe_url" } });

    const down = deps({
      fetchPage: async () => {
        throw new Error("ECONNRESET");
      },
    });
    expect(
      await handleSubmission({ userId: USER, url: "https://example.com/p" }, down.d),
    ).toMatchObject({ status: 422, body: { error: "unreadable_link" } });
  });
});

describe("duplicates", () => {
  it("returns a near-certain duplicate as 'same' and an ambiguous one as 'maybe'", async () => {
    const match = { id: "c1", slug: "ais-case", title: "AIS Case", similarity: 0.95 };
    const same = deps({ dedupe: async () => ({ action: "merge", match, embedding: [1] }) });
    const a = await handleSubmission({ userId: USER, image: { bytes: PNG } }, same.d);
    expect(a.status === 200 && "possible_match" in a.body && a.body.possible_match).toEqual({
      slug: "ais-case",
      title: "AIS Case",
      similarity: 0.95,
      confidence: "same",
    });

    const maybe = deps({
      dedupe: async () => ({
        action: "review",
        candidates: [{ ...match, similarity: 0.85 }],
        embedding: [1],
      }),
    });
    const b = await handleSubmission({ userId: USER, image: { bytes: PNG } }, maybe.d);
    expect(b.status === 200 && "possible_match" in b.body && b.body.possible_match).toMatchObject({
      confidence: "maybe",
      similarity: 0.85,
    });
    expect(same.created[0].extracted).toMatchObject({ possible_match: { slug: "ais-case" } });
  });

  it("never fails the submission because the dedupe preview failed", async () => {
    const { d } = deps({
      dedupe: async () => {
        throw new Error("embeddings down");
      },
    });
    const r = await handleSubmission({ userId: USER, image: { bytes: PNG } }, d);
    expect(r.status === 200 && "possible_match" in r.body && r.body.possible_match).toBeNull();
  });
});

describe("failure states (product_spec §5)", () => {
  it.each(["timeout", "rate_limit", "unavailable"] as const)(
    "AI %s: keeps the submission queued and tells the student (202)",
    async (kind) => {
      const { d, created } = deps({
        extract: async () => {
          throw new SourceError("groq", kind);
        },
      });
      const r = await handleSubmission({ userId: USER, image: { bytes: PNG } }, d);
      expect(r).toMatchObject({
        status: 202,
        body: { queued: true, message: MESSAGES.queued, submission_id: "sub-1" },
      });
      expect(created[0]).toMatchObject({ status: "queued", image_path: expect.any(String) });
    },
  );

  it("invalid model output twice: falls back to manual entry with the reason", async () => {
    const { d, created } = deps({
      extract: async () => ({
        ok: false,
        error: { kind: "error", reason: "failed validation twice" },
        meta: okOutcome().meta as never,
      }),
    });
    const r = await handleSubmission({ userId: USER, image: { bytes: PNG } }, d);
    expect(r).toMatchObject({
      status: 200,
      body: { manual: true, extracted: null, reason: "failed validation twice" },
    });
    expect(created[0].extracted).toMatchObject({ manual: true });
  });

  it("flags recaps and non-competitions so the form can warn, but still returns the extraction", async () => {
    const recap = deps({
      extract: async () => okOutcome({ ...comp, kind: "results", is_competition: false }),
    });
    expect(await handleSubmission({ userId: USER, image: { bytes: PNG } }, recap.d)).toMatchObject({
      body: { warning: "recap" },
    });
    const nope = deps({
      extract: async () => okOutcome({ ...comp, kind: "not_competition", is_competition: false }),
    });
    expect(await handleSubmission({ userId: USER, image: { bytes: PNG } }, nope.d)).toMatchObject({
      body: { warning: "not_a_competition" },
    });
  });

  it("unexpected errors propagate (they are bugs, not user problems)", async () => {
    const { d } = deps({
      extract: async () => {
        throw new TypeError("bug");
      },
    });
    await expect(handleSubmission({ userId: USER, image: { bytes: PNG } }, d)).rejects.toThrow(
      "bug",
    );
  });
});
