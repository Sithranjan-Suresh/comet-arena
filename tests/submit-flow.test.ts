import { describe, expect, it, vi } from "vitest";
import { loadFlyerCases } from "@/lib/fixtures";
import { postConfirm, postSubmission, type SubmitOutcome } from "@/lib/submit/api";
import { type FlowState, flowReducer, initialFlow, showDuplicatePrompt } from "@/lib/submit/flow";

const extraction = loadFlyerCases()[0].expected;
const match = {
  id: "c1",
  slug: "ais-case",
  title: "AIS Case",
  similarity: 0.95,
  confidence: "same" as const,
};
const ready = (over: Partial<Extract<SubmitOutcome, { kind: "ready" }>> = {}): SubmitOutcome => ({
  kind: "ready",
  submissionId: "s1",
  extraction,
  imageUrl: "https://cdn/x",
  match: null,
  warning: null,
  ...over,
});
const run = (...actions: Parameters<typeof flowReducer>[1][]) =>
  actions.reduce<FlowState>((s, a) => flowReducer(s, a), initialFlow);

describe("flowReducer", () => {
  it("input -> reading -> review with the extraction, image and submission id", () => {
    const s = run({ type: "submit_started" }, { type: "submit_result", result: ready() });
    expect(s).toMatchObject({
      step: "review",
      submissionId: "s1",
      imageUrl: "https://cdn/x",
      decision: "separate",
      submitting: false,
      preview: { status: "ready" },
    });
  });

  it("a possible duplicate leaves the decision open until the student answers", () => {
    const asked = run(
      { type: "submit_started" },
      { type: "submit_result", result: ready({ match }) },
    );
    expect(showDuplicatePrompt(asked)).toBe(true);
    const yes = flowReducer(asked, { type: "decide_yes", competitionId: "c1" });
    expect(yes).toMatchObject({ decision: "merge", mergeInto: "c1" });
    expect(showDuplicatePrompt(yes)).toBe(false);
    const no = flowReducer(asked, { type: "decide_no" });
    expect(no).toMatchObject({ decision: "separate", mergeInto: null });
    expect(showDuplicatePrompt(no)).toBe(false);
  });

  it("no match means no prompt", () => {
    expect(
      showDuplicatePrompt(
        run({ type: "submit_started" }, { type: "submit_result", result: ready() }),
      ),
    ).toBe(false);
  });

  it("errors return to the input step with the message; queued and manual outcomes get their own states", () => {
    expect(
      run(
        { type: "submit_started" },
        { type: "submit_result", result: { kind: "error", message: "Nope" } },
      ),
    ).toEqual({ step: "input", error: "Nope" });
    expect(
      run(
        { type: "submit_started" },
        { type: "submit_result", result: { kind: "queued", message: "Saved" } },
      ),
    ).toEqual({ step: "queued", message: "Saved" });
    const manual = run(
      { type: "submit_started" },
      {
        type: "submit_result",
        result: { kind: "manual", submissionId: "s2", reason: "bad json", imageUrl: null },
      },
    );
    expect(manual).toMatchObject({
      step: "review",
      preview: { status: "manual", reason: "bad json" },
      match: null,
    });
  });

  it("'fill it in myself' while waiting opens a blank form and ignores the late extraction and any match", () => {
    const s = run(
      { type: "submit_started" },
      { type: "manual_requested" },
      { type: "submit_result", result: ready({ match }) },
    );
    expect(s).toMatchObject({
      step: "review",
      preview: { status: "manual" },
      match: null,
      decision: "separate",
      submissionId: "s1",
    });
  });

  it("confirm: success finishes, validation errors map to fields, other errors become a banner", () => {
    const review = run(
      { type: "submit_started" },
      { type: "submit_result", result: ready() },
      { type: "confirm_started" },
    );
    expect(review).toMatchObject({ submitting: true });
    expect(
      flowReducer(review, {
        type: "confirm_result",
        result: { kind: "done", slug: "ais-case", outcome: "published" },
      }),
    ).toEqual({ step: "done", slug: "ais-case", outcome: "published" });
    expect(
      flowReducer(review, {
        type: "confirm_result",
        result: { kind: "invalid", errors: { title: "Add a title" } },
      }),
    ).toMatchObject({
      submitting: false,
      serverErrors: { title: "Add a title" },
      banner: expect.stringContaining("highlighted"),
    });
    expect(
      flowReducer(review, {
        type: "confirm_result",
        result: { kind: "error", message: "Try later" },
      }),
    ).toMatchObject({ submitting: false, banner: "Try later" });
  });

  it("a retry clears the previous errors", () => {
    const failed = run(
      { type: "submit_started" },
      { type: "submit_result", result: ready() },
      { type: "confirm_started" },
      { type: "confirm_result", result: { kind: "invalid", errors: { title: "x" } } },
    );
    expect(flowReducer(failed, { type: "confirm_started" })).toMatchObject({
      serverErrors: undefined,
      banner: undefined,
      submitting: true,
    });
  });

  it("ignores actions that do not apply to the current step and resets from anywhere", () => {
    expect(flowReducer(initialFlow, { type: "decide_yes", competitionId: "c" })).toBe(initialFlow);
    expect(flowReducer(initialFlow, { type: "confirm_started" })).toBe(initialFlow);
    expect(flowReducer(initialFlow, { type: "submit_result", result: ready() })).toBe(initialFlow);
    expect(run({ type: "submit_started" }, { type: "reset" })).toBe(initialFlow);
  });
});

