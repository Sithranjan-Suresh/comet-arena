// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CalendarSubscribe } from "@/components/schedule/CalendarSubscribe";
import { ToastProvider } from "@/components/ui";

const token = "c".repeat(48);
const mount = (appUrl: string) =>
  render(
    <ToastProvider>
      <CalendarSubscribe appUrl={appUrl} token={token} />
    </ToastProvider>,
  );

describe("CalendarSubscribe", () => {
  it("offers Google, Apple and Outlook subscribe links built from the personal feed", () => {
    mount("https://cometarena.example");
    const feed = `https://cometarena.example/api/calendar/${token}.ics`;
    expect(screen.getByRole("link", { name: "Add to Google Calendar" })).toHaveAttribute(
      "href",
      expect.stringContaining(
        encodeURIComponent(`webcal://cometarena.example/api/calendar/${token}.ics`),
      ),
    );
    expect(screen.getByRole("link", { name: /Apple Calendar/ })).toHaveAttribute(
      "href",
      `webcal://cometarena.example/api/calendar/${token}.ics`,
    );
    expect(screen.getByRole("link", { name: "Outlook" })).toHaveAttribute(
      "href",
      expect.stringContaining(encodeURIComponent(feed)),
    );
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("opens external subscribe flows safely", () => {
    mount("https://cometarena.example");
    for (const name of ["Add to Google Calendar", "Outlook"]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("warns that Google and Outlook cannot reach a local URL", () => {
    mount("http://localhost:3000");
    expect(screen.getByRole("note")).toHaveTextContent(/public URL/);
  });

  it("copies the feed link", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    mount("https://cometarena.example");
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(`https://cometarena.example/api/calendar/${token}.ics`);
    expect(await screen.findByText("Calendar link copied")).toBeInTheDocument();
  });
});
