# Comet Arena — Implementation Task List

> Derived from `full_context.md`, `product_spec.md`, `engineering_spec.md`.
> Single global numbering. Work top to bottom; every task is sequenced after its dependencies.
> **Rule:** one task = one commit (`Task N: <title>`), pushed to `claude/lucid-edison-8c7ns1`.
> **Progress:** tasks 1-98 complete (✅). Sections A-I done: foundation, database, design system, auth, mock layer, extraction/dedupe/publish pipeline, public discovery, save/schedule/calendar, and the warning/digest/change email jobs.
> **Priority tags:** P0 = launch-blocking core loop · P1 = important · P2 = depth/later.
> **Never cut:** ingestion → listing → save → warning.
> Each task lists **Objective**, **Files/Where**, and **Done when** (verifiable).

Note on the skill's hackathon framing: these specs describe a real launch product, not a time-boxed hackathon, so "demo" below means the Launch Demo (full_context §8) and "ship" means the §13 "Shipped means" checklist. The signature moment (flyer → Game Day page in ≤6 s) is protected throughout.

---

## A. Project foundation (P0)

1. ✅ **Initialize Next.js app (App Router, TypeScript, Tailwind).**
   Objective: scaffold a Next.js 15 app in the repo root with `src/`-less `app/` dir, TypeScript strict, Tailwind, ESLint, `npm run dev/build/lint/typecheck` scripts working. Keep existing spec files in place (move to `/docs` is NOT done; leave at root).
   Done when: `npm run build` and `npm run typecheck` pass on the empty scaffold.

2. ✅ **Repo hygiene.**
   Objective: `.gitignore` (node_modules, .next, .env*, eval outputs of secrets), `.nvmrc` (22), `.editorconfig`, Prettier config + `npm run format`, and a `README.md` with project one-liner, setup steps, and links to the three specs.
   Done when: README quickstart is accurate and `npm run lint` is clean.

3. ✅ **Environment config module.**
   Objective: `lib/env.ts` validating every variable in engineering_spec §12 with Zod (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `GROQ_API_KEY`, `EMBEDDINGS_API_KEY`, `META_IG_USER_ID`, `META_LONG_LIVED_TOKEN`, `APIFY_TOKEN`, `NEBULA_API_KEY`, `RESEND_API_KEY`, `EXTRACT_INTERNAL_KEY`, `SOURCES_MODE`, `APP_TIMEZONE`). Server-only vs public split; in `mock` mode only Supabase vars are required. Ship `.env.example` with every key and a comment.
   Done when: app boots in mock mode with only Supabase vars; missing vars give a readable error.

4. ✅ **Shared types and Zod schemas.**
   Objective: `lib/schemas/` with Zod schemas + inferred types for: extraction response (§4), `GameCardDTO`, `GameDayDTO`, stage, eligibility, submission, free-agent post, team opening, entry, all enums from §3 (status, tier, cost, format, source, result, window, ig_account_type). One enum source of truth reused by DB types and UI.
   Done when: schemas compile and a unit test parses a sample extraction JSON.

5. ✅ **Test tooling.**
   Objective: Vitest for unit tests, `npm test`, a `tests/` folder, and Playwright config (chromium, `--trace off`) for e2e smoke later.
   Done when: a trivial test passes in CI-like run.

6. ✅ **CI workflow.**
   Objective: `.github/workflows/ci.yml` running install, lint, typecheck, unit tests, build on every push/PR.
   Done when: workflow file is valid YAML and mirrors local commands.

7. ✅ **Vercel deployment config (early deploy).**
   Objective: `vercel.json` (region, cron-free since jobs are GitHub Actions), document in README the Vercel project setup + env var list; ensure `next.config` has image remote patterns for Supabase storage + Instagram CDN.
   Done when: README has a step-by-step "Deploy" section; build is Vercel-compatible.

## B. Database (P0)

8. ✅ **Supabase project scaffolding.**
   Objective: `supabase/config.toml`, `supabase/migrations/`, `supabase/seed/` folders; document local start with the Supabase CLI.
   Done when: structure exists and README explains `supabase start`.

9. ✅ **Migration 001 — extensions and enums.**
   Objective: enable `pgvector`, `pgcrypto`, `pg_trgm`; create all enums (ig_account_type, tier, cost, format, competition_status, source_type, queue_kind, queue_status, submission_status, ingest_class, free_agent_status, entry_result, warning_window).
   Done when: migration applies cleanly on a fresh DB.

