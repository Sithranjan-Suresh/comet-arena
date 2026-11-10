// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => "/game/ais-case",
  useSearchParams: () => new URLSearchParams(),
}));

import { AuthProvider } from "@/components/auth/AuthProvider";
import { FreeAgencyBoard } from "@/components/free-agency/FreeAgencyBoard";
import { ToastProvider } from "@/components/ui";
import type { Board } from "@/lib/board";

const C = "00000000-0000-4000-8000-0000000000c1";
const agent = (over = {}) => ({
  id: "a1",
  roles: ["dev"],
  note: "Python and React",
  created_at: "2026-11-10",
  display_name: "Ada",
  contact_email: "ada@utdallas.edu",
  is_mine: false,
  ...over,
});
const opening = (over = {}) => ({
  id: "o1",
  team_name: "Comet Coders",
  roles_needed: ["design"],
  note: "Need a designer",
  created_at: "2026-11-10",
  display_name: "Grace",
  contact_email: "grace@utdallas.edu",
  is_mine: false,
  ...over,
});

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
const json = (status: number, body: unknown) =>
  ({ ok: status < 300, status, json: async () => body }) as Response;
function server(board: Board, writes?: Handler) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
      if (method === "GET") return json(200, board);
      return writes ? writes(url, init) : json(201, {});
    }),
  );
  return calls;
}
function mount(
  user: { id: string; email: string } | null = { id: "u1", email: "me@utdallas.edu" },
  props: Partial<Parameters<typeof FreeAgencyBoard>[0]> = {},
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialUser={user}>
        <ToastProvider>
          <FreeAgencyBoard
            slug="ais-case"
            competitionId={C}
            title="AIS Case"
            registrationClosed={false}
            {...props}
          />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => push.mockClear());
afterEach(() => vi.unstubAllGlobals());

