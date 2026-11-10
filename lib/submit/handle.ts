import type { DedupeResult } from "@/lib/dedupe";
import type { ExtractOutcome } from "@/lib/extract/service";
import { UnsafeUrlError } from "@/lib/net/ssrf";
import type { Extraction, ExtractRequest } from "@/lib/schemas";
import { SourceError } from "@/lib/sources";
import { captionFromPage, parsePage } from "./page";
import { MAX_UPLOAD_BYTES, type ImageKind, sniffImage } from "./sniff";

export type FetchedPage =
  | { kind: "html"; html: string; finalUrl: string }
  | { kind: "image"; bytes: Uint8Array; finalUrl: string };

export interface SubmitDeps {
  storage: {
    upload(
      userId: string,
      bytes: Uint8Array,
      kind: ImageKind,
    ): Promise<{ ref: string; publicUrl: string | null }>;
  };
  /** Fetch a public URL (SSRF-guarded). Returns HTML, or the bytes when the URL is itself an image. */
  fetchPage(url: string): Promise<FetchedPage>;
  fetchImageBytes(url: string): Promise<Uint8Array>;
  extract(req: ExtractRequest): Promise<ExtractOutcome>;
  dedupe(extraction: Extraction, postedAt: string): Promise<DedupeResult>;
  submissions: {
    create(row: {
      user_id: string;
      raw_url: string | null;
      image_path: string | null;
      extracted: unknown;
      status: "pending" | "queued";
    }): Promise<{ id: string }>;
  };
  now?: Date;
}

export interface SubmitInput {
  userId: string;
  url?: string | null;
  image?: { bytes: Uint8Array } | null;
}

export interface PossibleMatch {
  /** Competition id: what the confirm endpoint needs to merge into it. */
  id: string;
  slug: string;
  title: string;
  similarity: number;
  /** "same": nearly certain; "maybe": ask the student. */
  confidence: "same" | "maybe";
}

export type SubmitResult =
  | {
      status: 200;
      body: {
        submission_id: string;
        extracted: Extraction;
        meta: unknown;
        image_url: string | null;
        possible_match: PossibleMatch | null;
        warning: "not_a_competition" | "recap" | null;
      };
    }
  | {
      status: 200;
      body: {
        submission_id: string;
        extracted: null;
        manual: true;
        reason: string;
        image_url: string | null;
      };
    }
  | { status: 202; body: { submission_id: string; queued: true; message: string } }
  | { status: 400 | 413 | 415 | 422; body: { error: string; message: string } };

const err = (status: 400 | 413 | 415 | 422, error: string, message: string): SubmitResult => ({
  status,
  body: { error, message },
});

export const MESSAGES = {
  empty: "Add a link or an image.",
  both: "Send either a link or an image, not both.",
  tooLarge: "That image is over 10 MB. Try a smaller one.",
  notImage: "Use a JPG or PNG image.",
  heic: "iPhone HEIC photos need converting first. Upload from your photo library (it converts automatically) or share the flyer as a JPG.",
  unreadableLink: "We could not read that link. Upload the flyer image instead.",
  unsafeLink: "That link cannot be used. Paste a public post link or upload the flyer.",
  queued: "Saved, we'll finish reading it shortly.",
} as const;

/**
 * Report a Game (product_spec CL-2): link or flyer in, extracted fields out, submission recorded.
 * Never throws for expected failures; infrastructure outages become a queued submission (202).
 */
