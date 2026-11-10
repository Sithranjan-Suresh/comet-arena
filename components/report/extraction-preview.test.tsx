// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExtractionPreview,
  READING_TIMEOUT_MS,
  type PreviewState,
} from "@/components/report/ExtractionPreview";
import { loadFlyerCases } from "@/lib/fixtures";

const ex = (id: string) => loadFlyerCases().find((c) => c.id === id)!.expected;
const ready = (
  id = "f01-ais-case",
  warning: "recap" | "not_a_competition" | null = null,
): PreviewState => ({ status: "ready", extraction: ex(id), warning });

afterEach(() => vi.useRealTimers());

function mount(state: PreviewState, extra: Partial<Parameters<typeof ExtractionPreview>[0]> = {}) {
  const onConfirm = vi.fn();
  const onStartManual = vi.fn();
  const utils = render(
    <ExtractionPreview
      state={state}
      onConfirm={onConfirm}
      onStartManual={onStartManual}
      {...extra}
    />,
  );
  return { onConfirm, onStartManual, ...utils };
}

describe("reading state", () => {
  it("shows skeleton fields and 'Reading the flyer…', then offers manual entry after 10 s", () => {
    vi.useFakeTimers();
    const { onStartManual } = mount({ status: "reading" });
    expect(screen.getByRole("status")).toHaveTextContent("Reading the flyer…");
    expect(screen.queryByRole("button", { name: "Fill it in myself" })).not.toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(READING_TIMEOUT_MS + 100));
    screen.getByRole("button", { name: "Fill it in myself" }).click();
    expect(onStartManual).toHaveBeenCalledOnce();
  });
});

describe("queued state", () => {
  it("tells the student it was saved and links back to The Field", () => {
    mount({ status: "queued", message: "Saved, we'll finish reading it shortly." });
    expect(screen.getByRole("status")).toHaveTextContent("Saved, we'll finish reading it shortly.");
    expect(screen.getByRole("link", { name: "Back to The Field" })).toHaveAttribute(
      "href",
      "/field",
    );
  });
});

