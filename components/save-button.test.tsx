// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => "/field",
  useSearchParams: () => new URLSearchParams("categories=hackathon"),
}));

import { AuthProvider } from "@/components/auth/AuthProvider";
import { SaveButton } from "@/components/SaveButton";
import { ToastProvider } from "@/components/ui";
import { takePendingAction } from "@/lib/pending-action";

const ID = "00000000-0000-4000-8000-0000000000c1";
const OTHER = "00000000-0000-4000-8000-0000000000c2";

type Handler = (url: string, init?: RequestInit) => Promise<Partial<Response>>;
function mockServer(initial: string[], onWrite?: Handler) {
  let saved = [...initial];
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      if (method === "GET") return { ok: true, json: async () => ({ competition_ids: saved }) };
      if (onWrite) return onWrite(url, init);
      if (method === "POST") saved.push(JSON.parse(init!.body as string).competition_id);
      if (method === "DELETE") saved = saved.filter((s) => !url.endsWith(s));
      return { ok: true, json: async () => ({}) };
    }),
  );
  return calls;
}

function mount(
  ui: React.ReactNode,
  user: { id: string; email: string } | null = { id: "u1", email: "a@utdallas.edu" },
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider initialUser={user}>
        <ToastProvider>{ui}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  push.mockClear();
  sessionStorage.clear();
});

describe("SaveButton", () => {
  it("reflects the server state, and toggling is optimistic", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const calls = mockServer([], async () => (await gate, { ok: true, json: async () => ({}) }));
    mount(<SaveButton competitionId={ID} title="AIS Case" />);

    const btn = await screen.findByRole("button", { name: "Save AIS Case" });
    expect(btn).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(btn);

    // Flips immediately, before the POST has finished.
    expect(await screen.findByRole("button", { name: "Unsave AIS Case" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    release();
    await waitFor(() =>
      expect(calls.some((c) => c.method === "POST" && c.url === "/api/saves")).toBe(true),
    );
    expect(await screen.findByText(/Its deadlines are on your schedule/)).toBeInTheDocument();
  });

  it("starts pressed when already saved and unsaves with DELETE", async () => {
    const calls = mockServer([ID]);
    mount(<SaveButton competitionId={ID} title="AIS Case" />);
    const btn = await screen.findByRole("button", { name: "Unsave AIS Case" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(btn);
    expect(await screen.findByRole("button", { name: "Save AIS Case" })).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.some((c) => c.method === "DELETE" && c.url === `/api/saves/${ID}`)).toBe(true),
    );
  });

  it("rolls back and tells the user when the server rejects the save", async () => {
    mockServer([], async () => ({ ok: false, status: 500 }));
    mount(<SaveButton competitionId={ID} title="AIS Case" />);
    await userEvent.click(await screen.findByRole("button", { name: "Save AIS Case" }));
    expect(await screen.findByText(/Could not save/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Save AIS Case" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("signed out: sends the user to sign in, remembers the save, and makes no write", async () => {
    const calls = mockServer([]);
    mount(<SaveButton competitionId={ID} title="AIS Case" />, null);
    await userEvent.click(screen.getByRole("button", { name: "Save AIS Case" }));
    expect(push).toHaveBeenCalledWith("/login?next=%2Ffield%3Fcategories%3Dhackathon");
    expect(takePendingAction()).toEqual({ type: "save", competitionId: ID });
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("two buttons for the same competition share one state; others are unaffected", async () => {
    mockServer([]);
    mount(
      <>
        <SaveButton competitionId={ID} title="Card" />
        <SaveButton competitionId={ID} title="Page" />
        <SaveButton competitionId={OTHER} title="Other" />
      </>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Save Card" }));
    expect(await screen.findByRole("button", { name: "Unsave Page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Other" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
