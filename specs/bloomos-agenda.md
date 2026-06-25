# spec: BloomOS Agenda and the Today briefing

Status: design. **Phase 0 recon gate — PASSED (2026-06-25).** Google auth reality confirmed; see §12. Phase 1 SQL drafted (`supabase/migrations/create_agenda_delegations_and_calendar_events.sql`), reviewable, not yet applied. Schema read: 2026-06-25, Supabase project `kzzdtibbwsucloaoqpqa` ("Ambition-Angels").

> **Recon corrections folded in (2026-06-25).** Three assumptions in the original design were checked against the live repo and database and changed. Inline `[Recon 2026-06-25: …]` notes flag them where they appear; §12 is the full findings record. The headline reversals: (a) the `has_permission(org_id, …)` RLS helper the policies depend on **does exist** (in the `private` schema) — the spec's RLS is buildable as written; (b) Google Calendar **read code already exists** and the token already holds the full `calendar` scope, so Phase 2 needs **no re-consent** for AA; (c) `bloomos_briefing_narrative` **exists** live.

## 1. Problem statement

BloomOS has no view of the actual calendar. The scheduling stack it does have (`meeting_types`, `bookings`, `/meet`) is an outbound Calendly-style booking page: 9 active meeting types, 3 bookings ever, 0 upcoming. It captures only meetings booked through the public page, not the real day. So a CEO opens BloomOS in the morning and cannot see what their day looks like, and the Executive Briefing can't reason about how time is being spent.

For a nonprofit CEO, the calendar is the readout of whether time matches strategy. "Fundraising is behind" lands differently when the briefing can add "and you have zero donor meetings this week." That requires the agenda and the strategic verdict to live on the same surface.

## 2. Who's affected

* Remi (CEO). Wants his day in his cockpit: agenda plus the moves due today, leading the Executive Briefing. Sees only his own calendar.
* Shannon (EA / ops lead). Runs Remi's calendar. Needs a two-lane day view: her calendar plus Remi's. Scheduling is already her domain in the ops panel.
* Every future tenant. Each nonprofit has people whose time matters and usually an ED/EA delegation. The model has to generalize, not hardcode Remi and Shannon.

## 3. Current behavior

* The live calendar is invisible inside BloomOS. The only calendar-ish table is `bookings`, which is outbound-only and effectively empty of upcoming items.
* Google Calendar writes already work: all 3 bookings have a `google_event_id`, so a booking creates a Google event.
* ~~There is no Google Calendar read anywhere.~~ **[Recon 2026-06-25: FALSE. `lib/google/calendar.ts` already has `listUpcomingEvents()` (lines 23–56) and `getFreeBusy()` (75–91); the latter feeds `lib/availability.ts` for `/meet` slot computation. The read primitive the sync job needs already exists and is proven against Remi's calendar.]**
* The Google credential is not in `connections` (only row there is `hubspot`). Gmail sync runs on `remi@ambitionangels.org`, so the Google token is an env-stored OAuth refresh token (`GOOGLE_REFRESH_TOKEN`) for that one workspace account. **[Recon 2026-06-25: confirmed. Scopes are `calendar` (full read/write — NOT readonly), `gmail.send`, `gmail.readonly`. The full `calendar` scope already permits event read.]**
* The Executive Briefing (`briefings`, `bloomos_briefing_state`, `bloomos_briefing_narrative`) produces a deterministic verdict plus a cached daily narrative. It has no agenda input. **[Recon 2026-06-25: the live Executive Briefing is "v2" — `lib/admin/briefing/{gather,engine,sources,narrate}.ts` — more built out than this paragraph implies. `bloomos_briefing_narrative` exists in the DB.]**
* A how-to guide occupies prime sidebar real estate (`NAV_SECTIONS[0].items[3]`, `/admin/howto`).

## 4. Desired behavior

* A per-user Agenda for today and this week, assembled from Google Calendar, merged with BloomOS `bookings` so a `/meet` booking shows alongside everything booked directly in Google.
* Delegation: a viewer sees their own calendar plus any calendar explicitly delegated to them. AA seeds one grant: Remi to Shannon. Remi sees only his own.
* The Executive Briefing leads with Today: date, time-ordered agenda, and the day's required moves (tasks, touches, donor moves due today). The "are we winning" verdict and the needs-attention list stay, condensed, below the agenda. A weekly variant answers "prepare for the week."
* The briefing narrative can cross-reference strategy against the calendar (for example, fundraising behind with no donor meetings booked this week).
* Shannon's ops panel shows a two-lane day view (hers plus Remi's).
* The how-to guide moves to the bottom of the left sidebar as a reference link.

