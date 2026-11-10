import { describe, expect, it } from "vitest";
import { toTickerItems } from "@/lib/data/ticker";

const now = new Date("2026-11-10T12:00:00Z");
const row = (slug: string, deadline: string | null, extra: Record<string, unknown> = {}) => ({
  slug,
  title: slug.toUpperCase(),
  next_stage_name: "Round 1",
  next_stage_deadline_at: deadline,
  has_upcoming: true,
  ...extra,
});

describe("toTickerItems", () => {
  it("sorts by soonest deadline and drops past, undated and incomplete rows", () => {
    const items = toTickerItems(
      [
        row("later", "2026-12-01T00:00:00Z"),
        row("soon", "2026-11-11T00:00:00Z"),
        row("past", "2026-11-01T00:00:00Z"),
        row("undated", null),
        row("fallback-past", "2026-11-12T00:00:00Z", { has_upcoming: false }),
        { ...row("no-title", "2026-11-13T00:00:00Z"), title: null },
      ],
      now,
    );
    expect(items.map((i) => i.slug)).toEqual(["soon", "later"]);
  });

  it("caps the list and labels missing stage names", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      row(`c${i}`, `2026-11-${String(11 + (i % 15)).padStart(2, "0")}T00:00:00Z`, {
        next_stage_name: null,
      }),
    );
    const items = toTickerItems(rows, now, 10);
    expect(items).toHaveLength(10);
    expect(items[0].stage).toBe("Deadline");
  });
});
