// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DuplicatePrompt } from "@/components/report/DuplicatePrompt";

const ID = "00000000-0000-4000-8000-0000000000c1";
const match = (confidence: "same" | "maybe" = "same") => ({
  id: ID,
  slug: "ais-case",
  title: "AIS Fall Case Competition",
  confidence,
});

describe("DuplicatePrompt", () => {
  it("asks 'Same competition?', names the existing listing and links to it in a new tab", () => {
    render(<DuplicatePrompt match={match()} onYes={vi.fn()} onNo={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Same competition?" })).toBeInTheDocument();
    expect(screen.getByText("AIS Fall Case Competition")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Check the existing listing/ });
    expect(link).toHaveAttribute("href", "/game/ais-case");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("Yes passes the existing competition's id (add a confirmation, no duplicate)", async () => {
    const onYes = vi.fn();
    render(<DuplicatePrompt match={match()} onYes={onYes} onNo={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Yes, same competition" }));
    expect(onYes).toHaveBeenCalledWith(ID);
  });

  it("No keeps the submission as its own competition", async () => {
    const onNo = vi.fn();
    const onYes = vi.fn();
    render(<DuplicatePrompt match={match()} onYes={onYes} onNo={onNo} />);
    await userEvent.click(screen.getByRole("button", { name: "No, it is a different one" }));
    expect(onNo).toHaveBeenCalledOnce();
    expect(onYes).not.toHaveBeenCalled();
  });

  it("is more tentative for an ambiguous match", () => {
    const { rerender } = render(
      <DuplicatePrompt match={match("same")} onYes={vi.fn()} onNo={vi.fn()} />,
    );
    expect(screen.getByText(/looks like one we already list/)).toBeInTheDocument();
    rerender(<DuplicatePrompt match={match("maybe")} onYes={vi.fn()} onNo={vi.fn()} />);
    expect(screen.getByText(/might be one we already list/)).toBeInTheDocument();
  });

  it("disables the choices while a request is in flight", () => {
    render(<DuplicatePrompt match={match()} onYes={vi.fn()} onNo={vi.fn()} busy />);
    expect(screen.getByRole("button", { name: "Yes, same competition" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "No, it is a different one" })).toBeDisabled();
  });
});
