import Link from "next/link";
import { Suspense } from "react";
import { FieldResults } from "@/components/field/FieldResults";
import { FilterBar } from "@/components/field/FilterBar";
import { EmptyState, buttonClasses } from "@/components/ui";
import { getCompetitionsPage } from "@/lib/data/field";
import { activeFilterCount } from "@/lib/field-url";
import { parseCompetitionQuery } from "@/lib/schemas/competition-query";

export const metadata = {
  title: "The Field",
  description: "Every UTD competition, sorted by what is due next.",
};

type SearchParams = Record<string, string | string[] | undefined>;

function toParams(sp: SearchParams): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp))
    for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) p.append(k, x);
  return p;
}

export default async function FieldPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = toParams(await searchParams);
  // Invalid values in a hand-edited URL fall back to defaults instead of erroring.
  const parsed = parseCompetitionQuery(params);
  const query = parsed.success ? parsed.data : parseCompetitionQuery(new URLSearchParams()).data!;
  const filtered = activeFilterCount(params) > 0;

  const page = await getCompetitionsPage(query);

  const withoutCursor = new URLSearchParams(params);
  withoutCursor.delete("cursor");

  return (
    <>
      <h1 className="mb-1 text-4xl font-extrabold uppercase">The Field</h1>
      <p className="text-ink-muted mb-6">Every UTD competition, sorted by what is due next.</p>

      <Suspense fallback={null}>
        <FilterBar />
      </Suspense>

      {page.items.length === 0 ? (
        filtered ? (
          <EmptyState
            title="No competitions match"
            description="Try removing a filter or searching for something broader."
            action={
              <Link href="/field" className={buttonClasses("primary")}>
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="No competitions listed yet"
            description="Know one we missed? Add it in a few seconds from a link or a flyer."
            action={
              <Link href="/report" className={buttonClasses("primary")}>
                Report a Game
              </Link>
            }
          />
        )
      ) : (
        <FieldResults
          key={withoutCursor.toString()}
          initialItems={page.items}
          initialCursor={page.next_cursor}
          queryString={withoutCursor.toString()}
        />
      )}
    </>
  );
}
