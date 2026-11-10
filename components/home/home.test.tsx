// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { AuthProvider } from "@/components/auth/AuthProvider";
import { HomeSwitch } from "@/components/home/HomeSwitch";
import { ToastProvider } from "@/components/ui";

const card = (n: number, title: string) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  slug: `c${n}`,
  title,
  host_name: "AIS",
  host_slug: "ais",
  categories: ["hackathon"],
  prize: null,
  status: "live",
  next_stage: {
    id: `s${n}`,
    name: "Reg",
    starts_at: null,
    deadline_at: "2099-01-01T00:00:00Z",
    order: 1,
  },
  viewer_saved: false,
});
const json = (body: unknown, status = 200) =>
  ({ ok: status < 300, status, json: async () => body }) as Response;

function mount(user: { id: string; email: string } | null) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthProvider initialUser={user}>
        <ToastProvider>
          <HomeSwitch>
            <h1>Public hero</h1>
          </HomeSwitch>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => replace.mockClear());
afterEach(() => vi.unstubAllGlobals());

describe("HomeSwitch", () => {
  it("signed out: shows the public page and never calls the feed API", () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    mount(null);
    expect(screen.getByRole("heading", { name: "Public hero" })).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it("signed in: shows the ranked feed with reason chips instead of the hero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/saves")
          ? json({ competition_ids: [] })
          : json({
              items: [
                { card: card(1, "Hack Night"), reasons: ["closing_soon", "matches_interests"] },
              ],
              next_cursor: null,
              needs_onboarding: false,
            }),
      ),
    );
    mount({ id: "u1", email: "a@utdallas.edu" });
    expect(await screen.findByRole("heading", { name: "Scouting Report" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Public hero" })).not.toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Hack Night" })).toBeInTheDocument();
    expect(screen.getByText("Closing soon")).toBeInTheDocument();
    expect(screen.getByText("Matches your interests")).toBeInTheDocument();
  });

  it("loads more pages with the cursor", async () => {
    const f = vi.fn(async (url: string) => {
      if (url.startsWith("/api/saves")) return json({ competition_ids: [] });
      return url.includes("cursor=NEXT")
        ? json({
            items: [{ card: card(2, "Second Page"), reasons: ["open_to_all"] }],
            next_cursor: null,
            needs_onboarding: false,
          })
        : json({
            items: [{ card: card(1, "First Page"), reasons: ["open_to_all"] }],
            next_cursor: "NEXT",
            needs_onboarding: false,
          });
    });
    vi.stubGlobal("fetch", f);
    mount({ id: "u1", email: "a@utdallas.edu" });
    await screen.findByRole("link", { name: "First Page" });
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByRole("link", { name: "Second Page" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
  });

  it("sends a student who never finished onboarding there", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ items: [], next_cursor: null, needs_onboarding: true })),
    );
    mount({ id: "u1", email: "a@utdallas.edu" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding?next=%2F"));
  });

  it("empty and error states offer a next step", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ items: [], next_cursor: null, needs_onboarding: false })),
    );
    const { unmount } = mount({ id: "u1", email: "a@utdallas.edu" });
    expect(await screen.findByText("Nothing matches yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse The Field" })).toHaveAttribute(
      "href",
      "/field",
    );
    unmount();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({}, 503)),
    );
    mount({ id: "u1", email: "a@utdallas.edu" });
    expect(await screen.findByText("We could not load your Scouting Report.")).toBeInTheDocument();
  });
});
