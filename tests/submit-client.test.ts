import { describe, expect, it, vi } from "vitest";
import {
  MAX_IMAGE_BYTES,
  MESSAGES,
  convertHeicToJpeg,
  firstImageFile,
  isHeic,
  isSupportedImage,
  prepareImage,
  validateImageFile,
  validateUrl,
} from "@/lib/submit/client";

const file = (name: string, type: string, size = 100) =>
  new File([new Uint8Array(size)], name, { type });

describe("image type detection", () => {
  it("recognizes JPEG/PNG and HEIC by type or by extension (phones often leave type empty)", () => {
    expect(isSupportedImage(file("a.jpg", "image/jpeg"))).toBe(true);
    expect(isSupportedImage(file("a.PNG", ""))).toBe(true);
    expect(isSupportedImage(file("IMG_1.HEIC", ""))).toBe(true);
    expect(isHeic(file("x.heif", "image/heif"))).toBe(true);
    expect(isHeic(file("x.jpg", "image/jpeg"))).toBe(false);
    for (const bad of [
      file("a.gif", "image/gif"),
      file("a.pdf", "application/pdf"),
      file("a.svg", "image/svg+xml"),
      file("noext", ""),
    ]) {
      expect(isSupportedImage(bad), bad.name).toBe(false);
    }
  });
});

describe("validateImageFile", () => {
  it("accepts a normal image and rejects wrong types, empty files and anything over 10 MB", () => {
    expect(validateImageFile(file("a.jpg", "image/jpeg", 1000))).toBeNull();
    expect(validateImageFile(file("a.jpg", "image/jpeg", MAX_IMAGE_BYTES))).toBeNull();
    expect(validateImageFile(file("a.jpg", "image/jpeg", MAX_IMAGE_BYTES + 1))).toBe(
      MESSAGES.tooLarge,
    );
    expect(validateImageFile(file("a.gif", "image/gif"))).toBe(MESSAGES.notImage);
    expect(validateImageFile(file("a.jpg", "image/jpeg", 0))).toBe(MESSAGES.notImage);
  });
});

describe("validateUrl", () => {
  it("requires a link and only accepts http(s)", () => {
    expect(validateUrl("")).toBe(MESSAGES.empty);
    expect(validateUrl("   ")).toBe(MESSAGES.empty);
    expect(validateUrl("https://www.instagram.com/p/abc/")).toBeNull();
    expect(validateUrl("  http://example.com/x  ")).toBeNull();
    for (const bad of [
      "instagram.com/p/abc",
      "javascript:alert(1)",
      "ftp://x.example",
      "not a url",
    ])
      expect(validateUrl(bad), bad).toBe(MESSAGES.badUrl);
  });
});

describe("firstImageFile", () => {
  it("picks the first supported image from a FileList-like or clipboard items", () => {
    const files = {
      length: 2,
      item: (i: number) => [file("a.pdf", "application/pdf"), file("b.png", "image/png")][i],
    } as unknown as FileList;
    expect(firstImageFile(files)?.name).toBe("b.png");
    const items = {
      length: 2,
      0: { kind: "string" },
      1: { kind: "file", getAsFile: () => file("shot.png", "image/png") },
    } as unknown as DataTransferItemList;
    expect(firstImageFile(items)?.name).toBe("shot.png");
    expect(firstImageFile(null)).toBeNull();
    expect(firstImageFile({ length: 0, item: () => null } as unknown as FileList)).toBeNull();
  });
});

describe("HEIC conversion", () => {
  it("converts via heic2any and renames the file to .jpg", async () => {
    const loader = async () => ({
      default: vi.fn(async () => new Blob(["jpeg"], { type: "image/jpeg" })),
    });
    const out = await convertHeicToJpeg(file("IMG_2041.HEIC", "image/heic"), loader);
    expect(out.name).toBe("IMG_2041.jpg");
    expect(out.type).toBe("image/jpeg");
  });

  it("accepts the array result heic2any returns for multi-frame images", async () => {
    const loader = async () => ({ default: async () => [new Blob(["a"]), new Blob(["b"])] });
    expect((await convertHeicToJpeg(file("x.heif", "image/heif"), loader)).size).toBe(1);
  });
});

describe("prepareImage", () => {
  it("passes JPEG/PNG straight through without converting", async () => {
    const convert = vi.fn();
    const f = file("a.jpg", "image/jpeg", 500);
    expect(await prepareImage(f, convert)).toEqual({ file: f, error: null });
    expect(convert).not.toHaveBeenCalled();
  });

  it("converts HEIC, then validates the converted file", async () => {
    const jpg = file("IMG.jpg", "image/jpeg", 800);
    expect(await prepareImage(file("IMG.heic", "image/heic"), async () => jpg)).toEqual({
      file: jpg,
      error: null,
    });
    const huge = file("IMG.jpg", "image/jpeg", MAX_IMAGE_BYTES + 1);
    expect(await prepareImage(file("IMG.heic", "image/heic"), async () => huge)).toEqual({
      file: null,
      error: MESSAGES.tooLarge,
    });
  });

  it("reports a friendly error when conversion fails, and rejects unsupported types up front", async () => {
    expect(
      await prepareImage(file("IMG.heic", "image/heic"), async () => {
        throw new Error("decode");
      }),
    ).toEqual({ file: null, error: MESSAGES.convertFailed });
    expect(await prepareImage(file("a.gif", "image/gif"), vi.fn())).toEqual({
      file: null,
      error: MESSAGES.notImage,
    });
  });
});
