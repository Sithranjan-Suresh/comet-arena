// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { ProfileForm } from "@/components/profile/ProfileForm";

const empty = {
  major: null,
  class_year: null,
  interests: [],
  roles: [],
  email_warnings: true,
  digest: true,
  public_results: false,
  onboarded: false,
};

function mockFetch(ok = true) {
  const fn = vi.fn(async () => ({ ok, status: ok ? 200 : 500 }) as Response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  push.mockClear();
  refresh.mockClear();
});

describe("ProfileForm (onboarding)", () => {
  it("submits the chosen profile, marks onboarded and continues to `next`", async () => {
    const fetchMock = mockFetch();
    render(<ProfileForm initial={empty} mode="onboarding" next="/game/abc" />);
    await userEvent.type(screen.getByLabelText("Major"), "Computer Science");
    await userEvent.click(screen.getByRole("radio", { name: "Junior" }));
    await userEvent.click(screen.getByRole("button", { name: "Hackathon" }));
    await userEvent.click(screen.getByRole("button", { name: "Developer" }));
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/me/profile");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({
      major: "Computer Science",
      class_year: "junior",
      interests: ["hackathon"],
      roles: ["dev"],
      onboarded: true,
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/game/abc"));
  });

  it("skip only marks the profile as onboarded", async () => {
    const fetchMock = mockFetch();
    render(<ProfileForm initial={empty} mode="onboarding" />);
    await userEvent.click(screen.getByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ onboarded: true });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("shows an error and stays on the page when saving fails", async () => {
    mockFetch(false);
    render(<ProfileForm initial={empty} mode="onboarding" />);
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("toggling a chip twice deselects it and exposes aria-pressed", async () => {
    mockFetch();
    render(<ProfileForm initial={empty} mode="onboarding" />);
    const chip = screen.getByRole("button", { name: "Hackathon" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("prefills from an existing profile", () => {
    mockFetch();
    render(
      <ProfileForm
        initial={{
          ...empty,
          major: "Finance",
          class_year: "senior",
          interests: ["finance"],
          roles: ["data"],
        }}
        mode="onboarding"
      />,
    );
    expect(screen.getByLabelText("Major")).toHaveValue("Finance");
    expect(screen.getByRole("radio", { name: "Senior" })).toHaveAttribute("aria-checked", "true");
    const interests = screen.getByRole("group", { name: /compete in/i });
    expect(within(interests).getByRole("button", { name: "Finance" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const roles = screen.getByRole("group", { name: /Roles you can play/i });
    expect(within(roles).getByRole("button", { name: "Data" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("ProfileForm (settings)", () => {
  it("shows notification toggles and sends them", async () => {
    const fetchMock = mockFetch();
    render(<ProfileForm initial={empty} mode="settings" />);
    expect(screen.queryByRole("button", { name: "Skip for now" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Deadline warnings/));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ email_warnings: false, digest: true });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
  });

  it("winner names are off by default and opting in is sent explicitly; onboarding never shows the option", async () => {
    const fetchMock = mockFetch();
    const { unmount } = render(<ProfileForm initial={empty} mode="settings" />);
    const box = screen.getByLabelText(/Show my first name and last initial/);
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ public_results: true });
    unmount();
    render(<ProfileForm initial={empty} mode="onboarding" />);
    expect(screen.queryByLabelText(/Show my first name/)).not.toBeInTheDocument();
  });
});
