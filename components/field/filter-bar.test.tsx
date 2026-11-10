// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let current = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/field",
  useSearchParams: () => current,
}));

import { FilterBar } from "@/components/field/FilterBar";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  replace.mockClear();
  current = new URLSearchParams();
});
afterEach(() => vi.useRealTimers());

const lastUrl = () => replace.mock.calls.at(-1)![0] as string;

describe("FilterBar search debounce", () => {
  it("navigates once, after the user stops typing", async () => {
    render(<FilterBar />);
    const box = screen.getByLabelText("Search competitions");
    await userEvent.type(box, "pitch", { advanceTimers: vi.advanceTimersByTime });
    expect(replace).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(350));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(lastUrl()).toBe("/field?q=pitch");
  });

  it("uses the LATEST filters when the timer fires (a chip clicked mid-debounce is not lost)", async () => {
    const { rerender } = render(<FilterBar />);
    await userEvent.type(screen.getByLabelText("Search competitions"), "pit", {
      advanceTimers: vi.advanceTimersByTime,
    });
    // Within the 300 ms window another filter lands in the URL.
    current = new URLSearchParams("categories=hackathon");
    rerender(<FilterBar />);
    act(() => void vi.advanceTimersByTime(350));
    expect(lastUrl()).toContain("categories=hackathon");
    expect(lastUrl()).toContain("q=pit");
  });

  it("clearing the box removes q from the URL", async () => {
    current = new URLSearchParams("q=pitch&format=virtual");
    render(<FilterBar />);
    const box = screen.getByLabelText("Search competitions");
    expect(box).toHaveValue("pitch");
    await userEvent.clear(box);
    act(() => void vi.advanceTimersByTime(350));
    expect(lastUrl()).toBe("/field?format=virtual");
  });

  it("follows the URL when it changes elsewhere (Clear filters / back button)", () => {
    current = new URLSearchParams("q=pitch");
    const { rerender } = render(<FilterBar />);
    expect(screen.getByLabelText("Search competitions")).toHaveValue("pitch");
    current = new URLSearchParams();
    rerender(<FilterBar />);
    expect(screen.getByLabelText("Search competitions")).toHaveValue("");
    act(() => void vi.advanceTimersByTime(500));
    expect(replace).not.toHaveBeenCalled(); // syncing from the URL must not navigate again
  });

  it("toggling a category chip updates the URL immediately and keeps the search text", async () => {
    current = new URLSearchParams("q=pitch");
    render(<FilterBar />);
    await userEvent.click(screen.getByRole("button", { name: /^Hackathon$/ }));
    expect(lastUrl()).toBe("/field?q=pitch&categories=hackathon");
  });
});
