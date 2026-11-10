# Comet Arena — Product Spec

> What must be true for v1 to ship, written for an engineering team. Context: `full_context.md`. Implementation: `engineering_spec.md`.

**Thesis:** Never miss a UTD competition, and never compete alone.
**Core loop:** competition post in → structured listing out → saved → stage deadlines on your calendar with warnings.

---

## 1. Product requirements (true at v1 launch)

1. ≥40 live and ≥50 past/expected competitions are listed, across at least 5 categories.
2. Ingestion runs daily over every known club Instagram handle and publishes new competitions without manual work, except the review queue.
3. Any visitor can browse The Field and any Game Day page without logging in.
4. A signed-in `@utdallas.edu` student can save a competition, see its stages on Schedule, subscribe via .ics, and receive 7-day and 1-day warnings by email.
5. Any signed-in student can submit a competition via link or flyer image and see AI-extracted fields before publishing.
6. Every Game Day page has a Free Agency board where students post as free agents or post team openings.
7. Every student has a private My Competitions history (Player Card, private view).
8. Every listing shows its source, verification status, and "updated X days ago."
9. The UI uses the sports theme consistently on every page and works on a phone.

---

## 2. Priorities and cut order

| Priority | Scope |
|---|---|
| **P0 (launch-blocking)** | Core loop: ingestion (Instagram via Business Discovery + Apify fallback, Devpost/MLH), extraction, dedupe, review queue, The Field, Game Day, Report a Game, Save, Schedule + .ics, Two-Minute Warning emails, weekly digest. Thin slices: Scouting Report (sorted feed + profile filters), Free Agency (post + browse), My Competitions (private history). Auth. |
| **P1** | Scouting Report ranking (interests, Nebula courses), Front Office (claim, edit, results upload), flags and confirmations, UTD Clubs / CampusGroups event ingestion, department page ingestion, Free Agency role matching. |
| **P2** | Verified points, Standings (season, category, major, org), awards, Discord bot, push notifications, prep resources, past winners, host tools (v3). |

**Cut order if behind:** P2 entirely → Free Agency matching → department ingestion → Scouting Report ranking (fall back to sort by deadline). **Never cut:** ingestion → listing → save → warning.

---

## 3. User stories and acceptance criteria

### Core loop

**CL-1. Automatic ingestion**
As a student, I want competitions posted on club Instagrams to appear on Comet Arena automatically so that I don't have to follow 600 accounts.
- [ ] The ingestion job runs at least once every 24 hours over every org with an Instagram handle.
- [ ] Only posts not seen before are processed (post IDs stored).
- [ ] Posts judged not a competition are stored and never reprocessed.
- [ ] Competitions with confidence ≥0.8 publish as `unverified`; below 0.8 go to the review queue.
- [ ] A listing created from Instagram links back to the original post.

**CL-2. Report a Game (submission)**
As a student, I want to paste a link or upload a flyer so that competitions the system missed get listed.
- [ ] Accepts an Instagram/LinkedIn/web URL, or a JPG/PNG/HEIC image ≤10 MB.
- [ ] Shows extracted fields within 10 s, every field editable.
- [ ] Submitter must confirm title, at least one stage with a date, and a register link (or tick "no link yet").
- [ ] If it matches an existing listing, the student is shown that listing and asked "Same competition?"; yes adds a confirmation instead of a duplicate.
- [ ] Submission publishes as `unverified` with the submitter credited.

**CL-3. Save**
As a student, I want to save a competition so that its deadlines are tracked for me.
- [ ] Save/Unsave toggle on The Field cards and Game Day; state persists across devices.
- [ ] Saving while signed out prompts sign-in, then completes the save.

**CL-4. Schedule + calendar sync**
As a student, I want every stage of my saved competitions on one calendar so that I see what's due next.
- [ ] Schedule lists saved stages in date order, grouped by week, with countdowns.
- [ ] A personal .ics URL includes every stage of every saved competition and updates when stages change.
- [ ] "Add to Google Calendar" opens Google's subscribe flow with the .ics URL.

**CL-5. Two-Minute Warning**
As a student, I want a reminder before each deadline so that I never miss one.
- [ ] Email 7 days and 1 day before each stage deadline of a saved competition.
- [ ] Each email names the competition, stage, deadline in Central Time, and the register link.
- [ ] One-click unsubscribe per competition and globally.
- [ ] No duplicate warnings for the same stage and window.

**CL-6. Weekly digest**
As a student, I want a weekly email of what's new and what's closing so that I stay in the loop without opening the app.
- [ ] Sent Sunday 6 PM CT: "Closing this week" (saved first) + "New this week" (ranked by profile).
- [ ] Non-account email subscribers (from Comet Arena Weekly) get the unranked version.

### Pillar 1 — Discover (Scouting Report, The Field, Game Day)

**P1-1. The Field**
As any visitor, I want to browse and filter every competition so that I can find ones that fit.
- [ ] Public, no login. Default sort: next upcoming deadline.
- [ ] Filters: category (multi), format, cost (free/paid), UTD-only vs external, beginner-friendly, deadline window, host. Text search on title, host and description.
- [ ] Each card: title, host, category badges, next stage + countdown, prize, verification badge.
- [ ] Past competitions are hidden unless "Include past" is on.

