// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadFlyerCases } from "@/lib/fixtures";

const postSubmission = vi.fn();
const postConfirm = vi.fn();
vi.mock("@/lib/submit/api", () => ({
  postSubmission: (...a: unknown[]) => postSubmission(...a),
  postConfirm: (...a: unknown[]) => postConfirm(...a),
}));

import { ReportFlow } from "@/components/report/ReportFlow";

const extraction = loadFlyerCases()[0].expected;
const C1 = "00000000-0000-4000-8000-0000000000c1"; // competition ids are UUIDs
const ready = (over = {}) => ({
  kind: "ready",
  submissionId: "s1",
  extraction,
  imageUrl: null,
  match: null,
  warning: null,
  ...over,
});

beforeEach(() => {
  postSubmission.mockReset();
  postConfirm.mockReset();
});

async function submitLink() {
  await userEvent.type(
    screen.getByLabelText("Link to the post or page"),
    "https://www.instagram.com/p/abc/",
  );
  await userEvent.click(screen.getByRole("button", { name: "Read it" }));
}

describe("ReportFlow", () => {
  it("link -> reading -> review -> publish -> success with a link to the Game Day page", async () => {
    postSubmission.mockResolvedValue(ready());
    postConfirm.mockResolvedValue({
      kind: "done",
      slug: "ais-fall-case-competition",
      outcome: "published",
    });
    render(<ReportFlow />);
    await submitLink();

    expect(await screen.findByLabelText("Title")).toHaveValue("AIS Fall Case Competition");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByRole("heading", { name: "It is on the field" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the Game Day page" })).toHaveAttribute(
      "href",
      "/game/ais-fall-case-competition",
    );
    expect(postConfirm).toHaveBeenCalledWith(
      "s1",
      expect.objectContaining({ title: "AIS Fall Case Competition", merge_into: null }),
    );
    expect(postSubmission).toHaveBeenCalledWith({ url: "https://www.instagram.com/p/abc/" });
  });

  it("a possible duplicate asks first; Yes merges into the existing competition", async () => {
    postSubmission.mockResolvedValue(
      ready({
        match: {
          id: C1,
          slug: "ais-case",
          title: "AIS Case",
          similarity: 0.95,
          confidence: "same",
        },
      }),
    );
    postConfirm.mockResolvedValue({ kind: "done", slug: "ais-case", outcome: "merged" });
    render(<ReportFlow />);
    await submitLink();

    expect(await screen.findByRole("heading", { name: "Same competition?" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument(); // the form waits behind the question
    await userEvent.click(screen.getByRole("button", { name: "Yes, same competition" }));
    await userEvent.click(await screen.findByRole("button", { name: "Confirm this competition" }));

    expect(
      await screen.findByRole("heading", { name: "Thanks, confirmation added" }),
    ).toBeInTheDocument();
    expect(postConfirm).toHaveBeenCalledWith("s1", expect.objectContaining({ merge_into: C1 }));
  });

  it("answering No publishes as a separate competition", async () => {
    postSubmission.mockResolvedValue(
      ready({
        match: {
          id: C1,
          slug: "ais-case",
          title: "AIS Case",
          similarity: 0.85,
          confidence: "maybe",
        },
      }),
    );
    postConfirm.mockResolvedValue({ kind: "done", slug: "new-one", outcome: "published" });
    render(<ReportFlow />);
    await submitLink();
    await userEvent.click(await screen.findByRole("button", { name: "No, it is a different one" }));
    await userEvent.click(await screen.findByRole("button", { name: "Publish" }));
    await screen.findByRole("heading", { name: "It is on the field" });
    expect(postConfirm).toHaveBeenCalledWith("s1", expect.objectContaining({ merge_into: null }));
  });

  it("a low-confidence read ends with 'We'll double-check this one' and no Game Day link", async () => {
    postSubmission.mockResolvedValue(ready());
    postConfirm.mockResolvedValue({
      kind: "queued",
      message: "It goes live once an admin has looked it over.",
    });
    render(<ReportFlow />);
    await submitLink();
    await userEvent.click(await screen.findByRole("button", { name: "Publish" }));
    expect(
      await screen.findByRole("heading", { name: "We'll double-check this one" }),
    ).toBeInTheDocument();
    expect(screen.getByText("It goes live once an admin has looked it over.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "See the Game Day page" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Report another" }));
  });

  it("shows a server rejection on the input step so the student can try another link", async () => {
    postSubmission.mockResolvedValue({
      kind: "error",
      message: "We could not read that link. Upload the flyer image instead.",
    });
    render(<ReportFlow />);
    await submitLink();
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not read that link");
    expect(screen.getByLabelText("Link to the post or page")).toBeInTheDocument();
  });

  it("when the AI is down the submission is queued and the student is told", async () => {
    postSubmission.mockResolvedValue({
      kind: "queued",
      message: "Saved, we'll finish reading it shortly.",
    });
    render(<ReportFlow />);
    await submitLink();
    expect(await screen.findByText("Saved, we'll finish reading it shortly.")).toBeInTheDocument();
  });

  it("server-side validation errors appear on the fields and the form stays editable", async () => {
    postSubmission.mockResolvedValue(ready());
    postConfirm.mockResolvedValue({
      kind: "invalid",
      errors: { title: "That title is not allowed" },
    });
    render(<ReportFlow />);
    await submitLink();
    await userEvent.click(await screen.findByRole("button", { name: "Publish" }));
    expect(await screen.findByText("That title is not allowed")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeEnabled();
  });

  it("a network or server failure on publish keeps the form and shows a message", async () => {
    postSubmission.mockResolvedValue(ready());
    postConfirm.mockResolvedValue({
      kind: "error",
      message: "Something went wrong. Please try again.",
    });
    render(<ReportFlow />);
    await submitLink();
    await userEvent.click(await screen.findByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Publish" })).toBeEnabled());
  });

  it("'Report another' starts over", async () => {
    postSubmission.mockResolvedValue(ready());
    postConfirm.mockResolvedValue({ kind: "done", slug: "x", outcome: "published" });
    render(<ReportFlow />);
    await submitLink();
    await userEvent.click(await screen.findByRole("button", { name: "Publish" }));
    await userEvent.click(await screen.findByRole("button", { name: "Report another" }));
    expect(screen.getByLabelText("Link to the post or page")).toHaveValue("");
  });
});
