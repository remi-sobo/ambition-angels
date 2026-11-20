# V4 Phase 0, track 6: Comms

Audited against `main` 37472e56 (the working tree HEAD dff62859 differs only by the V4 brief file). Story bank branch `claude/comms-stories-editions-composer-2mn5w5` at 8d2ca5f7 (2026-08-24). Read-only code audit; no dev server, no production access. Tags: **V** verified in code, **A** assumption, **R** needs runtime access. Branch paths are prefixed `story-bank:`.

## Findings first

| ID | Pri | Finding | Evidence | Tag |
|---|---|---|---|---|
| C-1 | **P0** | A saved view from Donors & Funders becomes a Comms segment, but the recipient resolver ignores its `view` key. A "Lapsed" or "Recurring" view emails everyone with an email who matches the other keys. The send confirm shows no recipient count, so nobody sees it before it goes. The 2,000 cap only blocks this when the whole list is bigger than 2,000. | `lib/fundraising/views.ts:106-111` (adds `view`), `donors-funders/_components/SavedViews.tsx:35-38` (saves to `segments`), `lib/fundraising/segments.ts:37-43` (reads only type/source/tag/q/min_total/since), `CommsControls.tsx:128-135` (confirm with no count) | V |
| C-2 | **P0** | Thank-you emails send from a hardcoded "Ambition Angels <careers@mail.ambitionangels.org>" through Resend for every org. A SafeSpace donor thanked from BloomOS would get mail from Ambition Angels. | `app/api/admin/acknowledgments/send/route.ts:113`, `lib/fundraising/stewardship.ts:76,216` | V (SafeSpace exposure R) |
| C-3 | P1 | No way to edit a draft campaign. The segment can only be picked at create time. The PATCH route exists but has no UI. A typo means delete and recreate, and a story-bank compiled draft (no segment) could never be sent. | `CommsControls.tsx:19-95,222-254`, `app/api/admin/comms/[id]/route.ts:9-32` | V |
| C-4 | P1 | Archived constituents are not excluded from campaign recipients. | `lib/fundraising/segments.ts:31-45` (no `archived_at` filter) vs `views.ts:81` ("archived hidden everywhere") | V |
| C-5 | P1 | Giving filters read gifts with `limit(10000)` and no order. Past 10,000 gifts, `min_total` and `since` segments are silently wrong. Constituents are capped the same way. | `lib/fundraising/segments.ts:19,31-34,65-71` | V (AA gift count R) |
| C-6 | P1 | Segment builder v2 (Phase 4) not built: six legacy keys, no giving-history rules, no live count, no preview. The empty-state hint points at "the Donors page (Segments & export)", a route that now 308s to Donors & Funders. | `segments.ts:4-8`, `comms/page.tsx:149`, `lib/admin/v2routes.ts:102` | V |
| C-7 | P1 | Unsubscribe links are built on the marketing origin (falls back to www.ambitionangels.org) and tracking links on the app origin, one value for all tenants. Email links and the unsubscribe page use AA orange. | `lib/fundraising/unsubscribe.ts:42`, `lib/origins.ts:23-51`, `lib/fundraising/comms-email.ts:105`, `app/api/unsubscribe/route.ts:48` | V (env values R) |
| C-8 | P1 | Gmail verification is not ready on what the repo shows. No privacy policy page exists in `app/`. The legacy `GOOGLE_REFRESH_TOKEN` (gmail-sync, meet emails) uses the same `GOOGLE_CLIENT_ID` and needs `gmail.readonly`, a restricted scope. If it was minted on the same consent screen, the brief's "sensitive only, one review" claim is wrong. | `lib/google/auth.ts:14-18`, `lib/google/gmail-read.ts:5`, `app/api/cron/gmail-sync/route.ts:8`; `find app -iname '*privacy*'` returns nothing | V / R |
| C-9 | P1 | Sends, opens and clicks never reach the donor timeline. Nothing in Today reads Comms (unknown sends, scheduled sends, stuck alarm). Only the alarm reaches Inbox. | No reader of `email_sends`/`email_campaigns` outside comms, tracking, unsubscribe, constituent merge and `lib/admin/plan/metrics.ts`; `lib/comms/safety.ts:61-65` | V |
| C-10 | P1 | No story capture on main. The headline loop starts with a step that doesn't exist yet. | The story bank lives only on the branch | V |
| C-11 | P1 | Operator emails, including the new `comms.stuck` alarm, go out as "BloomOS · Ambition Angels" to every org's admins. | `lib/email/operator.ts:78`, `lib/notifications/notify.ts:29,149` | V |
| C-12 | P1 | gmail-sync writes Remi's mailbox into interactions for `orgs.limit(1)` with no order: "single tenant today". With two live orgs that pick is arbitrary. (Hand-off to track 3.) | `app/api/cron/gmail-sync/route.ts:31-34`, `lib/fundraising/gmail-sync.ts:145-147` | V (which org R) |
| C-13 | P2 | Test send needs no `comms.send` permission, takes any address, and doesn't count toward the daily cap. | `app/api/admin/comms/[id]/test/route.ts:16-22,59-60` | V |
| C-14 | P2 | `comms.send` is enforced only in the API. RLS lets any `fundraising.write` holder insert pending `email_sends` and set a campaign to `sending`. Same roles today (owner/admin/staff), so this is latent. | `create_email_campaigns.sql:61-66`, `comms_gmail_g2.sql:47-51` | V |
| C-15 | P2 | GET on the unsubscribe link unsubscribes right away, so link scanners can opt people out. RFC 8058 expects GET to confirm and POST to act. | `app/api/unsubscribe/route.ts:122-129` | V |
| C-16 | P2 | When Google rate-limits ("paused"), the worker retries every minute with no backoff and no alarm. The alarm covers only a broken connection or 24 h of sending. | `lib/comms/queue-plan.ts:189-191`, `worker.ts:66-75`, `safety.ts:96-104` | V |
| C-17 | P2 | Journeys: no cron in `vercel.json`, Resend only, no send ledger or tracking, and held for any Gmail org until Phase 6. Once AA connects Gmail, journeys stop for AA. They do honor DNC and suppressions at send time. | `vercel.json` (5 crons, no journeys), `app/api/cron/journeys/route.ts:147-165,204-209` | V |
| C-18 | P2 | The send confirm doesn't show the count or the carry-over ("the last 12 go tomorrow"). That only appears in the success toast after queuing. G2 asked for it before. | `CommsControls.tsx:126-149`, `queue.ts:112` | V |
| C-19 | P2 | Results stop at counts and a CSV. No per-recipient link to the donor, no "segment from clickers", no follow-up task. | `app/admin/fundraising/comms/[id]/page.tsx:53-124` | V |
| C-20 | P2 | Leadership copies that fail are marked done and dropped. Test sends and copies sit outside the daily cap. There is no DB check on `daily_send_cap` (the 1,800 limit is API-only). | `safety.ts:134-150`, `app/api/admin/comms/settings/route.ts:58-66` | V |
| C-21 | P2 | `MAX_RECIPIENTS` is 2,000. AA had 2,432 emailable constituents per the v1.1 spec, so "everyone" is refused. | `queue-plan.ts:179`, `specs/comms-v2-mail-merge.md:34` | V / R |
| C-22 | P2 | Name collision: the Fundraising "Campaigns" tab (gift attribution) sits next to Comms "+ New campaign". `email_campaigns` has no link to `campaigns`/`appeals`, so email can't be credited with gifts. | `nav.ts:130-135`, `create_email_campaigns.sql:7-13`, `campaigns/page.tsx:45-50` | V |
| C-23 | P2 | Acknowledgments and auto-receipts don't check `do_not_contact`. | `acknowledgments/send/route.ts:19-60`, `stewardship.ts:180-187` | V |
| C-24 | P3 | Draft PATCH/DELETE use `isAuthed()` with no org pin (RLS only). AA copy in the compose placeholder ("believing in our teens"). | `[id]/route.ts:10,35`, `CommsControls.tsx:82` | V |