export async function handleSubmission(
  input: SubmitInput,
  deps: SubmitDeps,
): Promise<SubmitResult> {
  const url = input.url?.trim() || null;
  if (!url && !input.image) return err(400, "empty_input", MESSAGES.empty);
  if (url && input.image) return err(400, "both_inputs", MESSAGES.both);

  let imageBytes: Uint8Array | null = null;
  let imageKind: ImageKind | null = null;
  let caption = "";

  if (input.image) {
    imageBytes = input.image.bytes;
  } else if (url) {
    let page: FetchedPage;
    try {
      page = await deps.fetchPage(url);
    } catch (e) {
      return e instanceof UnsafeUrlError &&
        /valid URL|only https|credentials|local hostname|private/.test(e.reason)
        ? err(422, "unsafe_url", MESSAGES.unsafeLink)
        : err(422, "unreadable_link", MESSAGES.unreadableLink);
    }
    if (page.kind === "image") {
      imageBytes = page.bytes;
    } else {
      const info = parsePage(page.html, page.finalUrl);
      caption = captionFromPage(info);
      if (info.imageUrl) {
        try {
          imageBytes = await deps.fetchImageBytes(info.imageUrl);
        } catch {
          imageBytes = null; // fall back to the page text alone
        }
      }
      if (!imageBytes && !caption.trim())
        return err(422, "unreadable_link", MESSAGES.unreadableLink);
    }
  }

  // Validate and store the image (uploads, direct image links and page images share the rules).
  let ref: string | null = null;
  let publicUrl: string | null = null;
  if (imageBytes) {
    if (imageBytes.length > MAX_UPLOAD_BYTES) return err(413, "too_large", MESSAGES.tooLarge);
    imageKind = sniffImage(imageBytes);
    if (!imageKind) {
      // A link whose page image is not a usable image: continue with text only; an upload must be an image.
      if (input.image) return err(415, "not_an_image", MESSAGES.notImage);
      imageBytes = null;
    } else if (imageKind === "heic") {
      if (input.image) return err(415, "heic", MESSAGES.heic);
      imageBytes = null;
    }
  }
  if (imageBytes && imageKind) {
    const stored = await deps.storage.upload(input.userId, imageBytes, imageKind);
    ref = stored.ref;
    publicUrl = stored.publicUrl;
  }

  const now = deps.now ?? new Date();
  const postedAt = now.toISOString();
  let outcome: ExtractOutcome;
  try {
    outcome = await deps.extract({
      images: ref ? [ref] : [],
      caption: caption || undefined,
      source_url: url ?? undefined,
      posted_at: postedAt,
    });
  } catch (e) {
    if (e instanceof SourceError && ["timeout", "rate_limit", "unavailable"].includes(e.kind)) {
      // AI service is down or slow: keep the submission and finish later (product_spec §5).
      const row = await deps.submissions.create({
        user_id: input.userId,
        raw_url: url,
        image_path: ref,
        extracted: { reason: e.kind, caption },
        status: "queued",
      });
      return {
        status: 202,
        body: { submission_id: row.id, queued: true, message: MESSAGES.queued },
      };
    }
    throw e;
  }

  if (!outcome.ok) {
    const row = await deps.submissions.create({
      user_id: input.userId,
      raw_url: url,
      image_path: ref,
      extracted: { manual: true, reason: outcome.error.reason },
      status: "pending",
    });
    return {
      status: 200,
      body: {
        submission_id: row.id,
        extracted: null,
        manual: true,
        reason: outcome.error.reason,
        image_url: publicUrl,
      },
    };
  }

  const extraction = outcome.extraction;
  let possible: PossibleMatch | null = null;
  if (extraction.kind === "competition") {
    try {
      const d = await deps.dedupe(extraction, postedAt);
      if (d.action === "merge")
        possible = {
          id: d.match.id,
          slug: d.match.slug,
          title: d.match.title,
          similarity: d.match.similarity,
          confidence: "same",
        };
      else if (d.action === "review" && d.candidates[0]) {
        const c = d.candidates[0];
        possible = {
          id: c.id,
          slug: c.slug,
          title: c.title,
          similarity: c.similarity,
          confidence: "maybe",
        };
      }
    } catch {
      possible = null; // dedupe is a convenience here; the admin queue catches duplicates later
    }
  }

  const row = await deps.submissions.create({
    user_id: input.userId,
    raw_url: url,
    image_path: ref,
    extracted: { extraction, meta: outcome.meta, possible_match: possible },
    status: "pending",
  });
  return {
    status: 200,
    body: {
      submission_id: row.id,
      extracted: extraction,
      meta: outcome.meta,
      image_url: publicUrl,
      possible_match: possible,
      warning:
        extraction.kind === "results"
          ? "recap"
          : extraction.kind === "not_competition"
            ? "not_a_competition"
            : null,
    },
  };
}
