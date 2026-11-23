# Two-step login

Every BloomOS user, in every role and every org, signs in with a password (or Google, or a magic link) **and** a 6-digit code from an authenticator app. This is Supabase Auth MFA with TOTP. There is no bypass flag in any environment.

## The rule

The code is in `lib/auth/twoStep.ts`. It is enforced in `middleware.ts`, and again in `getOrgContext` (`lib/admin/auth.ts`).

| Session | Pages under `/admin` and `/board` | `/api/admin`, `/api/reed`, `/api/board` |
|---|---|---|
| Not signed in | the existing sign-in screens | the handler's own 401 |
| Signed in, no verified authenticator | redirect to `/admin/two-step/enroll?next=…` | 401 `{ code: "two_step_required", step: "enroll" }` |
| Signed in, has an authenticator, session at aal1 | redirect to `/admin/two-step/verify?next=…` | 401 `{ code: "two_step_required", step: "verify" }` |
| Signed in, has an authenticator, session at aal2 | through | through |

"No authenticator" wins even at aal2. When an owner resets someone, that person's open sessions are sent to enroll straight away.

Some routes still work before the second step: sign in, sign out, the password reset link request, board sign-in and board sign-out. The session path into `/demoday` and `/strategy` also needs aal2. Sign-ins never create users: every `signInWithOtp` call passes `shouldCreateUser: false`, so accounts come from an invite in People and roles, or from the dashboard.

## Recovery

Supabase TOTP has no recovery codes. There are three ways back in:

1. **A second authenticator.** In Settings → Your account → Two-step login, anyone can add a second one, such as a backup phone or a password manager. Nobody can remove their last one.
2. **An owner or admin resets it.** In Settings → People and roles, the "Reset two-step login" button deletes that person's authenticators. They set one up again the next time they open BloomOS. The rules:
   - you need `members.manage`
   - it works only on members of the active org
   - you can't reset yourself
   - only an owner can reset another owner
   - every reset is recorded in the audit log as `members.two_step.reset`
3. **The operator, if every owner is locked out.** Use the Supabase dashboard:
   1. Open the project, go to Authentication → Users and find the person by email.
   2. Open the user. Under "Multi-factor authentication" (MFA factors), delete their factor.
   3. If the dashboard doesn't show factors, run this in the SQL editor instead, with the right email. It is a one-off, by hand, and never a migration:
      ```sql
      delete from auth.mfa_factors
      where user_id = (select id from auth.users where email = 'person@example.org');
      ```
   4. Ask them to sign in again. They'll get the enroll screen.

## Supabase dashboard settings

- Authentication → Multi-Factor: **TOTP (App Authenticator) enabled**. Without it, the enroll screen fails and nobody can sign in.
- Authentication → Sign In / Providers → Email: **leaked password protection on**, plus a minimum password length of 8 or more.
- Authentication → Sign In / Providers: **"Allow new users to sign up" off**. That covers Google sign-in too, which has no `shouldCreateUser` option.
- Authentication → URL Configuration: the redirect allowlist must still include `/auth/callback` on both hosts. This hasn't changed.

## Local and visual checks

`e2e/v4/mock-supabase.mjs` issues aal2 sessions by default (`V4_MFA=aal2`), so sign-in through the mock lands in the app as before. Set `V4_MFA=verify` or `V4_MFA=enroll` (or `POST /__mock/config {"mfa": "verify"}`) to see the two-step screens. Any 6-digit code works except `000000`.
