import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { extractionSchema } from "@/lib/schemas";
import type { FeedListing } from "@/lib/sources/types";

const root = path.resolve(process.cwd(), "fixtures");

export const flyerCaseSchema = z.object({
  id: z.string().min(1),
  org_slug: z.string(),
  /** Sample handle (ends in _sample); not a real Instagram account. */
  ig_handle: z.string().regex(/_sample$/),
  posted_at: z.string().datetime(),
  caption: z.string(),
  /** File names under fixtures/flyers/ (carousel posts have several). */
  images: z.array(z.string()).min(1).max(10),
  note: z.string().default(""),
  /** The canned model response for this post (what a perfect extractor returns). */
  expected: extractionSchema,
});
export type FlyerCase = z.infer<typeof flyerCaseSchema>;

const flyerFileSchema = z.object({ cases: z.array(flyerCaseSchema) });
const devpostFileSchema = z.object({
  listings: z.array(
    z.object({
      source: z.enum(["devpost", "mlh"]),
      externalId: z.string(),
      url: z.string().url(),
      title: z.string(),
      text: z.string(),
      postedAt: z.string().datetime(),
    }),
  ),
});

let flyerCache: FlyerCase[] | undefined;

export function loadFlyerCases(): FlyerCase[] {
  flyerCache ??= flyerFileSchema.parse(
    JSON.parse(readFileSync(path.join(root, "flyers", "cases.json"), "utf8")),
  ).cases;
  return flyerCache;
}

export function loadFeedListings(): FeedListing[] {
  return devpostFileSchema.parse(
    JSON.parse(readFileSync(path.join(root, "devpost-listings.json"), "utf8")),
  ).listings;
}

export function flyerImagePath(file: string): string {
  return path.join(root, "flyers", file);
}

export function flyerImageBytes(file: string): Buffer {
  return readFileSync(flyerImagePath(file));
}
