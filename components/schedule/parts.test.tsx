// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PastStages, StageRow, WeekGroup } from "@/components/schedule/parts";
import type { ScheduleStage } from "@/lib/schedule";

const stage = (over: Partial<ScheduleStage> = {}): ScheduleStage => ({
  stage_id: "s1",
  stage_name: "Registration closes",
  starts_at: null,
  deadline_at: "2099-11-21T05:59:00Z",
  competition_id: "c1",
  slug: "ais-case",
  title: "AIS Case Competition",
  register_url: "https://example.com/r",
  ...over,
});

describe("StageRow", () => {
  it("shows the competition (linked), stage, Central Time, countdown and a safe register link", () => {
    render(
      <ul>
        <StageRow stage={stage()} />
      </ul>,
    );
    expect(screen.getByRole("link", { name: "AIS Case Competition" })).toHaveAttribute(
      "href",
      "/game/ais-case",
    );
    expect(screen.getByText(/Registration closes · .*11:59 PM CT/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Register/ })).toHaveAttribute(
      "href",
      "https://example.com/r",
    );
    expect(screen.getByRole("link", { name: /Register/ })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("omits the register link for missing or unsafe URLs", () => {
    for (const url of [null, "javascript:alert(1)"]) {
      const { unmount } = render(
        <ul>
          <StageRow stage={stage({ register_url: url })} />
        </ul>,
      );
      expect(screen.queryByRole("link", { name: /Register/ })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("past rows have no countdown or register link", () => {
    render(
      <ul>
        <StageRow stage={stage()} past />
      </ul>,
    );
    expect(screen.queryByRole("link", { name: /Register/ })).not.toBeInTheDocument();
    expect(document.querySelector("time")).toBeNull();
  });
});

describe("WeekGroup / PastStages", () => {
  it("renders a labelled section with its stages", () => {
    render(
      <WeekGroup
        week={{
          key: "2026-11-09",
          label: "This week",
          stages: [stage(), stage({ stage_id: "s2", title: "Hack" })],
        }}
      />,
    );
    const section = screen.getByRole("region", { name: "This week" });
    expect(within(section).getAllByRole("listitem")).toHaveLength(2);
  });

  it("collapses past deadlines behind a count, and renders nothing when there are none", () => {
    const { container, rerender } = render(
      <PastStages stages={[stage(), stage({ stage_id: "s2" })]} />,
    );
    expect(screen.getByText("Past deadlines (2)")).toBeInTheDocument();
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    rerender(<PastStages stages={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