## 1. Current state on main

**Seat.** One Fundraising tab, `comms` → `/admin/fundraising/comms`, gated `modules.comms` (`lib/admin/nav.ts:135`), kept in place (`v2routes.ts:271`), with a layout `FeatureGate` (`comms/layout.tsx`).

**Screens.** `/admin/fundraising/comms`: stats, New campaign form, Gmail card, sending identity card, campaign list with per-row Test, Send, Schedule, Cancel, Delete. `/admin/fundraising/comms/[id]`: results. Nothing else.

**Code.** `lib/comms/`: `transport/{index,gmail,resend,mime,types}`, `gmail-oauth`, `gmail-connection`, `queue`, `queue-plan`, `worker`, `links`, `results`, `safety`, `settings`. The renderer is `lib/fundraising/comms-email.ts` and the resolver is `lib/fundraising/segments.ts`.

**API.** `POST /api/admin/comms`; `PATCH|DELETE [id]`; `[id]/test`, `send`, `cancel`, `export`, `sends/[sendId]`; `settings`; `connect-gmail/{start,callback}` and DELETE. Cron `/api/cron/comms-queue` runs every minute. Tracking: `/api/t/o/[token]`, `/api/t/c/[token]/[n]`. Public `/api/unsubscribe` (GET and POST).