10. ✅ **Migration 002 — orgs, users, competitions core tables.**
    Objective: `orgs`, `users` (FK auth.users, `ics_token` default random 32-char), `competitions` (incl. `embedding vector(768)`), `competition_sources`, `stages`, `eligibility` exactly per §3 with FKs, defaults, checks (`confidence` 0–1, team_min ≤ team_max).
    Done when: applies; `\d` shows all columns/types from §3.

11. ✅ **Migration 003 — user-scoped tables.**
    Objective: `saves`, `warnings_sent`, `free_agents` (unique user+competition), `team_openings`, `entries`, `flags`, `email_subscribers`.
    Done when: applies; constraints/PKs match §3.

12. ✅ **Migration 004 — pipeline tables.**
    Objective: `ingest_posts`, `submissions`, `review_queue`, `nebula_cache`.
    Done when: applies.

13. ✅ **Migration 005 — indexes.**
    Objective: `stages(deadline_at)`, `competitions(status)`, GIN `competitions(categories)`, full-text GIN on title+host_name+description (generated `tsvector` column), ivfflat on `competitions(embedding)` (cosine), trigram on title, `saves(competition_id)`, `warnings_sent(stage_id)`.
    Done when: applies; `EXPLAIN` of a category filter uses the GIN index.

14. ✅ **Migration 006 — updated_at triggers + slug generator.**
    Objective: trigger keeping `updated_at` fresh; SQL function to generate unique slugs from titles (`title-yyyy-mm` suffix on collision).
    Done when: inserting two same-title comps yields distinct slugs.

15. ✅ **Migration 007 — auth hook and user bootstrap.**
    Objective: DB trigger on `auth.users` insert creating the `users` row; sign-up hook rejecting non-`@utdallas.edu` emails (case-insensitive).
    Done when: SQL test shows a gmail signup rejected and a utdallas signup creates a `users` row with an `ics_token`.

16. ✅ **Migration 008 — Row-Level Security.**
    Objective: RLS on every table per §3: public read on competitions/stages/eligibility/sources/orgs; owner-only on saves/entries/free_agents/team_openings; contact-email view `board_contacts` restricted to `authenticated`; admin-only on review_queue/submissions/ingest_posts; `is_admin` helper function.
    Done when: pgTAP (or SQL script) tests prove anon cannot read `users.email`, user A cannot read user B's saves/entries, non-admin cannot read review_queue.

17. ✅ **Migration 009 — SQL helper functions.**
    Objective: `competition_next_deadline(id)`, view `competition_cards` (competition + next upcoming stage + countdown source), `match_competitions(embedding, threshold, window_days)` for dedupe, and `stages_due_between(from,to)` for warnings.
    Done when: functions return expected rows in a seeded test.

18. ✅ **Supabase client modules.**
    Objective: `lib/supabase/server.ts` (SSR client w/ cookies), `lib/supabase/browser.ts`, `lib/supabase/admin.ts` (service key, server-only, guarded by `import 'server-only'`), plus generated `lib/supabase/database.types.ts` script (`npm run db:types`).
    Done when: types generate and a server component can query `competitions`.

19. ✅ **Seed: orgs from UTD Clubs.**
    Objective: `supabase/seed/orgs.ts` that loads a UTD Clubs CSV/JSON snapshot (`fixtures/utdclubs-snapshot.json`) into `orgs` (622 clubs, 239 handles), idempotent upsert, never overwriting manual handles.
    Done when: running twice yields identical row counts.

20. ✅ **Seed: starter competitions.**
    Objective: `supabase/seed/competitions.ts` + `fixtures/starter-competitions.json` structure with ≥12 realistic sample competitions across ≥5 categories (live, past, expected) with stages and eligibility, clearly flagged as sample data until replaced by hand-collected real ones.
    Done when: seed runs; The Field has data on first load.

## C. Design system and shell (P0)

21. ✅ **Tailwind theme tokens.**
    Objective: add tokens: `court`, `turf`, `utd-orange #E87500`, `utd-green #154734`, `scoreboard`, `led`, `good/warn/critical`; WCAG AA contrast verified for text-on-surface pairs (document the ratios in a comment).
    Done when: a token showcase page `/dev/tokens` renders all colors with contrast labels.

22. ✅ **Typography.**
    Objective: load a condensed athletic display font (e.g., Oswald/Barlow Condensed) and clean sans (Inter) via `next/font`, `font-display` / `font-body` utilities, LED digit style for countdowns.
    Done when: headings use jersey face, body uses sans, no layout shift.

23. ✅ **Base UI primitives.**
    Objective: `Button`, `Input`, `Select`, `Chip`, `Dialog`, `Skeleton`, `EmptyState`, `ErrorState` (with retry), `Toast`. Consistent focus rings, 44px touch targets.
    Done when: all rendered on `/dev/tokens` in default/hover/disabled/loading states.

