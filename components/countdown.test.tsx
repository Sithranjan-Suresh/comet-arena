// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Countdown } from "@/components/Countdown";

afterEach(() => vi.useRealTimers());

describe("Countdown", () => {
  it("shows LED digits with a spoken equivalent and a machine-readable time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
    render(<Countdown deadline="2026-11-13T16:12:00Z" />);
    const el = screen.getByText("03d 04h 12m");
    expect(el.tagName).toBe("TIME");
    expect(el).toHaveAttribute("aria-label", "3 days 4 hours until deadline");
    expect(el).toHaveAttribute("datetime", "2026-11-13T16:12:00Z");
  });

  it("ticks down each minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
    render(<Countdown deadline="2026-11-10T13:00:00Z" />);
    expect(screen.getByText("01h 00m")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByText("59m")).toBeInTheDocument();
  });

  it("shows Closed after the deadline", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
    render(<Countdown deadline="2026-11-09T12:00:00Z" />);
    expect(screen.getByText("CLOSED")).toBeInTheDocument();
  });

  it("server-renders the static CT deadline (no live digits, so no hydration mismatch)", () => {
    const html = renderToString(<Countdown deadline="2026-11-21T05:59:00Z" />);
    expect(html).toContain("Nov 20, 2026");
    expect(html).toContain("Deadline Nov 20, 2026, 11:59 PM CT");
    expect(html).not.toMatch(/\d\dd \d\dh/);
  });
});
