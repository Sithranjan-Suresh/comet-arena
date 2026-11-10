/** Client-side checks for Report a Game. They mirror the server's rules so students get instant feedback. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const MESSAGES = {
  empty: "Add a link or an image.",
  badUrl: "Enter a full link starting with https://",
  tooLarge: "That image is over 10 MB. Try a smaller one.",
  notImage: "Use a JPG, PNG or HEIC image.",
  converting: "Converting your photo…",
  convertFailed: "We could not convert that photo. Share it as a JPG and try again.",
} as const;

const HEIC_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

export function isHeic(file: Pick<File, "type" | "name">): boolean {
  return HEIC_TYPES.has(file.type.toLowerCase()) || /\.(heic|heif)$/i.test(file.name);
}

export function isSupportedImage(file: Pick<File, "type" | "name">): boolean {
  return (
    /^image\/(jpeg|png)$/i.test(file.type) || /\.(jpe?g|png)$/i.test(file.name) || isHeic(file)
  );
}

/** Returns an error message, or null when the (already converted) image is acceptable. */
export function validateImageFile(file: Pick<File, "type" | "name" | "size">): string | null {
  if (!isSupportedImage(file)) return MESSAGES.notImage;
  if (file.size > MAX_IMAGE_BYTES) return MESSAGES.tooLarge;
  if (file.size === 0) return MESSAGES.notImage;
  return null;
}

/** A link must be http(s). Returns an error message or null. */
export function validateUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return MESSAGES.empty;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? null : MESSAGES.badUrl;
  } catch {
    return MESSAGES.badUrl;
  }
}

/** First image file on a clipboard or drag event, if any. */
export function firstImageFile(
  items: DataTransferItemList | FileList | null | undefined,
): File | null {
  if (!items) return null;
  if ("length" in items && (items as FileList).item) {
    for (let i = 0; i < (items as FileList).length; i++) {
      const f = (items as FileList).item(i);
      if (f && isSupportedImage(f)) return f;
    }
    return null;
  }
  const list = items as DataTransferItemList;
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    if (it.kind === "file") {
      const f = it.getAsFile();
      if (f && isSupportedImage(f)) return f;
    }
  }
  return null;
}

/** Convert an iPhone HEIC/HEIF photo to JPEG in the browser. The library is loaded on demand (it is large). */
export async function convertHeicToJpeg(
  file: File,
  loader: () => Promise<{
    default: (o: { blob: Blob; toType: string; quality: number }) => Promise<Blob | Blob[]>;
  }> = () => import("heic2any"),
): Promise<File> {
  const mod = await loader();
  const out = await mod.default({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = Array.isArray(out) ? out[0] : out;
  return new File([blob], file.name.replace(/\.(heic|heif)$/i, "") + ".jpg", {
    type: "image/jpeg",
  });
}

/**
 * Make a chosen file ready to upload: converts HEIC, then validates. Returns the final file or an error.
 * Validation happens BEFORE conversion for obviously bad files, and again after (size can change).
 */
export async function prepareImage(
  file: File,
  convert: (f: File) => Promise<File> = convertHeicToJpeg,
): Promise<{ file: File; error: null } | { file: null; error: string }> {
  if (!isSupportedImage(file)) return { file: null, error: MESSAGES.notImage };
  let out = file;
  if (isHeic(file)) {
    try {
      out = await convert(file);
    } catch {
      return { file: null, error: MESSAGES.convertFailed };
    }
  }
  const error = validateImageFile(out);
  return error ? { file: null, error } : { file: out, error: null };
}
