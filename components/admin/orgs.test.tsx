// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));
import { OrgCsvImport } from "@/components/admin/OrgCsvImport";
import { OrgHandleRow } from "@/components/admin/OrgHandleRow";
import { ToastProvider } from "@/components/ui";

const respond = (body: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: status < 300, status, json: async () => body }) as Response),
  );
const calls = () =>
  (fetch as unknown as { mock: { calls: [string, { body: string; method: string }][] } }).mock
    .calls;
afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockClear();
});

describe("OrgHandleRow", () => {
  const org = {
    id: "10000000-0000-4000-8000-000000000001",
    name: "AIS",
    ig_handle: null,
    ig_account_type: "unknown",
  };
  it("saves a typed handle and account type", async () => {
    respond({ ig_handle: "ais_utd" });
    render(
      <ToastProvider>
        <OrgHandleRow org={org} />
      </ToastProvider>,
    );
    await userEvent.type(screen.getByLabelText("Instagram handle"), "@AIS_UTD");
    await userEvent.selectOptions(screen.getByLabelText("Account type"), "business");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(calls()[0][0]).toBe(`/api/admin/orgs/${org.id}`);
    expect(JSON.parse(calls()[0][1].body)).toEqual({
      ig_handle: "@AIS_UTD",
      ig_account_type: "business",
    });
  });
  it("clearing the field sends null; a server error is shown", async () => {
    respond({ message: "That is not a valid Instagram handle." }, 422);
    render(
      <ToastProvider>
        <OrgHandleRow org={{ ...org, ig_handle: "old" }} />
      </ToastProvider>,
    );
    await userEvent.clear(screen.getByLabelText("Instagram handle"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("That is not a valid Instagram handle.")).toBeInTheDocument();
    expect(JSON.parse(calls()[0][1].body).ig_handle).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("OrgCsvImport", () => {
  it("imports and reports skipped rows with line numbers", async () => {
    respond({
      updated: 2,
      unchanged: 1,
      skipped: [{ line: 4, reason: "Not a valid Instagram handle", value: "bad!" }],
    });
    render(<OrgCsvImport />);
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/CSV: club/), "ais,ais_utd");
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText("Updated 2, unchanged 1, skipped 1.")).toBeInTheDocument();
    expect(screen.getByText(/Line 4: Not a valid Instagram handle \(bad!\)/)).toBeInTheDocument();
    expect(JSON.parse(calls()[0][1].body)).toEqual({ csv: "ais,ais_utd" });
    expect(refresh).toHaveBeenCalled();
  });
  it("shows an error when the import fails", async () => {
    respond({ message: "Import failed part-way." }, 503);
    render(<OrgCsvImport />);
    await userEvent.type(screen.getByLabelText(/CSV: club/), "x,y");
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Import failed part-way.");
  });
});
