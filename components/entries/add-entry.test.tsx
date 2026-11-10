// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => "/game/ais-case",
  useSearchParams: () => new URLSearchParams(),
}));

import { AuthProvider } from "@/components/auth/AuthProvider";
import { AddEntryDialog } from "@/components/entries/AddEntryDialog";
import { ToastProvider } from "@/components/ui";

const C = "00000000-0000-4000-8000-0000000000c1";
const json = (status: number, body: unknown) =>
  ({ ok: status < 300, status, json: async () => body }) as Response;

function server(entries: unknown[] = [], write?: () => Response) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
      return method === "GET" ? json(200, { entries }) : (write?.() ?? json(201, {}));
    }),
  );
  return calls;
}
function mount(
  user: { id: string; email: string } | null = { id: "u1", email: "me@utdallas.edu" },
  stageCount = 4,
) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AuthProvider initialUser={user}>
        <ToastProvider>
          <AddEntryDialog competitionId={C} title="AIS Case" stageCount={stageCount} />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => push.mockClear());
afterEach(() => vi.unstubAllGlobals());

describe("AddEntryDialog", () => {
  it("logs a result: pick the outcome, rounds and team, then it is saved as unverified", async () => {
    const calls = server();
    mount();
    await userEvent.click(screen.getByRole("button", { name: "I competed" }));
    const dialog = await screen.findByRole("dialog", { name: "Add to your Player Card" });
    await userEvent.selectOptions(within(dialog).getByLabelText("How did it go?"), "second");
    await userEvent.clear(within(dialog).getByLabelText("Rounds advanced"));
    await userEvent.type(within(dialog).getByLabelText("Rounds advanced"), "2");
    await userEvent.type(within(dialog).getByLabelText("Team name (optional)"), "Comet Coders");
    expect(within(dialog).getByText(/unverified/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved to your Player Card.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      url: "/api/entries",
      body: { competition_id: C, result: "second", rounds_advanced: 2, team_name: "Comet Coders" },
    });
  });

  it("rejects out-of-range rounds before sending anything", async () => {
    const calls = server();
    mount(undefined, 3); // 3 stages -> at most 2 rounds advanced
    await userEvent.click(screen.getByRole("button", { name: "I competed" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.clear(within(dialog).getByLabelText("Rounds advanced"));
    await userEvent.type(within(dialog).getByLabelText("Rounds advanced"), "9");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("from 0 to 2");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("an existing result turns the button into Edit and prefills the form", async () => {
    server([
      {
        id: "e1",
        competition_id: C,
        team_name: "Comet Coders",
        result: "finalist",
        rounds_advanced: 2,
      },
    ]);
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Edit my result" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit your result" });
    expect(within(dialog).getByLabelText("How did it go?")).toHaveValue("finalist");
    expect(within(dialog).getByLabelText("Team name (optional)")).toHaveValue("Comet Coders");
  });

  it("shows the server's message when saving fails, keeping the dialog open", async () => {
    server([], () => json(500, { message: "Something went wrong. Please try again." }));
    mount();
    await userEvent.click(screen.getByRole("button", { name: "I competed" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("signed out: sends the visitor to sign in instead of opening the dialog", async () => {
    server();
    mount(null);
    await userEvent.click(screen.getByRole("button", { name: "I competed" }));
    expect(push).toHaveBeenCalledWith("/login?next=%2Fgame%2Fais-case");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
