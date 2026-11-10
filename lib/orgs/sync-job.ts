import type { Club } from "./merge";
import { type OrgStore, type SyncResult, syncOrgs } from "./sync";

export const SNAPSHOT_KEY = "utdclubs:snapshot";

export interface SnapshotCache {
  save(key: string, payload: unknown): Promise<void>;
}

/** Below this many clubs we assume the source is broken rather than that clubs vanished. */
export const MIN_CLUBS = 50;
/** Refuse a sync that would shrink the directory by more than this share. */
export const MAX_SHRINK = 0.5;

export class OrgSyncRefused extends Error {}

/**
 * Guarded sync: an empty, tiny or sharply shrunken club list is treated as an upstream failure.
 * We then keep the existing orgs AND the last good cached snapshot, and throw so the job runner alerts
 * the admin. Otherwise upsert (manual handles preserved by `syncOrgs`) and refresh the snapshot cache.
 */
export async function runOrgSync(deps: {
  fetchClubs: () => Promise<Club[]>;
  store: OrgStore;
  cache: SnapshotCache;
  minClubs?: number;
}): Promise<SyncResult> {
  const min = deps.minClubs ?? MIN_CLUBS;
  const clubs = await deps.fetchClubs();
  if (clubs.length === 0)
    throw new OrgSyncRefused("UTD Clubs returned no clubs; kept the previous directory");
  const existing = (await deps.store.loadAll()).length;
  if (clubs.length < min && existing >= min)
    throw new OrgSyncRefused(
      `UTD Clubs returned only ${clubs.length} clubs (have ${existing}); kept the previous directory`,
    );
  if (existing > 0 && clubs.length < existing * (1 - MAX_SHRINK))
    throw new OrgSyncRefused(
      `UTD Clubs shrank from ${existing} to ${clubs.length}; kept the previous directory`,
    );

  const result = await syncOrgs(deps.store, clubs);
  await deps.cache.save(SNAPSHOT_KEY, { fetched_at: new Date().toISOString(), clubs });
  return result;
}
