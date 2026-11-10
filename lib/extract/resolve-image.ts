import path from "node:path";
import { flyerImageBytes } from "@/lib/fixtures";
import { safeFetchBuffer } from "@/lib/net/ssrf";
import { MOCK_FLYER_PREFIX } from "@/lib/sources/mock/constants";

export type ImageResolver = (ref: string) => Promise<Buffer>;

export class ImageRefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageRefError";
  }
}

/**
 * Turn an image reference into bytes:
 *   mock://flyers/<file>      fixture flyer (SOURCES_MODE=mock)
 *   storage:<bucket>/<path>   Supabase Storage object (submissions, ingested flyers)
 *   https://...               public URL (SSRF-guarded)
 */
export function createImageResolver(
  opts: {
    downloadStorage?: (bucket: string, objectPath: string) => Promise<Buffer>;
    allowHttp?: boolean;
  } = {},
): ImageResolver {
  return async (ref) => {
    if (ref.startsWith(MOCK_FLYER_PREFIX)) {
      const file = path.basename(ref.slice(MOCK_FLYER_PREFIX.length));
      try {
        return flyerImageBytes(file);
      } catch {
        throw new ImageRefError(`unknown mock flyer: ${file}`);
      }
    }
    if (ref.startsWith("storage:")) {
      const rest = ref.slice("storage:".length);
      const slash = rest.indexOf("/");
      if (slash < 1 || rest.includes("..")) throw new ImageRefError("invalid storage path");
      if (!opts.downloadStorage) throw new ImageRefError("storage downloads are not configured");
      return opts.downloadStorage(rest.slice(0, slash), rest.slice(slash + 1));
    }
    if (/^https?:\/\//i.test(ref)) {
      const { buffer } = await safeFetchBuffer(ref, {
        accept: "image/",
        allowHttp: opts.allowHttp,
      });
      return buffer;
    }
    throw new ImageRefError("unsupported image reference");
  };
}