describe("FreeAgencyBoard: reading", () => {
  it("lists free agents with a contact reveal for signed-in students", async () => {
    server({ free_agents: [agent()], openings: [opening()] });
    mount();
    expect(await screen.findByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("Python and React")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Contact" }));
    expect(screen.getByRole("link", { name: "ada@utdallas.edu" })).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:ada@utdallas.edu"),
    );
  });

  it("never shows an email to signed-out visitors, and invites them to sign in", async () => {
    server({ free_agents: [agent({ contact_email: null })], openings: [] });
    mount(null);
    await screen.findByText("Ada");
    expect(screen.queryByRole("button", { name: "Contact" })).not.toBeInTheDocument();
    expect(screen.getByText(/Sign in to see how to reach them/)).toBeInTheDocument();
  });

  it("switches to team openings and counts both tabs", async () => {
    server({ free_agents: [agent()], openings: [opening()] });
    mount();
    await screen.findByText("Ada");
    expect(screen.getByRole("tab", { name: "Free agents (1)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.click(screen.getByRole("tab", { name: "Team openings (1)" }));
    expect(screen.getByText("Comet Coders")).toBeInTheDocument();
    expect(screen.getByText("Need a designer")).toBeInTheDocument();
  });

  it("filters by role through the API", async () => {
    const calls = server({ free_agents: [], openings: [] });
    mount();
    await screen.findByText("No free agents yet");
    await userEvent.click(screen.getByRole("button", { name: "Designer" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/board?role=design"))).toBe(true));
    expect(await screen.findByText(/No one is offering that role/)).toBeInTheDocument();
  });

  it("shows a retryable error when the board cannot load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(503, {})),
    );
    mount();
    expect(await screen.findByText("We could not load the board.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("FreeAgencyBoard: posting", () => {
  it("posts as a free agent: validates roles, then sends and confirms", async () => {
    const calls = server({ free_agents: [], openings: [] });
    mount();
    await screen.findByText("No free agents yet");
    await userEvent.click(screen.getByRole("button", { name: "I need a team" }));
    const dialog = await screen.findByRole("dialog", { name: "Post as a free agent" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Post" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Pick at least one role you can play",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Developer" }));
    await userEvent.type(within(dialog).getByLabelText("Note (optional)"), "React and Python");
    await userEvent.click(within(dialog).getByRole("button", { name: "Post" }));
    expect(await screen.findByText("Posted.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      url: "/api/free-agents",
      body: { competition_id: C, roles: ["dev"], note: "React and Python" },
    });
  });

  it("a team opening needs a name and a role", async () => {
    const calls = server({ free_agents: [], openings: [] });
    mount();
    await screen.findByText("No free agents yet");
    await userEvent.click(screen.getByRole("button", { name: "My team needs people" }));
    const dialog = await screen.findByRole("dialog", { name: "Post a team opening" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Post" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Name your team");
    await userEvent.type(within(dialog).getByLabelText("Team name"), "Comet Coders");
    await userEvent.click(within(dialog).getByRole("button", { name: "Data" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Post" }));
    await screen.findByText("Posted.");
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      url: "/api/team-openings",
      body: { team_name: "Comet Coders", roles_needed: ["data"] },
    });
  });

  it("shows the server's reason in the dialog when posting is refused", async () => {
    server({ free_agents: [], openings: [] }, () =>
      json(409, {
        message: "Registration for this competition has closed, so new posts are closed too.",
      }),
    );
    mount();
    await screen.findByText("No free agents yet");
    await userEvent.click(screen.getByRole("button", { name: "I need a team" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Developer" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Post" }));
    expect(
      await within(dialog).findByText(/Registration for this competition has closed/),
    ).toBeInTheDocument();
  });

  it("signed out: Post sends the visitor to sign in instead of opening the form", async () => {
    server({ free_agents: [], openings: [] });
    mount(null);
    await screen.findByText("No free agents yet");
    await userEvent.click(screen.getByRole("button", { name: "I need a team" }));
    expect(push).toHaveBeenCalledWith("/login?next=%2Fgame%2Fais-case");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("registration closed: no post buttons, with an explanation", async () => {
    server({ free_agents: [], openings: [] });
    mount({ id: "u1", email: "me@utdallas.edu" }, { registrationClosed: true });
    await screen.findByText("No free agents yet");
    expect(screen.queryByRole("button", { name: "I need a team" })).not.toBeInTheDocument();
    expect(screen.getByText(/posting is closed too/)).toBeInTheDocument();
  });
});

describe("FreeAgencyBoard: your own posts", () => {
  it("shows 'Close my post' instead of Contact and closes via PATCH", async () => {
    const calls = server({ free_agents: [agent({ is_mine: true })], openings: [] });
    mount();
    expect(await screen.findByText(/\(you\)/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Contact" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close my post" }));
    await screen.findByText("Closed.");
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({
      url: "/api/free-agents/a1",
      body: { status: "closed" },
    });
  });
});

describe("Suggested matches", () => {
  it("a free agent sees teams that need their role, with what they cover and what is still missing", async () => {
    server({
      free_agents: [agent({ id: "mine", is_mine: true, roles: ["dev"] })],
      openings: [
        opening({ id: "o1", team_name: "Comet Coders", roles_needed: ["dev", "pm"] }),
        opening({ id: "o2", team_name: "Designers Only", roles_needed: ["design"] }),
      ],
    });
    mount();
    const panel = await screen.findByRole("region", { name: "Suggested matches" });
    expect(within(panel).getByText("Comet Coders")).toBeInTheDocument();
    expect(
      within(panel).getByText(/You cover Developer; they still need Product \/ PM/),
    ).toBeInTheDocument();
    expect(within(panel).queryByText("Designers Only")).not.toBeInTheDocument();
  });

  it("a team lead sees free agents who fit their opening", async () => {
    server({
      free_agents: [
        agent({ id: "a1", display_name: "Ada", roles: ["design"] }),
        agent({ id: "a2", display_name: "Bo", roles: ["pm"] }),
      ],
      openings: [
        opening({ id: "mine", is_mine: true, team_name: "My Team", roles_needed: ["design"] }),
      ],
    });
    mount();
    const panel = await screen.findByRole("region", { name: "Suggested matches" });
    expect(within(panel).getByText("Ada")).toBeInTheDocument();
    expect(within(panel).queryByText("Bo")).not.toBeInTheDocument();
  });

  it("shows nothing for visitors, or when the student has no post, or nothing fits", async () => {
    server({ free_agents: [agent()], openings: [opening()] });
    mount(null);
    await screen.findByText("Ada");
    expect(screen.queryByRole("region", { name: "Suggested matches" })).not.toBeInTheDocument();
  });

  it("Contact reveals the email only after a click", async () => {
    server({
      free_agents: [agent({ id: "mine", is_mine: true, roles: ["design"] })],
      openings: [
        opening({
          id: "o1",
          team_name: "Team Z",
          roles_needed: ["design"],
          contact_email: "grace@utdallas.edu",
        }),
      ],
    });
    mount();
    const panel = await screen.findByRole("region", { name: "Suggested matches" });
    expect(within(panel).queryByText("grace@utdallas.edu")).not.toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Contact" }));
    expect(within(panel).getByText("grace@utdallas.edu")).toBeInTheDocument();
  });
});
