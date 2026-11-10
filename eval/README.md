# Extraction eval set

Ground truth for measuring the flyer-to-listing pipeline. **The pipeline must pass this before live
ingestion is switched on, and again after every prompt or model change** (see the Eval section in the
top-level README).

`cases.jsonl` holds one JSON object per line (schema: `lib/eval/schema.ts`).
The committed file is a **mock set generated from the 20 fixture flyers** (`npm run eval:seed`) so the
harness runs anywhere. The real gate needs a hand-labeled set of real UTD posts, replacing this file:

| Required for the real set                                   | Count                                     |
| ----------------------------------------------------------- | ----------------------------------------- |
| Total posts                                                 | 50 or more                                |
| Not competitions (meetings, socials, officer announcements) | 10 or more                                |
| Results / winners recaps                                    | 5 or more                                 |
| The rest                                                    | Competitions across at least 5 categories |

Check composition with `npm run eval:validate -- --strict`.

## Adding a case

```bash
npm run eval:scaffold -- https://www.instagram.com/p/XXXX/ --org ais --handle ais_utd
```

This appends a draft line to `cases.draft.jsonl`. Download the post's images into `eval/images/`
(Instagram image links expire), list their paths in `images`, fill in `label` by the rules below, then move
the line into `cases.jsonl` and run `npm run eval:validate`.

## Labeling rules

Label what a careful student would conclude from the post, using only the post itself (caption and images).
Do not look the event up elsewhere.

- **kind**
  - `competition`: a competition, hackathon, case comp, pitch, research/design/speaking contest, or similar, that students can still enter or that has dates ahead.
  - `results`: announces winners or a recap of an event that already happened.
  - `not_competition`: everything else (general meeting, social, workshop with no contest, officer call).
  - A post that both recaps and announces the next edition is `competition` only if it carries a future date to enter.
- **title**: the event's name as students say it. No emoji, no hashtags, no "Registration open for". Keep the year or season only if it is part of the name ("Fall Case Competition").
- **host**: the club or department as written on the post (an acronym is fine: "AIS"). Null if none is shown.
- **categories**: one to four from the product category list. Pick by what students do, not who hosts.
- **first_deadline**: the earliest dated item a student must act on (registration closes, application due, or the event itself if nothing earlier). ISO instant with the America/Chicago offset, e.g. `2026-11-20T23:59:00-06:00` (CST is `-06:00`, CDT is `-05:00`). If only a date is shown, use `23:59` local for a deadline and the stated time for an event. If the year is missing, use the next occurrence after `posted_at`. Null when the post has no usable date.
- **register_url**: the link to register or apply, only if it is a full URL visible in the post. A "link in bio" is null. Never guess one.
- Non-competitions and results get `first_deadline: null` and `register_url: null`.

Put anything unusual in `notes` (messy layout, two events in one flyer, ambiguous dates) so failures can be understood later.
