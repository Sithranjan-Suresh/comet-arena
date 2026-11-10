# Performance

Budget (product_spec §7): first contentful paint at most 2 s on a phone over 4G; any database query at most 150 ms.

## Web, measured

`PERF=1 npx playwright test e2e/perf.spec.ts --project=mobile` runs the production build in Chromium with
Pixel 7 emulation, a "slow 4G" network (1.6 Mbps down, 150 ms RTT) and 4x CPU slowdown. The measured load
starts with an empty browser cache; the server cache is warm. Run on 2026-11-10, mock data:

| Page      |    FCP |    LCP | Transferred |
| --------- | -----: | -----: | ----------: |
| The Field | 0.80 s | 0.80 s |      402 KB |
| Game Day  | 0.76 s | 0.76 s |      409 KB |
| Home      | 1.05 s | 2.34 s |      389 KB |

All pages are inside the 2 s FCP budget. The home page LCP (2.3 s) is the hero headline waiting for the web
font; if it creeps over 2.5 s, preload the display font or fall back to `font-display: optional` for the hero.

Real data will make The Field's first page heavier (20 cards instead of the fixture set). Re-run after the
real data load (Task 128) and record the numbers here.

## Caching

| Route                              | Rendering                         | Notes                                                                                           |
| ---------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/`, `/game/[slug]`, `/org/[slug]` | ISR, `s-maxage=300`               | First request renders, later ones are cache hits. Verified by `e2e/caching.spec.ts`.            |
| `/field`                           | Dynamic (filters live in the URL) | Backed by `unstable_cache` (5 min, tag `competitions`), so repeat views never hit the database. |
| Signed-in pages and `/api/*`       | `private, no-store`               | Per-user data.                                                                                  |

Publishing a competition calls `revalidateTag("competitions")`, so new listings appear without waiting for the
5-minute window. Viewer-specific state (saved, eligibility, free agents) loads client-side after the cached
HTML, which is why those pages can be shared by every visitor.

**Bug fixed during this pass:** the Save button read the query string with `useSearchParams()`, which forced every
page that rendered it out of static rendering. It now reads `window.location.search` when clicked.

## Images

Public pages render no user flyers inline (Game Day and the Field use text and badges; flyers appear only in
the Open Graph image). The few `<img>` tags are local upload previews and the admin review screen, which load
object URLs or one image at a time, so `next/image` would add cost without benefit. Uploaded images are
downscaled to at most 2000 px and 5 MB before extraction (`lib/extract/images.ts`).

## Database

`supabase/perf/explain.sql` loads about 10x the launch volume (2,000 competitions, 6,000 stages, 5,000 users,
40,000 saves, 768-dimension embeddings) into the throwaway Postgres and times every hot query. It fails if any
takes more than 150 ms.

```bash
scripts/db-test.sh reset && scripts/db-test.sh psql -f supabase/perf/explain.sql
```

| Query                                          |    Time |
| ---------------------------------------------- | ------: |
| Digest: saves with a stage in the next 14 days | 13.7 ms |
| Field default page                             |  8.0 ms |
| Warnings: stages due in a 1-hour window        |  6.5 ms |
| Field text search                              |  4.3 ms |
| Dedupe: nearest embeddings in a 45-day window  |  4.1 ms |
| Field filtered by category                     |  1.8 ms |
| Schedule: one user's saved stages              |  0.6 ms |
| Game Day lookup by slug                        |  0.2 ms |

The pgvector index (ivfflat) warns about low recall on small tables; it is fine at launch volume and worth
re-creating (`REINDEX`) after the first real data load.

**Bug fixed during this pass:** The Field's text search filtered the `competition_cards` view on a `description`
column the view did not expose. Mock mode reads fixtures, so it never failed there, but it would have returned
an error against a real database. Migration `20261110000019_cards_description.sql` adds the column and
`supabase/tests/04_helpers.sql` now asserts it.
