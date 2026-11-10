# Comet Arena — Full Context

> Read this first. It explains the whole project to someone with zero prior context.
> Companion files: `product_spec.md` (what to build) and `engineering_spec.md` (how to build it).

---

## 1. Vision

**One sentence:** Comet Arena is Devpost for every UTD competition: one place to find, track, team up for, and eventually run every case comp, hackathon, pitch, research, design and speaking competition open to UT Dallas students.

**Paragraph:** Competitions are one of the best ways for students to get experience, prizes and internships, but at UTD they are scattered across hundreds of club Instagram accounts, department newsletters, Discords and Handshake. Students hear about them after the deadline or never; hosts put in real work and get thin turnout. Comet Arena collects every competition automatically, mostly by reading the flyers clubs already post on Instagram, and turns them into structured listings with deadlines, eligibility and teammates. Over time hosts post and run competitions directly on Comet Arena, and it becomes the default place UTD competitions live.

**Thesis:** *Never miss a UTD competition, and never compete alone.*

---

## 2. Problem

- UTD has **622 clubs** listed on Nebula's UTD Clubs directory; competition announcements live mostly on club Instagram accounts, not in any shared calendar.
- Only **239 of 622 clubs (38%)** list an Instagram handle on UTD Clubs, and only **29 of the 76** competition-heavy clubs do (measured 2026-11-09).
- Only **114 clubs** have ever posted an event on UTD Clubs. CampusGroups exists but is not built around competitions (no stages, eligibility or teams).
- Competitions have multi-stage deadlines (registration → case release → round 1 → semis → finals) that no current tool tracks.
- "I don't have a team" is a common reason students skip competitions; no UTD tool solves it.

**Evidence level:** founder experience (AIMD AI in Medicine, Dallas Mavericks × CISTECH, HackUTD) plus the directory counts above. **Not yet validated with users.** The first milestone (Comet Arena Weekly, section 11) exists to test demand before heavy building.

---

## 3. Target users

| User | What they do today | Why it hurts |
|---|---|---|
| **Competitor students** (CS, JSOM, pre-health, design) | Follow dozens of club Instagrams, rely on friends and GroupMes | Miss deadlines, find out late, can't find teammates |
| **New students** (freshmen, transfers) | Don't know competitions exist | Never start |
| **Hosts** (club officers, departments, IIE, companies) | Post a flyer on Instagram, a Google Form, maybe a GroupMe blast | Low turnout, no data on interest, manual registration and judging |
| **Recruiters (later)** | Attend a few big events | No way to find students with verified placements |

---

## 4. User journey (end to end)

1. A club posts a case-comp flyer on Instagram.
2. Within 24 hours the ingestion job pulls the post, the AI reads the flyer, and an "unverified" listing appears on Comet Arena with stages, deadlines, eligibility and the registration link.
3. A student opens their **Scouting Report**, sees the comp ranked near the top because it matches their major and interests, and taps **Save**.
4. The comp's stages land on their **Schedule** and sync to Google Calendar. **Two-Minute Warnings** go out 7 days and 1 day before each stage.
5. The student has no team, so they post in **Free Agency** ("free agent: data + slides"). A team needing that role signs them.
6. They compete. The host claims the listing in **Front Office** and uploads results.
7. The result is added to the student's **Player Card**, earns points, and moves them and their club up the **Standings**.
8. Next semester the host posts directly on Comet Arena instead of only Instagram.

---

## 5. Feature map

**Core loop:** *a competition post goes in → a structured, saveable listing comes out → the student never misses a stage.*
(Flyer/post → AI extraction → listing → Save → Schedule + Two-Minute Warning.)

**Shared backbone:** one Supabase Postgres data model (`competitions` + `stages` + `eligibility` are read by every pillar), one Next.js navigation shell, one sports-themed design system.

| Pillar | Job (serves the thesis by…) | Mini moment | Thin slice (v1) | Depth items (later) |
|---|---|---|---|---|
| **1. Scouting Report + The Field + Game Day** (discover) | …surfacing every competition you qualify for | Drop a real flyer into Report a Game → watch it become a Game Day page in seconds | Feed sorted by next deadline with category/major filters; Game Day page with stages and register link; Report a Game submission | Course-based ranking from Nebula, embeddings ranking, prep resources, past winners |
| **2. Schedule + Two-Minute Warning** (never miss) | …turning every saved competition into deadlines you can't miss | Save a comp → stages appear on your Google Calendar instantly | Saved list + per-user .ics feed + 7-day and 1-day email warnings + weekly digest | Discord bot alerts, push notifications, "new game in your category" |
| **3. Free Agency** (never compete alone) | …matching solo students into teams for a specific competition | Post as a free agent → a team with a matching opening appears | Per-competition free-agent posts and team openings, filtered by role; contact via UTD email | Role matching score, in-app DM, "sign" flow |
| **4. Player Card + Standings** (the record) | …rewarding participation and wins so students come back | Your Player Card's stat line updates after host-verified results | Private "My Competitions" history (participated / placed) | Host-verified points, season standings, org standings, awards |