24. ✅ **`CategoryBadge`, `VerifyBadge`, `RoleChip`.**
    Objective: category list constant (case comp, hackathon, pitch, research, design, speaking, finance, other…) with color + icon mapping; verification states (`verified`, `unverified`, `expected`) with accessible labels.
    Done when: unit-tested label/ARIA mapping.

25. ✅ **`Countdown` component (LED).**
    Objective: LED-digit countdown (days/hours/min) with a text equivalent for screen readers (`aria-label="3 days 4 hours until deadline"`), SSR-safe (no hydration mismatch), updates each minute, "Closed" state.
    Done when: unit tests cover formatting for >1d, <1d, <1h, past.

26. ✅ **`StageTimeline` component (quarters).**
    Objective: renders stages as Q1…Qn timeline with date, CT label, current/next/past styling; handles date ranges and null `starts_at`.
    Done when: Storybook-less visual check at `/dev/tokens` for 1, 3, 5 stages.

27. ✅ **Date/time utilities (Central Time).**
    Objective: `lib/time.ts` with `formatCT()`, `relativeUpdated()` ("updated 3 days ago"), `daysUntil()`, always America/Chicago with "CT" suffix; DST-safe tests (Nov & Mar transitions).
    Done when: tests pass including DST edges.

28. ✅ **Navigation shell.**
    Objective: `app/(shell)/layout.tsx` with desktop `TopBar` and mobile `BottomTabs` (Scouting Report `/`, The Field `/field`, Schedule `/schedule`, Free Agency `/free-agency`, Player Card `/me`), active state, sign-in/out control, logo.
    Done when: tabs navigate on 375px and 1280px viewports.

29. ✅ **Deadline `Ticker`.**
    Objective: ESPN-style bottom ticker of next ~10 upcoming deadlines (server-fetched, cached 300 s), pauses on hover, respects `prefers-reduced-motion`, links to Game Day.
    Done when: ticker scrolls with seeded data and is static under reduced motion.

30. ✅ **Global states pattern.**
    Objective: standard `loading.tsx`, `error.tsx`, `not-found.tsx` for shell routes using the skeleton/empty/error components.
    Done when: forced errors show the retry UI.

## D. Auth (P0)

31. ✅ **Supabase Auth config.**
    Objective: configure Google OAuth + email magic link providers, redirect URLs, `@utdallas.edu` restriction note in README; local `config.toml` settings.
    Done when: README documents exact dashboard settings.

32. ✅ **Sign-in page and callback.**
    Objective: `/login` (Google button + magic link form), `/auth/callback` route exchanging the code, friendly error for non-UTD emails ("Use your @utdallas.edu address"), `next` param to return to the originating page.
    Done when: gmail login shows the error state; utdallas login lands back on the page.

33. ✅ **Session handling + middleware.**
    Objective: `middleware.ts` refreshing Supabase session cookies; helpers `getUser()`, `requireUser()`, `requireAdmin()` for server components/route handlers.
    Done when: protected routes redirect to `/login?next=`.

34. ✅ **Sign-in-then-complete pattern.**
    Objective: reusable `useRequireAuth()` / `<AuthGate>` that captures a pending action (e.g., save competition X), routes through login, and completes the action after return (CL-3 AC2).
    Done when: signed-out Save → login → returns with the item saved.

35. ✅ **Onboarding flow (`/onboarding`).**
    Objective: ≤60 s form: major (searchable list), class year, interest categories (multi), roles (multi: dev, design, finance, research, speaking…). Writes `users`. Redirects first-time sign-ins here; skippable with defaults. Editable later in profile settings.
    Done when: completing it sets fields and Scouting Report reflects them.

36. ✅ **Profile settings page.**
    Objective: `/settings` to edit major/year/interests/roles, toggle `email_warnings` and `digest`, show/regenerate `ics_token`, delete account data.
    Done when: changing major updates eligibility results immediately (edge case in §4).

## E. Mock layer and fixtures (P0)

37. ✅ **`SOURCES_MODE` switch + source adapter interface.**
    Objective: `lib/sources/index.ts` exposing typed adapters (`instagram`, `devpost`, `mlh`, `utdclubs`, `groq`, `embeddings`, `resend`) with `mock|live` implementations chosen by env.
    Done when: swapping env changes the adapter with no call-site changes.

38. ✅ **Mock fixtures.**
    Objective: `/fixtures`: 20 flyer images + captions (placeholder images until real flyers are collected, documented), 2 Devpost listings, 1 UTD Clubs snapshot, canned Groq responses per flyer.
    Done when: each fixture loads and validates against schemas.

