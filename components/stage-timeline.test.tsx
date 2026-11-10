// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StageTimeline } from "@/components/StageTimeline";

const now = new Date("2026-11-10T12:00:00Z");
const stages = [
  { name: "Registration", starts_at: null, deadline_at: "2026-11-05T23:00:00Z", order: 1 },
  { name: "Round 1", starts_at: null, deadline_at: "2026-11-20T23:00:00Z", order: 2 },
  { name: "Finals", starts_at: null, deadline_at: "2026-12-05T23:00:00Z", order: 3 },
];

describe("StageTimeline", () => {
  it("renders an ordered list with quarter labels and marks the next step", () => {
    render(<StageTimeline stages={stages} now={now} />);
    const list = screen.getByRole("list", { name: "Competition stages" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveAttribute("aria-current", "step");
    expect(within(items[0]).getByText("Done")).toBeInTheDocument();
    expect(within(items[1]).getByText("Next up")).toBeInTheDocument();
    expect(within(items[2]).getByText("Upcoming")).toBeInTheDocument();
  });

  it("explains missing dates instead of rendering an empty list", () => {
    render(<StageTimeline stages={[]} now={now} />);
    expect(screen.getByText("Dates not announced yet.")).toBeInTheDocument();
  });
});
