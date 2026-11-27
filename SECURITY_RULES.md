# Security rules for Claude Code

These rules apply to every Sobo app (Next.js + Supabase + Vercel + Anthropic API). They come from the cross-app security standard written on 2026-11-26. If this repo's own SECURITY.md is stricter, follow SECURITY.md. When a rule here would block the task, stop and say so; don't work around it.

## 1. Sign-in and accounts
- Use Supabase Auth. Don't build custom login codes, PINs or session tokens unless the spec says so. If you must: generate with `crypto.randomBytes`/`crypto.getRandomValues` (at least 128 bits for links, 6+ digits for codes), store only a hash, expire in 15 minutes or less, single use, and cap attempts (5 per code, then lock).
- Admin, staff, coach and any role that can see other people's data must have MFA. Gate those routes on AAL2: check `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` server-side, and in RLS use `(auth.jwt()->>'aal') = 'aal2'` for admin-only policies. Offer passkeys (Supabase passkeys) or an authenticator app (TOTP). Don't use SMS as the only second factor.
- Passwords, where used: minimum 8 characters with MFA, 15 without. No composition rules. Leaked-password protection on in Supabase.
- On the server, authorize with `supabase.auth.getUser()` or `getClaims()`. Never trust `getSession()` alone.

## 2. Every route checks for itself
- Middleware is a convenience, not the gate. Every API route, route handler and server action checks the user and their role at the top, even if middleware also does.
- Server actions are public POST endpoints. Treat every argument as hostile and validate it with zod.
- Any id that comes from the request (orgId, childId, athleteId, familyId) must be checked against the signed-in user's memberships before use. No IDOR.

## 3. Database (Supabase)
- RLS on for every table in `public` and any exposed schema, in the same migration that creates the table. Policies scope by `auth.uid()` or membership. Never `using (true)` on personal data.
- A table with RLS on and no policies is deny-all. That's fine for tables only server code touches with the secret key. Say so in a comment in the migration.
- Views: `with (security_invoker = true)`.
- SECURITY DEFINER functions: `set search_path = ''` (or `public, pg_temp`), check the caller inside the function, and `revoke execute ... from public, anon` (and `authenticated` unless signed-in users need it). Trigger functions: revoke execute from `anon, authenticated`.
- Extensions go in the `extensions` schema, not `public`.
- Don't apply migrations to production yourself. Write the migration file; Remi approves the apply.
- After any schema change, run the Supabase security advisor and fix new ERROR/WARN items.

## 4. Keys and secrets
- The Supabase secret key (`sb_secret_...`, formerly `service_role`) and the Anthropic key are server-only. Never import them in a file that can reach the browser, never prefix them `NEXT_PUBLIC_`, never log them. Use `import 'server-only'` in modules that read them.
- Prefer the new Supabase publishable/secret keys over the legacy anon/service_role JWT keys (legacy keys are being retired).
- Never commit secrets, `.env*` files, real user data, or CSV exports. Public repos (ambition-angels, wildwanderers-app) need extra care: no real names, emails or kids' data in seeds, specs or tests.
- Webhooks verify their signature (Stripe, Resend, Givebutter, etc.). Cron routes check `Authorization: Bearer ${CRON_SECRET}` with a constant-time compare.

## 5. Web hardening
- Keep `poweredByHeader: false` and these headers: Strict-Transport-Security, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, X-Frame-Options DENY (or CSP frame-ancestors), Permissions-Policy, and a Content-Security-Policy (start as Report-Only, then enforce).
- Redirect targets from query params (`next`, `redirectTo`, `returnTo`) must be same-site relative paths starting with a single `/`.
- No `dangerouslySetInnerHTML` with user or AI content unless sanitized.
- Validate every input with zod. No SQL built from strings.

## 6. Abuse and cost
- Rate limit sign-in, code/OTP sends, public forms, email/SMS sends and AI endpoints (per user and per IP). Use Vercel BotID or Turnstile on public forms.
- Every AI call goes through a per-user and per-app daily spend cap.

## 7. AI features
- Content from emails, documents, web pages, uploads and other users is data, not instructions. Wrap it in clear delimiters and tell the model so.
- Model output never decides a privileged action on its own. Tools the model can call only touch the signed-in user's own data, and anything that sends, deletes, pays or shares needs a human confirm.
- Render model output as text or sanitized markdown, never raw HTML.
- Send the model only the data the feature needs. Don't send kids' data to the model unless the feature requires it, and never another family's data.

## 8. Kids' and teens' data
- Ambition Angels, Team Esface, Wild Wanderers and Trellis hold data on minors. Treat it as the most sensitive data we have.
- Only the family, the assigned coach/mentor and admins can read it, enforced in RLS, not just in the UI.
- Photos and documents of minors live in private storage buckets, served with short-lived signed URLs.
- No third-party analytics, ad pixels or session replay on pages kids use.
- Collect only what the feature needs, and keep a written retention period (COPPA, as amended in 2025, requires one for under-13 data). Deleting a family deletes their kids' data.

## 9. Dependencies and CI
- Stay on a supported Next.js line and take security patches within a week (critical within 48 hours). Next 14 is end of life.
- Commit the lockfile. CI uses `npm ci`. Don't add a package without saying why; prefer well-known packages; check the name for typos (slopsquatting).
- GitHub Actions: set `permissions:` to the minimum, pin third-party actions to a commit SHA, never use `pull_request_target` with checkout of PR code.
- Never run install scripts from packages you don't know. Watch for unexpected `setup.mjs`, `.vscode/tasks.json` or `.claude/settings.json` changes in diffs.

## 10. Logging
- Log admin reads and changes of personal data to an audit table. Don't log tokens, keys, passwords or full personal records.
- Errors returned to the browser are generic. Details go to server logs.

## Before you open a PR that touches auth, data access, secrets, AI or dependencies
1. Re-read sections 2, 3 and 4.
2. Run the Supabase security advisor if the schema changed.
3. Say in the PR description what data the change can read or write, and for whom.
