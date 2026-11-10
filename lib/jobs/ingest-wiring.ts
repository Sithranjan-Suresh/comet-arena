import type { SupabaseClient } from "@supabase/supabase-js";
import { dedupeExtraction } from "@/lib/dedupe";
import { supabaseDedupeStore } from "@/lib/dedupe-store";
import { createExtractDeps } from "@/lib/extract/deps";
import { runExtraction } from "@/lib/extract/service";
import { type IngestPostDeps } from "@/lib/pipeline/ingest-post";
import { supabasePublishStore } from "@/lib/pipeline/supabase-store";
import { getSources } from "@/lib/sources";
import type { Database } from "@/lib/supabase/database.types";

/** Production wiring of extract -> dedupe -> publish for scheduled ingestion jobs (service-role client). */
export function createIngestPostDeps(db: SupabaseClient<Database>): IngestPostDeps {
  const extractDeps = createExtractDeps(db);
  const sources = getSources();
  return {
    extract: (req) => runExtraction(req, extractDeps),
    dedupe: (extraction, postedAt) =>
      dedupeExtraction(extraction, {
        embedder: sources.embedder,
        store: supabaseDedupeStore(db),
        postedAt,
      }),
    store: supabasePublishStore(db),
  };
}
