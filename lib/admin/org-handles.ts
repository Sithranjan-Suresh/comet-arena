import { z } from "zod";

export const ACCOUNT_TYPES = ["business", "creator", "personal_or_missing", "unknown"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Instagram usernames: 1-30 of letters, digits, dots, underscores. */
const HANDLE = /^[A-Za-z0-9._]{1,30}$/;

/** Accepts "@club", "club", "instagram.com/club/", "https://www.instagram.com/club/?hl=en". Null when it is not a handle. */
export function normalizeHandle(input: string | null | undefined): string | null {
  let v = (input ?? "").trim();
  if (!v) return null;
  const url = v.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#\s]+)/i);
  if (url) v = url[1];
  v = v.replace(/^@/, "");
  return HANDLE.test(v) && !/^(p|reel|reels|explore|stories|accounts)$/i.test(v)
    ? v.toLowerCase()
    : null;
}

/** Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF, embedded commas/newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export interface OrgLite {
  id: string;
  name: string;
  slug: string;
  utdclubs_slug: string | null;
  ig_handle: string | null;
}

export interface HandleStore {
  listOrgs(): Promise<OrgLite[]>;
  setHandle(orgId: string, handle: string | null, type: AccountType): Promise<void>;
}

export interface ImportReport {
  updated: number;
  unchanged: number;
  skipped: { line: number; reason: string; value?: string }[];
}

const MAX_ROWS = 2000;

/**
 * Bulk import `club,instagram[,account_type]` (header optional; `club` matches slug, UTD Clubs slug or exact name).
 * Every row is checked on its own: bad rows are reported and skipped, never abort the import.
 */
export async function importHandles(csv: string, store: HandleStore): Promise<ImportReport> {
  const rows = parseCsv(csv);
  const report: ImportReport = { updated: 0, unchanged: 0, skipped: [] };
  if (rows.length === 0) return report;
  if (rows.length > MAX_ROWS + 1) {
    report.skipped.push({ line: 0, reason: `Too many rows (max ${MAX_ROWS}). Split the file.` });
    return report;
  }

  const looksLikeHeader =
    /^(club|org|organization|name|slug)$/i.test(rows[0][0]?.trim() ?? "") &&
    /^(instagram|ig|handle|ig_handle|instagram_handle)$/i.test(rows[0][1]?.trim() ?? "");
  const start = looksLikeHeader ? 1 : 0;
  const orgs = await store.listOrgs();
  const by = new Map<string, OrgLite>();
  for (const o of orgs) {
    for (const k of [o.slug, o.utdclubs_slug, o.name]) if (k) by.set(k.trim().toLowerCase(), o);
  }
  const seen = new Set<string>();

  for (let i = start; i < rows.length; i++) {
    const line = i + 1;
    const [clubRaw = "", handleRaw = "", typeRaw = ""] = rows[i].map((c) => c.trim());
    const org = by.get(clubRaw.toLowerCase());
    if (!org) {
      report.skipped.push({
        line,
        reason: "No organization with that name or slug",
        value: clubRaw,
      });
      continue;
    }
    if (seen.has(org.id)) {
      report.skipped.push({ line, reason: "Organization appears more than once", value: clubRaw });
      continue;
    }
    const handle = normalizeHandle(handleRaw);
    if (!handle) {
      report.skipped.push({ line, reason: "Not a valid Instagram handle", value: handleRaw });
      continue;
    }
    let type: AccountType = "unknown";
    if (typeRaw) {
      const t = typeRaw.toLowerCase() as AccountType;
      if (!ACCOUNT_TYPES.includes(t)) {
        report.skipped.push({
          line,
          reason: `Account type must be one of ${ACCOUNT_TYPES.join(", ")}`,
          value: typeRaw,
        });
        continue;
      }
      type = t;
    }
    seen.add(org.id);
    if (org.ig_handle?.toLowerCase() === handle && !typeRaw) {
      report.unchanged++;
      continue;
    }
    await store.setHandle(org.id, handle, type);
    report.updated++;
  }
  return report;
}

export const handleEditSchema = z.object({
  ig_handle: z.string().trim().max(200).nullable(),
  ig_account_type: z.enum(ACCOUNT_TYPES).optional(),
});

export const importSchema = z.object({ csv: z.string().min(1).max(500_000) });
