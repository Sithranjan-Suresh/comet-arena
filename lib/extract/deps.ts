import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getSources } from "@/lib/sources";
import { createImageResolver } from "./resolve-image";
import type { ExtractDeps } from "./service";

/** Per-request image limit of the vision model (Groq qwen: 3). Override with GROQ_MAX_IMAGES. */
export const maxImages = () => Number(process.env.GROQ_MAX_IMAGES) || 3;

/**
 * The runtime dependencies of the extraction pipeline, for any caller (API routes, scheduled jobs).
 * The caller supplies a service-role client so storage downloads work; nothing here imports server-only code.
 */
export function createExtractDeps(db: SupabaseClient<Database>): ExtractDeps {
  const sources = getSources();
  return {
    vision: sources.vision,
    mode: sources.mode,
    maxImages: maxImages(),
    resolveImage: createImageResolver({
      downloadStorage: async (bucket, objectPath) => {
        const { data, error } = await db.storage.from(bucket).download(objectPath);
        if (error || !data) throw new Error("storage download failed");
        return Buffer.from(await data.arrayBuffer());
      },
    }),
  };
}
