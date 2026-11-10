// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GameHeader, InfoGrid, RegisterButton, SourceList } from "@/components/game-day/parts";
import type { GameDayDTO } from "@/lib/schemas";

const dto = (over: Partial<GameDayDTO> = {}): GameDayDTO => ({
  id: "00000000-0000-4000-8000-000000000001",
  slug: "case",
  title: "Case Comp",
  host_name: "AIS",
  host_slug: "ais",
  categories: ["case_competition"],
  description: "d",
  tier: "campus",
  prize: "$2,500",
  cost: "free",
  format: "in_person",
  location: "JSOM",
  register_url: "https://example.com/r",
  utd_only: true,
  beginner_friendly: true,
  status: "unverified",
  confirmations: 2,
  flyer_url: null,
  updated_at: "2026-11-07T12:00:00Z",
  stages: [],
  eligibility: {
    majors: [],
    class_years: [],
    course_prereqs: [],
    team_min: 3,
    team_max: 4,
    cross_school: false,
  },
  sources: [
    { source: "instagram", source_url: "https://ig.example/p/1", seen_at: "2026-11-05T00:00:00Z" },
    { source: "submission", source_url: "javascript:alert(1)", seen_at: "2026-11-06T00:00:00Z" },
  ],
  viewer_saved: false,
  viewer_eligible: null,
  ...over,
});
const now = new Date("2026-11-10T12:00:00Z");

describe("GameHeader", () => {
  it("shows the title as the page heading, host link, freshness and badges", () => {
    render(<GameHeader dto={dto()} now={now} />);
    expect(screen.getByRole("heading", { level: 1, name: "Case Comp" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AIS" })).toHaveAttribute("href", "/org/ais");
    expect(screen.getByText("updated 3 days ago")).toBeInTheDocument();
    expect(screen.getAllByText(/Unverified/).length).toBeGreaterThan(0);
  });

  it("marks national and non-UTD competitions and tolerates a missing host", () => {
    render(
      <GameHeader
        dto={dto({ tier: "national", utd_only: false, host_name: null, host_slug: null })}
        now={now}
      />,
    );
    expect(screen.getByText("National")).toBeInTheDocument();
    expect(screen.getByText("Open beyond UTD")).toBeInTheDocument();
    expect(screen.queryByText(/Hosted by/)).not.toBeInTheDocument();
  });
});

describe("InfoGrid", () => {
  it("shows prize, cost, format, location, team size and beginner note", () => {
    render(<InfoGrid dto={dto()} />);
    for (const t of ["$2,500", "Free", "In person", "JSOM", "Teams of 3 to 4", "Beginners welcome"])
      expect(screen.getByText(t)).toBeInTheDocument();
  });
  it("says 'Not listed' instead of leaving gaps", () => {
    render(
      <InfoGrid
        dto={dto({
          prize: null,
          cost: "unknown",
          format: "unknown",
          location: null,
          eligibility: null,
          beginner_friendly: false,
        })}
      />,
    );
    expect(screen.getByText("Not listed")).toBeInTheDocument();
    expect(screen.getByText("Cost not listed")).toBeInTheDocument();
  });
});

describe("RegisterButton", () => {
  it("opens the host's page safely in a new tab", () => {
    render(<RegisterButton dto={dto()} />);
    const a = screen.getByRole("link", { name: /Register/ });
    expect(a).toHaveAttribute("href", "https://example.com/r");
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
    expect(a).toHaveAttribute("target", "_blank");
  });
  it("shows 'Registration opens soon' without a (valid) link and 'ended' for past events", () => {
    const { rerender } = render(<RegisterButton dto={dto({ register_url: null })} />);
    expect(screen.getByText("Registration opens soon")).toBeInTheDocument();
    rerender(<RegisterButton dto={dto({ register_url: "javascript:alert(1)" })} />);
    expect(screen.getByText("Registration opens soon")).toBeInTheDocument();
    rerender(<RegisterButton dto={dto({ status: "past" })} />);
    expect(screen.getByText("This competition has ended")).toBeInTheDocument();
  });
});

describe("SourceList", () => {
  it("links safe sources to the original post and never renders unsafe URLs as links", () => {
    render(<SourceList dto={dto()} />);
    expect(screen.getByRole("link", { name: /Instagram post/ })).toHaveAttribute(
      "href",
      "https://ig.example/p/1",
    );
    expect(screen.getByText(/Submitted by a student/).closest("a")).toBeNull();
    expect(screen.getByText(/2 students confirmed it/)).toBeInTheDocument();
    expect(screen.getByText(/Not yet confirmed by the host/)).toBeInTheDocument();
  });
  it("renders nothing without sources", () => {
    const { container } = render(<SourceList dto={dto({ sources: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
