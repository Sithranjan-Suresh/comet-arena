// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GameCard } from "@/components/GameCard";
import type { GameCardDTO } from "@/lib/schemas";

const card = (over: Partial<GameCardDTO> = {}): GameCardDTO => ({
  id: "00000000-0000-4000-8000-000000000001",
  slug: "ais-fall-case",
  title: "AIS Fall Case Competition",
  host_name: "AIS",
  host_slug: "ais",
  categories: ["case_competition", "finance"],
  prize: "$2,500",
  status: "live",
  next_stage: {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Registration closes",
    starts_at: null,
    deadline_at: "2099-01-01T00:00:00Z",
    order: 1,
  },
  viewer_saved: false,
  ...over,
});

describe("GameCard", () => {
  it("links the title to the Game Day page and shows host, stage, prize and verification", () => {
    render(<GameCard card={card()} />);
    expect(screen.getByRole("link", { name: "AIS Fall Case Competition" })).toHaveAttribute(
      "href",
      "/game/ais-fall-case",
    );
    expect(screen.getByText("AIS")).toBeInTheDocument();
    expect(screen.getByText("Registration closes")).toBeInTheDocument();
    expect(screen.getByText("$2,500")).toBeInTheDocument();
    expect(screen.getAllByText(/Verified/).length).toBeGreaterThan(0);
  });

  it("renders when every optional field is missing", () => {
    render(
      <GameCard
        card={card({
          host_name: null,
          host_slug: null,
          prize: null,
          categories: [],
          next_stage: null,
          status: "unverified",
        })}
      />,
    );
    expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
    expect(screen.getByText("Dates not announced")).toBeInTheDocument();
    expect(screen.queryByLabelText("Categories")).not.toBeInTheDocument();
  });

  it("says 'expected again' for undated recurring competitions", () => {
    render(<GameCard card={card({ status: "expected", next_stage: null })} />);
    expect(screen.getByText(/Expected again, dates not announced/)).toBeInTheDocument();
  });

  it("shows at most three category badges and counts the rest", () => {
    render(
      <GameCard
        card={card({ categories: ["hackathon", "design", "speaking", "research", "finance"] })}
      />,
    );
    const list = screen.getByLabelText("Categories");
    expect(within(list).getAllByRole("listitem")).toHaveLength(4); // 3 badges + "+2 more"
    expect(within(list).getByText("+2 more")).toBeInTheDocument();
  });

  it("renders an action slot (Save button) that is separate from the card link", () => {
    render(<GameCard card={card()} action={<button>Save</button>} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AIS Fall Case Competition" })).not.toContainElement(
      screen.getByRole("button", { name: "Save" }),
    );
  });
});
