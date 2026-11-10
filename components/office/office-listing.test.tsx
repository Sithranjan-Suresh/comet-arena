// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));
import { OfficeListing, type OfficeListingData } from "@/components/office/OfficeListing";
import { ToastProvider } from "@/components/ui";

const listing: OfficeListingData = {
  id: "10000000-0000-4000-8000-000000000001",
  slug: "ais-case",
  title: "AIS Case",
  status: "unverified",
  description: "Old",
  prize: null,
  location: null,
  register_url: null,
  stages: [{ name: "Registration", deadline_at: "2026-11-20T23:59:00-06:00" }],
};
const respond = (body: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: status < 300, status, json: async () => body }) as Response),
  );
const call = () =>
  (fetch as unknown as { mock: { calls: [string, { method: string; body: string }][] } }).mock
    .calls[0];
const mount = () =>
  render(
    <ToastProvider>
      <ul>
        <OfficeListing listing={listing} />
      </ul>
    </ToastProvider>,
  );

beforeEach(() => {
  refresh.mockClear();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(() => vi.unstubAllGlobals());

describe("OfficeListing", () => {
  it("sends only the fields that changed", async () => {
    respond({ status: "live", dates_changed: false });
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.type(screen.getByLabelText("Prize"), "$1,000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(call()[0]).toBe(`/api/office/competitions/${listing.id}`);
    expect(call()[1].method).toBe("PATCH");
    expect(JSON.parse(call()[1].body)).toEqual({ prize: "$1,000" });
    expect(await screen.findByText("Saved. This listing is now verified.")).toBeInTheDocument();
  });

  it("a changed date is sent as an ISO instant and the officer is told savers are notified", async () => {
    respond({ status: "live", dates_changed: true });
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const date = screen.getByLabelText("Registration (Central Time)");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-11-22T17:00");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/told about the new dates/)).toBeInTheDocument();
    expect(JSON.parse(call()[1].body)).toEqual({
      stages: [{ name: "Registration", deadline_at: "2026-11-22T23:00:00.000Z" }],
    });
  });

  it("no changes sends nothing", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Nothing changed.")).toBeInTheDocument();
    expect(f).not.toHaveBeenCalled();
  });

  it("uploads results CSV and reports counts and skipped lines", async () => {
    respond({
      matched: 2,
      unmatched: 1,
      skipped: [{ line: 4, reason: "Result must be one of", value: "champ" }],
    });
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Upload results" }));
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/CSV: email/), "a@utdallas.edu,1st");
    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(
      await screen.findByText(/Added 2 verified results. 1 row has no Comet Arena account yet./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Line 4: Result must be one of \(champ\)/)).toBeInTheDocument();
    expect(call()[0]).toBe(`/api/office/competitions/${listing.id}/results`);
    expect(JSON.parse(call()[1].body)).toEqual({ csv: "a@utdallas.edu,1st" });
  });

  it("a rejected upload shows the reason and the skipped lines", async () => {
    respond(
      {
        message: "No valid rows to upload.",
        skipped: [{ line: 1, reason: "Not a valid email address", value: "x" }],
      },
      422,
    );
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Upload results" }));
    await userEvent.type(screen.getByLabelText(/CSV: email/), "x,1st");
    await userEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(await screen.findByText("No valid rows to upload.")).toBeInTheDocument();
    expect(screen.getByText(/Line 1: Not a valid email address/)).toBeInTheDocument();
  });
});