**Tables and statuses.** `email_campaigns`: draft, scheduled, sending, sent, canceled. `email_sends`: pending, sending, sent, failed, unknown, skipped, suppressed. Also `email_link_clicks`, `email_suppressions` (citext), `org_comms_settings` (transport, cap, leadership list), and `connections` (provider `google_gmail`, AES-256-GCM token, RLS deny-all).

| Spec capability | Status | Note |
|---|---|---|
| v1.1 P1 identity, suppressions, fail-closed secret, List-Unsubscribe | Shipped | `unsubscribe.ts:12-20`, `comms-email.ts:67-77` |
| v1.1 P2 Resend webhooks / `email_events` | Replaced | Option B, not built |
| G1 connect Gmail, transport seam | Shipped | |
| G2 queue, schedule, cancel, cap, unknown, reaper | Shipped | Carry-over shown only after queuing (C-18) |
| G3 opens, clicks, results, CSV, manual bounce, per-org unsubscribe page | Shipped | Branding gaps (C-7) |
| G4 stuck alarm, leadership copy | Shipped | C-16, C-20 |
| Pre-send checks (`lib/comms/checks.ts`, the stale-import warning) | Missing | No file |
| Test against a real sample recipient | Shipped | first_name only |
| P4 segment builder v2, live count | Missing | C-1, C-6 |
| P5 templates | Missing | |
| P6 journey retrofit | Missing | C-17 |
| Merge fields beyond `{{first_name}}` | Missing | `comms-email.ts:20-22` |
| Edit a draft | Partial | API only (C-3) |

**Send call sites, by transport and identity** (V):

| Path | Transport | From |
|---|---|---|
| Campaigns, tests, leadership copies (`worker.ts`, `test/route.ts`, `safety.ts`) | Seam: Gmail, or Resend for orgs still on `resend` (AA until it connects, `comms_gmail_g1.sql`) | Connected account, or `org_comms_settings.from_email` |
| Journeys (`cron/journeys/route.ts:221`) | Resend | `org_comms_settings.from_email`; Gmail orgs held |
| Acknowledgments, auto-receipt (`acknowledgments/send:113`, `stewardship.ts:216`) | Resend | Hardcoded AA |
| Notifications and alarms (`lib/email/operator.ts:77`) | Resend | "BloomOS · Ambition Angels" |
| Donations, receipts (`stripe-webhook`, `save-donation`, `send-receipt`) | Resend | Hardcoded AA (public site, fine) |
| Meet scheduler (`lib/google/gmail.ts`) | Gmail, env token | remi@ |
| Public forms, coach, ms, ygb, shannon (12 more files) | Resend | AA-specific, outside BloomOS |

