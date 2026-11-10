# Security and privacy review

Reviewed 2026-11-10 against the checklist in the task plan. Each item says how it is enforced and where it
is tested, so a regression fails CI instead of relying on this document.

## Checklist

| #   | Item                                                                            | Status                    | How it is enforced / tested                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Row-level security on every table, default deny                                 | ✅                        | `supabase/tests/12_security.sql` fails if any public table lacks RLS; `03_rls.sql` exercises the policies as anon, a student, and an admin                                                                                                                                              |
| 2   | Visitors read nothing personal                                                  | ✅                        | Same test: anon has no privileges on users, saves, entries, free agents, team openings, subscribers, warnings, review queue, submissions, flags, mutes, caches                                                                                                                          |
| 3   | Contact emails never reach anonymous callers                                    | ✅                        | Board views return `contact_email` only when `auth.uid()` is set (and sign-up is limited to `@utdallas.edu` by a database trigger). `03_rls.sql`: "anon sees no contact emails"                                                                                                         |
| 4   | Service-only tables unreachable from a browser session                          | ✅                        | `12_security.sql`: signed-in users have no privileges on subscribers, warning ledger, caches, change log                                                                                                                                                                                |
| 5   | Privileged SQL functions are not callable as RPC                                | ✅                        | `12_security.sql`: every `security definer` function is revoked from clients except `is_admin`                                                                                                                                                                                          |
| 6   | Nobody can make themselves admin or overwrite a calendar token                  | ✅                        | `12_security.sql`: no client UPDATE on `users.is_admin` or `users.ics_token`                                                                                                                                                                                                            |
| 7   | Service key and other secrets never in the client bundle                        | ✅                        | `npm run check:bundle` scans `.next/static` and `public/` for secret names, secret values, and credential-shaped strings; runs in CI after the build; scanner itself tested in `tests/check-bundle.test.ts`. The admin client imports `server-only`, so a client import fails the build |
| 8   | `/api/extract` requires the internal key                                        | ✅                        | Constant-time compare (`lib/auth/internal-key.ts`); 401 without it in `tests/api/routes.test.ts` and `e2e/api-auth.spec.ts`                                                                                                                                                             |
| 9   | Every user and admin API refuses signed-out callers; admin APIs refuse students | ✅                        | `tests/api/routes.test.ts` (401 for all, 403 for admin routes), `e2e/api-auth.spec.ts`                                                                                                                                                                                                  |
| 10  | Rate limits on submit and subscribe                                             | ✅ (see caveat)           | Submit: per-user limit, then 429 with Retry-After. Subscribe: per-IP limiter, honeypot field, and a database cooldown per email. Caveat below                                                                                                                                           |
| 11  | Token entropy                                                                   | ✅                        | Calendar feed token: 24 random bytes (192 bits), regenerable. Unsubscribe links: HMAC-SHA256 signed, constant-time verified, GET never unsubscribes (POST one-click per RFC 8058). Tests: `tests/ics-token.test.ts`, `tests/unsubscribe.test.ts`                                        |
| 12  | Only public captions and images are stored                                      | ✅                        | Ingestion reads public posts via Meta's Business Discovery API (public business/creator accounts only) or Apify for public pages; it stores caption, permalink, and image links, plus the flyer for a published listing. No stories, DMs, or follower data are requested anywhere       |
| 13  | Server-side request forgery                                                     | ✅                        | Every outbound fetch of a user-supplied URL goes through `safeFetchBuffer` (https only, public IPs only, redirects re-checked, size and time capped). `tests/ssrf.test.ts`                                                                                                              |
| 14  | Upload validation                                                               | ✅                        | Images are identified by magic bytes, not name or `Content-Type`; 10 MB cap; HEIC converted; decoded and re-encoded with sharp before use. `tests/submit-handle.test.ts`                                                                                                                |
| 15  | Cross-site scripting                                                            | ✅                        | React escapes all text. The only `dangerouslySetInnerHTML` is JSON-LD on Game Day, with `<` escaped so a title containing `</script>` cannot break out. Email HTML escapes every value and allows only http(s) links. External links carry `rel="noopener noreferrer"`                  |
| 16  | Open redirects                                                                  | ✅                        | Post-login `next` is restricted to same-site paths (`lib/auth/redirect.ts`, `tests/auth.test.ts`)                                                                                                                                                                                       |
| 17  | Security headers                                                                | ✅ (added in this review) | `next.config.ts`: CSP (no framing, no plugins, connections only to this site and Supabase), HSTS, nosniff, `X-Frame-Options: DENY`, referrer and permissions policies. `e2e/security-headers.spec.ts` checks them on the production build and that the app still hydrates under the CSP |
| 18  | Account deletion removes personal data                                          | ✅                        | `DELETE /api/me` cascades through profile, saves, entries, free-agent posts; `supabase/tests/05_account_delete.sql`                                                                                                                                                                     |
| 19  | Secrets handling in CI and jobs                                                 | ✅                        | Secrets come from GitHub Actions secrets only; the token-refresh job logs no token value and never emails one (`tests/refresh-token.test.ts`)                                                                                                                                           |
| 20  | Dependency vulnerabilities                                                      | ⚠️ accepted               | See below                                                                                                                                                                                                                                                                               |

## Findings and fixes in this pass

1. **No security headers were set.** Added the set above, including a CSP. `script-src` keeps `'unsafe-inline'`
   because Next.js inlines its bootstrap scripts and a nonce-based policy would make every page dynamic and
   remove ISR caching; everything else in the policy is strict. Revisit if Next adds hash-based CSP support
   that keeps static pages static.
2. **Nothing checked the client bundle for leaks.** Added `check:bundle` (CI) with tests proving it catches
   names, values, and credential shapes.
3. **Security structure was only covered by example-based RLS tests.** Added `12_security.sql` so a new table
   without RLS, or a new privileged function left open to clients, fails the database test run.

## Accepted risks and open items

- **`npm audit` reports PostCSS issues bundled inside Next.js** (moderate and high). They concern processing
  attacker-controlled CSS with `sourceMappingURL` or `</style>` content. Comet Arena only runs PostCSS on its own
  stylesheet at build time, never on user input, so it is not reachable. The fix is a major Next.js upgrade
  (16.x); schedule it after launch rather than during the freeze.
- **The in-memory rate limiter is per serverless instance.** It blunts bursts and simple abuse but is not a hard
  cap across instances. The durable protections are the per-email cooldown in the database, the honeypot, and
  the per-user submit limit. If abuse appears, move the counters to a Supabase table or Vercel KV.
- **Email addresses in `email_subscribers` and `users` are personal data.** They are service-only and never
  logged; unsubscribe and account deletion remove them. Publish a short privacy notice before launch (what is
  stored, why, and how to delete it) alongside the Meta App Review submission.
- **Cookie flags** (HttpOnly, Secure, SameSite) are set by `@supabase/ssr`; confirm in the production
  deployment that cookies are `Secure` once the real domain is on HTTPS (Task 126).
- **Live checks pending real accounts:** RLS has been verified against real Postgres, but not against hosted
  Supabase (Task 125). Re-run `scripts/db-test.sh`-equivalent policy checks there after migrating.
