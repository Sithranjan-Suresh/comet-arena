// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));
import { ReviewCard, type ReviewCardItem } from "@/components/admin/ReviewCard";
import { ToastProvider } from "@/components/ui";

const item: ReviewCardItem = {
  id: "10000000-0000-4000-8000-000000000001",
  kind: "possible_duplicate",
  extraction: {
    title: "Case Comp",
    host: "AIS",
    description: "Desc",
    prize: null,
    location: null,
    register_url: null,
    confidence: 0.85,
    stages: [{ name: "Reg", deadline_at: "2026-12-01T17:00:00Z" }],
  },
  sourceUrl: "https://www.instagram.com/p/x/",
  flyerUrl: "https://i.example/x.jpg",
  candidates: [
    {
      id: "20000000-0000-4000-8000-000000000002",
      slug: "case-comp",
      title: "Existing Case Comp",
      host_name: "AIS",
    },
  ],
};
const mount = (i = item) =>
  render(
    <ToastProvider>
      <ReviewCard item={i} />
    </ToastProvider>,
  );
const respond = (body: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: status < 300, status, json: async () => body }) as Response),
  );
afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe("ReviewCard", () => {
  it("shows the flyer next to the extracted fields and the original post link", () => {
    mount();
    expect(screen.getByRole("img", { name: /Source flyer for Case Comp/ })).toHaveAttribute(
      "src",
      "https://i.example/x.jpg",
    );
    expect(screen.getByRole("link", { name: "Open original post" })).toHaveAttribute(
      "rel",
      expect.stringContaining("noopener"),
    );
    expect(screen.getByText(/Possible duplicate/)).toBeInTheDocument();
  });

  it("never renders an unsafe image or link", () => {
    mount({ ...item, flyerUrl: "javascript:alert(1)", sourceUrl: "javascript:alert(1)" });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open original post" })).not.toBeInTheDocument();
  });

  it("approve posts the action and refreshes the queue", async () => {
    respond({ outcome: "published" });
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Approve as new" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = (fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock
      .calls[0];
    expect(url).toBe(`/api/admin/review/${item.id}`);
    expect(JSON.parse(init.body)).toEqual({ action: "approve" });
  });

  it("merge sends the chosen target", async () => {
    respond({ outcome: "merged" });
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Merge into this listing" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const init = (fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock
      .calls[0][1];
    expect(JSON.parse(init.body)).toEqual({ action: "merge", merge_into: item.candidates[0].id });
  });

  it("edit sends only the changed fields", async () => {
    respond({ outcome: "published" });
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const title = screen.getByLabelText("Title");
    await userEvent.clear(title);
    await userEvent.type(title, "Better Title");
    await userEvent.click(screen.getByRole("button", { name: "Save and publish" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const init = (fetch as unknown as { mock: { calls: [string, { body: string }][] } }).mock
      .calls[0][1];
    expect(JSON.parse(init.body)).toEqual({ action: "edit", edits: { title: "Better Title" } });
  });

  it("a failed action shows the server message and does not refresh", async () => {
    respond({ message: "Someone already handled this one." }, 409);
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(await screen.findByText("Someone already handled this one.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