## 2. The core loop today

Setup, once: Gmail card → Connect → Google chooser and consent (3 to 4 clicks off-site) → fill in the mailing address → Save. Then:

| Step | Where | Clicks | Breaks or leaves Comms |
|---|---|---|---|
| Capture a story | nowhere | n/a | **Breaks**: no story bank on main |
| Choose audience | Fundraising → Donors & Funders → filter → Save view → name → Save | ~6 | **Leaves Comms**. Saved `view` semantics lost (C-1); no count |
| Compose | Comms tab → + New campaign → fields → pick segment → Save draft | ~4 + typing | No preview, no edit afterwards (C-3) |
| Test | Test → address → Send test | 2 | **Leaves** to an inbox to check it |
| Schedule or send | Schedule → pick time → Schedule → Confirm (or Send → Confirm) | 2 to 4 | Count shown only after (C-18) |
| Read results | Campaign name → results | 1 | Opens labeled "about" |
| Follow up | Download CSV | 1 | **Leaves BloomOS**: spreadsheet, Gmail for replies, donor records by hand |

About 16 to 18 clicks and four context switches (Donors & Funders, test inbox, Gmail replies, spreadsheet). The loop breaks at capture, at audience correctness, and at follow-up.

**Segment rules.** Today: type, source, one tag, name search, minimum lifetime total, last gift since. Spec P4: match all or any; total given, gift count, first and last gift date, largest gift, recurring, campaign or appeal, tags, lapsed by fiscal year; a live count; recipient preview; an exclusions line. Only the exclusion counts exist, and they show after sending (`[id]/page.tsx:69-74`).

## 3. Story bank branch

**Contents.** 9 commits, about 9,000 lines. 6 migrations (`comms_phase1_story_schema`, `phase2_storage`, `phase2_views`, `phase3_outputs`, `phase4_editions`, `phase6_loop`). Tables `stories`, `story_subjects`, `story_consents`, `story_media`, `comms_outputs`, `comms_formats`, `comms_editions`, `comms_edition_slots`, the views `v_publishable_stories` and `v_story_suggestions`, and a private `comms-media` bucket. 18 routes under `app/api/admin/comms/{stories,subjects,consents,media,outputs,formats,editions}`. Screens at `/admin/comms` (bank, story detail, editions, edition builder, settings/formats). Tests: `comms-consent`, `-media`, `-bank`, `-channels`, `-redact`, `-formats`, `-compile`, `-loop`, `admin-nav`, plus RLS leak cases.

**Phases.** 0 to 6 are all committed (spec §8). Phase 5 compiles into a draft. Phase 6 adds sent-edition performance and gift-in-window attribution (`story-bank:lib/comms/loop-server.ts:47-61`).

**Key fact: the schema is already in production.** All six migrations sit in the ledger baseline as `ledgerOnly` (`scripts/check-migration-ledger.ts:215-220`). Landing commits the files and removes those six entries in the same PR (the baseline ratchet requires it). No DDL needs to run.

**Consent model: built, not only spec'd** (V). States are computed (`story-bank:lib/comms/consent.ts`). `v_publishable_stories` makes revocation beat any other grant, and an expired or merely requested consent blocks (`story-bank:supabase/migrations/comms_phase2_views.sql`). `comms.subjects.read` (owner and admin) gates participant subjects and consents in RLS (`story-bank:comms_phase1_story_schema.sql:248-304`). The composer reads only publishable stories, redacts, and refuses if a name survives (`story-bank:app/api/admin/comms/stories/[id]/compose/route.ts:94-105,177-181`). Compile re-checks publishability (`story-bank:lib/comms/compile.ts:144-153`). **Gap:** nothing checks consent again after compile. The campaign body is frozen text the worker sends as-is (`worker.ts:162`). A revocation after compile, or before a send scheduled up to 90 days out, doesn't stop it (P1 when landed).

