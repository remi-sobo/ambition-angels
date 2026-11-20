# Spec amendment: Comms v2, v1.2 (send from each org's Gmail)

**Status:** Approved 2026-11-20. G1 in review, G2 in review. Amends `specs/comms-v2-mail-merge.md` v1.1.
**Repo location:** `specs/comms-v2-gmail-amendment.md`
**Author:** Claude (architect), for Remi
**Source of patterns:** the Team Esface email engine (`remi-sobo/team-esface-`, `src/lib/email/**`). Remi confirmed on 2026-11-20 that Team Esface has agreed to BloomOS using and adapting that code.

---

## What this amendment changes

v1.1 sends through Resend from one verified domain, and lists Gmail sending as out of scope. v1.2 does the opposite for now:

- **In:** every BloomOS org connects one Google account. Campaigns go out through the Gmail API as that account. Mail sits in that account's Sent folder, and replies come back to its inbox. This is the Mailmeteor experience, built into the CRM, much like HubSpot's connected inbox.
- **Deferred, still designed:** sending from the org's own domain through Resend (Option B below). The transport seam in this spec is there so Option B can be added later without touching the queue, the renderer, or the screens.
- **Unchanged:** Phase 1 (compliance floor and identity, already shipped), Phase 4 (segment builder), Phase 5 (templates), Phase 6 (journeys). Phases 2 and 3 are replaced by Phases G1 to G3 below.

## The two sending options

| | **A. Send from your Gmail** (build now) | **B. Send from your domain** (later) |
|---|---|---|
| How the org sets it up | Clicks "Connect Gmail", picks an account, approves | Adds DNS records (SPF, DKIM, DMARC) in Resend for its domain |
| What recipients see | A normal email from a real person or shared inbox | A sent-by-a-platform email from the org's domain |
| Where replies go | The connected inbox, natively | Whatever reply-to says |
| Daily ceiling | Google's: about 2,000 a day on Workspace, 500 on a free account | Effectively none for orgs this size |
| Bounces and complaints | Arrive as emails in the connected inbox. No webhook | Webhooks into `email_events`, with automatic suppression |
| Best fit | Orgs under $2M writing to a few hundred or a couple of thousand people | Orgs with a big list or weekly newsletters |
| Platform work | Google OAuth app verification (see Risks) | A domain onboarding screen, plus Resend webhooks (old Phase 2) |

**Decision (Remi, 2026-11-20):** build A. Write B into the design as a later phase.

## Current state (BloomOS, checked 2026-11-20)

- Phase 1 of v1.1 is live: `org_comms_settings` (from_name, from_email, reply_to, mailing_address, footer_text, daily_send_cap) and `email_suppressions` exist, and `/api/unsubscribe` writes suppressions.
- Campaigns still send synchronously through Resend from `app/api/admin/comms/[id]/send/route.ts`, in chunks of 25. There is no queue, no scheduling and no tracking. `email_sends` is written after each send.
- Gmail today is one hardcoded account. `lib/google/auth.ts` authenticates as remi@ through `GOOGLE_REFRESH_TOKEN` in env. That works for Ambition Angels and nobody else.
- What already works for many orgs: the Google Calendar connect flow (`lib/google/oauth.ts`, `lib/google/connection.ts`) puts each org's refresh token in `connections`, encrypted by `lib/crypto/secret-box.ts`. The Gmail connection reuses this path.
- Cron pattern: GET, `Bearer ${CRON_SECRET}`, `maxDuration = 60`. The fastest job today runs every 15 minutes.

## What we take from Team Esface

Team Esface has the engine BloomOS is missing, and it already sends through Gmail. We port these patterns and adapt them to BloomOS's tables, `getOrgContext()` and permission checks.

