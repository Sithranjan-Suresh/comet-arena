// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { EntryList } from "@/components/player/EntryList";
import { PlayerCard } from "@/components/player/PlayerCard";
import { ToastProvider } from "@/components/ui";
import type { EntryRow } from "@/lib/entries";

afterEach(() => vi.unstubAllGlobals());

const entry = (over: Partial<EntryRow> = {}): EntryRow => ({
  id: "e1",
  competition_id: "c1",
  team_name: "Comet Coders",
  result: "second",
  rounds_advanced: 2,
  verified_by_host: false,
  points: null,
  season: "Fall 2026",
  created_at: "2026-11-10",
  competition: { slug: "ais-case", title: "AIS Case" },
  ...over,
});
const wrap = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);

describe("PlayerCard", () => {
  it("shows name, major and year, and the four stats", () => {
    render(
      <PlayerCard
        name="Ada Lovelace"
        major="Computer Science"
        classYear="junior"
        stats={{ entered: 7, advanced: 3, podiums: 2, wins: 1, verified: 1 }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByText("Computer Science · Junior")).toBeInTheDocument();
    for (const [label, n] of [
      ["Entered", "7"],
      ["Advanced", "3"],
      ["Podiums", "2"],
      ["Wins", "1"],
    ]) {
      expect(screen.getByText(label).previousSibling).toHaveTextContent(n);
    }
    expect(screen.getByText("1 host-verified")).toBeInTheDocument();
  });

  it("prompts for a major when none is set", () => {
    render(
      <PlayerCard
        name="Ada"
        major={null}
        classYear={null}
        stats={{ entered: 0, advanced: 0, podiums: 0, wins: 0, verified: 0 }}
      />,
    );
    expect(screen.getByText("Add your major in Settings")).toBeInTheDocument();
  });
});

describe("EntryList", () => {
  it("labels each result, links to the competition and says unverified", () => {
    wrap(<EntryList entries={[entry()]} />);
    expect(screen.getByRole("link", { name: "AIS Case" })).toHaveAttribute(
      "href",
      "/game/ais-case",
    );
    expect(
      screen.getByText(/2nd place · 2 rounds advanced · Comet Coders · Fall 2026/),
    ).toBeInTheDocument();
    expect(screen.getByText("Unverified")).toBeInTheDocument();
  });

  it("host-verified results cannot be removed by the student", () => {
    wrap(<EntryList entries={[entry({ verified_by_host: true })]} />);
    expect(screen.getByText("✓ Verified by host")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
  });

  it("removes a self-reported result after confirmation and refreshes the page", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const f = vi.fn(
      async () => ({ ok: true, status: 200, json: async () => ({ deleted: true }) }) as Response,
    );
    vi.stubGlobal("fetch", f);
    wrap(<EntryList entries={[entry()]} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove AIS Case" }));
    expect(await screen.findByText("Removed.")).toBeInTheDocument();
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe("/api/entries/e1");
    expect(refresh).toHaveBeenCalled();
  });

  it("does nothing when the confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    wrap(<EntryList entries={[entry()]} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove AIS Case" }));
    expect(f).not.toHaveBeenCalled();
  });

  it("copes with a removed competition", () => {
    wrap(<EntryList entries={[entry({ competition: null })]} />);
    expect(screen.getByText("Competition removed")).toBeInTheDocument();
  });
});