describe("ready state", () => {
  it("fills every field from the extraction, all editable", () => {
    mount(ready());
    expect(screen.getByLabelText("Title")).toHaveValue("AIS Fall Case Competition");
    expect(screen.getByLabelText("Host (club or organization)")).toHaveValue("AIS");
    expect(screen.getByLabelText("Registration link")).toHaveValue(
      "https://example.com/register/ais-fall-case",
    );
    expect(screen.getByRole("button", { name: "Case comp" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Round 1 name")).toHaveValue("Registration closes");
    expect(screen.getByLabelText("Smallest team")).toHaveValue(3);
    expect(screen.getAllByLabelText("Due / ends")).toHaveLength(3);
  });

  it("converts rounds to Central Time wall clock for the inputs", () => {
    mount(ready());
    expect(screen.getAllByLabelText("Due / ends")[0]).toHaveValue("2026-11-20T23:59");
  });

  it("submits the edited values as a validated payload", async () => {
    const { onConfirm } = mount(ready());
    await userEvent.clear(screen.getByLabelText("Title"));
    await userEvent.type(screen.getByLabelText("Title"), "AIS Case Comp (edited)");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    const input = onConfirm.mock.calls[0][0];
    expect(input).toMatchObject({
      title: "AIS Case Comp (edited)",
      categories: ["case_competition", "finance"],
      merge_into: null,
    });
    expect(input.stages[0]).toMatchObject({
      name: "Registration closes",
      deadline_at: "2026-11-21T05:59:00.000Z",
    });
  });

  it("blocks submit with field errors and moves focus to the first invalid field", async () => {
    const { onConfirm } = mount(ready());
    await userEvent.clear(screen.getByLabelText("Title"));
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(onConfirm).not.toHaveBeenCalled();
    const title = screen.getByLabelText("Title");
    expect(title).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveFocus();
    expect(screen.getByText("Add a title")).toBeInTheDocument();
  });

  it("requires a register link or the 'no link yet' box (the ticked box unblocks it)", async () => {
    const { onConfirm } = mount(ready());
    await userEvent.clear(screen.getByLabelText("Registration link"));
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(screen.getByText(/Add the registration link, or tick/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/No link yet/));
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("edits rounds: add, move and remove", async () => {
    mount(ready());
    expect(screen.getAllByLabelText(/Round \d name/)).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "Add a round" }));
    expect(screen.getAllByLabelText(/Round \d name/)).toHaveLength(4);
    await userEvent.click(screen.getByRole("button", { name: "Move round 2 up" }));
    expect(screen.getByLabelText("Round 1 name")).toHaveValue("Case released");
    await userEvent.click(screen.getByRole("button", { name: "Remove round 4" }));
    expect(screen.getAllByLabelText(/Round \d name/)).toHaveLength(3);
    // first row cannot move up, last cannot move down
    expect(screen.getByRole("button", { name: "Move round 1 up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move round 3 down" })).toBeDisabled();
  });

  it("will not remove the only remaining round", () => {
    mount({ status: "manual" });
    expect(screen.getByRole("button", { name: "Remove round 1" })).toBeDisabled();
  });
});

describe("uncertainty and warnings", () => {
  it("shows the low-confidence note and flags the fields the model was unsure about", () => {
    mount(ready("f14-messy"));
    expect(screen.getByText(/not fully sure about this one/i)).toBeInTheDocument();
    expect(screen.getAllByText(/We were not sure about this one/).length).toBeGreaterThan(0);
  });

  it("a clean extraction shows no uncertainty notes", () => {
    mount(ready("f01-ais-case"));
    expect(screen.queryByText(/not fully sure/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/We were not sure about this one/)).not.toBeInTheDocument();
  });

  it("warns about recaps and non-competitions but still lets the student continue", () => {
    const { unmount } = mount(ready("f01-ais-case", "recap"));
    expect(screen.getByRole("note")).toHaveTextContent(/results post/);
    unmount();
    mount(ready("f01-ais-case", "not_a_competition"));
    expect(screen.getByRole("note")).toHaveTextContent(/does not look like a competition/);
    expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled();
  });

  it("manual entry explains why and starts blank", () => {
    mount({ status: "manual", reason: "failed validation twice" });
    expect(screen.getByRole("note")).toHaveTextContent(
      /could not read this one automatically \(failed validation twice\)/,
    );
    expect(screen.getByLabelText("Title")).toHaveValue("");
  });
});

describe("server feedback and merge mode", () => {
  it("shows server-side field errors next to the fields", () => {
    mount(ready(), {
      serverErrors: {
        title: "That title is already taken",
        "stages.0.deadline_at": "This competition has already ended.",
      },
    });
    expect(screen.getByText("That title is already taken")).toBeInTheDocument();
    expect(screen.getByText("This competition has already ended.")).toBeInTheDocument();
  });

  it("merge mode relabels the button and sends merge_into", async () => {
    const id = "00000000-0000-4000-8000-0000000000c1";
    const { onConfirm } = mount(ready(), { mergeInto: id });
    await userEvent.click(screen.getByRole("button", { name: "Confirm this competition" }));
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ merge_into: id });
  });

  it("shows the submitted flyer beside the form", () => {
    mount(ready(), { imageUrl: "https://cdn.example/f.png" });
    const aside = screen.getByRole("complementary", { name: "Your flyer" });
    expect(within(aside).getByAltText("The flyer you submitted")).toHaveAttribute(
      "src",
      "https://cdn.example/f.png",
    );
  });
});

describe("errors on fields without an input", () => {
  it("never fails silently: a bad merge target is explained", async () => {
    const { onConfirm } = mount(ready(), { mergeInto: "not-a-uuid" });
    await userEvent.click(screen.getByRole("button", { name: "Confirm this competition" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not link this to the existing listing/,
    );
  });
});