**Landing on today's main:**

| Piece | Fit | Work | Size |
|---|---|---|---|
| Migrations | Already applied | Add files, shrink the baseline, run `tests/migrations.test.ts` idempotency (R) | Small |
| `lib/comms/*` story files | No filename collisions with the G1 to G4 files | None | Small |
| Story routes | Static segments coexist with `[id]` | Keep `requireEntitlement`/`generateText` (signatures unchanged on main) | Small |
| Nav | **Conflicts**: edits V1 `NAV_SECTIONS`, `Sidebar.tsx`, `SectionSubNav.tsx`, all deleted on main | Rebuild as a V2 destination. `V2Tab` has no `perm` field (`nav.ts:60-69`); add it or rely on page gates. Rewrite `admin-nav.test.ts` | Medium |
| Permissions | `getMyPermissions` added to `lib/admin/permissions.ts` | Merge. Decide on `comms.manage` vs `comms.send` (both owner/admin/staff) | Small |
| Compile into the sender | Written for the old Resend sender; still inserts a valid draft | Segment attach and draft edit UI (C-3). Sync handles only `sent` (`story-bank:lib/comms/editions-server.ts:129-147`), so canceled and scheduled need states. `failed_count` now includes skipped and suppressed (`loop-server.ts:38`). Consent check at enqueue and send time. Deep links to `/admin/fundraising/comms` (`EditionBuilder.tsx:543,583`) | Medium |
| Loop | Fits | Use G3 opens and clicks | Small |
| Screens | Same tokens and PageHeader | Move under the new destination | Small to medium |
| RLS harness | `rls-leak-test.sql`, `test-rls.sh`, `tenant-isolation.test.ts` changed on both sides | Merge by hand, run the RLS workflow | Medium |

Overall: **medium**. No piece is large, but nav, compile and the harness need care.

## 4. Where things belong

| Surface | Today | Recommendation |
|---|---|---|
| Email campaigns | Fundraising → Comms | **Move in**, renamed "Emails" (fixes C-22) |
| Fundraising Campaigns (gift attribution, appeals) | Fundraising tab | **Stay**. Add `appeal_id` on `email_campaigns` later for attribution |
| Acknowledgments queue | Fundraising Today | **Stay** (gift-driven stewardship). Fix identity (C-2) |
| `ack_templates`, letters | Live with no seat (`v2routes.ts:106`) | **Stay** in Fundraising, in its Settings seat |
| Journeys | No seat (`v2routes.ts:108`), cron off | **Move in** as Automations once Phase 6 routes them through the queue |
| Capture (Record) | Global quick add and mobile bar | **Stay global**; add a story destination |
| `fr_email_drafts` | Table only, no code | **Leave**; retire or fold into Reed drafts |
| `bv_newsletter_subscribers` | Table only (ledger), no code | **Link** later as an audience import |
| Public unsubscribe page | `/api/unsubscribe` | **Stay public**; the suppression list shows in Comms Settings |
| Segments / saved views | Donors & Funders | **Stay** as one store; Comms links "Build an audience" there |

Both options below add one destination, remove the Fundraising Comms tab, and keep `modules.comms` on every tab.

- **Option A (story-first, recommended):** Comms = **Stories · Editions · Emails · Automations · Settings**. Stories lands first, so program staff can capture without the send permission. Settings holds Gmail, identity, leadership copy, formats and suppressions.
- **Option B (send-first):** Comms = **Overview · Stories · Emails · Settings**. Overview holds needs-a-decision, scheduled soon, ready stories and recent results. Editions and journeys become kinds of Email ("Newsletter", "Automated").