**P1-2. Game Day**
As a student, I want one page per competition with everything I need so that I can decide and register.
- [ ] Shows title, host (linked to org), categories, description, stage timeline (quarters), eligibility, prize, cost, format, location, register button, source links, verification status, "updated X days ago."
- [ ] Eligibility check: "You qualify" / "Check eligibility" based on the viewer's major and year (signed in only).
- [ ] Embedded Free Agency board for this competition.
- [ ] "Report a problem" opens a flag form.

**P1-3. Scouting Report**
As a signed-in student, I want a feed ranked for me so that the most relevant competitions are at the top.
- [ ] v1: listings filtered to the viewer's eligibility, sorted by next deadline, with chosen interest categories boosted.
- [ ] Onboarding asks major, class year, interest categories, roles (dev, design, finance, research, speaking…). Completable in ≤60 s.

### Pillar 2 — Never miss (covered by CL-3 to CL-6)

### Pillar 3 — Free Agency

**P3-1. Post as a free agent**
As a student without a team, I want to post myself for a competition so that teams can find me.
- [ ] From a Game Day page: choose roles offered (multi), optional note (≤280 chars).
- [ ] One active free-agent post per student per competition; editable and closable.

**P3-2. Post a team opening**
As a team, I want to post the roles we need so that the right people find us.
- [ ] Team name, roles needed (multi), note; the poster is the contact.

**P3-3. Browse and contact**
As either side, I want to see matching posts and reach out so that we can form a team.
- [ ] Board lists free agents and openings for that competition, filterable by role.
- [ ] "Contact" reveals the poster's `@utdallas.edu` email (signed-in users only).
- [ ] Posts auto-close when the competition's registration stage passes.

### Pillar 4 — Record (thin slice)

**P4-1. My Competitions**
As a student, I want a private history of competitions I entered so that I can track my record.
- [ ] Add an entry from any Game Day: participated / advanced / finalist / 3rd / 2nd / 1st, rounds advanced, team name.
- [ ] Self-reported entries are labeled "unverified." Visible only to the owner in v1.
- [ ] Export as a short résumé-ready list.

### P1 stories (summarized)
- **Front Office:** an officer with an `@utdallas.edu` account claims an org (verified by admin), edits its listings, uploads results; claimed listings become `verified`.
- **Flags and confirmations:** any student can confirm a listing or flag a field; 3 confirmations or a host claim removes "unverified."
- **Review queue (admin):** list low-confidence extractions with the source image; approve, edit, merge or reject.

---

## 4. Edge cases

- Flyer has no year → assume the next occurrence of that date; lower confidence by 0.1.
- Flyer has a date range ("Nov 7–8") → one stage with start and end.
- Same competition posted by multiple clubs or as a carousel → one listing, multiple sources.
- Competition reposted with changed dates → update stages, keep saves, notify savers of the change.
- Post is a recap ("Congrats to our winners!") → classify as results, not a new competition; attach to the existing listing if matched.
- Competition with no register link yet → listing shows "Registration opens soon."
- External competition (national case comp) → `utd_only = false`, still listed if open to UTD students.
- Recurring annual competition not yet announced → listed as `expected` with last year's month, no dates.
- Club has no Instagram handle → club appears in the org directory; competitions come from submissions or other sources.
- User changes major → Scouting Report and eligibility checks update immediately.
- Deadlines are in Central Time; displayed with "CT."

---

## 5. Failure states (every AI and external-API feature)

| Feature | Empty input | Slow response | Malformed output | Low confidence / refusal | Rate limit / outage |
|---|---|---|---|---|---|
| **Flyer extraction (Groq vision)** | "Add a link or an image" inline error | Skeleton fields + "Reading the flyer…" up to 10 s, then offer manual entry | Schema validation fails → retry once with a repair prompt, then manual entry | Confidence <0.8 → submission goes to review queue; user sees "We'll double-check this one" | Queue the job; user sees "Saved, we'll finish reading it shortly" |
| **Business Discovery API** | Handle returns no account → mark `ig_account_type = personal_or_missing`, route to Apify | Timeout 20 s → retry next run | Missing fields → skip post, log | — | Respect usage headers; back off exponentially; stop the run at 80% quota and resume next run |
| **Apify fallback** | No posts → log, continue | Actor run >5 min → abort, retry next day | Bad JSON → skip, log | — | Free credits exhausted → skip personal accounts until next month; alert admin |
| **UTD Clubs endpoints** | Empty club list → keep last cached list | — | Schema change → keep cache, alert admin | — | Use weekly cache; never call per page view |
| **Devpost / MLH** | No events → fine | Timeout → retry next run | Parse error → skip source, alert | — | Daily cadence only |
| **Email (Resend)** | No recipients → skip | — | — | — | Retry with backoff; never send duplicate warnings (idempotency key per user+stage+window) |
| **Dedupe (embeddings)** | — | — | — | Similarity in the ambiguous band → review queue as "possible duplicate" | Embedding API down → publish as new, re-run dedupe later |

---

## 6. Non-functional requirements

- **Performance:** The Field and Game Day first contentful paint ≤2 s on 4G; listings served from the database, never from live APIs.
- **Freshness:** every listing shows "updated X days ago"; ingestion ≤24 h behind Instagram.
- **Privacy:** only `@utdallas.edu` users can see contact emails; Player Card is private in v1; no scraping of private accounts, stories or DMs; only public post captions and images are stored.
- **Platform rules:** Instagram data via Meta's official API wherever possible; Meta App Review approval before running the daily job at scale; Apify limited to the few personal accounts nothing else covers.
- **Accessibility:** WCAG AA contrast on the theme colors; all countdowns have text equivalents.
