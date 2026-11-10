// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh, replace: vi.fn() }),
  usePathname: () => "/game/x",
}));
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ListingTrust } from "@/components/game-day/ListingTrust";
import { ToastProvider } from "@/components/ui";

const ID = "10000000-0000-4000-8000-000000000001";
const mount = (
  over: Partial<React.ComponentProps<typeof ListingTrust>> = {},
  user: { id: string; email: string } | null = { id: "u", email: "a@utdallas.edu" },
) =>
  render(
    <AuthProvider initialUser={user}>
      <ToastProvider>
        <ListingTrust competitionId={ID} title="Case Comp" unverified confirmations={1} {...over} />
      </ToastProvider>
    </AuthProvider>,
  );
const respond = (body: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: status < 300, status, json: async () => body }) as Response),
  );
const lastCall = () =>
  (fetch as unknown as { mock: { calls: [string, { body?: string }][] } }).mock.calls[0];
beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("ListingTrust", () => {
  it("shows the confirmation button and how many more are needed while unverified", () => {
    mount();
    expect(screen.getByRole("button", { name: "This looks right" })).toBeInTheDocument();
    expect(screen.getByText("2 more confirmations verifies it")).toBeInTheDocument();
  });

  it("verified listings only offer Report a problem", () => {
    mount({ unverified: false });
    expect(screen.queryByRole("button", { name: "This looks right" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Report a problem" })).toBeInTheDocument();
  });

  it("confirming posts to the API, thanks the student and refreshes the page", async () => {
    respond({ confirmations: 2, status: "unverified", already: false });
    mount();
    await userEvent.click(screen.getByRole("button", { name: "This looks right" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(lastCall()[0]).toBe(`/api/confirm/${ID}`);
    expect(await screen.findByText("Thanks for confirming")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmed" })).toBeDisabled();
  });

  it("the third confirmation says the listing is now verified", async () => {
    respond({ confirmations: 3, status: "live", already: false });
    mount({ confirmations: 2 });
    await userEvent.click(screen.getByRole("button", { name: "This looks right" }));
    expect(await screen.findByText("Thanks, that makes it verified")).toBeInTheDocument();
  });

  it("shows the server's reason when confirming is refused (own submission)", async () => {
    respond(
      { error: "own_submission", message: "You reported this one, so it already counts." },
      403,
    );
    mount();
    await userEvent.click(screen.getByRole("button", { name: "This looks right" }));
    expect(
      await screen.findByText("You reported this one, so it already counts."),
    ).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("signed out: both actions send the visitor to sign in and call nothing", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    mount({}, null);
    await userEvent.click(screen.getByRole("button", { name: "This looks right" }));
    await userEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    expect(push).toHaveBeenCalledTimes(2);
    expect(String(push.mock.calls[0][0])).toContain("/login");
    expect(f).not.toHaveBeenCalled();
  });

  it("the flag form sends the chosen problem and note", async () => {
    respond({ flagged: true }, 201);
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Report a problem" }));
    await userEvent.selectOptions(screen.getByLabelText("What is wrong?"), "link");
    await userEvent.type(screen.getByLabelText("Details (optional)"), "404 page");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Thanks, we will take a look")).toBeInTheDocument();
    expect(JSON.parse(lastCall()[1].body!)).toEqual({
      competition_id: ID,
      field: "link",
      note: "404 page",
    });
  });
});