**Cross-links:**
- Pillar 1 → Pillar 2: Save on a Game Day writes `saves`, which drives Schedule, warnings and digest.
- Pillar 1 → Pillar 3: every Game Day embeds that competition's Free Agency board.
- Pillar 3 → Pillar 4: a signed team becomes an `entries` row, which feeds Player Card and Standings when results are verified.
- Pillar 4 → Pillar 1: Standings and past winners appear on Game Day pages; org standings drive org adoption.

**Cut order if time is short:** Pillar 4 depth (Standings) → Pillar 3 depth → Pillar 2 Discord bot → Pillar 1 Nebula ranking. **The core loop (ingest → listing → save → warning) is never cut.**

**Coherence test:** every pillar is "find it, don't miss it, don't do it alone, get credit for it." Host tools (registration, judging) serve the thesis indirectly and are deliberately **v3**, outside this spec's build scope.

---

## 6. Key differentiators

| Closest alternative | What it does | Why Comet Arena wins at UTD |
|---|---|---|
| CampusGroups (UTD's official org platform) | Org events | Not competition-shaped: no stages, eligibility, teams or results |
| UTD Clubs (Nebula Labs) | Club directory + events | No concept of competitions; Comet Arena reads from it and complements it |
| Devpost / MLH | Hackathons | Hackathons only; no case comps, pitch, research or design |
| Unstop | Competitions at huge scale | Built for Indian colleges; UTD orgs don't post there |
| CaseCrest | Case comps + hosting | Case comps only; not campus-specific |
| StudentCompetitions.com | Global listings | No local campus competitions |

**The edge:** campus-specific, every category, **built from what clubs already post** (flyer extraction, no behavior change required from hosts), with Team Finder and a verified record on top.

---

## 7. Technical overview

- **Stack:** Next.js (App Router) + Tailwind on Vercel; Supabase (Postgres, auth restricted to `@utdallas.edu`, storage, pgvector); Groq (Llama vision) for extraction; GitHub Actions cron for jobs; Resend for email.
- **Data sources (original plan):**
  1. **Club list:** UTD Clubs (Nebula Labs) public tRPC endpoints → 622 clubs, 239 Instagram handles; cross-checked against CampusGroups; missing handles filled manually.
  2. **Instagram:** Meta **Business Discovery API** for Business/Creator accounts; **Apify** Instagram Profile Scraper as fallback for personal accounts.
  3. **UTD Clubs events + CampusGroups events:** classified by the same extractor.
  4. **Devpost + MLH** listings.
  5. **Department pages and newsletters** (JSOM, Jonsson School, IIE, Career Center, Undergrad Research).
  6. **Student submissions** (link or flyer upload).
  7. **Nebula API** (courses, rooms) for ranking and locations.
- **Key technical bets:**
  1. A vision LLM can turn stylized club flyers + captions into accurate structured competition data.
  2. Embedding similarity can merge the same competition posted by several clubs.
  3. Business Discovery covers most competition-heavy clubs; the rest are covered by Apify, submissions and outreach.

**Technical claim:** *Comet Arena's extractor pulls the correct title, first deadline and registration link from real UTD competition flyers with ≥90% accuracy, versus a caption-only text extraction baseline.* Measured on 50 hand-labeled UTD flyers (see `engineering_spec.md` §9).

---

## 8. Launch demo design (replaces the hackathon demo)

Used for: pitching club officers, the Nebula Labs / UTD Clubs team, Student Org Center, IIE, and for recruiting/portfolio demos.

**Hook (first 15 s):** "There were 40+ competitions at UTD this semester. Most students saw maybe five. Here's every one of them." → open The Field showing the full live list.

**Flow:**
1. The Field: every current UTD competition, sorted by next deadline. (core loop result shown first)
2. **Report a Game:** paste a real Instagram post → fields fill in live (title, stages, deadlines, eligibility) → publish. (signature moment)
3. Game Day page for that comp → **Save** → Schedule shows the stages; the .ics feed is already on a phone calendar.
4. Show the Two-Minute Warning email that will go out.
5. Free Agency tab on the same Game Day: post as a free agent, see a team opening that matches.
6. Player Card + Standings (seeded with real past results, labeled as such).

**Wow moments:**
1. A messy flyer becomes a clean Game Day page in a few seconds. (core loop)
2. One tap puts every round's deadline on your phone calendar.
3. The same competition posted by three clubs appears once, with three sources.
4. "Free agent: data + slides" → matched team appears.
5. Club standings: "AIS members won 7 competitions this semester."

**Signature moment:** live flyer → listing extraction on a real UTD flyer. Cached fallback: a pre-extracted result for the same flyer. Budget: ≤6 s on a phone connection.

**90-second script:**
> "UTD had over forty competitions this semester: case comps, hackathons, pitch competitions, research showcases. They're scattered across six hundred club Instagrams, so most students find out after the deadline. *(The Field)* This is Comet Arena: every one of them in one place, sorted by what's due next. Most of these were never posted here by anyone. *(Report a Game)* Clubs just post flyers like this one. Comet Arena reads it: title, every round, every deadline, who's eligible, where to register. That's a real flyer, extracted in about four seconds, and on fifty real UTD flyers it gets the deadline right over ninety percent of the time. *(Save → Schedule)* I save it, and every round lands on my calendar. A week before each deadline I get a warning. *(Free Agency)* Don't have a team? Post as a free agent and teams looking for your role find you. *(Standings)* And when results come in, they go on your Player Card and your club climbs the standings. Never miss a UTD competition, and never compete alone. That's Comet Arena."

**Three takeaways:**
1. Never miss a UTD competition, and never compete alone. (thesis)
2. It builds itself from the flyers clubs already post.
3. It turns competitions into a verified record for students and clubs.

**Judge/visitor path:** The Field and Game Day pages are public, no login. Save, Free Agency and Player Card require `@utdallas.edu` sign-in.

**Design direction:** football/basketball league theme. Hardwood-court neutral base, turf green surface, UTD orange + green as team colors; scoreboard LED digits for countdowns; jersey block numerals for headings; an ESPN-style bottom ticker of upcoming deadlines. One component system on every page. Navigation: top bar on desktop, bottom tab bar on mobile (Scouting Report · The Field · Schedule · Free Agency · Player Card). Load budget: first contentful paint ≤2 s on 4G.

---

## 9. Riskiest assumptions

| Assumption | How it's tested | When |
|---|---|---|
| Students want a separate place for competitions | Comet Arena Weekly digest: ≥150 subscribers in 2 weeks | Before building v1 |
| Hosts will claim listings and post results | Interviews with 8 officers; claims after launch | Weeks 1–2; month 2 |
| Vision extraction is accurate on real flyers | 50-flyer eval (≥90% on title, first deadline, register link) | Before automating ingestion |
| Business Discovery covers most competition clubs | One run over all known handles; count empty results | When the Meta app is set up |
| Meta allows this use at scale | App Review approval before scheduled runs | Before the daily job goes live |
| UTD Clubs endpoints stay available | Courtesy conversation with Nebula; cache club list weekly | Week 1 |

---

## 10. Success metrics

| Metric | Target (end of Spring 2027) |
|---|---|
| Share of known UTD competitions listed | ≥90% |
| Live listings at launch | ≥40 live + ≥50 past |
| Extraction accuracy (title, first deadline, register link) | ≥90% each |
| Digest / alert subscribers | 1,000 |
| Orgs that claimed a listing | 20 |
| Competitions running registration on Comet Arena (v3 signal) | 3 |

---

## 11. Milestones

1. **Validate (2 weeks):** fill missing Instagram handles for the 47 competition-heavy clubs; publish Comet Arena Weekly by hand; interview 10 students + 8 officers; run the 50-flyer eval; talk to Nebula's UTD Clubs team.
2. **v1 (≈2 weekends):** core loop + Pillars 1–3 thin slices + Pillar 4 private history.
3. **v2:** Front Office (claim, edit, results upload), verified points, Standings, Nebula course ranking.
4. **v3:** host tools (registration, rosters, submissions, judging, results pages), Discord bot.

---

## 12. Future expansion

1. **Host platform:** UTD competitions run end to end on Comet Arena (the Devpost move).
2. **Recruiter access:** companies find students by verified placements and sponsor competitions.
3. **Other campuses:** the same pipeline (club directory → Instagram → extraction) at UTA, UNT, SMU, then beyond.
