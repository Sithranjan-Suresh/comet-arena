import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { DigestCompetition, DigestDeps, DigestUser } from "./send-digest";

interface Row {
  id: string;
  slug: string;
  title: string;
  host_name: string | null;
  categories: string[];
  created_at: string;
  status: "live" | "unverified" | "expected";
  stages: { name: string; deadline_at: string }[] | null;
  eligibility: DigestCompetition["eligibility"] | DigestCompetition["eligibility"][] | null;
}

export function toDigestCompetition(r: Row, now: Date): DigestCompetition {
  const next = [...(r.stages ?? [])]
    .filter((s) => new Date(s.deadline_at).getTime() >= now.getTime())
    .sort((a, b) => a.deadline_at.localeCompare(b.deadline_at))[0];
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    host_name: r.host_name,
    categories: r.categories,
    created_at: r.created_at,
    status: r.status,
    next_stage_name: next?.name ?? null,
    next_deadline_at: next?.deadline_at ?? null,
    eligibility: (Array.isArray(r.eligibility) ? r.eligibility[0] : r.eligibility) ?? null,
  };
}

/** Service-role persistence for the digest job. */
export function supabaseDigestStore(
  db: SupabaseClient<Database>,
): Pick<DigestDeps, "loadCompetitions" | "loadUsers" | "loadSaved" | "loadSubscribers"> {
  return {
    async loadCompetitions(now) {
      const { data, error } = await db
        .from("competitions")
        .select(
          "id,slug,title,host_name,categories,created_at,status,stages(name,deadline_at),eligibility(majors,class_years,course_prereqs,cross_school)",
        )
        .in("status", ["live", "unverified", "expected"]);
      if (error) throw error;
      return ((data ?? []) as unknown as Row[]).map((r) => toDigestCompetition(r, now));
    },

    async loadUsers() {
      const { data, error } = await db
        .from("users")
        .select("id,email,name,major,class_year,interests,courses")
        .eq("digest", true);
      if (error) throw error;
      return (data ?? []) as DigestUser[];
    },

    async loadSaved(userIds) {
      const out = new Map<string, Set<string>>();
      for (let i = 0; i < userIds.length; i += 200) {
        const { data, error } = await db
          .from("saves")
          .select("user_id,competition_id")
          .in("user_id", userIds.slice(i, i + 200));
        if (error) throw error;
        for (const r of data ?? []) {
          if (!out.has(r.user_id)) out.set(r.user_id, new Set());
          out.get(r.user_id)!.add(r.competition_id);
        }
      }
      return out;
    },

    async loadSubscribers() {
      const { data, error } = await db
        .from("email_subscribers")
        .select("email")
        .not("confirmed_at", "is", null);
      if (error) throw error;
      return (data ?? []).map((r) => r.email);
    },
  };
}
