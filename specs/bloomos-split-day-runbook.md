# Split day runbook

Companion to `specs/bloomos-repo-split.md` (phase 3, section 7). That spec says what moves where. This file is the order of operations for the day itself, with what's already done, what to check, and how to back out.

Written 2026-11-24, after phases 1 and 2 shipped (#620 to #632).

## Where things stand

| Piece | State |
|---|---|
| Intake API in BloomOS | Live since #620. Two keys for Ambition Angels: `bos_live_ZPwv…` (Ambition Angels Vercel project) and `bos_live_JU4YfPvG` (bloomos project, pre-split only) |
| Website forms | Sending through BloomOS (`INTAKE_MODE=api` on bloomos) since 2026-11-24 03:00 UTC. One test quiz went through end to end. No real submission yet as of 2026-11-24 |
| Games and site analytics | On the Ambition Angels database (`sfmlktoeveovujjurihn`) since #624. `SITE_DB=site` on bloomos. No second data copy needed on split day: the flip already happened |
| Website admin | Live at ambitionangels.org/admin (#625, #626, #628). `SITE_ADMIN_EMAILS` is Remi and Shannon |
| Outbox retry cron | `/api/site/cron/intake-outbox`, every 15 minutes (#628). Outbox empty |
| Website numbers in BloomOS | Daily cron and 209-day backfill done (#630, #631). Key saved in BloomOS Settings → Connections |
| `/shannon` | Deleted (#632) |
| Stripe | The "ambition donation" webhook already points at app.bloomos.org/api/stripe-webhook |
| Google Calendar watch | Already registers to app.bloomos.org (`APP_ORIGIN`) and renews weekly. Nothing to do on split day |
| HubSpot | Has never sent a webhook. Nothing to do |
| Trellis hub | No `BLOOMOS_HUB_URL` set, so sync is off. Nothing to do |
| BloomOS GitHub repo | `remi-sobo/bloomos` exists, private, empty |
| Ambition Angels Vercel project | `ambition-angels-site`, no domain, builds from `main`. Builds fail until its repo is trimmed (expected) |
| DNS | At **Wix** (ns2/ns3.wixdns.net), not Cloudflare as the spec says. Apex A record is `216.198.79.1`, www is a CNAME to Vercel. Both already point at Vercel, so moving the domain between two Vercel projects in the same team should need no DNS change |

### Ambition Angels Vercel project env

Set: `ANTHROPIC_API_KEY`, `BLOOMOS_INTAKE_KEY`, `BLOOMOS_INTAKE_URL`, `CRON_SECRET`, `DEMODAY_PASSWORD`, `DEMO_COOKIE_SECRET`, `DEMO_PASSWORD`, `GAMES_TOKEN_SECRET`, `INTAKE_MODE=api`, `MARKETING_ORIGIN`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `SITE_ADMIN_EMAILS`, `SITE_DB=site`, `SITE_STATS_KEY`, `SITE_SUPABASE_ANON_KEY`, `SITE_SUPABASE_SERVICE_ROLE_KEY`, `SITE_SUPABASE_URL`, `STRIPE_SECRET_KEY`.

No BloomOS Supabase key of any kind. Keep it that way: the website's trimmed code must not need `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.

## Before the day

1. **Let the forms run a week through BloomOS.** Earliest split day: Monday 2026-11-30. Each day, check that the outbox in the website admin (Forms) is empty and that new submissions show in BloomOS.
2. **Optional, with Remi's yes:** send one test submission of each form kind (application, schools inquiry, partner signup, partner waitlist, coach signup, YGB, Demo Day, quiz) and delete the rows after. Each one emails Remi, so warn first.
3. **Prepare the Ambition Angels trim on a branch** (spec phase 3 step 3), opened as a draft PR against `main`. Vercel builds it on the `ambition-angels-site` project at a `*.vercel.app` preview address, so the whole website can be tested there before the day:
   - every public page, with no console errors
   - every form, landing in BloomOS with `org_id` = Ambition Angels
   - every game, against the Ambition Angels database
   - the website admin sign-in. This needs the preview address added to the Ambition Angels Supabase project under Auth → URL Configuration → Redirect URLs. Remove it after split day
   - `/admin/fundraising`, `/board`, `/meet`, `/strategy`, `/coach/me/x`, `/api/unsubscribe` all 308 to app.bloomos.org
4. **Prepare the BloomOS trim on a branch** (spec phase 3 step 2). It isn't deployed until after the domain move (see rollback).
5. **The night before, tell Remi:** the time, that the website may be down for a few minutes, and the two jobs that are his on the day (re-adding the Claude connector, and checking the admin sign-in).
6. **Pick a quiet hour.** Page views are lowest late evening Pacific and on weekends.

## On the day

Run in this order. Don't skip ahead: until step 6, rolling back is just moving the domain.

1. **Mirror the repo into BloomOS.** `git clone --mirror` this repo, then `git push --mirror` to `remi-sobo/bloomos`. Check that `main` and its history are there.
2. **Point the bloomos Vercel project at `remi-sobo/bloomos`** (Settings → Git). Deploy `main` and check app.bloomos.org: sign in, Today loads, one fundraising page, the board portal, `/meet`. The code is still the full monorepo, so nothing changes yet.
3. **Merge the Ambition Angels trim PR.** `ambition-angels-site` deploys it to production at its `*.vercel.app` address, with no domain yet. Repeat the preview checks against that production address.
4. **Move the domain.** In Vercel, remove `ambitionangels.org` and `www.ambitionangels.org` from the bloomos project and add them to `ambition-angels-site`, keeping apex → www as a redirect. Wait for both to show Valid. If Vercel asks for a TXT verification record, add it in Wix DNS. This is the only risky moment.
5. **Check the live website** at www.ambitionangels.org: homepage, one form, one game, the website admin sign-in, the old-link redirects from step 3. Check BloomOS logs for 401s on `/api/intake`, `/api/mcp`, `/api/hub` and `/api/ingest` (spec failure mode: a caller still on the old host).
6. **Merge the BloomOS trim PR in `remi-sobo/bloomos`.** Its middleware becomes app-only. After this deploys, the old project can no longer serve the website, so it must come after step 5.
7. **Clean up the bloomos project's env.** Remove what only the website used: `STRIPE_SECRET_KEY`, `DEMO_PASSWORD`, `DEMODAY_PASSWORD`, `DEMO_COOKIE_SECRET`, `INTAKE_MODE`, `BLOOMOS_INTAKE_URL`, `BLOOMOS_INTAKE_KEY`, `SITE_STATS_KEY`, `SITE_ADMIN_EMAILS`, `SITE_DB`, `SITE_SUPABASE_URL`, `SITE_SUPABASE_ANON_KEY`, `SITE_SUPABASE_SERVICE_ROLE_KEY`, and `GAMES_TOKEN_SECRET` if present. Redeploy.
8. **Revoke the pre-split intake key** `bos_live_JU4YfPvG` (set `revoked_at` on its `org_api_keys` row). The website now uses `bos_live_ZPwv…` from its own project.
9. **Remi re-adds the Claude BloomOS connector** at `https://app.bloomos.org/api/mcp/<secret>`. The old `www.ambitionangels.org` address stops working at step 6.
10. **Smoke test:** spec section 8, items 1 to 11 and 13. Item 12 (website numbers) is checked the next morning.

## Rollback

| If it breaks at | Do this |
|---|---|
| Steps 1 to 3 | Nothing is live yet. Fix forward, or close the PR |
| Step 4 or 5 (website down or broken) | Move both domains back to the bloomos project. It still has the full website code and env until step 6 |
| After step 6 | Revert the BloomOS trim merge in `remi-sobo/bloomos`, redeploy, then move the domains back |
| Forms failing after the move | They queue in the outbox and retry every 15 minutes. If the key is the problem, fix `BLOOMOS_INTAKE_KEY` on `ambition-angels-site` and redeploy. Nothing is lost |

## The day after

- Item 12: BloomOS shows yesterday's website numbers and they match the website admin home.
- The outbox is empty, and the 8am stuck-form email didn't fire.
- Remove the preview redirect URL from the Ambition Angels Supabase auth settings.

## Thirty days after (phase 4)

- Drop the 5b tables from the BloomOS database, after a fresh backup.
- Rotate the BloomOS service-role key and `GAMES_TOKEN_SECRET`.
- Remove the leftover `getResidentOrgId()` callers in BloomOS.
- Delete the stubbed `site-import-temp` edge function on the Ambition Angels database.
- Optional: rename `app/site-admin` to `app/admin` in the Ambition Angels repo and drop the rewrite.
