# "Shipped" checklist (engineering_spec §13 and product_spec §1)

Tick a box only with the evidence named beside it. Items marked **(auto)** are checked by
`npm run verify:launch` against the production environment.

## Product requirements

- [ ] 1. At least 40 live and 50 past or expected listings across 5+ categories. **(auto)**
- [ ] 2. Daily ingestion over every known club handle, publishing without manual work except the review queue. Evidence: 3 green days of `job-ingest-instagram`, `job-ingest-feeds`, `job-ingest-events` in Actions.
- [ ] 3. Anyone can browse The Field and Game Day without logging in. **(auto)** plus `e2e/smoke.spec.ts` and `e2e/game-day.spec.ts` against the production URL.
- [ ] 4. A UTD student can save, see Schedule, subscribe via .ics, and get 7-day and 1-day emails. Evidence: test account received both warnings (screenshots) and the calendar feed loads on a phone.
- [ ] 5. A student can submit a link or flyer and see extracted fields before publishing. Evidence: one real flyer through Report a Game on the production site.
- [ ] 6. Every Game Day page has a Free Agency board. Evidence: post as a free agent and see a matching opening.
- [ ] 7. Every student has a private Player Card. Evidence: add an entry; confirm a second account cannot see it.
- [ ] 8. Every listing shows its source, verification status and "updated X days ago". **(auto)** (sources) and a visual check of three Game Day pages.
- [ ] 9. The sports theme is consistent and the site works on a phone. Evidence: `e2e/a11y.spec.ts` green on the mobile project and the 90-second demo run on a phone.

## Shipped means (engineering_spec §13)

- [ ] Production URL is live on the custom domain over HTTPS.
- [ ] At least 40 live listings. **(auto)**
- [ ] Daily ingestion green for 3 consecutive days (link to the Actions history).
- [ ] Warning and digest emails delivered to a test account.
- [ ] Eval report committed with at least 90% on title, first deadline and register link (`eval/report.md`, run with `SOURCES_MODE=live` on 50 real flyers).

## Quality gates (already enforced in CI)

- [ ] `npm run check` green on `main` (format, lint, types, unit tests, build).
- [ ] `npm run check:bundle` clean (no secrets in the client bundle).
- [ ] `npm run db:test` green (RLS, privileges and every SQL function).
- [ ] e2e suite green, including axe on every public page.
- [ ] `docs/security.md` reviewed: no open findings except those listed as accepted.
- [ ] `docs/failure-states.md` has no unticked 🔧 rows.

## Launch hygiene

- [ ] Privacy notice linked from the footer and the sign-in page (what is stored, how to delete an account).
- [ ] Meta App Review approved before the daily Instagram job runs at scale (`docs/meta-review.md`).
- [ ] `ADMIN_EMAIL` receives a test failure alert (run a job with a bad key on purpose, once).
- [ ] README shows the live URL.