## 5. Scope

In:

* Per-user Google Calendar read (delegation-aware) for today and the current week.
* A cached `calendar_events` table and a sync job that fills it.
* The delegation model (`agenda_delegations`) and per-user calendar auth (`connections.user_id`).
* Reframing the Executive Briefing to lead with the agenda plus today's moves, plus a weekly variant.
* The Today component rendered in the Command Center (CEO) and the ops panel (EA two-lane).
* Sidebar: demote the how-to guide.

Out:

* Two-way calendar editing from BloomOS (creating or moving events). Read-only this round. Booking writes already exist and stay as they are.
* Non-Google calendars (Outlook, iCloud). Provider field leaves room; not built now.
* Free/busy scheduling intelligence or auto-suggesting times. Future.
* Any change to the public `/meet` booking flow or `meeting_types` config beyond leaving it where it is.

## 6. Architecture sketch (grounded in the real schema)

Auth, per-user. `connections` today is org-level (`org_id`, `provider`, `external_id`, `access_token_enc`, `refresh_token_enc`, `expires_at`, `status`, `meta`) with no `user_id`. **[Recon 2026-06-25: confirmed live — no `user_id` column; `org_id` has a column default of AA's org uuid `17c75da8-082d-4c8f-b00b-a4100fb2eb22`.]** Add a nullable `user_id uuid references auth.users`. Org-level connections (hubspot) keep `user_id` null; calendar connections set it. Provider value `google_calendar`. This is where the env token for `remi@` should migrate to, so a second tenant's calendars don't depend on an env var.

Delegation. New table `agenda_delegations`:

* `id uuid pk`, `org_id uuid not null references orgs(id)` (set from session, no column default), `grantor_user_id uuid not null`, `grantee_user_id uuid not null`, `created_at timestamptz`.
* RLS on, `has_permission(org_id, 'ops.read')` plus a self-or-grantee predicate. Seed one row for AA: grantor Remi, grantee Shannon. Generalizes to any ED/EA. **[Recon 2026-06-25: `private.has_permission(org_id, perm)` confirmed to exist (joins `memberships → role_permissions`); `ops.read` grants to owner/admin/staff. The Phase 1 migration writes delegation writes as `org.manage` (owner/admin) — flag for Remi if EAs should self-manage grants.]**

Event cache. New table `calendar_events` (mirrors the gmail sync pattern, which is the closest existing system-path job):

* `id uuid pk`, `org_id uuid not null references orgs(id)`, `owner_user_id uuid not null` (whose calendar), `google_event_id text`, `calendar_id text`, `title text`, `description text`, `location text`, `start_time timestamptz`, `end_time timestamptz`, `all_day boolean`, `status text`, `attendees jsonb`, `is_external boolean` (any attendee outside the org domain), `source text` (`google` or `booking`), `synced_at timestamptz`.
* RLS on. Read predicate: viewer is `owner_user_id`, or a row exists in `agenda_delegations` where viewer is grantee and `owner_user_id` is grantor, all within `org_id`. Writes are service-role only (the sync job). **[Recon 2026-06-25: `ops.read` is granted to owner/admin/staff, so the permission gate ALONE would expose Remi's calendar to all staff. The per-user/delegation predicate is the real protection; the Phase 1 policy ANDs `has_permission('ops.read')` with the owner-or-grantee check. This is the single most important RLS line in the feature.]**

Sync job (system path, service-role). Reads Google Calendar for each user with an active `google_calendar` connection, upserts into `calendar_events` keyed on `(owner_user_id, google_event_id)`. Same shape as `gmail_sync_jobs`. Runs on a schedule and on-demand when the Today view loads if the cache is stale. `is_external` computed at sync time by comparing attendee domains to the org domain.

Agenda service. Given a viewer, resolves the set of `owner_user_id`s they can see (self plus grantors), reads `calendar_events` for the date range, merges any BloomOS `bookings` not already represented by a `google_event_id`, returns a normalized, timezone-aware, time-ordered agenda. One function, consumed by the briefing builder, the cockpit Today component, and the ops two-lane view.

Briefing reframe. The briefing builder gains a Today section sourced from the agenda service plus today's due work (`ops_tasks`, `fr_touches`, donor moves). Structure becomes: Today (agenda + moves) on top, verdict line and needs-attention list below, both kept. The weekly variant ranges over the current week. The deterministic verdict stays deterministic; the agenda is data, not AI. **[Recon 2026-06-25: slot the `today` block into `lib/admin/briefing/gather.ts` output and render after `<PulseStrip>` / before the decision feed in `app/admin/briefing/page.tsx`. Today's due-work queries already exist: `ops_tasks` (due_date), `opportunities.next_step_due` (in the daily-reminders cron), follow-up-labelled `ops_tasks`.]**

Placement. The Today surface lives in the Command Center (the briefing is already the front door per `strategy-command-center.md`). The ops panel renders the same agenda component in two-lane mode for Shannon. No new top-level nav item. The how-to guide moves to a sidebar footer link. **[Recon 2026-06-25: CEO mount = `app/admin/_components/overview/CeoCockpit.tsx` (widget stack, near `ScheduleWidget`); ops mount = `app/admin/_components/overview/OpsPanel.tsx` `widgets[]` array handed to `OpsBoard`. A `ScheduleWidget` already exists in both — reconcile overlap before adding.]**

Staleness, per the design system. Every agenda shows "calendar synced Xm ago," ochre past a threshold. A schedule you can't date is one you can't trust.

## 7. Staged build order (named commits, each phase useful alone)

Phase 0. Recon gate. Repo read, no code. Confirm Google auth reality, scopes, the briefing builder, the Command Center mount points, and the sidebar nav. **DONE 2026-06-25 — see §12.**

Phase 1. Data and delegation foundation. Add `connections.user_id` (nullable). Create `agenda_delegations` and `calendar_events` with RLS and `has_permission` policies in the same migration. Seed the Remi to Shannon grant. Reviewable SQL handed to Remi, applied by Remi through the dashboard. No app behavior change yet. Commit: `feat(agenda): delegation and calendar_events tables with RLS`. **[Recon 2026-06-25: SQL drafted at `supabase/migrations/create_agenda_delegations_and_calendar_events.sql`. Seed UUIDs verified: Remi (owner) `aa39cd02-b813-4e75-aa36-52adadf5d2fe`, Shannon (admin) `7312ba86-5203-4cf6-81d8-d8fbd3e2ec89`. Not yet applied.]**

Phase 2. Google Calendar read and sync. Migrate the `remi@` Google credential into `connections` as a `google_calendar` row with `user_id` set, ~~add `calendar.readonly` scope (re-consent)~~ **[Recon 2026-06-25: NO re-consent needed for AA — the existing token already holds the full `calendar` scope, which includes read. Re-consent only matters if you choose to downgrade to least-privilege `calendar.readonly` on principle, or for a second tenant's fresh grant.]**, write the service-role sync job filling `calendar_events`. Prove it on Remi's calendar first. Commit: `feat(agenda): google calendar read sync job`. **[2026-06-25: CODE SHIPPED. Decision: "migrate credential first." Built — `lib/crypto/secret-box.ts` (AES-256-GCM; first implementation of the documented `connections.*_enc` scheme — there was none), `lib/google/connection.ts` (encrypted per-user credential store + client), `lib/agenda/calendar-sync.ts` (window sync, upsert + stale-delete), cron `/api/cron/calendar-sync` (*/15), on-demand `/api/admin/agenda/sync`, and `/api/admin/agenda/connect-google` (one-time credential migration). DB: `calendar_sync_jobs` (service-path only); the Phase 1 partial unique index was swapped for a non-partial one so PostgREST upsert can target it. PENDING OPS (deploy env, not runnable here — sandbox has no secrets): (1) set `BLOOMOS_TOKEN_ENC_KEY` (= `openssl rand -base64 32`) in Vercel + local; (2) ensure `GOOGLE_REFRESH_TOKEN`/`CRON_SECRET` set; (3) POST `/api/admin/agenda/connect-google` once as Remi to store the encrypted credential; (4) hit `/api/admin/agenda/sync` (or wait for cron) and confirm `calendar_events` fills.]**

Phase 3. Agenda service and Today component. Build the delegation-aware agenda assembler and one shared Today/agenda UI component (day and week). Read through the session client so RLS applies. Commit: `feat(agenda): agenda service and today component`

Phase 4. Briefing leads with Today. Restructure the Executive Briefing to lead with the agenda plus today's moves, keep the verdict and exception list below, add the weekly variant. Wire the strategy-vs-calendar cross-reference into the narrative. Commit: `feat(briefing): lead with today agenda and moves`

Phase 5. Ops two-lane and sidebar. Render the agenda in two-lane mode (Shannon: hers plus Remi's) in the ops panel. Move the how-to guide to the sidebar footer. Commit: `feat(ops): EA two-lane agenda` and `chore(nav): demote how-to guide to footer`

## 8. Definition of done (observable)

* Remi opens the Command Center and sees today's time-ordered agenda at the top of the briefing, with the verdict below it, and a working week view.
* Shannon sees a two-lane day view (hers plus Remi's). No other user can see Remi's calendar.
* An RLS test confirms a member with no grant cannot read another user's `calendar_events` rows.
* The agenda shows a sync timestamp and goes stale-styled past the threshold.
* A `/meet` booking and a directly-booked Google event both appear, once each, no duplicates.
* The how-to guide is a footer reference link, not prime nav.
* Manual smoke on a preview deploy as the real authenticated Remi and as Shannon, per working agreements.

## 9. Failure modes to watch for

* Delegation leak. The whole feature is one RLS predicate away from exposing a CEO's calendar org-wide. **`ops.read` covers owner/admin/staff (verified) — so the predicate MUST AND in the owner-or-grantee check.** Test grantee, non-grantee, and second-org cases explicitly.
* The org_id default trap. New tables set `org_id` from session, never a column default. **[Recon 2026-06-25: note the tension — every existing tenant table (incl. `connections`) DOES set an AA-uuid column default (`add_org_id_to_tenant_tables.sql`). The Phase 1 migration deliberately omits the default on the new tables, per this rule. Service/app inserts must pass `org_id` explicitly.]** Verify on `agenda_delegations` and `calendar_events`.
* Token lapse. Google refresh failures should degrade to stale cache with a visible "last synced" age, not a blank or a crash.
* Timezone drift. Store tz-aware, render in the viewer's timezone. Booking `attendee_timezone` already exists; don't double-convert.
* Duplicate events. A booking that created a Google event must not show twice. Dedupe on `google_event_id` when merging `bookings`.
* Entity bleed. Calendar reads are AA-scoped. Never pull a personal or SOBO calendar into the AA org agenda.
* Service-role discipline. Only the sync job uses service-role. The Today view and briefing read through the session client.
* Second-tenant survival. Calendar connections are keyed by `(org_id, user_id)`. The env-token shortcut for `remi@` is AA-only and must not persist past Phase 2.
* Identity resolution gap. **[Recon 2026-06-25: there is NO `profiles` table / `users` view / `auth.users` metadata read. Display names come from a hardcoded `PEOPLE` dict (`lib/admin/plan/owners.ts`) + email local-part (`lib/admin/auth.ts:57–62`). The two-lane owner chips need a uuid → name/initials map that does not exist today. Either Phase 1/3 adds a minimal display-name source, or the chips inherit the hardcoded remi/shannon limitation — which fails the "generalize, don't hardcode" requirement.]**

## 10. Open decisions (with a recommendation each)

1. Scope: `calendar.readonly` vs `calendar.events.readonly`. Recommend `calendar.readonly`. Simpler, and the weekly view benefits from full visibility. Revisit if consent friction matters. **[Recon 2026-06-25: moot for AA's existing token, which already holds full `calendar`. This is a green-field choice for a least-privilege downgrade or for second-tenant grants, not a re-consent blocker.]**
2. Cached table vs live API reads. Recommend the cached `calendar_events` table. "Prepare the week" wants durable data, and the briefing builder shouldn't make seven live round-trips. Live reads are more fragile on a slow Google or a lapsed token.
3. Does the verdict stay in the daily briefing, or move out so the briefing is "just" the agenda? Recommend it stays, condensed. The agenda is most valuable as evidence for the strategic read; splitting them loses the cross-reference. The deeper strategy surface remains the Command Center proper.
4. Detail level on a delegated calendar. Does Shannon see Remi's event titles and attendees, or busy/free only? Recommend full detail. An EA managing a calendar needs it, and the grant is explicit and per-person. Flag for Remi's sign-off since it's a privacy call. **[Recon 2026-06-25: Phase 1 tables store full detail; the busy/free-only option would be a render-time redaction in the agenda service (Phase 3), not a schema change. Still needs Remi's sign-off.]**
5. Weekly briefing trigger. On-demand when Remi opens the week view, or a Monday-morning generated cache like the daily narrative? Recommend on-demand for v1, add a cached weekly later if it earns it.
6. **[New, Recon 2026-06-25] Who may grant/revoke a delegation?** Phase 1 gates `agenda_delegations` writes on `org.manage` (owner/admin only). Alternative: let a grantor self-manage grants of their own calendar (`grantor_user_id = auth.uid()`). Recommend `org.manage` for v1 (simplest, AA's grant is seeded anyway); revisit if EAs need to self-serve.

## 11. Phase 0 kickoff prompt (paste-ready, recon-first, no code)

```
Read and report only. No code, no migration. Recon gate for the BloomOS Agenda
and Today-briefing spec (specs/bloomos-agenda.md).

Report back, with file paths and a short plain-language summary per item:

1. GOOGLE AUTH. Where do Google OAuth tokens live today? ...
2. CALENDAR WRITE PATH. Find the code that sets bookings.google_event_id. ...
3. GMAIL SYNC. How does the gmail sync authenticate and where does it store state ...
4. BRIEFING BUILDER. Find the code that writes the briefings table ...
5. COMMAND CENTER + OPS. Find the Command Center route(s) ...
6. SIDEBAR NAV. Find the left sidebar nav definition and the how-to guide link. ...
7. USER IDENTITY. How are users resolved to names/initials ...
8. Confirm there is NO existing calendar-read or calendar_events cache table.

Flag anything hardcoded to AA's org_id or to remi@ ...
```

## 12. Phase 0 recon findings (read 2026-06-25, project `kzzdtibbwsucloaoqpqa`)

**Gate verdict: PASSED.** Google auth reality confirmed; the one design dependency that looked missing (`has_permission`) actually exists. Proceed to Phase 1.

### Verified facts

| # | Item | Finding | Source |
|---|------|---------|--------|
| 1 | Google auth | Env-var refresh token (`GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`) for `remi@ambitionangels.org`. Not in `connections`. | `lib/google/auth.ts:12–21`; `.env.example:60–76` |
| 1 | Scopes | `calendar` (full read+write), `gmail.send`, `gmail.readonly`. **Full `calendar` already permits event read.** | `.env.example:62–69` |
| 2 | Calendar write | `app/api/meet/book/route.ts:176` sets `google_event_id`; `getCalendarClient()` in `lib/google/calendar.ts`, calendar `GOOGLE_CALENDAR_ID` else `"primary"`. Full CRUD present. | `lib/google/calendar.ts:3,103–169` |
| 2 | Calendar **read** | **Already exists**: `listUpcomingEvents()`, `getFreeBusy()`. | `lib/google/calendar.ts:23–91` |
| 3 | Gmail sync | Same env token; state in `gmail_sync_jobs`; Vercel cron `45 * * * *` + on-demand; service-role Supabase. The pattern the calendar sync should mirror. | `lib/fundraising/gmail-sync.ts`; `app/api/cron/gmail-sync/route.ts`; migration `add_email_logging_to_interactions.sql:26–40` |
| 4 | Briefing builder | v2: `gather.ts` (I/O) → `engine.ts` (deterministic verdict, rank/cap-5/hide) → `sources/index.ts` (8 signal sources) → `narrate.ts` (Claude `claude-sonnet-4-6`, cached per-day, fallback). Numbers never go through the model. | `lib/admin/briefing/*`; `lib/admin/thresholds.ts` |
| 4 | Narrative cache | `bloomos_briefing_narrative` **exists** in DB (keyed by `brief_date`). Migration file not in repo (applied out-of-band). | live DB; `lib/admin/briefing/narrate.ts:258–274` |
| 5 | Command Center | Entry `app/admin/page.tsx` → `CommandCenter.tsx` (shared `<BriefingStrip/>` + `RoleViewShell` localStorage toggle). CEO = `CeoCockpit.tsx`, ops = `OpsPanel.tsx` (`widgets[]` → `OpsBoard`). No permission gate on the toggle. | `app/admin/_components/overview/*` |
| 6 | Sidebar | How-To Guide = `NAV_SECTIONS[0].items[3]` → `/admin/howto`. Footer regions exist (sync, settings/logout) but no footer *nav-link* slot — moving it = remove array entry + add link markup ~lines 593–624. | `app/admin/_components/Sidebar.tsx` |
| 7 | Identity | No `profiles`/`users`/`auth.users` metadata. Names from hardcoded `PEOPLE` dict + email local-part. `memberships` = `(user_id, org_id, role)` only. | `lib/admin/plan/owners.ts:15–30`; `lib/admin/auth.ts:57–62` |
| 8 | No cache table | `calendar_events` and `agenda_delegations` **absent** (verified live). `connections` exists, **no `user_id`**. | live `information_schema` |

### Permission model (the thing that looked missing)

- `private.has_permission(p_org uuid, p_perm text)` exists — `SECURITY DEFINER`, joins `public.memberships → public.role_permissions where m.user_id = auth.uid() and m.org_id = p_org and rp.permission = p_perm`. Also `private.is_org_member(p_org)`.
- Existing policy idiom (from `create_briefings.sql`): `using ( (select private.has_permission(org_id, 'reports.read')) )`.
- `role_permissions` for the strings this feature uses: `ops.read` → **owner, admin, staff**; `ops.write` → owner, admin, staff; `org.manage` → owner, admin.
- **Consequence:** `ops.read` is broad. A `calendar_events` read policy gated only on `ops.read` would leak Remi's calendar to all staff. The per-user owner-or-grantee predicate is the actual protection and must be AND-ed in. (The earlier recon claim "no `has_permission` helper exists" was wrong — it searched only app code and the `public`/`auth` SQL schemas; the function lives in `private`.)

### Seed identities (AA)

- Org `ambition-angels` = `17c75da8-082d-4c8f-b00b-a4100fb2eb22` (also the `connections.org_id` column default).
- Remi `aa39cd02-b813-4e75-aa36-52adadf5d2fe` (role `owner`).
- Shannon `7312ba86-5203-4cf6-81d8-d8fbd3e2ec89` (role `admin`).

### Open items for Remi before/at Phase 1 apply

1. **org_id default**: follow this spec (no column default on the new tables) vs. match house style (AA-uuid default everywhere else). Phase 1 SQL follows the spec — confirm.
2. **Delegation write permission** (new open decision #6): `org.manage` vs grantor-self-manage. Phase 1 uses `org.manage`.
3. **Delegated-calendar detail** (open decision #4): full detail vs busy/free — privacy call, Phase 3 render concern, no schema impact.
4. **Identity source**: the two-lane owner chips need a uuid → display-name map that does not exist; decide whether to add a minimal one in Phase 1/3 or accept the hardcoded remi/shannon limitation for v1.
