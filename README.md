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
