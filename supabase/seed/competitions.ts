// Seeds sample competitions (idempotent by slug). Deadlines are relative to the run date.
//   npm run seed:competitions
import { readFileSync } from "node:fs";
import { createJobClient } from "../../jobs/lib/db";
import { buildSeedCompetitions, starterFileSchema } from "../../lib/seed/competitions";

const file =
  process.argv[2] ?? new URL("../../fixtures/starter-competitions.json", import.meta.url).pathname;
const fixtures = starterFileSchema.parse(JSON.parse(readFileSync(file, "utf8"))).competitions;
const db = createJobClient();

const { data: orgs, error: orgErr } = await db.from("orgs").select("id,slug");
if (orgErr) throw orgErr;
const orgBySlug = new Map((orgs ?? []).map((o) => [o.slug, o.id]));

let n = 0;
for (const seed of buildSeedCompetitions(fixtures, new Date())) {
  const { data: comp, error } = await db
    .from("competitions")
    .upsert(
      { ...seed.competition, host_org_id: orgBySlug.get(seed.host_org_slug) ?? null },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (error) throw error;

  // Replace dependent rows so re-running keeps exactly the fixture's stages.
  await db.from("stages").delete().eq("competition_id", comp.id);
  if (seed.stages.length) {
    const { error: e } = await db
      .from("stages")
      .insert(seed.stages.map((s) => ({ ...s, competition_id: comp.id })));
    if (e) throw e;
  }
  const { error: eligErr } = await db
    .from("eligibility")
    .upsert({ competition_id: comp.id, ...seed.eligibility }, { onConflict: "competition_id" });
  if (eligErr) throw eligErr;

  await db
    .from("competition_sources")
    .delete()
    .eq("competition_id", comp.id)
    .eq("external_id", `seed:${seed.slug}`);
  const { error: srcErr } = await db.from("competition_sources").insert({
    competition_id: comp.id,
    source: "host",
    source_url: seed.competition.register_url,
    external_id: `seed:${seed.slug}`,
  });
  if (srcErr) throw srcErr;
  n++;
}
console.log(`seeded ${n} competitions from ${file}`);