39. ✅ **Failure injection + latency simulator.**
    Objective: mock adapters add 1–4 s latency, 10% malformed JSON, 5% timeouts, one 429 per run (deterministic seed option for tests).
    Done when: tests can force each failure type.

## F. Extraction and dedupe (P0 — the signature moment)

40. ✅ **Extraction prompt + category list.**
    Objective: `lib/extract/prompt.ts` building the system+user prompt with today's date, America/Chicago, category list, "never invent a date or link" rule, year-inference rule.
    Done when: snapshot test of prompt output.

41. ✅ **Groq vision client.**
    Objective: `lib/extract/groq.ts` calling the Groq Llama vision model: temperature 0, JSON mode, ≤10 images + caption, 8 s timeout, typed errors (timeout, rate-limit, invalid).
    Done when: mock + live implementations conform; live untested until key is provided.

42. ✅ **Image preprocessing.**
    Objective: skip/downscale images >5 MB (sharp), convert HEIC→JPEG, strip EXIF, cap 10 images.
    Done when: unit tests with fixture images pass.

43. ✅ **Validation + repair loop.**
    Objective: Zod-validate model output; on failure one repair call including the validation error; on second failure return `{kind:"error"}`.
    Done when: tests with the 10% malformed fixture hit repair and error paths.

44. ✅ **Post-processing: year inference and date ranges.**
    Objective: infer missing year as next occurrence after `posted_at`; convert "Nov 7–8" to one stage with start+end; normalize to America/Chicago.
    Done when: table-driven tests for 10 date shapes.

45. ✅ **Confidence scoring.**
    Objective: model self-score minus 0.1 for each of {no year, no register link, no stage date}, clamped 0–1; expose reasons list.
    Done when: tests cover each penalty and clamping.

46. ✅ **`POST /api/extract` route.**
    Objective: server-only route guarded by `EXTRACT_INTERNAL_KEY` header; wires preprocess → Groq → validate → postprocess → confidence; returns §4 response.
    Done when: curl with key returns JSON; without key returns 401.

47. ✅ **Embeddings adapter.**
    Objective: `lib/embeddings.ts` single function `embed(text): number[768]` behind the adapter interface (mock = deterministic hash vector; live = provider TBD).
    Done when: same text → same vector in mock; dimension 768 asserted.

48. ✅ **Dedupe service.**
    Objective: `lib/dedupe.ts`: build embedding text `title | host | first deadline | categories`; query `match_competitions` within ±45 days; ≥0.92 merge (add source, +1 confirmation, fill null fields only), 0.80–0.92 → `possible_duplicate` queue, <0.80 new; if embeddings down, publish as new and flag for re-run.
    Done when: unit tests for all three bands + outage path.

49. ✅ **Publish pipeline.**
    Objective: `lib/pipeline/publish.ts` taking an extraction → dedupe → write `competitions` (+stages, eligibility, sources, embedding) as `unverified` if confidence ≥0.8 else `review_queue(low_confidence)`; results-kind posts attach to matched listing; non-competition recorded only.
    Done when: integration test across the three outcomes.

50. ✅ **Edge-case handling in pipeline.**
    Objective: recurring annual comps as `expected`; repost with changed dates updates stages and records a "dates changed" event for savers; external comps `utd_only=false`; no register link → null ("Registration opens soon").
    Done when: tests for each §4 edge case.

## G. Public discovery (P0)

51. ✅ **`GET /api/competitions` route.**
    Objective: filters (q, categories[], format, cost, utd_only, beginner, from, to, include_past, host), default sort next upcoming deadline, cursor pagination, full-text search, returns `GameCardDTO[]`.
    Done when: integration tests for each filter and pagination.

52. ✅ **`GET /api/competitions/:slug` route.**
    Objective: returns `GameDayDTO` with stages, eligibility, sources, `viewer_save`, `viewer_eligible` (signed-in only).
    Done when: anon vs signed-in responses differ correctly.

53. ✅ **Eligibility check logic.**
    Objective: `lib/eligibility.ts` returns `qualifies | check | unknown` from user major/year vs `eligibility` arrays (empty = open to all).
    Done when: table-driven tests incl. empty arrays and cross_school.

54. ✅ **`GameCard` component.**
    Objective: title, host, category badges, next stage + `Countdown`, prize, `VerifyBadge`, `SaveButton` slot; skeleton variant.
    Done when: renders from DTO with all optional fields missing.

