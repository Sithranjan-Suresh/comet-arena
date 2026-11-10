# Auth setup (Supabase)

Comet Arena uses Supabase Auth with **Google OAuth** and **email magic links**. Only
`@utdallas.edu` addresses may sign up. That rule is enforced **in the database**
(`supabase/migrations/20261110000007_auth_bootstrap.sql`, trigger `enforce_utd_email` on
`auth.users`), so it holds for every provider and cannot be bypassed from the client. The `hd`
hint on the Google flow only improves the account picker UX.

## 1. Hosted project settings (Dashboard → Authentication)

| Setting                        | Value                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Site URL**                   | Production URL, e.g. `https://cometarena.example` (`NEXT_PUBLIC_APP_URL`)                                                                         |
| **Redirect URLs** (allow list) | `https://<production-domain>/auth/callback`, `https://*-<vercel-team>.vercel.app/auth/callback` (previews), `http://localhost:3000/auth/callback` |
| **Providers → Email**          | Enabled. "Confirm email" on. Magic link enabled. Secure email change on.                                                                          |
| **Providers → Google**         | Enabled with the client id and secret from step 2                                                                                                 |
| **Email OTP expiry**           | 3600 s (default)                                                                                                                                  |
| **Rate limits**                | Keep defaults; email sends: 30/hour for the built-in SMTP. Configure Resend SMTP below before launch                                              |
| **Allow new users to sign up** | On                                                                                                                                                |

### Custom SMTP (before launch)

Dashboard → Authentication → SMTP Settings → use Resend SMTP (`smtp.resend.com`, port 465, user
`resend`, password = Resend API key, sender = verified domain). Without this, the built-in sender
is heavily rate limited and shows a Supabase sender name.

## 2. Google OAuth client

1. Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID** (Web).
2. Authorized JavaScript origins: the site URL and `http://localhost:3000`.
3. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
   (local: `http://127.0.0.1:54321/auth/v1/callback`).
4. OAuth consent screen: User type **Internal is not available** (UTD is not your Workspace), so
   use External, publish the app, scopes: `openid`, `email`, `profile`.
5. Paste the client id and secret into Supabase (hosted) or into `.env.local` as
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (local `supabase start`, referenced in `config.toml`).

## 3. Local development

`supabase/config.toml` already enables both providers and allows
`http://localhost:3000/auth/callback`. With the local stack, magic-link emails are captured by
**Inbucket** at `http://127.0.0.1:54324`, so you can sign in without real email.

## 4. How the app uses it

- `/login` offers Google and a magic-link form; `/auth/callback` exchanges the code for a session.
- `middleware.ts` refreshes the session cookie on every request.
- A non-UTD address makes the database raise `utd_email_required`; the callback maps it to the
  friendly message "Use your @utdallas.edu address".
- `users.is_admin` is the only admin switch and is not writable by clients (column grants + RLS).
  Make yourself admin with the service role: `update public.users set is_admin = true where email = '...'`.

## 5. Checklist before launch

- [ ] Site URL and redirect URLs set for production and previews
- [ ] Google OAuth client published (not in "Testing" with a 100-user cap)
- [ ] Custom SMTP verified (SPF/DKIM) so magic links reach `@utdallas.edu` inboxes
- [ ] Sign up with a non-UTD address and confirm it is rejected
- [ ] First admin user created
