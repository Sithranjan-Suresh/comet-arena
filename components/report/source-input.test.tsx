// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The browser-only HEIC decoder: replaced so the conversion path runs without a real HEIC image.
vi.mock("heic2any", () => ({
  default: vi.fn(async () => new Blob([new Uint8Array(10)], { type: "image/jpeg" })),
}));

import { SourceInput } from "@/components/report/SourceInput";

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

const img = (name = "flyer.png", type = "image/png", size = 2000) =>
  new File([new Uint8Array(size)], name, { type });

describe("SourceInput: link mode", () => {
  it("shows 'Add a link or an image' when submitted empty, and a clear message for a bad link", async () => {
    const onSubmit = vi.fn();
    render(<SourceInput onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "Read it" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add a link or an image");
    await userEvent.type(screen.getByLabelText("Link to the post or page"), "instagram.com/p/abc");
    await userEvent.click(screen.getByRole("button", { name: "Read it" }));
    expect(screen.getByRole("alert")).toHaveTextContent("full link starting with https://");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid, trimmed link", async () => {
    const onSubmit = vi.fn();
    render(<SourceInput onSubmit={onSubmit} />);
    await userEvent.type(
      screen.getByLabelText("Link to the post or page"),
      "  https://www.instagram.com/p/abc/ ",
    );
    await userEvent.click(screen.getByRole("button", { name: "Read it" }));
    expect(onSubmit).toHaveBeenCalledWith({ url: "https://www.instagram.com/p/abc/" });
  });
});

describe("SourceInput: image mode", () => {
  async function toImageMode() {
    await userEvent.click(screen.getByRole("button", { name: "Upload a flyer" }));
  }

  it("previews a chosen image and submits the file", async () => {
    const onSubmit = vi.fn();
    render(<SourceInput onSubmit={onSubmit} />);
    await toImageMode();
    const f = img();
    await userEvent.upload(screen.getByLabelText("Flyer image file"), f);
    expect(await screen.findByAltText("Your flyer preview")).toHaveAttribute("src", "blob:preview");
    await userEvent.click(screen.getByRole("button", { name: "Read it" }));
    expect(onSubmit).toHaveBeenCalledWith({ file: f });
  });

  it("converts an iPhone HEIC photo to JPEG before accepting it", async () => {
    const onSubmit = vi.fn();
    render(<SourceInput onSubmit={onSubmit} />);
    await toImageMode();
    await userEvent.upload(
      screen.getByLabelText("Flyer image file"),
      img("IMG_2041.heic", "image/heic"),
    );
    await screen.findByAltText("Your flyer preview");
    await userEvent.click(screen.getByRole("button", { name: "Read it" }));
    const sent = onSubmit.mock.calls[0][0].file as File;
    expect(sent.name).toBe("IMG_2041.jpg");
    expect(sent.type).toBe("image/jpeg");
  });

  it("rejects an oversize or wrong-type file with a message and does not submit", async () => {
    const onSubmit = vi.fn();
    render(<SourceInput onSubmit={onSubmit} />);
    await toImageMode();
    // userEvent.upload filters by the accept attribute, so drop a wrong type via the drop zone instead
    const zone = screen.getByText(/Drag a flyer here/).closest("div")!;
    fireEvent.drop(zone, { dataTransfer: { files: [img("notes.pdf", "application/pdf")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Use a JPG, PNG or HEIC image");
    await userEvent.click(screen.getByRole("button", { name: "Read it" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("accepts a pasted screenshot anywhere in the form", async () => {
    render(<SourceInput onSubmit={vi.fn()} />);
    const shot = img("shot.png");
    fireEvent.paste(screen.getByRole("button", { name: "Read it" }), {
      clipboardData: { items: { length: 1, 0: { kind: "file", getAsFile: () => shot } } },
    });
    await waitFor(() => expect(screen.getByAltText("Your flyer preview")).toBeInTheDocument());
  });

  it("offers a camera input for phones and can remove the chosen file", async () => {
    render(<SourceInput onSubmit={vi.fn()} />);
    await toImageMode();
    expect(screen.getByLabelText("Take a photo of the flyer")).toHaveAttribute(
      "capture",
      "environment",
    );
    await userEvent.upload(screen.getByLabelText("Flyer image file"), img());
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(screen.queryByAltText("Your flyer preview")).not.toBeInTheDocument();
  });

  it("asks for an image when submitted with none", async () => {
    const onSubmit = vi.fn();
    render(<SourceInput onSubmit={onSubmit} />);
    await toImageMode();
    await userEvent.click(screen.getByRole("button", { name: "Read it" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add a link or an image");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