55. ✅ **The Field page (`/field`).**
    Objective: server-rendered list (revalidate 300), `FilterBar` bound to URL search params (category multi, format, cost, UTD-only, beginner, deadline window, host, search), "Include past" toggle, infinite/“load more”, empty and error states.
    Done when: shareable filtered URLs reproduce the same list; FCP target checked.

56. ✅ **Game Day page (`/game/[slug]`).**
    Objective: server-rendered (SEO + OG tags): `GameHeader`, `StageTimeline`, eligibility block, `EligibilityCheck`, prize/cost/format/location, `RegisterButton` ("Registration opens soon" fallback), `SourceList` (links to originals), `VerifyBadge`, "updated X days ago", `FlagButton` placeholder, Free Agency slot.
    Done when: a seeded competition renders every required element from product_spec P1-2.

57. ✅ **Open Graph share image.**
    Objective: dynamic `opengraph-image` for Game Day (title, next deadline, sports styling) for link sharing.
    Done when: image renders at `/game/[slug]/opengraph-image`.

58. ✅ **Org page (`/org/[slug]`).**
    Objective: host org profile with their listings (Game Day links host name to this page).
    Done when: org page lists that org's competitions.

## H. Save, Schedule, Calendar (P0 — core loop)

59. ✅ **Saves API.**
    Objective: `POST /api/saves`, `DELETE /api/saves/:competition_id`, idempotent, returns `{saved}`.
    Done when: double-POST doesn't error or duplicate.

60. ✅ **`SaveButton` with optimistic update.**
    Objective: TanStack Query mutation, optimistic toggle, rollback on error, signed-out → `AuthGate` flow, state synced across Field cards and Game Day.
    Done when: toggling on a card updates the Game Day button without reload.

61. ✅ **`GET /api/schedule`.**
    Objective: saved stages ordered by date grouped by ISO week.
    Done when: test with multi-stage saves yields correct grouping.

62. ✅ **Schedule page (`/schedule`).**
    Objective: `WeekGroup` → `StageRow` with countdowns, link to Game Day, empty state with CTA to The Field, past stages collapsed.
    Done when: saved comps appear with correct CT dates.

63. ✅ **iCalendar generator.**
    Objective: `lib/ics.ts` building RFC 5545 output: VEVENT per stage (all-day when no time), stable UID per stage, 1-day VALARM, `X-WR-CALNAME`, proper escaping/line folding, UPDATED via `DTSTAMP`/`SEQUENCE`.
    Done when: output validates with an ICS parser in tests.

64. ✅ **`GET /api/calendar/:ics_token.ics`.**
    Objective: token-authenticated feed, content-type `text/calendar`, 10-min cache per token, 404 on bad token, ≤500 ms.
    Done when: curl returns parsable calendar for a seeded user.

65. ✅ **`CalendarSubscribeButton`.**
    Objective: shows the personal feed URL (copy), "Add to Google Calendar" using Google's `render?cid=webcal://…` subscribe flow, Apple/Outlook instructions, regenerate token action.
    Done when: link format verified in a unit test.

## I. Emails — warnings and digest (P0)

66. ✅ **Email adapter (Resend) + templates.**
    Objective: `lib/email/` with mock/live senders, React Email (or plain HTML) templates for warning and digest, branded sports styling, plain-text alternative.
    Done when: templates render to HTML/text snapshots.

67. ✅ **Unsubscribe tokens + endpoints.**
    Objective: signed tokens (HMAC) for per-competition and global unsubscribe; `/unsubscribe` one-click page + RFC 8058 `List-Unsubscribe` headers.
    Done when: token tamper test fails; unsubscribe flips the right flag/save.

68. ✅ **`send-warnings` job logic.**
    Objective: `jobs/send-warnings.ts`: stages with deadline in [now+7d±30m] and [now+1d±30m] × savers with warnings on, minus `warnings_sent`; email names competition, stage, deadline in CT, register link; idempotency key `user+stage+window`; retry with backoff; insert `warnings_sent` only on success.
    Done when: running twice sends once; unit tests with a fake clock.

69. ✅ **`send-digest` job logic.**
    Objective: Sunday 6 PM CT: "Closing this week" (saved first) + "New this week" (profile-ranked) for users; unranked version for `email_subscribers`; skip empty digests.
    Done when: fixture run produces expected sections for both audiences.

70. ✅ **Subscribe (Comet Arena Weekly) endpoint + page.**
    Objective: `POST /api/subscribe` with double opt-in confirmation email, public signup form on the landing/Field page, rate-limited.
    Done when: confirm link activates the subscriber.

71. ✅ **Dates-changed notification.**
    Objective: when a repost changes stages, email savers once ("Dates changed for X") with old → new.
    Done when: test of change detection + single send.

