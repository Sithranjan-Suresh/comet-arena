# Launch runbook (Tasks 125 to 131)

Everything below that can be prepared without accounts is already in the repository. This is the ordered list
of what needs a person with the accounts, with the exact commands. After each step, run
`npm run verify:launch` (it prints PASS/FAIL per criterion).

## What you need to provide

| Item                                                                         | Used for                                    | Where it goes                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------- |
| Supabase project (URL, anon key, service key, DB password)                   | Database, auth, storage                     | Vercel + GitHub secrets; `supabase link`      |
| Google OAuth client id and secret                                            | "Sign in with Google"                       | Supabase dashboard (see `docs/auth-setup.md`) |
| Vercel account, GitHub repo connected                                        | Hosting, previews                           | Vercel project                                |
| A domain you control                                                         | Production URL, email sending               | Vercel + Resend DNS                           |
| Resend account and API key                                                   | Warning, digest and admin emails, auth SMTP | `RESEND_API_KEY`, `EMAIL_FROM`                |
| Groq API key                                                                 | Flyer extraction                            | `GROQ_API_KEY`                                |
| An embeddings API key (OpenAI-compatible)                                    | Duplicate detection                         | `EMBEDDINGS_API_KEY`                          |
| Admin email address                                                          | Job failure alerts                          | `ADMIN_EMAIL`                                 |
| Meta developer account, Instagram Business account linked to a Facebook Page | Instagram ingestion                         | `META_*` (Task 127)                           |
| Apify token (optional)                                                       | Personal-account fallback                   | `APIFY_TOKEN`                                 |
| Nebula API key                                                               | Courses and UTD Clubs data                  | `NEBULA_API_KEY`                              |
| The 47 club handles and about 50 real flyers                                 | Data load and the eval gate                 | `eval/`, `/admin/orgs`                        |

Generate the random secrets yourself, 32+ characters each:

```bash
openssl rand -hex 32   # UNSUBSCRIBE_SECRET
openssl rand -hex 32   # EXTRACT_INTERNAL_KEY
openssl rand -hex 32   # INBOUND_EMAIL_SECRET (only if you use the newsletter webhook)
```

## 125. Production Supabase

1. Create the project (region close to Dallas, for example `us-east-1` or `us-central`). Save the DB password.
2. Link and apply every migration (there are 24; the order is the filename order):
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
3. Extensions: `vector`, `pg_trgm` and `citext`/`unaccent` are created by migration 1. If push reports a
   permissions error, enable them in Dashboard, Database, Extensions, then re-run.
4. Authentication (see `docs/auth-setup.md`): site URL, redirect URLs, Google provider, Resend SMTP.
5. Storage: migration 15 creates the public `flyers` bucket and its policies. Confirm in Dashboard, Storage.
6. Backups: Dashboard, Database, Backups. Enable daily backups (Pro plan) or schedule `pg_dump` weekly.
7. Make yourself an admin after first sign-in:
   ```sql
   update public.users set is_admin = true where email = 'you@utdallas.edu';
   ```
8. Load the club directory and starter competitions:
   ```bash
   npm run seed:orgs && npm run seed:competitions   # reads .env.local; SOURCES_MODE=live pulls the real club list
   ```
9. Regenerate types only if you changed a migration: `scripts/db-test.sh reset && npm run db:types`.

Done when `/field` shows rows from the production database (`npm run verify:launch` prints
"Visitors can read The Field").

## 126. Vercel and the domain

