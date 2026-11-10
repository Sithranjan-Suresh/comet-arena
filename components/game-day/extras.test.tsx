// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PastWinners, PrepResources } from "@/components/game-day/Extras";
import { PlayerCard } from "@/components/player/PlayerCard";
import { computeBadges } from "@/lib/awards";

describe("PastWinners", () => {
  it("lists placings in order with names only where students opted in", () => {
    render(
      <PastWinners
        winners={[
          { place: "first", team_name: null, display: "Ada L.", season: "Fall 2026" },
          { place: "second", team_name: "Team Bo", display: null, season: "Fall 2026" },
          { place: "third", team_name: null, display: null, season: "Fall 2026" },
        ]}
      />,
    );
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("1st place");
    expect(items[0]).toContain("Ada L.");
    expect(items[1]).toContain("Team Bo");
    expect(items[2]).toContain("A UTD student");
    expect(screen.getByText("Results confirmed by the host.")).toBeInTheDocument();
  });
  it("renders nothing without winners", () => {
    const { container } = render(<PastWinners winners={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PrepResources", () => {
  it("renders safe links that open in a new tab and drops unsafe ones to plain text", () => {
    render(
      <PrepResources
        resources={[
          { id: "1", label: "Rubric", url: "https://example.com/r" },
          { id: "2", label: "Sneaky", url: "javascript:alert(1)" },
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: "Rubric" });
    expect(link).toHaveAttribute("href", "https://example.com/r");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.queryByRole("link", { name: "Sneaky" })).not.toBeInTheDocument();
    expect(screen.getByText("Sneaky")).toBeInTheDocument();
  });
  it("renders nothing without resources", () => {
    const { container } = render(<PrepResources resources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PlayerCard badges", () => {
  it("shows earned badges with their meaning for screen readers", () => {
    const entries = [{ result: "first" as const, rounds_advanced: 0, verified_by_host: true }];
    render(
      <PlayerCard
        name="Ada"
        major={null}
        classYear={null}
        stats={{ entered: 1, advanced: 1, podiums: 1, wins: 1, verified: 1 }}
        badges={computeBadges(entries)}
      />,
    );
    const list = screen.getByRole("list", { name: "Badges" });
    expect(list).toHaveTextContent("Champion");
    expect(list).toHaveTextContent("Won a competition");
  });
  it("shows no badge list for a new player", () => {
    render(
      <PlayerCard
        name="Ada"
        major={null}
        classYear={null}
        stats={{ entered: 0, advanced: 0, podiums: 0, wins: 0, verified: 0 }}
      />,
    );
    expect(screen.queryByRole("list", { name: "Badges" })).not.toBeInTheDocument();
  });
});