## J. Report a Game (P0 — signature moment)

72. ✅ **`POST /api/submit`.**
    Objective: accepts URL or multipart image (JPG/PNG/HEIC ≤10 MB), stores image in Supabase Storage, fetches page text/OG image for URLs, calls extraction, runs dedupe preview, creates `submissions` row, returns `{submission_id, extracted, possible_match?}`; queues on outage with "we'll finish reading it shortly".
    Done when: integration tests for URL, image, oversize (413), wrong type, outage.

73. ✅ **`POST /api/submit/:id/confirm`.**
    Objective: validates required confirmations (title, ≥1 dated stage, register link or "no link yet"), publishes as `unverified` crediting the submitter, or merges (`merge_into`) adding a confirmation.
    Done when: both publish and merge paths tested.

74. ✅ **Storage bucket + policies.**
    Objective: `flyers` bucket, owner-write/public-read for published flyers, size/type limits.
    Done when: anon cannot write; user can upload own file.

75. ✅ **`SourceInput` component.**
    Objective: link-or-upload with drag-drop, paste-image, camera on mobile, inline validation ("Add a link or an image").
    Done when: works on 375px.

76. ✅ **`ExtractionPreview` component.**
    Objective: skeleton fields + "Reading the flyer…", fields fill live as results arrive, every field editable, stages editor (add/remove/reorder), category chips, confidence/“we'll double-check” note, manual-entry fallback after 10 s.
    Done when: simulated slow/malformed/timeout mock states each render correctly.

77. ✅ **`DuplicatePrompt` + confirm UI.**
    Objective: "Same competition?" showing the matched Game Day card with Yes (adds confirmation) / No (publishes new).
    Done when: both choices hit the right API path.

78. ✅ **Report a Game page (`/report`).**
    Objective: compose steps 75–77, success screen linking to the new Game Day page; requires auth via `AuthGate`.
    Done when: end-to-end in mock mode: upload fixture flyer → fields → publish → page exists.

79. ✅ **Signature-moment cache + budget.**
    Objective: pre-extracted cached result for the demo flyer served when `DEMO_CACHE=1` or when live exceeds 6 s; measure and log extraction latency.
    Done when: demo flyer returns in ≤6 s on throttled network emulation.

## K. Free Agency (P0)

80. ✅ **Free agent & opening APIs.**
    Objective: `POST/PATCH /api/free-agents`, `POST/PATCH /api/team-openings` with validation (note ≤280 chars, one active free-agent post per user per competition, editable/closable).
    Done when: tests for uniqueness and ownership.

81. ✅ **Board API.**
    Objective: `GET /api/competitions/:id/board?role=`; contact emails only for authenticated users via the `board_contacts` view.
    Done when: anon response contains no emails.

82. ✅ **Auto-close job.**
    Objective: in `expire-past`, close posts once the competition's registration stage passes.
    Done when: test with fake clock.

83. ✅ **`FreeAgencyBoard` component.**
    Objective: tabs (Free agents / Team openings), role filter chips, post forms (dialog), contact reveal button, own-post edit/close, empty states.
    Done when: embedded on Game Day and functional.

84. ✅ **Free Agency tab page (`/free-agency`).**
    Objective: cross-competition view of the user's saved competitions' boards + their own posts.
    Done when: lists boards for saved comps.

## L. Player Card — private history (P0)

85. ✅ **Entries API.**
    Objective: `POST /api/entries`, `GET /api/me/entries`, update/delete; result enum, rounds advanced, team name, `season` computed, `verified_by_host=false` always from users.
    Done when: ownership + validation tests.

86. ✅ **`AddEntryDialog` on Game Day.**
    Objective: "I competed" flow from Game Day with participated…1st options.
    Done when: adds an entry visible in My Competitions.

87. ✅ **Player Card page (`/me`).**
    Objective: `PlayerCard` header (name, major, year, stat line: entered/advanced/placed), `EntryList` labeled "unverified", edit/delete, private-only note.
    Done when: stat line computes from entries.

88. ✅ **Résumé export.**
    Objective: "Copy as résumé list" and plain-text download: `Title — Result (Season), Team`.
    Done when: output snapshot test.

## M. Scouting Report (P0 thin slice)

89. ✅ **`GET /api/feed`.**
    Objective: filter to viewer eligibility, sort by next deadline, boost chosen interest categories (stable sort), cursor pagination.
    Done when: ranking tests with differing interests.

90. ✅ **Scouting Report page (`/`).**
    Objective: signed-in ranked feed with reasons chips ("Matches your major"), signed-out hero + public Field preview + Weekly signup; redirect to onboarding if profile empty.
    Done when: both states render.

