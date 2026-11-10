export type ImageKind = "jpeg" | "png" | "heic";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // product_spec CL-2

const HEIC_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "mif1",
  "msf1",
  "heif",
]);

/** Identify an image by its first bytes. The client-supplied MIME type is never trusted. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return "png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    if (HEIC_BRANDS.has(brand)) return "heic";
  }
  return null;
}

export const EXTENSION: Record<ImageKind, string> = { jpeg: "jpg", png: "png", heic: "heic" };
export const MIME: Record<ImageKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  heic: "image/heic",
};
