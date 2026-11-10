import { type Club, type OrgRecord, mergeOrg, orgFromClub } from "./merge";

/** Persistence port so the sync logic is testable without a database. */
export interface OrgStore {
  loadAll(): Promise<OrgRecord[]>;
  upsertMany(rows: OrgRecord[]): Promise<void>;
}

export interface SyncResult {
  inserted: number;
  updated: number;
  unchanged: number;
  total: number;
}

/** Idempotent: running twice with the same clubs yields identical rows. */
export async function syncOrgs(store: OrgStore, clubs: Club[]): Promise<SyncResult> {
  const existing = new Map((await store.loadAll()).map((o) => [o.slug, o]));
  const seen = new Set<string>();
  const toWrite: OrgRecord[] = [];
  const result: SyncResult = { inserted: 0, updated: 0, unchanged: 0, total: 0 };

  for (const club of clubs) {
    if (seen.has(club.slug)) continue; // duplicate slug in the source
    seen.add(club.slug);
    const current = existing.get(club.slug);
    if (!current) {
      toWrite.push(orgFromClub(club));
      result.inserted++;
      continue;
    }
    const merged = mergeOrg(current, club);
    if (JSON.stringify(merged) === JSON.stringify(current)) result.unchanged++;
    else {
      toWrite.push(merged);
      result.updated++;
    }
  }
  if (toWrite.length) await store.upsertMany(toWrite);
  result.total = seen.size;
  return result;
}
