import { SourceError } from "@/lib/sources/errors";
import type { InstagramSource } from "@/lib/sources";
import type { IgOrg } from "./ingest-instagram";

export interface ClassifyStore {
  listPersonal(): Promise<IgOrg[]>;
  setAccountType(orgId: string, type: IgOrg["ig_account_type"]): Promise<void>;
}

export interface ClassifySummary {
  checked: number;
  upgraded: number;
  still_personal: number;
  errors: number;
  incomplete: boolean;
}

/**
 * Weekly: handles we routed to Apify (`personal_or_missing`) get re-tested with Business Discovery,
 * since clubs sometimes switch to a Business/Creator account. A hit flips the type so the daily
 * ingest uses the cheaper, official path. Quota stops end the run early (incomplete) and are not errors.
 */
export async function runClassifyAccounts(deps: {
  store: ClassifyStore;
  instagram: InstagramSource;
  sleep?: (ms: number) => Promise<void>;
  spacingMs?: number;
  log?: (e: string, d?: Record<string, unknown>) => void;
}): Promise<ClassifySummary> {
  const sleep = deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const s: ClassifySummary = {
    checked: 0,
    upgraded: 0,
    still_personal: 0,
    errors: 0,
    incomplete: false,
  };
  for (const org of await deps.store.listPersonal()) {
    try {
      const res = await deps.instagram.fetchRecentPosts(org.ig_handle, { limit: 1 });
      s.checked++;
      if (res.status === "ok") {
        await deps.store.setAccountType(org.id, "business");
        s.upgraded++;
      } else s.still_personal++;
    } catch (e) {
      if (e instanceof SourceError && e.kind === "rate_limit") {
        s.incomplete = true;
        deps.log?.("quota_stop", { at_org: org.id });
        break;
      }
      s.errors++;
      deps.log?.("org_failed", { org: org.id, error: String((e as Error).message ?? e) });
    }
    await sleep(deps.spacingMs ?? 2000);
  }
  return s;
}
