// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResumeExport } from "@/components/player/ResumeExport";
import { ToastProvider } from "@/components/ui";
import type { EntryRow } from "@/lib/entries";

const entry: EntryRow = {
  id: "e1",
  competition_id: "c",
  team_name: "Comet Coders",
  result: "second",
  rounds_advanced: 1,
  verified_by_host: false,
  points: null,
  season: "Fall 2026",
  created_at: "x",
  competition: { slug: "s", title: "AIS Case" },
};
const mount = (entries: EntryRow[]) =>
  render(
    <ToastProvider>
      <ResumeExport entries={entries} />
    </ToastProvider>,
  );

describe("ResumeExport", () => {
  it("copies the formatted list", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mount([entry]);
    await userEvent.click(screen.getByRole("button", { name: "Copy résumé list" }));
    expect(writeText).toHaveBeenCalledWith(
      "• AIS Case — 2nd place (Fall 2026), Comet Coders *\n\n* Self-reported",
    );
    expect(await screen.findByText("Résumé list copied")).toBeInTheDocument();
  });

  it("downloads a .txt file", async () => {
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mount([entry]);
    await userEvent.click(screen.getByRole("button", { name: "Download .txt" }));
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });

  it("tells the student when copying is blocked, and renders nothing without entries", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
      configurable: true,
    });
    const { unmount } = mount([entry]);
    await userEvent.click(screen.getByRole("button", { name: "Copy résumé list" }));
    expect(await screen.findByText(/Could not copy/)).toBeInTheDocument();
    unmount();
    const { container } = mount([]);
    expect(container.querySelector("button")).toBeNull();
  });
});
