import { type Extraction, type ExtractionError, type ExtractRequest } from "@/lib/schemas";
import type { VisionModel } from "@/lib/sources";
import { scoreConfidence, type ConfidenceResult } from "./confidence";
import { preprocessImages, toDataUrl, type SkipReason } from "./images";
import { postProcessExtraction } from "./postprocess";
import { buildExtractionPrompt } from "./prompt";
import type { ImageResolver } from "./resolve-image";
import { extractWithRepair } from "./validate";

export interface ExtractDeps {
  vision: VisionModel;
  resolveImage: ImageResolver;
  mode: "mock" | "live";
  /** Per-request image limit of the vision model (Groq qwen: 3). */
  maxImages: number;
  now?: Date;
}

export interface ExtractMeta {
  repaired: boolean;
  yearInferred: boolean;
  adjustments: string[];
  penalties: ConfidenceResult["penalties"];
  modelScore: number | null;
  publishable: boolean;
  skippedImages: { ref: string; reason: SkipReason | "unresolvable" }[];
}

export type ExtractOutcome =
  | { ok: true; extraction: Extraction; meta: ExtractMeta }
  | { ok: false; error: ExtractionError; meta: ExtractMeta };

export class EmptyInputError extends Error {
  constructor() {
    super("Add a link or an image");
    this.name = "EmptyInputError";
  }
}

const emptyMeta = (): ExtractMeta => ({
  repaired: false,
  yearInferred: false,
  adjustments: [],
  penalties: [],
  modelScore: null,
  publishable: false,
  skippedImages: [],
});

/**
 * Full extraction pipeline for one post: resolve + preprocess images, prompt the model, validate with
 * one repair, post-process dates, score confidence. Infrastructure failures propagate as SourceError.
 */
export async function runExtraction(
  req: ExtractRequest,
  deps: ExtractDeps,
): Promise<ExtractOutcome> {
  const caption = req.caption?.trim() ?? "";
  if (req.images.length === 0 && !caption) throw new EmptyInputError();

  const meta = emptyMeta();

  // Resolve every reference to bytes (skipping ones we cannot load), then preprocess.
  const buffers: Buffer[] = [];
  const refs: string[] = [];
  for (const ref of req.images) {
    try {
      buffers.push(await deps.resolveImage(ref));
      refs.push(ref);
    } catch {
      meta.skippedImages.push({ ref, reason: "unresolvable" });
    }
  }
  const processed = await preprocessImages(buffers, { maxImages: deps.maxImages });
  for (const s of processed.skipped)
    meta.skippedImages.push({ ref: refs[s.index], reason: s.reason });

  if (req.images.length > 0 && processed.images.length === 0 && !caption) {
    return {
      ok: false,
      error: { kind: "error", reason: "None of the images could be read" },
      meta,
    };
  }

  // Mock mode sends the original references (the fixture model matches flyers by name);
  // live mode sends the cleaned image bytes.
  const keptRefs = refs.filter((_, i) => !processed.skipped.some((s) => s.index === i));
  const imagesForModel = deps.mode === "mock" ? keptRefs : processed.images.map(toDataUrl);

  const prompt = buildExtractionPrompt({
    now: deps.now,
    caption,
    sourceUrl: req.source_url,
    postedAt: req.posted_at,
    imageCount: imagesForModel.length,
  });

  const { result, repaired } = await extractWithRepair({
    vision: deps.vision,
    prompt,
    images: imagesForModel,
  });
  meta.repaired = repaired;
  if ("kind" in result && result.kind === "error") return { ok: false, error: result, meta };

  const raw = result as Extraction;
  const post = postProcessExtraction(raw, { postedAt: req.posted_at, now: deps.now });
  const score = scoreConfidence(post.extraction, { yearInferred: post.yearInferred });

  meta.yearInferred = post.yearInferred;
  meta.adjustments = post.adjustments;
  meta.penalties = score.penalties;
  meta.modelScore = score.modelScore;
  meta.publishable = score.publishable;

  const missing = new Set(post.extraction.missing_fields);
  for (const p of score.penalties) {
    if (p.reason === "no_register_link") missing.add("register_url");
    if (p.reason === "no_stage_date") missing.add("stages");
  }
  return {
    ok: true,
    extraction: { ...post.extraction, confidence: score.confidence, missing_fields: [...missing] },
    meta,
  };
}
