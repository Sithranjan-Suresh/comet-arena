import sharp, { type Sharp } from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_BYTES, preprocessImage, preprocessImages, toDataUrl } from "@/lib/extract/images";

async function solid(w: number, h: number, fmt: "png" | "jpeg", extra?: (s: Sharp) => Sharp) {
  const base = sharp({
    create: { width: w, height: h, channels: 3, background: { r: 16, g: 55, b: 42 } },
  });
  const s = extra ? extra(base) : base;
  return (fmt === "png" ? s.png() : s.jpeg()).toBuffer();
}

/** Incompressible noise so file size genuinely exceeds 5 MB. */
async function noisy(w: number, h: number) {
  const raw = Buffer.alloc(w * h * 3);
  let x = 123456789;
  for (let i = 0; i < raw.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    raw[i] = x & 255;
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

describe("preprocessImage", () => {
  it("keeps small PNGs as PNG and caps the longest edge", async () => {
    const out = await preprocessImage(await solid(3000, 1500, "png"));
    expect(out.mime).toBe("image/png");
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(2000);
  });

  it("converts JPEG input to JPEG and never enlarges small images", async () => {
    const out = await preprocessImage(await solid(400, 300, "jpeg"));
    expect(out.mime).toBe("image/jpeg");
    expect([out.width, out.height]).toEqual([400, 300]);
  });

  it("strips EXIF metadata (GPS and camera info)", async () => {
    const withExif = await sharp({
      create: { width: 200, height: 200, channels: 3, background: "#fff" },
    })
      .jpeg()
      .withExif({ IFD0: { Copyright: "secret-location" } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const out = await preprocessImage(withExif);
    expect((await sharp(out.buffer).metadata()).exif).toBeUndefined();
    expect(out.buffer.toString("latin1")).not.toContain("secret-location");
  });

  it("applies EXIF orientation before stripping it", async () => {
    // 300x100 image tagged "rotate 90" should come out 100x300.
    const tagged = await sharp({
      create: { width: 300, height: 100, channels: 3, background: "#123" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const out = await preprocessImage(tagged);
    expect([out.width, out.height]).toEqual([100, 300]);
  });

  it("downsizes an image larger than 5 MB until it fits", async () => {
    const big = await noisy(2400, 1800); // ~13 MB uncompressed PNG
    expect(big.length).toBeGreaterThan(MAX_BYTES);
    const out = await preprocessImage(big);
    expect(out.buffer.length).toBeLessThanOrEqual(MAX_BYTES);
    expect(out.mime).toBe("image/jpeg");
  }, 30_000);

  it("rejects bytes that are not an image", async () => {
    await expect(preprocessImage(Buffer.from("not an image"))).rejects.toBeDefined();
  });
});

describe("preprocessImages", () => {
  it("skips unreadable files with a reason instead of failing the post", async () => {
    const good = await solid(100, 100, "png");
    const r = await preprocessImages([good, Buffer.from("junk"), good], { maxImages: 5 });
    expect(r.images).toHaveLength(2);
    expect(r.skipped).toEqual([{ index: 1, reason: "unreadable" }]);
  });

  it("caps the number of images and reports the overflow", async () => {
    const good = await solid(100, 100, "png");
    const r = await preprocessImages([good, good, good, good], { maxImages: 3 });
    expect(r.images).toHaveLength(3);
    expect(r.skipped).toEqual([{ index: 3, reason: "over_limit" }]);
  });

  it("builds a data URL", async () => {
    const img = await preprocessImage(await solid(50, 50, "png"));
    expect(toDataUrl(img)).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
  });
});
