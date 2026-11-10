# Comet Arena — Engineering Spec

> Design only, no code. An engineer should be able to implement v1 from this without making major design decisions. Context: `full_context.md`. Requirements: `product_spec.md`.

---

## 1. Architecture

```
                         ┌──────────────────────── Sources ────────────────────────┐
                         │ UTD Clubs (club list)   CampusGroups   Devpost / MLH      │
                         │ Instagram: Business Discovery API  |  Apify (fallback)    │
                         │ Dept pages / newsletters           Student submissions    │
                         └───────────────┬──────────────────────────┬───────────────┘
                                         │ GitHub Actions cron       │ Next.js API route
                                         ▼                           ▼
                               ┌──────────────────┐        ┌──────────────────┐
                               │ ingest-* jobs     │        │ POST /api/submit │
                               └────────┬─────────┘        └────────┬─────────┘
                                        └────────────┬──────────────┘
                                                     ▼
                                      ┌──────────────────────────────┐
                                      │ Extraction service            │
                                      │ POST /api/extract (Groq)      │
                                      │ → JSON + confidence           │
                                      └──────────────┬───────────────┘
                                                     ▼
                                      ┌──────────────────────────────┐
                                      │ Dedupe (pgvector similarity)  │
                                      └──────┬───────────────┬───────┘
                                   ≥0.8 conf │               │ <0.8 or ambiguous
                                             ▼               ▼
                                   competitions (unverified)  review_queue
                                             │
                     ┌───────────────────────┼─────────────────────────┐
                     ▼                       ▼                         ▼
              Next.js app (Vercel)   send-warnings / digest      .ics feeds
              The Field, Game Day,   (Resend)                    /api/calendar
              Schedule, Free Agency,
              Player Card
                     │
                     ▼
              Supabase (Postgres + Auth + Storage + pgvector)
```

**Principles:** pages read only from Supabase (never live third-party APIs); every source feeds one extraction route; every job is idempotent and safe to re-run.

---

## 2. Shared backbone

- **One data model:** `competitions` + `stages` + `eligibility` are the spine; every pillar reads them. `saves`, `free_agents`, `team_openings`, `entries` hang off `competitions`.
- **Cross-pillar flows:**
  - Game Day Save → `saves` → Schedule, `.ics`, warnings, digest.
  - Game Day → Free Agency board filtered by `competition_id`.
  - Team formed → `entries` row → Player Card (and Standings in P2).