## 5. Comms vs Messages vs Inbox

Today: Inbox (notifications) and Messages (team chat, `modules.messages`) sit under the Inbox utility (`nav.ts:180-188`), and Comms under Fundraising. The risks are real. "Messages" vs "Comms", plus Capture's `message_draft` destination (`capture_tables.sql:70-71`), all say "message" for different things. Keep "Messages" for team chat only and never use it for donor email.

Replies go only to the connected Gmail inbox. BloomOS can't read them with `gmail.send` (`gmail-oauth.ts:8-10`). The one inbox reader is the legacy remi@ gmail-sync into interactions, AA only (C-12). Sends and results are not on the timeline, and Today shows nothing from Comms (C-9).

## 6. Trust

| Requirement | State | Tag |
|---|---|---|
| Suppression and DNC on campaigns | At enqueue (`segments.ts:94-96`) and again at send (`worker.ts:156-160,214-231`) | V |
| Suppression and DNC on journeys | At send (`journeys/route.ts:152-165`) | V |
| Suppression and DNC on acks and receipts | Not checked (C-23) | V |
| `unknown` never auto-retried | Reaper makes it unknown (`comms_gmail_g2.sql:67-69`); a person decides (`sends/[sendId]/route.ts`). "Send again" on a canceled campaign never runs (reopens only `sent`) | V |
| Daily cap | DB claim counts sent, sending and unknown over 24 h (`g2.sql:93-131`). Tests and copies sit outside it (C-13, C-20) | V |
| Tracking token tenant safety | Random per send; org taken from the row (`api/t/c/...:42-55`); redirect target from the stored body | V |
| Unsubscribe token tenant safety | HMAC over the constituent id; org from the constituent; `c=` checked against the org (`unsubscribe/route.ts:87-98`) | V |
| OAuth token storage | AES-256-GCM in `connections`, deny-all RLS, service path only (`gmail-connection.ts:211`) | V; key handling R |
| Gmail revoked | `invalid_grant`/401/403 marks the connection broken, rows wait, alarm once a day (`transport/gmail.ts:97-119`) | V |
| Google limit hit | Requeue and stop the org, retry every minute, no alarm (C-16) | V |
| List-Unsubscribe headers | mailto plus one-click URL and Post header (`comms-email.ts:67-77`); mailto only on tests and copies | V |
| Verification | Scopes: `gmail.send openid email` and `calendar`; legacy token needs `gmail.readonly` (C-8). Consent-screen status, test users, Testing vs In production (7-day refresh tokens), domain verification, privacy policy hosting | **R / unknown** |

## 7. Mobile

There's no quick story capture on main. What exists: Record (Capture, `ai.capture`) in `V2QuickAdd.tsx:75` and `V2MobileBar.tsx:244`, which files interactions, tasks, thoughts or message drafts only. The 15-second path would reuse the branch's `CaptureSheet` (title, body, outcome bottom sheet; `story-bank:app/admin/comms/_components/CaptureSheet.tsx:97-144`) behind a "Capture a story" chip in quick add. Voice-to-story would be a new `story` value on `capture_cards.dest` (migration). The branch sheet has no photo field, which the spec asked for (§7.2). The Comms list and results pages haven't been checked at phone width (R).

## 8. Value proposition check

What is actually built: BloomOS knows the donor and sends from the org's Gmail with honest results. It doesn't yet join that up with the gift or the outcome number. Distance to the 3H claim: about a third.

The missing links that matter most:
1. **Audience you can trust.** Giving-history rules with a live count, and saved views that mean the same in Comms as in Donors & Funders (C-1, C-5, C-6).
2. **Everything on the donor record.** Sends, opens, clicks and replies written as timeline interactions, plus email-to-gift attribution (an appeal link, or the branch's window attribution) (C-9, C-22).
3. **Stories and real numbers.** Land the story bank so metrics slots come from `metric_snapshots`, with a consent check at send (section 3).
