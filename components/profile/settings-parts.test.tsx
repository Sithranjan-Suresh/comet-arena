// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarFeedCard } from "@/components/profile/CalendarFeedCard";
import { DeleteAccount } from "@/components/profile/DeleteAccount";
import { ToastProvider } from "@/components/ui";

afterEach(() => vi.unstubAllGlobals());

describe("CalendarFeedCard", () => {
  it("shows the feed URL and rotates the token after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const newToken = "b".repeat(48);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ ics_token: newToken }) }) as Response),
    );
    render(
      <ToastProvider>
        <CalendarFeedCard appUrl="https://x.example" initialToken={"a".repeat(48)} />
      </ToastProvider>,
    );
    expect(screen.getByLabelText("Calendar feed URL")).toHaveValue(
      `https://x.example/api/calendar/${"a".repeat(48)}.ics`,
    );
    await userEvent.click(screen.getByRole("button", { name: "Generate new link" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Calendar feed URL")).toHaveValue(
        `https://x.example/api/calendar/${newToken}.ics`,
      ),
    );
  });

  it("does not rotate when the user cancels the confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ToastProvider>
        <CalendarFeedCard appUrl="https://x.example" initialToken={"a".repeat(48)} />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Generate new link" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("DeleteAccount", () => {
  it("requires typing DELETE before the destructive button is enabled", async () => {
    render(<DeleteAccount />);
    await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));
    const confirmBtn = screen.getByRole("button", { name: "Permanently delete" });
    expect(confirmBtn).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Type DELETE to confirm"), "delete");
    expect(confirmBtn).toBeDisabled(); // case-sensitive
    await userEvent.clear(screen.getByLabelText("Type DELETE to confirm"));
    await userEvent.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    expect(confirmBtn).toBeEnabled();
  });

  it("surfaces a failure without leaving the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as Response),
    );
    render(<DeleteAccount />);
    await userEvent.click(screen.getByRole("button", { name: "Delete my data" }));
    await userEvent.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await userEvent.click(screen.getByRole("button", { name: "Permanently delete" }));
    expect(await screen.findByText(/could not delete your account/i)).toBeInTheDocument();
  });
});
