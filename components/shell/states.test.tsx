// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ShellError from "@/app/(shell)/error";
import Loading from "@/app/(shell)/loading";
import { NotFoundView } from "@/components/shell/NotFoundView";

describe("shell state pages", () => {
  it("loading exposes a status region and skeleton cards", () => {
    render(<Loading />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "Loading competition" })).toHaveLength(6);
  });

  it("error shows a friendly alert and retries through reset()", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    render(<ShellError error={new Error("boom")} reset={reset} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/hit a snag/i);
    expect(screen.queryByText("boom")).not.toBeInTheDocument(); // never leak internals to users
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("not-found offers a way back to The Field", () => {
    render(<NotFoundView />);
    expect(screen.getByRole("link", { name: "Browse The Field" })).toHaveAttribute(
      "href",
      "/field",
    );
  });
});