1. Import the GitHub repo. Production branch `main`; previews for every PR are automatic.
2. Environment variables (Production and Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_KEY`, `NEXT_PUBLIC_APP_URL` (the final https URL), `SOURCES_MODE=live`, `GROQ_API_KEY`,
   `EMBEDDINGS_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL`, `UNSUBSCRIBE_SECRET`,
   `EXTRACT_INTERNAL_KEY`, and optionally `NEBULA_API_KEY`, `INBOUND_EMAIL_SECRET`, `DEMO_CACHE=1` (demo only).
   Use only the anon key for `NEXT_PUBLIC_*`. Never put the service key in a `NEXT_PUBLIC_` variable.
3. Domain: add it in Vercel and create the DNS records it shows. HTTPS is automatic.
4. Resend: add the sending domain, then create the SPF and DKIM records Resend shows. Wait for "Verified".
5. Update Supabase Auth site URL and redirect URLs to the final domain.
6. Check: `npm run check:bundle` passes in CI; open the site and confirm the lock icon, then sign in with a
   UTD account and receive a magic link from your domain.

## 127. Meta app and App Review

1. Convert the Comet Arena Instagram account to Business; link it to a Facebook Page.
2. Create a Meta app (Business type) with "Instagram API with Facebook Login". Note the app id and secret.
3. Generate a long-lived token and the Instagram business user id (Graph API explorer).
4. Add `META_IG_USER_ID`, `META_LONG_LIVED_TOKEN`, `META_APP_ID`, `META_APP_SECRET` to GitHub secrets, plus
   `GH_SECRETS_TOKEN` (a fine-grained PAT with "Secrets: read and write" on this repo) so the monthly
   refresh job can rotate the token itself.
5. Test one public business handle: `SOURCES_MODE=live npx tsx -e "import('./lib/sources').then(async m=>console.log(await m.getSources().instagram.fetchRecentPosts('<handle>')))"`.
6. Submit App Review for `instagram_basic` and Business Discovery. Until approved, keep
   `job-ingest-instagram` disabled (Actions, Workflows, Disable) and run it by hand for a handful of handles.
7. Record the review status in `docs/meta-review.md`.

## 128. Real data load

1. `/admin/orgs`: import the 47 handles (CSV `club,instagram,account_type`).
2. Collect about 50 real flyers into `eval/images/`, label them (`eval/README.md`), then:
   ```bash
   npm run eval:validate -- --strict
   SOURCES_MODE=live npm run eval            # needs GROQ_API_KEY
   npm run eval:gate -- --absolute
   SOURCES_MODE=live npm run eval:dedupe     # tune thresholds if needed
   ```
   Commit `eval/report.md` once title, first deadline and register link are each at least 90%.
3. Run ingestion by hand until the counts are met, then work the review queue in `/admin/review`:
   ```bash
   SOURCES_MODE=live npm run job:ingest-instagram
   SOURCES_MODE=live npm run job:ingest-feeds
   SOURCES_MODE=live npm run job:ingest-events
   ```
4. `npm run verify:launch` must show 40 live, 50 past or expected, and 5 categories.

## 129. Burn-in

1. Add every secret listed by `node -e "import('./scripts/lib/schedule.mjs').then(m=>console.log([...new Set(m.JOBS.flatMap(j=>j.secrets))].sort().join('\n')))"` to GitHub, Settings, Secrets.
2. Enable the workflows. They are generated (`npm run` nothing to do) and run on schedule; trigger each once with
   "Run workflow" to check it first. Manual runs skip the Central Time guard.
3. Create a test account, save a competition whose deadline is about 7 days out, and confirm the warning and
   the Sunday digest arrive (the admin Overview page shows queue sizes; the Actions log shows each run).
4. Three consecutive green days of every daily workflow (Actions history) completes the task.

## 130. Demo assets

`docs/demo-script.md` has the 90-second script and the phone checklist. Set `DEMO_CACHE=1` on the demo
deployment so the signature flyer falls back to its pre-extracted result if the model is slow.

## 131. Ship

Work through `docs/ship-checklist.md` and tick each box with the evidence it names.

## Rollback

- Bad deploy: Vercel, Deployments, previous production deployment, "Promote".
- Bad migration: restore from backup; migrations are forward-only.
- Runaway ingestion: disable the workflow in GitHub Actions; set `SOURCES_MODE=mock` in Vercel to stop live calls.
