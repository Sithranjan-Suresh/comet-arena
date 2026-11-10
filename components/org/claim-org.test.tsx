// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/org/ais",
}));
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ClaimOrgButton } from "@/components/org/ClaimOrgButton";
import { ToastProvider } from "@/components/ui";

const ORG = "10000000-0000-4000-8000-000000000001";
const json = (body: unknown, status = 200) =>
  ({ ok: status < 300, status, json: async () => body }) as Response;
const mount = (
  user: { id: string; email: string } | null = { id: "u", email: "a@utdallas.edu" },
  orgId = ORG,
) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthProvider initialUser={user}>
        <ToastProvider>
          <ClaimOrgButton orgId={orgId} orgName="AIS" />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
beforeEach(() => {
  push.mockClear();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(() => vi.unstubAllGlobals());

describe("ClaimOrgButton", () => {
  it("offers the claim, sends the request with a note and then shows it as pending", async () => {
    let state = { status: "none", claimed: false };
    const f = vi.fn(async (_u: string, init?: { method?: string; body?: string }) => {
      if (init?.method === "POST") {
        state = { status: "pending", claimed: false };
        return json({ status: "pending" }, 201);
      }
      return json(state);
    });
    vi.stubGlobal("fetch", f);
    mount();
    await userEvent.click(
      await screen.findByRole("button", { name: "Are you an officer? Claim this page" }),
    );
    await userEvent.type(screen.getByLabelText(/How can we confirm/), "I am the president");
    await userEvent.click(screen.getByRole("button", { name: "Send request" }));
    expect(
      await screen.findByText("Your request to run AIS is waiting for review."),
    ).toBeInTheDocument();
    const post = f.mock.calls.find((c) => c[1]?.method === "POST")!;
    expect(post[0]).toBe(`/api/orgs/${ORG}/claim`);
    expect(JSON.parse(post[1]!.body!)).toEqual({ note: "I am the president" });
  });

  it("an approved officer gets a link to the Front Office", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ status: "approved", claimed: true })),
    );
    mount();
    expect(await screen.findByRole("link", { name: "Open your Front Office" })).toHaveAttribute(
      "href",
      "/office",
    );
  });

  it("offers nothing when someone else already runs the org", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ status: "none", claimed: true })),
    );
    mount();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Claim this page/ })).not.toBeInTheDocument(),
    );
  });

  it("signed out: sends the visitor to sign in without calling the API; fixture orgs render nothing", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const { unmount } = mount(null);
    await userEvent.click(
      screen.getByRole("button", { name: "Are you an officer? Claim this page" }),
    );
    expect(push).toHaveBeenCalled();
    expect(f).not.toHaveBeenCalled();
    unmount();
    mount({ id: "u", email: "a@utdallas.edu" }, "fixture-ais");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
