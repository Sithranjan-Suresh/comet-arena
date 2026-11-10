import sharp from "sharp";

export const MAX_BYTES = 5 * 1024 * 1024; // spec: skip/downscale images over 5 MB
export const MAX_INPUT_BYTES = 25 * 1024 * 1024; // refuse absurd inputs outright
export const MAX_EDGE = 2000;

export interface ProcessedImage {
  buffer: Buffer;
  mime: "image/jpeg" | "image/png";
  width: number;
  height: number;
}

export type SkipReason = "too_large" | "unreadable" | "unsupported_heic" | "over_limit";

export interface PreprocessResult {
  images: ProcessedImage[];
  skipped: { index: number; reason: SkipReason }[];
}

/**
 * Normalize one image for the vision model: apply EXIF orientation, strip all metadata (phone photos
 * carry GPS), cap the longest edge, and shrink until it is under 5 MB. PNGs stay PNG when small
 * (flyer text stays crisp); everything else becomes JPEG.
 */
export async function preprocessImage(input: Buffer): Promise<ProcessedImage> {
  const meta = await sharp(input, { failOn: "error" }).metadata();
  if (meta.format === "heif") {
    // sharp's prebuilt binaries cannot decode HEVC-based HEIC; the upload form converts in the browser.
    try {
      await sharp(input).toBuffer();
    } catch {
      throw new ImageError("unsupported_heic");
    }
  }

  let edge = MAX_EDGE;
  let quality = 85;
  const keepPng = meta.format === "png" && input.length <= MAX_BYTES;

  for (let attempt = 0; attempt < 6; attempt++) {
    // rotate() with no argument applies EXIF orientation; sharp drops metadata unless asked to keep it.
    const pipeline = sharp(input, { failOn: "error" })
      .rotate()
      .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true });
    const out =
      keepPng && attempt === 0
        ? pipeline.png({ compressionLevel: 9 })
        : pipeline.jpeg({ quality, mozjpeg: true });
    const { data, info } = await out.toBuffer({ resolveWithObject: true });
    if (data.length <= MAX_BYTES) {
      return {
        buffer: data,
        mime: info.format === "png" ? "image/png" : "image/jpeg",
        width: info.width,
        height: info.height,
      };
    }
    edge = Math.round(edge * 0.75);
    quality = Math.max(50, quality - 10);
  }
  throw new ImageError("too_large");
}

export class ImageError extends Error {
  constructor(readonly reason: SkipReason) {
    super(`image skipped: ${reason}`);
    this.name = "ImageError";
  }
}

/** Process a batch. Unusable images are skipped with a reason instead of failing the whole post. */
export async function preprocessImages(
  inputs: Buffer[],
  opts: { maxImages: number },
): Promise<PreprocessResult> {
  const result: PreprocessResult = { images: [], skipped: [] };
  for (let i = 0; i < inputs.length; i++) {
    if (result.images.length >= opts.maxImages) {
      result.skipped.push({ index: i, reason: "over_limit" });
      continue;
    }
    if (inputs[i].length > MAX_INPUT_BYTES) {
      result.skipped.push({ index: i, reason: "too_large" });
      continue;
    }
    try {
      result.images.push(await preprocessImage(inputs[i]));
    } catch (e) {
      result.skipped.push({ index: i, reason: e instanceof ImageError ? e.reason : "unreadable" });
    }
  }
  return result;
}

/** data: URL accepted by vision APIs. */
export function toDataUrl(img: ProcessedImage): string {
  return `data:${img.mime};base64,${img.buffer.toString("base64")}`;
}