| Team Esface | Becomes in BloomOS | Notes |
|---|---|---|
| `lib/email/gmail.ts` (`buildRawMessage`, send) | `lib/comms/transport/gmail.ts` | Its MIME builder is stricter than BloomOS's (it refuses line breaks inside headers, handles attachments and extra headers). Drop the hardcoded `ADMIN_SENDER`: an org can connect any account it controls |
| `lib/email/connection.ts`, `crypto.ts`, `oauth-state.ts`, settings `start`/`callback` routes | `lib/comms/gmail-connection.ts` and `app/api/admin/comms/connect-gmail/{start,callback}` | Storage moves to `connections` (provider `google_gmail`) through `secret-box.ts`. The PKCE and state cookie pattern stays |
| `lib/email/campaigns/send.ts` (`startCampaign`, `drainQueue`) | `lib/comms/queue.ts` | One queued row per person, claimed by the worker. Pacing as in Team Esface: 2 at a time, a 250 ms gap, a 55 s budget per run |
| `claim_email_messages` SQL function | `claim_email_sends()` | `for update skip locked`, plus each org's daily cap counted over the last 24 hours |
| `unknown` status on an unclear Gmail answer | Same | A Gmail send can't safely be repeated. If we don't know whether it went, it is never retried automatically, and a person decides |
| `lib/email/campaigns/render.ts` merge and footer | Extends `lib/fundraising/comms-email.ts` | Merge fields come from constituents. All branding comes from `org_comms_settings` |
| `lib/email/campaigns/tracking.ts`, `/e/o`, `/e/c` routes | `lib/comms/tracking.ts`, `app/e/o/[token]`, `app/e/c/[token]/[n]` | Per-send token, open pixel, click redirect |
| `app/e/u/[token]/one-click/route.ts` | `app/api/unsubscribe/one-click` | RFC 8058 one-click unsubscribe. It writes the existing `email_suppressions` and keeps BloomOS's HMAC token format |
| `lib/email/campaigns/{checks,results,export}.ts` | `lib/comms/{checks,results,export}.ts` | Pre-send checks, the results page and CSV export |
| `lib/email/campaigns/stuck.ts`, `lib/email/hq/*` | Phase G4 | Stuck-send alarm and copy-to-leadership |

What we don't take: Team Esface's audience logic (families, athletes, teams, coaches). BloomOS uses `constituents` and `segments`. We also leave out the coach rules, the AI prompt about the academy, the GIF picker and texting.

## Architecture

```
compose · schedule · segment · report · settings (session client, getOrgContext)
        │
segments.definition ──► recipients = constituents with email
                                     − email_suppressions − do_not_contact
        │  Send now / schedule
        ▼
email_sends rows, status 'pending' (unique campaign_id + email = no double queue)
        │
cron /api/cron/comms-queue (every minute, CRON_SECRET, maxDuration 60)
  · open campaigns whose scheduled_at has passed
  · claim_email_sends(): skip locked, per-org daily cap
  · check suppression again at send time
  · render: merge fields, footer, tracking links, List-Unsubscribe headers
  · transport for the org (org_comms_settings.transport):
        'gmail'  → Gmail API as the connected account   ◄── this build
        'resend' → Resend from the org's domain         ◄── Option B, later
  · write the outcome: sent | failed | unknown | skipped | suppressed
  · reaper: a row claimed over 15 minutes ago with no outcome becomes
    'unknown' (never re-queued, since Gmail sends can't safely repeat)
        │
/e/o/[token] open pixel · /e/c/[token]/[n] click redirect
/api/unsubscribe (link) · /api/unsubscribe/one-click (header) → email_suppressions
v_campaign_stats (security_invoker) over email_sends + email_link_clicks
```

**The transport seam.** `lib/comms/transport/index.ts` exports one type, `Transport.send(message) → { providerMessageId }`, and one function, `transportFor(orgId)`. The queue, renderer and screens only call this. For now `gmail.ts` is the only transport. The existing Resend campaign route is retired in G2. Journeys keep their own Resend call until Phase 6.

**Who the email is from.** It comes from the connected Google account, so the From address is that account, with `from_name` taken from `org_comms_settings`. Reply-To is set only when `reply_to` is filled in. When someone connects an account, `from_email` is filled in automatically from Google's answer and can't be edited, so the settings never disagree with what Gmail sends.

## Schema changes (SQL for review per phase, Remi applies)