## N. Ingestion jobs (P0)

91. ✅ **Job runner framework.**
    Objective: `jobs/lib/` with idempotent run wrapper, structured logging, run summary, admin failure notification email, resumable cursor stored in DB/`nebula_cache`.
    Done when: failing job emails admin (mock) and a rerun resumes.

92. ✅ **`sync-orgs` job.**
    Objective: UTD Clubs `club.all` + `club.getDirectoryInfo` (6 concurrent, 200 ms delay), upsert orgs, preserve manual handles, cache snapshot to `nebula_cache`, keep last cache on empty/schema change and alert.
    Done when: mock run + schema-change test.

93. ✅ **Instagram adapter — Business Discovery.**
    Objective: `lib/sources/instagram.ts` live impl: query `media{caption,media_url,permalink,timestamp,media_type,children{media_url}}` last 10 posts, 20 s timeout, usage-header parsing, exponential backoff, stop at 80% quota; no-account result → `personal_or_missing`.
    Done when: contract tests against recorded fixtures.

94. ✅ **Instagram adapter — Apify fallback.**
    Objective: batch personal-account fetch, 5-minute abort, monthly credit-exhaustion handling, admin alert.
    Done when: mocked failure paths tested.

95. ✅ **`ingest-instagram` job.**
    Objective: per org with handle: fetch → skip known `ig_post_id` → extract → publish pipeline → record `ingest_posts` classification (never reprocess non-competitions); sequential 2 s spacing; link listing to original post; resume from last processed org.
    Done when: mock run twice creates no duplicates; ≤30 min budget logged.

96. ✅ **`classify-accounts` job.**
    Objective: weekly retest of `personal_or_missing` handles with Business Discovery.
    Done when: account type flips in a mock.

97. ✅ **`ingest-feeds` (Devpost + MLH).**
    Objective: fetch DFW + virtual listings, text-only extraction, dedupe, publish; parse-error → skip + alert.
    Done when: fixtures produce listings.

98. ✅ **`expire-past` job.**
    Objective: mark competitions past once last stage passed; close Free Agency posts; flip `expected` stale ones.
    Done when: fake-clock test.

99. **GitHub Actions workflows.**
    Objective: one workflow per job with correct CT-converted UTC cron (DST-aware strategy documented), secrets wiring, concurrency groups, failure notification.
    Done when: YAML lints; schedules match §6.

100.  **Meta token refresh job.**
      Objective: monthly `refresh-token` workflow refreshing the long-lived token and writing back to secrets (or alerting for manual rotation).
      Done when: dry-run logs expected calls.

## O. Admin and review queue (P0)

101. **Admin guard + layout (`/admin`).**
     Objective: `requireAdmin`, nav for Review, Submissions, Ingest runs, Orgs.
     Done when: non-admin gets 403.

102. **Review queue UI + API.**
     Objective: `GET/POST /api/admin/review`: list low-confidence and possible-duplicate items with source image side-by-side; approve, edit, merge (pick target), reject.
     Done when: each action resolves the queue item and updates competitions.

103. **Admin org handle editor.**
     Objective: add/fix Instagram handles + account type for the competition-heavy clubs (supports the 47 missing-handle workflow), bulk CSV import.
     Done when: import updates handles and reports skipped rows.

## P. Eval harness (P0 gate before live ingestion)

104. **Eval dataset format + labeling tool.**
     Objective: `/eval/cases.jsonl` schema; helper script to scaffold a case from an Instagram post URL; document labeling rules (title, host, first deadline, register URL, categories; 10 non-competition, 5 results).
     Done when: schema validator passes sample cases.

105. **Eval runner (`npm run eval`).**
     Objective: run image+caption pipeline and caption-only baseline; metrics: exact first-deadline, normalized title and URL, is_competition precision/recall, category F1; per-field table + failure list; write `/eval/report.md`.
     Done when: runs on fixture cases end to end (mock).

106. **Dedupe eval.**
     Objective: 15 duplicate pairs + 30 non-duplicates, sweep thresholds, report best 0.92/0.80 pair.
     Done when: report prints precision/recall per threshold.

107. **Eval gate in CI/docs.**
     Objective: document "run before enabling live ingestion and after prompt changes"; optional CI job that fails if mock-eval regresses.
     Done when: README section + workflow step.

## Q. Quality: tests, accessibility, performance (P0/P1)

108. **API integration test suite.**
     Objective: tests across every route's auth/validation/error paths against a local Supabase.
     Done when: suite green in CI.

109. **Playwright smoke: core loop.**
     Objective: e2e: browse Field → open Game Day → sign in (test user) → save → Schedule shows stages → ICS feed parses.
     Done when: passes headless.

