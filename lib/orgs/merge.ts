import { z } from "zod";

/** One club as returned by UTD Clubs (Nebula Labs), normalized. */
export const clubSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  instagram: z.string().nullable().optional(),
  discord: z.string().nullable().optional(),
  campusgroups_id: z.string().nullable().optional(),
});
export type Club = z.infer<typeof clubSchema>;

export const snapshotSchema = z.object({
  fetched_at: z.string(),
  clubs: z.array(clubSchema),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

/** The subset of the `orgs` row that sync/seed manage. */
export interface OrgRecord {
  slug: string;
  name: string;
  utdclubs_slug: string | null;
  campusgroups_id: string | null;
  ig_handle: string | null;
  discord_url: string | null;
  tags: string[];
  handle_manual: boolean;
}

/** Normalize an Instagram handle: strip URL, '@', query, trailing slash; lowercase. */
export function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let h = raw.trim();
  h = h.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "");
  h = h.replace(/^@/, "").split(/[/?#]/)[0] ?? "";
  h = h.toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : null;
}

/** Build a fresh org record from a club. */
export function orgFromClub(club: Club): OrgRecord {
  return {
    slug: club.slug,
    name: club.name,
    utdclubs_slug: club.slug,
    campusgroups_id: club.campusgroups_id ?? null,
    ig_handle: normalizeHandle(club.instagram),
    discord_url: club.discord ?? null,
    tags: club.tags,
    handle_manual: false,
  };
}

/**
 * Merge an incoming club into an existing org. A handle someone entered by hand
 * (`handle_manual`) is never overwritten; otherwise the incoming handle wins when present,
 * and an existing handle is kept if the source stopped listing one.
 */
export function mergeOrg(existing: OrgRecord, club: Club): OrgRecord {
  const incoming = orgFromClub(club);
  return {
    ...existing,
    name: incoming.name,
    utdclubs_slug: incoming.utdclubs_slug,
    campusgroups_id: incoming.campusgroups_id ?? existing.campusgroups_id,
    discord_url: incoming.discord_url ?? existing.discord_url,
    tags: incoming.tags.length ? incoming.tags : existing.tags,
    ig_handle: existing.handle_manual
      ? existing.ig_handle
      : (incoming.ig_handle ?? existing.ig_handle),
  };
}
