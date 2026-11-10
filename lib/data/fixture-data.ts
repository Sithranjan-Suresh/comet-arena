import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CompetitionPage } from "@/lib/data/competitions";
import type { GameCardDTO, GameDayDTO } from "@/lib/schemas";
import { type CompetitionQuery, decodeCursor, encodeCursor } from "@/lib/schemas/competition-query";
import {
  buildSeedCompetitions,
  starterFileSchema,
  type SeedCompetition,
} from "@/lib/seed/competitions";

/**
 * Dev/mock-mode stand-in for the database: serves the starter competitions from fixtures/ with the
 * same filtering and ordering rules as `queryCompetitions`, so every public page can be exercised
 * without Supabase. Never used when Supabase is configured.
 */

const uuid = (seed: string): string => {
  const h = createHash("sha1").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

let cachedFile: ReturnType<typeof starterFileSchema.parse> | undefined;
function fixtures() {
  cachedFile ??= starterFileSchema.parse(
    JSON.parse(
      readFileSync(path.resolve(process.cwd(), "fixtures/starter-competitions.json"), "utf8"),
    ),
  );
  return cachedFile.competitions;
}

interface Built {
  seed: SeedCompetition;
  id: string;
  stages: GameDayDTO["stages"];
  next: GameDayDTO["stages"][number] | null;
  hasUpcoming: boolean;
}

function build(now: Date): Built[] {
  return buildSeedCompetitions(fixtures(), now).map((seed) => {
    const stages = seed.stages.map((s, i) => ({
      id: uuid(`${seed.slug}:stage:${i}`),
      name: s.name,
      starts_at: s.starts_at,
      deadline_at: s.deadline_at,
      order: s.order,
    }));
    const upcoming = stages.filter((s) => new Date(s.deadline_at).getTime() >= now.getTime());
    const next =
      upcoming.sort((a, b) => a.deadline_at.localeCompare(b.deadline_at))[0] ??
      [...stages].sort((a, b) => b.deadline_at.localeCompare(a.deadline_at))[0] ??
      null;
    return { seed, id: uuid(seed.slug), stages, next, hasUpcoming: upcoming.length > 0 };
  });
}

const hostSlug = (b: Built) => b.seed.host_org_slug || null;

function toCard(b: Built): GameCardDTO {
  const c = b.seed.competition;
  return {
    id: b.id,
    slug: c.slug,
    title: c.title,
    host_name: c.host_name,
    host_slug: hostSlug(b),
    categories: c.categories as GameCardDTO["categories"],
    prize: c.prize,
    status: c.status,
    next_stage: b.next,
    viewer_saved: false,
  };
}

export function queryFixtureCompetitions(
  q: CompetitionQuery,
  now: Date = new Date(),
): CompetitionPage {
  const statuses = q.include_past
    ? ["live", "unverified", "expected", "past"]
    : ["live", "unverified", "expected"];
  const needle = q.q?.toLowerCase().trim();
  const host = q.host?.toLowerCase().trim();
  const from = q.from ? new Date(`${q.from}T00:00:00-06:00`).getTime() : null;
  const to = q.to ? new Date(`${q.to}T23:59:59-05:00`).getTime() : null;

  const rows = build(now)
    .filter((b) => statuses.includes(b.seed.competition.status))
    .filter(
      (b) =>
        !q.categories.length || b.seed.competition.categories.some((c) => q.categories.includes(c)),
    )
    .filter((b) => !q.format || b.seed.competition.format === q.format)
    .filter((b) => !q.cost || b.seed.competition.cost === q.cost)
    .filter((b) => q.utd_only === undefined || b.seed.competition.utd_only === q.utd_only)
    .filter((b) => q.beginner === undefined || b.seed.competition.beginner_friendly === q.beginner)
    .filter((b) => {
      if (from === null && to === null) return true;
      if (!b.next) return false;
      const t = new Date(b.next.deadline_at).getTime();
      return (from === null || t >= from) && (to === null || t <= to);
    })
    .filter(
      (b) =>
        !host ||
        hostSlug(b)?.toLowerCase() === host.replace(/ /g, "-") ||
        b.seed.competition.host_name?.toLowerCase().includes(host),
    )
    .filter(
      (b) =>
        !needle ||
        [
          b.seed.competition.title,
          b.seed.competition.host_name,
          b.seed.competition.description,
        ].some((t) => t?.toLowerCase().includes(needle)),
    )
    .sort(
      (a, b) =>
        Number(b.hasUpcoming) - Number(a.hasUpcoming) ||
        (a.next?.deadline_at ?? "9999").localeCompare(b.next?.deadline_at ?? "9999") ||
        a.id.localeCompare(b.id),
    );

  const offset = decodeCursor(q.cursor);
  const page = rows.slice(offset, offset + q.limit);
  return {
    items: page.map(toCard),
    next_cursor: rows.length > offset + q.limit ? encodeCursor(offset + q.limit) : null,
  };
}

export function getFixtureGameDay(slug: string, now: Date = new Date()): GameDayDTO | null {
  const b = build(now).find((x) => x.seed.competition.slug === slug);
  if (!b) return null;
  const c = b.seed.competition;
  return {
    id: b.id,
    slug: c.slug,
    title: c.title,
    host_name: c.host_name,
    host_slug: hostSlug(b),
    categories: c.categories as GameDayDTO["categories"],
    description: c.description,
    tier: c.tier,
    prize: c.prize,
    cost: c.cost,
    format: c.format,
    location: c.location,
    register_url: c.register_url,
    utd_only: c.utd_only,
    beginner_friendly: c.beginner_friendly,
    status: c.status,
    confirmations: 0,
    flyer_url: null,
    updated_at: new Date(now.getTime() - 2 * 86_400_000).toISOString(),
    stages: b.stages,
    eligibility: { ...b.seed.eligibility, course_prereqs: [] },
    sources: [
      {
        source: "host",
        source_url: c.register_url,
        seen_at: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
      },
    ],
    viewer_saved: false,
    viewer_eligible: null,
  };
}

export function fixtureSlugs(): string[] {
  return fixtures().map((f) => f.slug);
}