110. **Playwright smoke: Report a Game + Free Agency.**
     Objective: e2e: upload fixture flyer → edit → publish → post free agent → opening appears.
     Done when: passes headless.

111. **Accessibility pass.**
     Objective: axe checks on every page, keyboard navigation, focus management in dialogs, text equivalents for countdowns, contrast audit.
     Done when: zero serious axe violations.

112. **Performance pass.**
     Objective: Lighthouse on Field/Game Day (mobile, 4G throttle) FCP ≤2 s; ISR caching verified; image optimization; DB query ≤150 ms (add EXPLAIN checks).
     Done when: numbers recorded in `docs/perf.md`.

113. **Failure-state audit.**
     Objective: walk product_spec §5 table row by row with mock failure injection; each cell has an observed behavior matching spec.
     Done when: checklist in `docs/failure-states.md` fully ticked.

114. **Security and privacy review.**
     Objective: verify RLS, no email exposure to anon, service key never in client bundle, internal key on `/api/extract`, rate limits on submit/subscribe, token entropy, only public captions/images stored.
     Done when: checklist committed with any fixes.

## R. P1 features

115. **Flags and confirmations.**
     Objective: `POST /api/flags`, `POST /api/confirm/:competition_id`; 3 confirmations removes "unverified"; `FlagButton` form; admin flag list.
     Done when: third confirmation flips verification.

116. **Front Office — claim org.**
     Objective: `POST /api/orgs/:id/claim` pending claim, admin approve, `claimed_by` set.
     Done when: approved officer sees `/office`.

117. **Front Office — edit listings + upload results.**
     Objective: officer edits their listings (marks `live`/verified), uploads results (CSV or form) creating `entries` with `verified_by_host=true`.
     Done when: results appear on matching users' Player Cards labeled verified.

118. **Scouting Report ranking v2 (Nebula courses).**
     Objective: Nebula API courses cached in `nebula_cache`; match `course_prereqs`; embeddings similarity boost from interests.
     Done when: ranking explains boosts; falls back to deadline sort if Nebula is down.

119. **`ingest-events` (UTD Clubs events + CampusGroups).**
     Objective: next 120 days → competition classifier → pipeline.
     Done when: mock run publishes classified events.

120. **`ingest-dept` (department pages + newsletter webhook).**
     Objective: configured page fetchers + inbound email webhook parser.
     Done when: fixture page and email produce listings.

121. **Free Agency role matching.**
     Objective: match score between free-agent roles and openings; "Suggested matches" panel.
     Done when: ranking tests.

## S. P2 depth (only after P0 shipped)

122. **Verified points + Standings.**
     Objective: points formula, season/category/major/org standings pages, "AIS members won 7 competitions" stat.
     Done when: standings compute from verified entries.

123. **Awards, past winners on Game Day, prep resources.**
     Objective: badge set, past-winners section, resources links per competition.
     Done when: rendered from data.

124. **Discord bot + push notifications.**
     Objective: channel alerts for new games and deadlines; web push opt-in.
     Done when: test message delivered.

## T. Launch and deployment (P0)

125. **Production Supabase + migrations applied.**
     Objective: create prod project, apply migrations, configure auth providers/redirects, storage bucket, backups.
     Done when: `/field` reads prod data.

126. **Vercel production deploy + domain.**
     Objective: production on `main`, preview per PR, env vars set, custom domain + HTTPS, Resend domain verified (SPF/DKIM).
     Done when: production URL live.

127. **Meta app setup + App Review submission.**
     Objective: business IG account, Facebook Page link, Meta app, token, submit App Review; document status; keep jobs on mock/limited until approved.
     Done when: token works for a test handle.

128. **Real data load.**
     Objective: hand-collect/fill 47 competition-heavy club handles, run eval on 50 real flyers, ingest to ≥40 live + ≥50 past listings across ≥5 categories.
     Done when: counts verified by SQL.

129. **Ingestion burn-in.**
     Objective: enable scheduled jobs live; green 3 consecutive days; warnings + digest delivered to a test account.
     Done when: Actions history shows 3 green days.

130. **Launch demo assets.**
     Objective: demo script rehearsal, cached fallback verified, seeded Standings labeled as past real results, Weekly signup live (≥150 subscriber validation goal tracked).
     Done when: 90-second script runs end to end on a phone.

131. **Final "Shipped" checklist.**
     Objective: verify all §13 criteria; commit eval report with ≥90% on title/first deadline/register link; update README with live URL.
     Done when: every box ticked in `docs/ship-checklist.md`.
