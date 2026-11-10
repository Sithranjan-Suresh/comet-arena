# Comet Arena

Devpost for every UTD competition: find, track, team up for, and eventually run every case comp,
hackathon, pitch, research, design and speaking competition open to UT Dallas students.

**Thesis:** Never miss a UTD competition, and never compete alone.

**Core loop:** a competition post goes in → a structured, saveable listing comes out → the student
never misses a stage.

## Docs

- [`full_context.md`](full_context.md): vision, users, feature map, launch demo
- [`product_spec.md`](product_spec.md): requirements, user stories, edge cases, failure states
- [`engineering_spec.md`](engineering_spec.md): architecture, data model, APIs, jobs
- [`docs/auth-setup.md`](docs/auth-setup.md): Supabase Auth, Google OAuth and `@utdallas.edu` restriction setup
- [`TASKS.md`](TASKS.md): the ordered implementation checklist (one commit per task)

## Quickstart

Requires Node 22 (`nvm use`).

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run format`.

More setup (Supabase, env vars, deploy) is added by the tasks in `TASKS.md` as they land.

## Testing

```bash
npm test            # Vitest unit/integration tests
npm run test:e2e    # Playwright (builds and serves the app in SOURCES_MODE=mock)
```

If Playwright can't find its browser, set `PW_CHROMIUM_PATH` to a Chromium binary.

## Deploy (Vercel)

Web is hosted on Vercel (preview per PR, production on `main`). Scheduled jobs are **not** Vercel
crons; they run as GitHub Actions workflows (see `.github/workflows`).

1. Import the GitHub repo in Vercel (framework: Next.js; `vercel.json` pins region `dfw1`).
2. Add environment variables from `.env.example` for Production and Preview. Start with
   `SOURCES_MODE=mock`; switch to `live` only after the eval gate passes (see `TASKS.md` §P).
3. Set `NEXT_PUBLIC_APP_URL` to the production URL (used for calendar feeds and email links).
4. Add the custom domain, then verify the email sending domain (SPF/DKIM) in Resend.
5. Production deploys from `main`; every PR gets a preview URL.

Images from Supabase Storage and the Instagram/Facebook CDNs are allowed in `next.config.ts`.

## Database (Supabase)

Schema lives in `supabase/migrations` (applied in filename order). Two ways to run it locally:

- **Supabase CLI (full stack):** `supabase start` then `supabase db reset` (needs Docker).
  Link the hosted project with `supabase link --project-ref <ref>` and push with `supabase db push`.
- **Plain Postgres 16 + pgvector (no Docker):** `npm run db:test` starts a throwaway cluster, loads a
  minimal stand-in for Supabase's `auth` schema (`supabase/tests/bootstrap.sql`), applies every
  migration and runs the SQL tests in `supabase/tests/NN_*.sql`. Use this for migration and RLS work.

Seeds live in `supabase/seed` and are idempotent.

## Eval gate (extraction and dedupe quality)

The AI extraction decides what students see, so it is measured against hand-labeled posts
(`eval/README.md` has the labeling rules).

**Run it before turning on live ingestion, and again after every prompt, model or threshold change.**

```bash
npm run eval:validate -- --strict   # the real set needs 50+ posts (10 non-competitions, 5 results)
SOURCES_MODE=live npm run eval      # writes eval/report.md and eval/results.json
npm run eval:gate -- --absolute     # fails if first-deadline/title accuracy < 85% or is-competition precision/recall < 90%
SOURCES_MODE=live npm run eval:dedupe   # tune the 0.92 / 0.80 dedupe thresholds, writes eval/dedupe-report.md
```

The report compares the image + caption pipeline with a caption-only baseline, lists every failing case
field by field, and shows where the dedupe thresholds should sit. A wrong **merge** is the costly mistake
(it hides a real competition), so the dedupe report must show zero false merges.

CI runs the same harness on the fixture-seeded mock set (`eval/cases.jsonl`) and fails if any metric drops
more than 2 points below `eval/baseline.json`. That protects the pipeline code, not the model: the mock
model returns canned answers. After an intentional change, accept the new numbers with
`npm run eval:gate -- --update-baseline`.