| Object | Phase | Change |
|---|---|---|
| `connections` | G1 | No schema change. One row per org with provider `google_gmail`, and `meta` holding `{ account_email, scope, connected_by }`. Its RLS stays deny-all |
| `org_comms_settings` | G1 | Add `transport text not null default 'gmail' check (transport in ('gmail','resend'))`. When Gmail is connected, the cap is set to 400 unless an admin raises it (the most allowed is 1,800) |
| `email_campaigns` | G2 | Add `scheduled_at`, `started_at`, `finished_at` and a `left_out` jsonb (counts of who was excluded and why). Rebuild the status check as draft, scheduled, sending, sent, canceled |
| `email_sends` | G2 | Add `claimed_at`, `provider_message_id`, `attempt_count`, `tracking_token` (unique) and `personalized_subject`. Rebuild the status check as pending, sending, sent, failed, unknown, skipped, suppressed. Index on (org_id, status, sent_at) for the cap |
| `claim_email_sends(batch int)` | G2 | SECURITY DEFINER, service role only, ported from Team Esface's `claim_email_messages` |
| `email_sends` tracking | G3 | Add `open_count`, `first_opened_at`, `click_count` |
| `email_link_clicks` | G3 | org_id (no default), send_id, link_index, url, clicked_at. RLS read through `fundraising.read`, writes by service role only |
| `record_email_open(token)` and `record_email_click(token, n)` | G3 | SECURITY DEFINER, called from the public tracking routes |
| `v_campaign_stats` | G3 | security_invoker |

None of these tables gets a default `org_id`. The ratchet test covers each new table.

## Build order

**G1: Connect Gmail per org** (`comms-gmail-connect`)
- In Comms settings, a "Connect Gmail" card with connect, disconnect and the status ("Sending as redacted@example.invalid, connected by Dana on Nov 3"). Only people with `org.manage` can connect or disconnect.
- The OAuth start and callback routes ask only for `gmail.send openid email`. They reuse the calendar flow's state cookie and credential preflight. The token is stored in `connections` through `secret-box.ts`.
- Add the transport seam and `transport/gmail.ts`. Test sends go through Gmail, personalized from a real sample recipient (kept from v1.1).
- Revoked or expired tokens: the connection is marked `error`, sending stops, and the settings card says what to fix.
- Operational (Remi): add the redirect URI to the Google OAuth client, add `gmail.send` to the consent screen, and add the two client orgs' accounts as test users until verification is done (see Risks).

**G2: Send queue, scheduling and the worker** (`comms-gmail-queue`)
- `startCampaign`: works out the recipients, records who was left out and why, inserts pending rows, and sets the campaign to sending or scheduled.
- The cron worker `/api/cron/comms-queue` runs every minute, with the claim function, Team Esface's pacing, the per-org daily cap, the `unknown` status and the reaper. A campaign larger than the day's cap carries on the next day automatically, and the screen says so before sending ("412 people. At your daily limit of 400, the last 12 go tomorrow morning.").
- Schedule and cancel in the compose screen. Cancel stops the rows that haven't been claimed yet.
- Retire the synchronous Resend send route.

**G3: Tracking, one-click unsubscribe and results** (`comms-gmail-results`)
- Open pixel and click redirect, ported from Team Esface. Opens are labeled "about", because Apple Mail and Gmail load images ahead of time.
- One-click unsubscribe route plus the `List-Unsubscribe` and `List-Unsubscribe-Post` headers.
- Results page: sent, failed, unknown, opened, clicked, unsubscribed, the left-out counts, and CSV export.
- Bounces: Gmail has no webhook. Staff can mark an address as bounced from the results page, which adds a suppression with reason `hard_bounce`. Detecting bounces automatically would mean reading the inbox (a restricted Google scope), so it's out.

**G4: Safety nets** (`comms-gmail-nets`, small)
- Stuck-send alarm: a campaign still sending after 24 hours, or a connection in error while rows are waiting, emails the org's admins. Ported from `stuck.ts`.
- Copy to leadership: a list of people in each org who get a copy of every campaign as sent. Ported from `lib/email/hq/*`.

