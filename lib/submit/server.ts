import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dedupeExtraction } from "@/lib/dedupe";
import { supabaseDedupeStore } from "@/lib/dedupe-store";
import { createExtractDeps } from "@/lib/extract/deps";
import { runExtraction } from "@/lib/extract/service";
import { safeFetchBuffer } from "@/lib/net/ssrf";
import { getSources } from "@/lib/sources";
import type { Database } from "@/lib/supabase/database.types";
import type { SubmitDeps } from "./handle";
import { EXTENSION, MAX_UPLOAD_BYTES, MIME } from "./sniff";

export const FLYER_BUCKET = "flyers";
const MAX_HTML_BYTES = 2 * 1024 * 1024;

/** Production wiring for the submission orchestrator (service-role client; the caller has authenticated the user). */
export function createSubmitDeps(db: SupabaseClient<Database>): SubmitDeps {
  const sources = getSources();
  const extractDeps = createExtractDeps(db);

  return {
    storage: {
      async upload(userId, bytes, kind) {
        const path = `submissions/${userId}/${randomUUID()}.${EXTENSION[kind]}`;
        const { error } = await db.storage
          .from(FLYER_BUCKET)
          .upload(path, bytes, { contentType: MIME[kind], upsert: false });
        if (error) throw error;
        // Short-lived link for the preview; the flyer becomes public only when the competition is published.
        const { data } = await db.storage.from(FLYER_BUCKET).createSignedUrl(path, 3600);
        return { ref: `storage:${FLYER_BUCKET}/${path}`, publicUrl: data?.signedUrl ?? null };
      },
    },

    async fetchPage(url) {
      const res = await safeFetchBuffer(url, {
        maxBytes: Math.max(MAX_UPLOAD_BYTES, MAX_HTML_BYTES),
        timeoutMs: 8000,
      });
      if (res.contentType.toLowerCase().startsWith("image/"))
        return { kind: "image", bytes: new Uint8Array(res.buffer), finalUrl: res.url };
      return {
        kind: "html",
        html: res.buffer.subarray(0, MAX_HTML_BYTES).toString("utf8"),
        finalUrl: res.url,
      };
    },

    async fetchImageBytes(url) {
      const res = await safeFetchBuffer(url, {
        accept: "image/",
        maxBytes: MAX_UPLOAD_BYTES,
        timeoutMs: 8000,
      });
      return new Uint8Array(res.buffer);
    },

    extract: (req) => runExtraction(req, extractDeps),

    dedupe: (extraction, postedAt) =>
      dedupeExtraction(extraction, {
        embedder: sources.embedder,
        store: supabaseDedupeStore(db),
        postedAt,
      }),

    submissions: {
      async create(row) {
        const { data, error } = await db
          .from("submissions")
          .insert({
            user_id: row.user_id,
            raw_url: row.raw_url,
            image_path: row.image_path,
            extracted: row.extracted as never,
            status: row.status,
          })
          .select("id")
          .single();
        if (error) throw error;
        return { id: data.id };
      },
    },
  };
}

import { supabasePublishStore } from "@/lib/pipeline/supabase-store";
import type { ConfirmDeps, SubmissionRecord } from "./confirm";

/** Public URL of a stored flyer, e.g. storage:flyers/submissions/u/x.jpg -> https://<project>.supabase.co/storage/v1/object/public/... */
export function publicFlyerUrl(
  imagePath: string | null,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  if (!imagePath?.startsWith("storage:") || !supabaseUrl) return null;
  const rest = imagePath.slice("storage:".length);
  if (rest.includes("..")) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${rest}`;
}

/**
 * Production wiring for confirming a submission. `userDb` is the student's RLS-bound client (so they can
 * only ever load their own submission); `adminDb` performs the system writes.
 */
export function createConfirmDeps(
  userDb: SupabaseClient<Database>,
  adminDb: SupabaseClient<Database>,
): ConfirmDeps {
  return {
    async getSubmission(id, userId) {
      const { data, error } = await userDb
        .from("submissions")
        .select("id,user_id,raw_url,image_path,status,competition_id,merged_into")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data as SubmissionRecord | null;
    },
    store: supabasePublishStore(adminDb),
    embedder: getSources().embedder,
    async lookupSlug(competitionId) {
      const { data } = await adminDb
        .from("competitions")
        .select("slug")
        .eq("id", competitionId)
        .maybeSingle();
      return data?.slug ?? null;
    },
    async markDone(id, patch) {
      const { error } = await adminDb.from("submissions").update(patch).eq("id", id);
      if (error) throw error;
    },
    flyerUrl: (path) => publicFlyerUrl(path),
  };
}
