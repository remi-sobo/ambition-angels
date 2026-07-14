---
name: verify
description: How to run and drive this app locally to verify a change end-to-end, including the auth-gated /admin (BloomOS) pages, without real Supabase credentials.
---

# Verifying changes in this repo

## Public pages

`npm run dev` (port 3000) works with no env vars for purely static pages.
Anything touching Supabase/Stripe/Anthropic needs the env vars from
`.env.example`.

## Admin (/admin, BloomOS) pages — no real credentials needed

`/admin/*` is gated by middleware on a Supabase session, and pages read data
through `getSupabaseAdmin()`. A local Supabase stack (`supabase start`) is NOT
possible in the remote execution environment — Docker image blobs are served
from CloudFront hosts the egress proxy denies. Instead, run the app unmodified
against a small HTTP mock of the two Supabase surfaces it uses (GoTrue +
PostgREST):

1. Write a Node mock server on `127.0.0.1:55321` handling:
   - `POST /auth/v1/token` → `{access_token: <fake JWT>, token_type, expires_in,
     expires_at, refresh_token, user}` (JWT = base64url header/payload/"sig";
     payload needs `sub`, `role: "authenticated"`, far-future `exp`).
   - `GET /auth/v1/user` → the same user object (200) when the Authorization
     header carries your fake JWT.
   - `GET /rest/v1/<table>` → fixture rows per table, `[]` default. When the
     `Accept` header contains `vnd.pgrst.object` return the first row (or a 406
     with `{code: "PGRST116"}` when empty) — `.maybeSingle()` depends on this.
   - `POST/PATCH` writes → 201/204, discard.
   - Must-have fixtures for admin auth: `memberships` (one row with `org_id`,
     `role: "owner"`) — a session without a membership row is treated as
     unauthenticated by `lib/admin/auth.ts`.
2. `.env.local`: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321`, any
   JWT-shaped strings for `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY`. Delete it when done.
3. `npm run dev`, then drive with Playwright
   (`require("playwright-core")` from the repo's node_modules, launch with
   `executablePath: "/opt/pw-browsers/chromium"` and `--no-proxy-server`).
4. Log in through the real UI at `/admin`: placeholders are "Email" /
   "Password", any password works against the mock. **Wait for the
   `/api/admin/login` response** before navigating on — the dev server's
   first-hit compile makes fixed waits flaky, and navigating before the
   session cookies land gets you bounced back to `/admin` by middleware.

Gotchas:
- Layout/dashboard fan out to dozens of tables; the `[]` default covers them —
  admin pages degrade gracefully on empty data.
- Ops fixtures: `ops_tasks` rows need the full column set from
  `app/admin/ops/_types/ops.ts` (`labels: []`, `roll_count: 0`, pin flags,
  etc.). Use a recent `created_at`/`updated_at` or rows render as "stuck".