const res = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe("postSubmission", () => {
  it("sends links as JSON and files as multipart", async () => {
    const f = vi.fn(async () =>
      res(200, {
        submission_id: "s1",
        extracted: extraction,
        image_url: null,
        possible_match: null,
        warning: null,
      }),
    );
    await postSubmission({ url: "https://x.example/p" }, f as unknown as typeof fetch);
    const [, linkInit] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(linkInit.body as string)).toEqual({ url: "https://x.example/p" });

    const file = new File([new Uint8Array(5)], "flyer.png", { type: "image/png" });
    await postSubmission({ file }, f as unknown as typeof fetch);
    const [, fileInit] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect((fileInit.body as FormData).get("image")).toBeInstanceOf(File);
    expect(fileInit.headers).toBeUndefined(); // the browser sets the multipart boundary
  });

  it("maps each response to an outcome", async () => {
    const call = (r: Response) =>
      postSubmission({ url: "https://x.example" }, (async () => r) as unknown as typeof fetch);
    expect(
      await call(
        res(200, {
          submission_id: "s1",
          extracted: extraction,
          image_url: "u",
          possible_match: { id: "c" },
          warning: "recap",
        }),
      ),
    ).toMatchObject({ kind: "ready", submissionId: "s1", warning: "recap", match: { id: "c" } });
    expect(
      await call(res(200, { submission_id: "s2", manual: true, reason: "r", image_url: null })),
    ).toMatchObject({ kind: "manual", reason: "r" });
    expect(await call(res(202, { message: "Saved, we'll finish reading it shortly." }))).toEqual({
      kind: "queued",
      message: "Saved, we'll finish reading it shortly.",
    });
    expect(await call(res(422, { message: "We could not read that link." }))).toEqual({
      kind: "error",
      message: "We could not read that link.",
    });
    expect(await call(res(413, { message: "That image is over 10 MB." }))).toMatchObject({
      kind: "error",
      message: "That image is over 10 MB.",
    });
    expect(await call(res(401, {}))).toMatchObject({
      kind: "error",
      message: expect.stringContaining("Sign in"),
    });
    expect(await call(res(429, { message: "Slow down" }))).toEqual({
      kind: "error",
      message: "Slow down",
    });
    expect(await call(res(500, "not json"))).toMatchObject({
      kind: "error",
      message: "Something went wrong. Please try again.",
    });
  });

  it("reports a network failure without throwing", async () => {
    const out = await postSubmission({ url: "https://x.example" }, (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch);
    expect(out).toMatchObject({ kind: "error", message: expect.stringContaining("connection") });
  });
});

describe("postConfirm", () => {
  const call = (r: Response) =>
    postConfirm("s1", { title: "x" }, (async () => r) as unknown as typeof fetch);
  it("returns the slug and outcome, field errors for 422, and messages otherwise", async () => {
    expect(await call(res(200, { competition_slug: "ais", outcome: "published" }))).toEqual({
      kind: "done",
      slug: "ais",
      outcome: "published",
    });
    expect(await call(res(200, { competition_slug: "ais", outcome: "merged" }))).toMatchObject({
      outcome: "merged",
    });
    expect(
      await call(
        res(422, {
          issues: [
            { path: "title", message: "Add a title" },
            { path: "title", message: "second" },
            { path: "stages", message: "Add a round" },
          ],
        }),
      ),
    ).toEqual({ kind: "invalid", errors: { title: "Add a title", stages: "Add a round" } });
    expect(await call(res(409, { message: "Already handled" }))).toEqual({
      kind: "error",
      message: "Already handled",
    });
    expect(await call(res(503, {}))).toMatchObject({ kind: "error" });
  });

  it("posts the payload to the submission's confirm endpoint", async () => {
    const f = vi.fn(async () => res(200, { competition_slug: "a", outcome: "published" }));
    await postConfirm("sub-9", { title: "T" }, f as unknown as typeof fetch);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/submit/sub-9/confirm");
  });
});