- **Navigation shell:** `app/(shell)/layout.tsx` holds the top bar (desktop) / bottom tab bar (mobile) and the deadline ticker. Tabs: Scouting Report `/`, The Field `/field`, Schedule `/schedule`, Free Agency `/free-agency`, Player Card `/me`. Game Day at `/game/[slug]`, Report a Game at `/report`, Front Office at `/office` (P1), Admin at `/admin`.
- **Design tokens (Tailwind theme):**
  - Colors: `court` (hardwood neutral, background), `turf` (deep green surface), `utd-orange` (#E87500), `utd-green` (#154734), `scoreboard` (near-black panel), `led` (amber digits), status `good/warn/critical`.
  - Type: a condensed jersey/athletic display face for headings and numerals; a clean sans for body.
  - Components: `GameCard`, `StageTimeline` (rounds as quarters), `Countdown` (LED digits), `CategoryBadge`, `VerifyBadge`, `Ticker`, `PlayerCard`, `RoleChip`.

---

## 3. Data model (Supabase Postgres)

| Table | Columns (type) | Notes |
|---|---|---|
| `orgs` | id uuid pk, name text, slug text unique, utdclubs_slug text, campusgroups_id text, ig_handle text, ig_account_type enum(business, creator, personal_or_missing, unknown), discord_url text, tags text[], verified bool, claimed_by uuid fk users, updated_at timestamptz | Seeded from UTD Clubs; handles filled manually |
| `competitions` | id uuid pk, slug text unique, title text, host_org_id uuid fk orgs null, host_name text, categories text[], description text, tier enum(campus, regional, national), prize text, cost enum(free, paid, unknown), format enum(in_person, virtual, hybrid, unknown), location text, nebula_room_id text null, register_url text null, utd_only bool, beginner_friendly bool, status enum(live, unverified, expected, past, rejected), confidence real, confirmations int default 0, flyer_url text, embedding vector(768), created_at, updated_at | `status=live` means verified |
| `competition_sources` | id, competition_id fk, source enum(instagram, submission, host, devpost, mlh, dept, utdclubs, campusgroups), source_url text, external_id text, seen_at | Many sources per competition |
| `stages` | id, competition_id fk, name text, starts_at timestamptz null, deadline_at timestamptz, order int | ≥1 per live competition |
| `eligibility` | competition_id pk fk, majors text[], class_years text[], course_prereqs text[], team_min int, team_max int, cross_school bool | Empty arrays = open to all |
| `users` | id uuid pk (auth.users), email text, name text, major text, class_year text, courses text[], interests text[], roles text[], email_warnings bool default true, digest bool default true, ics_token text unique, reputation int default 0, is_admin bool | `ics_token` is a random secret for the feed URL |
| `saves` | user_id fk, competition_id fk, created_at, pk(user_id, competition_id) | |
| `warnings_sent` | user_id, stage_id, window enum(d7, d1), sent_at, pk(user_id, stage_id, window) | Idempotency |
| `free_agents` | id, user_id fk, competition_id fk, roles text[], note text, status enum(open, closed), created_at, unique(user_id, competition_id) | |
| `team_openings` | id, user_id fk, competition_id fk, team_name text, roles_needed text[], note text, status enum(open, closed), created_at | |
| `entries` | id, user_id fk, competition_id fk, team_name text, result enum(participated, advanced, finalist, third, second, first), rounds_advanced int, verified_by_host bool default false, points int null, season text, created_at | Points computed in P2 |
| `ingest_posts` | ig_post_id text pk, org_id fk, caption text, media_urls text[], posted_at, seen_at, classification enum(competition, results, not_competition, error), competition_id fk null | Never reprocess |
| `submissions` | id, user_id fk, raw_url text, image_path text, extracted jsonb, status enum(pending, published, queued, rejected, merged), merged_into uuid null, created_at | |
| `review_queue` | id, kind enum(low_confidence, possible_duplicate), payload jsonb, candidate_competition_id uuid null, status enum(open, done), created_at | Admin only |
| `flags` | id, competition_id fk, user_id fk, field text, note text, resolved bool, created_at | P1 |
| `email_subscribers` | email pk, source text, created_at | Non-account digest list |
| `nebula_cache` | key text pk, payload jsonb, fetched_at | Courses, rooms, UTD Clubs list |

**Indexes:** `stages(deadline_at)`, `competitions(status)`, GIN on `competitions(categories)`, full-text on title+host+description, ivfflat on `competitions(embedding)`.

**Row-level security:** public read on `competitions`, `stages`, `eligibility`, `competition_sources`, `orgs`; users read/write only their own `saves`, `entries`, `free_agents`, `team_openings`; contact emails exposed via a view only to authenticated users; admin-only on `review_queue`, `submissions`, `ingest_posts`.

---

## 4. Extraction service

**Route:** `POST /api/extract` (server-only, called by jobs and `/api/submit`).
**Request:** `{ images: string[] (URLs or storage paths, ≤10), caption?: string, source_url?: string, posted_at?: ISO }`
**Response:**
```
{
  is_competition: boolean,
  kind: "competition" | "results" | "not_competition",
  title, host, categories[], description,
  stages: [{ name, starts_at|null, deadline_at }],
  eligibility: { majors[], class_years[], team_min, team_max },
  prize, cost, format, location, register_url,
  confidence: 0..1, missing_fields: []
}
```
**Design:**
- Model: Groq Llama vision model; temperature 0; JSON mode.
- Prompt includes today's date and timezone (America/Chicago), the category list, and the rule "never invent a date or link; leave null and list in missing_fields."
- Carousel: send up to 10 images in one call with the caption.
- Validation: Zod schema; on failure, one repair call with the error; on second failure, return `kind: error`.
- Confidence: model's self-score, minus 0.1 for each of {no year on date, no register link, no stage date}; clamp 0–1.
- Year inference: if a date has no year, choose the next occurrence after `posted_at`.
- Cost guard: skip images >5 MB (downscale first); one call per post.

---

## 5. Dedupe

- Embedding text: `title | host | first deadline (YYYY-MM-DD) | categories`.
- Compare to competitions with any stage within ±45 days.
- Similarity ≥0.92 → merge: add `competition_sources` row, increment `confirmations`, fill null fields only.
- 0.80–0.92 → `review_queue` kind `possible_duplicate`.
- <0.80 → new competition.
- Thresholds tuned on the eval set (§9).

---

## 6. Ingestion jobs (GitHub Actions cron, Node scripts using the Supabase service key)

| Job | Schedule (CT) | What it does |
|---|---|---|
| `sync-orgs` | Weekly, Sun 2 AM | Fetch UTD Clubs `club.all` + `club.getDirectoryInfo` per slug (6 concurrent, 200 ms delay); upsert `orgs`; never overwrite manually entered handles |
| `ingest-instagram` | Daily, 4 AM | For each org with `ig_handle`: business/creator → Business Discovery (`media{caption,media_url,permalink,timestamp,media_type,children{media_url}}`, last 10 posts); personal → Apify batch. New post IDs → extract → dedupe → publish/queue. Sequential with 2 s spacing; stop at 80% of app usage header |
| `classify-accounts` | Weekly | Re-test `personal_or_missing` handles with Business Discovery to catch clubs that switched |
| `ingest-feeds` | Daily, 5 AM | Devpost and MLH listings (DFW + virtual) → extract from text → dedupe |
| `ingest-events` (P1) | Daily, 5:30 AM | UTD Clubs `event.findByDateRange` and CampusGroups public events for the next 120 days → competition classifier |
| `ingest-dept` (P1) | Daily | Fetch configured department pages; newsletter inbox parsed via email webhook |
| `expire-past` | Daily, 3 AM | Competitions whose last stage passed → `past`; close Free Agency posts after registration stage |
| `send-warnings` | Hourly | Stages with deadline in [now+7d±30 min] and [now+1d±30 min] × savers with warnings on, minus `warnings_sent` |
| `send-digest` | Sun 6 PM | Per user ranked digest + unranked list to `email_subscribers` |

**Meta setup:** Comet Arena Instagram account as Business, linked Facebook Page, Meta app with Instagram API with Facebook Login, long-lived token stored in GitHub Actions secrets and refreshed monthly by a `refresh-token` job. Use a dedicated Meta account. Run at scale only after App Review approval.

---

## 7. API design (Next.js route handlers)

| Method + path | Auth | Request | Response |
|---|---|---|---|
| `GET /api/competitions` | public | `q, categories[], format, cost, utd_only, beginner, from, to, include_past, cursor` | `{ items: GameCardDTO[], next_cursor }` |
| `GET /api/competitions/:slug` | public | — | `GameDayDTO` (competition + stages + eligibility + sources + viewer_save + viewer_eligible) |
| `GET /api/feed` | user | `cursor` | Ranked `GameCardDTO[]` |
| `POST /api/submit` | user | `{ url? , image? (multipart) }` | `{ submission_id, extracted, possible_match? }` |
| `POST /api/submit/:id/confirm` | user | edited fields + `{ merge_into? }` | `{ competition_slug }` |
| `POST /api/saves` / `DELETE /api/saves/:competition_id` | user | — | `{ saved }` |
| `GET /api/schedule` | user | — | Saved stages grouped by week |
| `GET /api/calendar/:ics_token.ics` | token | — | iCalendar feed (one VEVENT per stage, all-day if no time, 1-day VALARM) |
| `POST /api/free-agents`, `PATCH /api/free-agents/:id` | user | roles, note, status | post |
| `POST /api/team-openings`, `PATCH /api/team-openings/:id` | user | team_name, roles_needed, note, status | post |
| `GET /api/competitions/:id/board` | public (emails only if user) | `role?` | `{ free_agents[], openings[] }` |
| `POST /api/entries` / `GET /api/me/entries` | user | result fields | entries |
| `POST /api/flags`, `POST /api/confirm/:competition_id` | user (P1) | field, note | ok |
| `POST /api/orgs/:id/claim` | user (P1) | — | pending claim |
| `GET/POST /api/admin/review` | admin | approve / edit / merge / reject | ok |
| `POST /api/subscribe` | public | `{ email }` | ok (double opt-in) |
| `POST /api/extract` | internal (service key header) | §4 | §4 |

**Auth:** Supabase Auth with Google OAuth and email magic link, restricted to `@utdallas.edu` by a sign-up hook; admin via `users.is_admin`.

**Mock-to-live switch:** env `SOURCES_MODE=mock|live`. Mock mode reads fixtures from `/fixtures` (20 real flyer images + captions, 2 Devpost listings, 1 UTD Clubs snapshot) with simulated latency (1–4 s) and injected failures (10% malformed JSON, 5% timeouts, one 429) so failure states are built before live calls.

---

## 8. Frontend architecture

- **Routing (App Router):** `(shell)` layout group with tabs; `/game/[slug]` server-rendered for SEO and sharing; `/report` client form; `/onboarding` after first sign-in.
- **Data fetching:** server components query Supabase directly for public pages (cached with `revalidate: 300`); client mutations via route handlers; TanStack Query for user-specific data (saves, schedule, board).
- **State:** server state in TanStack Query; filter state in URL search params (shareable); no global client store needed.
- **Component hierarchy:**
  - `ShellLayout` → `TopBar` / `BottomTabs`, `Ticker`
  - `FieldPage` → `FilterBar`, `GameCardList` → `GameCard` (`CategoryBadge`, `Countdown`, `VerifyBadge`, `SaveButton`)
  - `GameDayPage` → `GameHeader`, `StageTimeline`, `EligibilityCheck`, `RegisterButton`, `SourceList`, `FreeAgencyBoard`, `FlagButton`
  - `ReportPage` → `SourceInput` (link | upload) → `ExtractionPreview` (editable fields, `DuplicatePrompt`) → `ConfirmButton`
  - `SchedulePage` → `WeekGroup` → `StageRow`, `CalendarSubscribeButton`
  - `PlayerCardPage` → `PlayerCard`, `EntryList`, `AddEntryDialog`
- **States everywhere:** skeleton loaders, empty states with a next action, error states with retry; consistent across pages.

---

## 9. Eval harness (extraction accuracy)

- **Dataset:** 50 real UTD competition flyers + captions (Instagram), hand-labeled into `/eval/cases.jsonl` with title, host, first deadline date, register URL, categories. Include 10 non-competition posts and 5 results posts.
- **Baseline:** text-only extraction from the caption (same model, no image).
- **Metrics:** exact match on first deadline date; normalized match on title and register URL; precision/recall on `is_competition`; category F1.
- **Target:** ≥90% on title, first deadline and register link; ≥95% `is_competition` precision.
- **Script:** `npm run eval` runs both pipelines, prints a per-field table and a failure-case list, writes `/eval/report.md`.
- **Dedupe eval:** 15 known duplicate pairs + 30 non-duplicates to tune the 0.92 / 0.80 thresholds.
- **When:** before turning on `ingest-instagram` in live mode, and after any prompt change.

---

## 10. Performance budget and fallbacks

| Surface | Budget | Fallback |
|---|---|---|
| The Field / Game Day | FCP ≤2 s on 4G; DB query ≤150 ms | ISR cache; static page if DB is slow |
| Report a Game extraction | ≤10 s | Manual entry form pre-filled with anything extracted |
| `.ics` feed | ≤500 ms | Cached per token for 10 min |
| Ingestion run | ≤30 min for 300 orgs | Resume from last processed org next run |
| Demo signature moment | ≤6 s | Pre-extracted cached result for the demo flyer |

---

## 11. External integrations

| Integration | Use | Limits / notes |
|---|---|---|
| Meta Instagram Graph API (Business Discovery) | Public posts from Business/Creator club accounts | Professional accounts only; rate-limited; App Review before scale |
| Apify Instagram Profile Scraper | Personal-account fallback | Paid beyond free credits; against Instagram's terms, so keep to a small set |
| UTD Clubs (Nebula Labs) tRPC endpoints | Club list, handles, events | Public but undocumented; cache weekly; coordinate with Nebula |
| Nebula API | Courses, rooms | API key; daily limits; cache |
| CampusGroups | Org cross-check, public events | Public pages only |
| Devpost, MLH | Hackathons | Public listings, daily |
| Groq | Vision extraction | JSON mode, temperature 0 |
| Embeddings (provider TBD, 768-dim) | Dedupe, ranking | Swap-able behind one function |
| Resend | Warnings, digest | Domain verified, idempotency keys |
| Google Calendar | Subscribe via .ics URL | No OAuth needed in v1 |

---

## 12. Environment and secrets

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `GROQ_API_KEY`, `EMBEDDINGS_API_KEY`, `META_IG_USER_ID`, `META_LONG_LIVED_TOKEN`, `APIFY_TOKEN`, `NEBULA_API_KEY`, `RESEND_API_KEY`, `EXTRACT_INTERNAL_KEY`, `SOURCES_MODE`, `APP_TIMEZONE=America/Chicago`.

---

## 13. Deployment

- **Web:** Vercel (preview per PR, production on `main`), custom domain.
- **DB:** Supabase project with migrations in `/supabase/migrations`; seed script loads orgs (from the UTD Clubs CSV) and the hand-collected starter competitions.
- **Jobs:** GitHub Actions workflows per job, secrets in repo settings, failure notifications to the admin email.
- **"Shipped" means:** production URL live; ≥40 live listings; daily ingestion green for 3 consecutive days; warnings and digest delivered to a test account; eval report committed with ≥90% on the three key fields.