**Then, unchanged from v1.1:** Phase 4 (segment builder), Phase 5 (templates, which can borrow Team Esface's `lib/email/templates`), Phase 6 (journeys, now sending through this queue and therefore through Gmail).

**Later: Option B, send from your domain.** Add `transport/resend.ts`, a domain onboarding screen that shows the DNS records and checks them, and v1.1's old Phase 2 (Resend webhooks, `email_events`, automatic suppression). Nothing in G1 to G4 changes.

## Definition of done (G1 to G3)

- A second test org connects a different Google account and sends a campaign. Recipients see that account as the sender, the email sits in that account's Sent folder, and no Ambition Angels row is read or written along the way (checked through RLS and the service-path org checks).
- No file contains a hardcoded sender address or org name in the send path.
- 600 queued sends with a cap of 400: 400 go out today and 200 the next day, and every row ends with an outcome.
- Killing the worker partway through, then letting the next cron run, loses nothing and sends nothing twice. Rows caught mid-send end as `unknown`, not re-sent.
- Revoking the Google grant shows as an error on the settings card within one cron run, and no rows are marked failed for it. They wait.
- In Gmail's "Show original", the email has List-Unsubscribe, List-Unsubscribe-Post, the mailing address and the footer from `org_comms_settings`.
- One-click unsubscribe creates an `email_suppressions` row, and the next campaign leaves that person out with the left-out line showing it.
- Ported code arrives with its Team Esface tests, adapted, in `tests/`.

## Risks

1. **Google verification.** `gmail.send` is a sensitive scope. Until BloomOS's OAuth app passes Google's review, only listed test users (up to 100) can connect, and they see an "unverified app" warning. The calendar scope already in use is also sensitive, so one review can cover both. Start it during G1. It takes days to weeks and needs a privacy policy, a home page on the app's domain and a short demo video.
2. **Hitting Gmail's limits.** Going over Google's daily ceiling locks the account out of sending for up to 24 hours, including the ED's own email. The cap defaults to 400 and can go no higher than 1,800 for this reason.
3. **The connected person leaves.** If the account belongs to someone who leaves, sending stops. The connect screen recommends a shared Workspace inbox (such as hello@) over a personal one.
4. **Bounces without a webhook.** A list with many dead addresses hurts the account's reputation. Mitigations: the manual bounce button, and a pre-send check that warns when more than 5% of the segment has never been emailed and was imported more than 2 years ago.
5. **Bringing over Team Esface assumptions.** Ported code still mentions families, athletes or "Team Esface". A G1 to G3 review step greps for those words and for `teamesface`.
6. **The unknown pile.** If Gmail is slow, `unknown` rows build up. The results page lists them with "Mark as sent" and "Send again" so a person decides.

## Decisions (Remi, 2026-11-20: "go with your recommendations")

- **A. Ambition Angels' own sender.** A shared inbox (hello@ambitionangels.org), connected through the new flow. Until it's connected, AA stays on its current Resend identity: the G1 migration keeps AA's row on `transport = 'resend'`, and connecting Gmail switches it. `GOOGLE_REFRESH_TOKEN` is retired for sending once AA is on Gmail.
- **B. Default daily cap.** 400, which an admin can raise to 1,800. Connecting Gmail sets a new org to 400 and brings any cap above 1,800 down to 400. The settings API refuses anything above 1,800 while the org sends through Gmail.
- **C. Cron frequency.** Every minute (G2).
- **D. Who can send.** A separate `comms.send` permission, added in G2. In G1, connecting and disconnecting Gmail need `org.manage`.
- **E. Gating.** `modules.comms` stays the per-org switch. Both client orgs get it (an entitlement row, not code).

## G1 as built (2026-11-20)

- Migration `supabase/migrations/comms_gmail_g1.sql`: adds `org_comms_settings.transport` (default 'gmail', with a check constraint) and keeps existing configured rows on 'resend'.
- `lib/comms/gmail-oauth.ts`, `lib/comms/gmail-connection.ts`: the consent URL (gmail.send, openid, email only), the scope check, and encrypted storage in `connections` (provider `google_gmail`, one row per org).
- Routes `app/api/admin/comms/connect-gmail/{start,callback}` and `DELETE /api/admin/comms/connect-gmail`, all requiring `org.manage`. The callback reads the account from the verified id_token, refuses a grant without gmail.send, creates the org's settings row when it's missing, and switches the org to Gmail.
- The transport seam `lib/comms/transport/` holds `gmail.ts`, `resend.ts` (the old path, unchanged) and `mime.ts` (ported from Team Esface).
- Test send and campaign send go through the seam. The send route paces Gmail at 2 at a time with a 250 ms gap, refuses a campaign that doesn't fit what's left of the daily cap, and stops the run (marking the rest skipped) if the sender breaks or Google limits it.
- The journeys cron holds enrollments for Gmail orgs until Phase 6.
- The Comms page has a "Send from Gmail" card. The sending identity card shows the connected account as the From address when the org is on Gmail.
- Tests: `tests/comms-gmail.test.ts`.

## G2 as built (2026-11-20)

- Migration `supabase/migrations/comms_gmail_g2.sql`: scheduling columns and `left_out` on `email_campaigns`; `claimed_at`, `provider_message_id`, `attempt_count` and `first_name` (the merge data snapshot) on `email_sends`; both status checks rebuilt; the `comms.send` permission for owner, admin and staff; and three service-role functions: `comms_queue_tick()` (reap rows stuck over 15 minutes as unknown, open due scheduled campaigns, list orgs with work), `claim_email_sends(org, limit)` (skip locked, within the org's 24-hour cap) and `finish_email_campaigns()` (refresh counts, close finished campaigns).
- `lib/comms/queue.ts`: `startCampaign` queues one pending row per recipient (send now or scheduled) and returns a carry-over note when the cap spreads it over days. `cancelCampaign` skips what's still waiting.
- `lib/comms/worker.ts` + `/api/cron/comms-queue` (every minute, `CRON_SECRET`, 60 s): per org, resolve the transport, claim, check suppression and do-not-contact again, send at the transport's pace (Gmail 2 at a time with a 250 ms gap), write each outcome. A broken or rate-limited sender puts the message back and stops that org until the next tick. An unclear answer becomes `unknown` and is never retried.
- Send route now only queues and needs `comms.send`. New cancel route. Delete refuses a queued campaign.
- `resolveRecipients` takes the org id and pins constituents, suppressions and gifts to it. Before this, a member of two orgs could email the other org's constituents.
- Comms page: Schedule and Cancel, and a status line per campaign ("Sending: 120 of 412", "Scheduled for Nov 22, 9:00 AM").
- Tests: `tests/comms-queue.test.ts`.

## G3 as built (2026-11-20)

- Migration `supabase/migrations/comms_gmail_g3.sql`: `tracking_token` (unique), `open_count`, `first_opened_at`, `click_count` and `first_clicked_at` on `email_sends`; `email_link_clicks` (read through `fundraising.read`, written only by service role); `record_email_open(token)` and `record_email_click(token, n, url)`.
- `lib/comms/links.ts`: one link extractor shared by the renderer and the click route, so link n in the email is link n in the redirect. The redirect target always comes from the stored campaign body, never the request, so the route can't be used as an open redirect.
- Renderer: links in the body are now clickable. With a tracking token they go through `/api/t/c/[token]/[n]`, and an open pixel (`/api/t/o/[token]`) is added. Test sends carry no token. Routes live under `/api/` because the app host's router 404s other paths. No reader data (address, IP, agent) is stored.
- Results page `/admin/fundraising/comms/[id]`: sent, opened (labeled "about"), clicked, unsubscribed, what happened by status, who was left out and why, links clicked, CSV export (formula cells defused), and a "Needs a decision" list for unclear and failed sends with It arrived / Send again / Bounced.
- One-click unsubscribe already existed (`/api/unsubscribe` accepts the RFC 8058 POST). Fixed: the unsubscribe page was hardcoded to Ambition Angels and remi@; it now names the sending org and its reply-to or Gmail account.
- `v_campaign_stats` was dropped in favor of counting on the results page, since campaigns are capped at 2,000 recipients.
- Tests: `tests/comms-tracking.test.ts`.

## Effort

G1 is a couple of evenings, mostly because of the OAuth plumbing that already exists for calendars. G2 is the careful phase and the biggest port, about 1,200 lines from Team Esface's `send.ts` and the claim function, plus tests. G3 is about two evenings. G4 is one. Google verification has to start in G1 because it takes the longest.
