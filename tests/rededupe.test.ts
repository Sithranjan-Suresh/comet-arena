import { describe, expect, it, vi } from "vitest";
import type { DedupeMatch, DedupeStore } from "@/lib/dedupe";
import { type PendingDedupe, type RededupeStore, runRededupe } from "@/lib/jobs/rededupe";

const pending = (id: string, title = id): PendingDedupe => ({
  id,
  title,
  host: "AIS",
  categories: ["hackathon"],
  first_deadline: "2026-12-01T17:00:00-06:00",
  created_at: "2026-11-01T00:00:00Z",
});

function setup(items: PendingDedupe[], matches: DedupeMatch[] = []) {
  const done: string[] = [];
  const flagged: { newId: string; candidateId: string }[] = [];
  const store: RededupeStore = {
    listPending: async () => items,
    markDeduped: async (id) => void done.push(id),
    enqueuePostHoc: async (i) => void flagged.push({ newId: i.newId, candidateId: i.candidateId }),
  };
  const dedupe: DedupeStore = { findMatches: vi.fn(async () => matches) };
  const embedder = { embed: vi.fn(async () => [0.1, 0.2]) };
  return { store, dedupe, embedder, done, flagged };
}

describe("runRededupe", () => {
  it("embeds pending listings, clears the flag and flags nothing when there is no lookalike", async () => {
    const t = setup([pending("a"), pending("b")]);
    expect(await runRededupe(t)).toEqual({ checked: 2, duplicates_flagged: 0, still_pending: 0 });
    expect(t.done).toEqual(["a", "b"]);
    expect(t.flagged).toEqual([]);
  });

  it("a lookalike goes to the review queue (never merged automatically) and still clears the flag", async () => {
    const t = setup(
      [pending("a")],
      [
        { id: "older", slug: "o", title: "Older", similarity: 0.88 },
        { id: "a", slug: "a", title: "self", similarity: 1 },
      ],
    );
    const s = await runRededupe(t);
    expect(s.duplicates_flagged).toBe(1);
    expect(t.flagged).toEqual([{ newId: "a", candidateId: "older" }]);
    expect(t.done).toEqual(["a"]);
  });

  it("ignores itself as a match", async () => {
    const t = setup([pending("a")], [{ id: "a", slug: "a", title: "a", similarity: 1 }]);
    expect((await runRededupe(t)).duplicates_flagged).toBe(0);
  });

  it("if the embedding service is still down it leaves the flag set and stops", async () => {
    const t = setup([pending("a"), pending("b")]);
    t.embedder.embed.mockRejectedValue(new Error("down"));
    expect(await runRededupe(t)).toEqual({ checked: 0, duplicates_flagged: 0, still_pending: 1 });
    expect(t.done).toEqual([]);
    expect(t.embedder.embed).toHaveBeenCalledTimes(1);
  });
});
