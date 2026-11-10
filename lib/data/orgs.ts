import { readFileSync } from "node:fs";
import path from "node:path";
import { unstable_cache } from "next/cache";
import { isMockMode } from "@/lib/env";
import { type Snapshot, snapshotSchema } from "@/lib/orgs/merge";
import { createSupabasePublicClient } from "@/lib/supabase/public";

export interface OrgDTO {
  id: string;
  name: string;
  slug: string;
  tags: string[];
  verified: boolean;
  ig_handle: string | null;
  discord_url: string | null;
}

let snapshot: Snapshot | undefined;
function fixtureOrg(slug: string): OrgDTO | null {
  snapshot ??= snapshotSchema.parse(
    JSON.parse(
      readFileSync(path.resolve(process.cwd(), "fixtures/utdclubs-snapshot.json"), "utf8"),
    ),
  );
  const c = snapshot.clubs.find((x) => x.slug === slug);
  return c
    ? {
        id: `fixture-${c.slug}`,
        name: c.name,
        slug: c.slug,
        tags: c.tags,
        verified: false,
        ig_handle: null,
        discord_url: c.discord ?? null,
      }
    : null;
}

export const getOrgBySlug = unstable_cache(
  async (slug: string): Promise<OrgDTO | null> => {
    const db = createSupabasePublicClient();
    if (db) {
      const { data, error } = await db
        .from("orgs")
        .select("id,name,slug,tags,verified,ig_handle,discord_url")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
    if (isMockMode()) return fixtureOrg(slug);
    throw new Error("Supabase is not configured");
  },
  ["org"],
  { revalidate: 300, tags: ["competitions", "orgs"] },
);
