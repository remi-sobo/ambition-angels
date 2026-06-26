# Recon: Meetings module + Google Calendar two-way sync

**Mode:** read-and-report only. No code, migrations, or mutations were made.
**Date:** 2026-06-25 · **Repo:** `remi-sobo/ambition-angels` · **Supabase project:** `kzzdtibbwsucloaoqpqa` (Ambition-Angels)
**Branch:** `claude/meetings-calendar-sync-recon-xzp7pj`

> **⚠️ Loud surprise up front.** A substantial slice of this feature already exists and is in production, and an existing design doc — `specs/bloomos-agenda.md` — already ran a "Phase 0 recon gate (PASSED 2026-06-25)" covering the same Google-auth questions. Concretely: **Google Calendar READ already exists** (direct reads + a cached cron sync every 15 min into a `calendar_events` table), the env Google token **already holds the full `calendar` scope** (read+write), an **Agenda layer** (`lib/agenda/*`, `calendar_events`, `agenda_delegations`, per-user `connections`) is built through "Phase 3", and **Monday Plan / Friday Review pages, a Meetings nav item, and a calendar-aware Executive Briefing already ship.** The brief's expectation that calendar read is "NOT FOUND" is **false**. Read §C and the spec before designing anything new — much of layer (3) is partially built, not greenfield.

---

## A. Google OAuth scopes and token storage

### Two distinct Google auth models coexist

**Model 1 — single env-stored refresh token (the live production path):**
`lib/google/auth.ts:12-21` constructs an OAuth2 client from `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and a single env `GOOGLE_REFRESH_TOKEN`, authenticated as `remi@ambitionangels.org`. Both Calendar and Gmail use the *same* token:
```ts
// lib/google/auth.ts:12-21
const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
// getCalendarClient() :28  and  getGmailClient() :38  both wrap this
```
Access-token refresh is handled **automatically by the `googleapis` library** on each call — there is no manual refresh logic and `expires_at` is **never read** on this path (`auth.ts:3-7` comment states this explicitly).

**Model 2 — per-user encrypted token in `connections` (the Agenda path):**
`lib/google/connection.ts` stores a per-user refresh token under provider **`google_calendar`** (`connection.ts:15`), encrypted into `refresh_token_enc`:
```ts
// lib/google/connection.ts:33-48  (upsertGoogleCalendarConnection)
const enc = toByteaHex(encryptSecret(args.refreshToken));
sb.from("connections").upsert({ org_id, user_id, provider: PROVIDER, external_id: calendarId,
  refresh_token_enc: enc, status: "active", meta: { calendar_id } }, { onConflict: "org_id,provider,external_id" });
```
A client is built per token via `calendarClientFromRefreshToken()` (`connection.ts:117-124`).

### Exact scopes requested

**NOT FOUND in code.** There is **no consent-URL construction, no `generateAuthUrl`, no `getToken`, and no scope array anywhere** in `lib/`, `app/`, or `scripts/` (grep for `generateAuthUrl|getToken|access_type|SCOPES|scopes:` → NONE). The refresh token is minted **out of band** (e.g., OAuth playground / a script that isn't in the repo) and pasted in. Scopes are therefore whatever was granted at that external consent.

Ground truth on the actual scopes the live token holds comes from two places:
- Code *uses* `calendar.events.insert/list/patch/delete` and `freebusy.query` (write+read) **and** Gmail send + `gmail.readonly`, all on the one env token — so the token must hold all of these.
- `specs/bloomos-agenda.md` §3 / inline recon note records the verified scope set: **`calendar` (full read/write — NOT readonly), `gmail.send`, `gmail.readonly`.**
- Caveat already flagged in code: `lib/google/gmail-read.ts:5-6` warns that `gmail.readonly` returns 403 "until that scope is granted" — i.e., the readonly scope was historically the fragile one, not calendar.

### Persistence in `connections`

`supabase/migrations/create_connections_and_webhook_events.sql:13-26`:
```sql
create table connections (
  org_id uuid not null references orgs(id),
  provider text not null,        -- 'quickbooks'|'givebutter'|'google'|'gusto'|'hubspot'
  external_id text,
  access_token_enc bytea,        -- AES-256-GCM, app-layer; key lives in env/KMS
  refresh_token_enc bytea,
  expires_at timestamptz,
  status text default 'active',  -- active|expired|revoked|error
  meta jsonb,
  unique (org_id, provider, external_id) );
-- RLS enabled, NO policies → deny-all for authenticated/anon (service-path only)  :42-43
```
- **Provider value for calendar:** `google_calendar` (`connection.ts:15`). Note the migration's comment lists `google` (singular) for the *original* Gmail-era plan; the Agenda code uses `google_calendar`. The env Gmail path does **not** use a `connections` row at all (it reads env directly).
- **Encryption:** AES-256-GCM, app-layer, in `lib/crypto/secret-box.ts`. Layout `iv(12)||authTag(16)||ciphertext` (`secret-box.ts:9-11,37-53`). **Key lives in env var `BLOOMOS_TOKEN_ENC_KEY`** (base64 of 32 random bytes, `secret-box.ts:17-25`). pgsodium/TCE explicitly deprecated (`secret-box.ts:6-8`).
- **Token refresh:** delegated to `googleapis` (auto). `expires_at` column exists but **no code reads or checks it** on the calendar path. On failure the sync degrades to a stale cache (`calendar-sync.ts:188-191`), it does not refresh-and-retry.

### One-per-org or one-per-user?

**One-per-user** for calendar. `connections.user_id` was added by `create_agenda_delegations_and_calendar_events.sql:26-30` (nullable; org-level rows like `hubspot` stay null, `google_calendar` rows set it). `listActiveCalendarConnections()` returns "one per connected user" and filters `r.user_id && r.refresh_token_enc` (`connection.ts:52-72`). Uniqueness is `(org_id, provider, external_id)` where `external_id` = calendarId — so technically one row per (user's) calendar.

### ⚠️ Gap / risk

1. **No in-app consent flow exists.** `app/api/admin/agenda/connect-google/route.ts:38` does *not* run OAuth — it adopts the env `GOOGLE_REFRESH_TOKEN` (or a token pasted into the request body) and stores it per-user. Onboarding a *second* real user's calendar today requires manually provisioning a refresh token elsewhere. A genuine "Connect Google Calendar" button for new tenants/users is **not built**.
2. Scopes are invisible in the codebase — they live only in the externally-minted token. Any future scope change (e.g., adding `calendar.events` granularity, or restoring `gmail.readonly`) is a manual re-mint, not a code change.

### ✅ VERDICT A

**No re-consent needed for AA.** The env token already holds the full **`calendar`** scope (read **and** write), proven by live event create/list/patch/delete + freebusy usage. A re-consent flow is only needed (a) to onboard additional users/tenants properly, since no consent UI exists, or (b) if `gmail.readonly` ever needs re-granting.

---

## B. Existing booking → Google Calendar WRITE path

### Where `bookings.google_event_id` is set

`app/api/meet/book/route.ts:140-176` — create the event, then store its id on the booking:
```ts
// :140  create on Google
const created = await createEvent({ summary, description, start, end,
  timeZone: HOST_TIMEZONE, attendees: [...host, ...attendee], location: eventLocation });
eventId = created.eventId;
// :164-176  persist
supabase.from("bookings").insert({ ..., google_event_id: eventId, ... })
```
- **Update (reschedule):** `app/api/meet/booking/[token]/reschedule/route.ts:76` → `updateEvent(booking.google_event_id, newStart, newEnd, HOST_TIMEZONE)`.
- **Cancel/delete:** `app/api/meet/booking/[token]/cancel/route.ts:50` and `app/api/admin/meet/bookings/[id]/cancel/route.ts:61` → `cancelEvent(booking.google_event_id)`.

### Library / API / auth

`googleapis` Node client throughout (not raw REST). All three primitives live in `lib/google/calendar.ts` and use the **env single-account** auth (`getCalendarClient()` → Model 1):
- `createEvent` `:103-124` → `calendar.events.insert`, `sendUpdates: "all"`.
- `updateEvent` `:153-169` → `calendar.events.patch`, `sendUpdates: "all"`.
- `cancelEvent` `:131-145` → `calendar.events.delete`; treats 404/410 as success (idempotent).
Target calendar is `process.env.GOOGLE_CALENDAR_ID || "primary"` (`calendar.ts:3`).

### extendedProperties / private metadata on created events?

**NOT FOUND.** Grep for `extendedProperties|privateExtendedProperty|sharedExtendedProperty|iCalUID` across `lib/`, `app/`, `scripts/` → NONE. Events created by the booking flow carry **no BloomOS-private metadata** (`calendar.ts:107-118` sets only summary/description/location/start/end/attendees). **This is a direct echo-prevention gap for two-way sync** — there's no marker on a BloomOS-originated event to recognize it when it later comes back through a calendar read.

### Failures / retries / inline vs job

**Inline, in the request, no retries, no job.** `book/route.ts:153-159` catches a `createEvent` failure and returns 502. The DB insert is *compensated*: if the `bookings` insert fails after the event was created, it calls `cancelEvent(eventId)` to avoid an orphan (`book/route.ts:184-190`). There is no queue, no retry/backoff, no idempotency key on the write.

### ⚠️ Gap / risk

- The write path is **hard-wired to the env single account** (`getCalendarClient()`), not the per-user `connections` token. A multi-user/multi-tenant write engine cannot reuse `getCalendarClient()` as-is — it would need a `*FromRefreshToken` variant mirroring `connection.ts:117-124`.
- No `extendedProperties` → no echo suppression, no clean way to reconcile a written event against the read cache except by `google_event_id` (which the booking already stores, and which `getAgenda` already dedupes on — see §C).

### ✅ VERDICT B

**Partially reusable.** The low-level functions in `lib/google/calendar.ts` (`createEvent/updateEvent/cancelEvent`) are clean and generic *in shape* and a calendar-write engine should reuse them — but they are coupled to (1) the **env single-account auth** and (2) implicit single-calendar/`primary` targeting. To serve a multi-user write engine you must parametrize the auth (accept a calendar client / refresh token) and add `extendedProperties` for echo control. The *bookings-specific* glue (compensating cancel, `uniq_bookings_confirmed_start`) stays in the booking route, not the engine.

---

## C. Existing Google Calendar READ path

**FOUND — the brief's "expected NOT FOUND" is incorrect.** Two layers of read exist.

### Layer 1 — direct reads (env account), feeding /meet + cockpit

`lib/google/calendar.ts`:
- `listUpcomingEvents()` `:23-56` → `calendar.events.list({ singleEvents, orderBy: "startTime" })`. Drops cancelled. Powers the cockpit Schedule widget.
- `getFreeBusy()` `:75-91` → `calendar.freebusy.query(...)`. Feeds `lib/availability.ts` for `/meet` slot computation.

### Layer 2 — cached per-user sync into `calendar_events` (BloomOS Agenda Phase 2)

`lib/agenda/calendar-sync.ts`:
- Pages real events with `events.list` (PAGE_SIZE 250, follows `nextPageToken`) over a window `[-1 day, +21 days]` (`calendar-sync.ts:18-29, 92-105`).
- Upserts into `calendar_events` keyed `onConflict: "owner_user_id,google_event_id"` (`:117`); then **stale-deletes** in-window google rows it didn't touch this run so cancellations fall out (`:124-131`).
- Runs per active `google_calendar` connection, logging a row per user into `calendar_sync_jobs` (`:142-195`).
- **Triggers:** cron `app/api/cron/calendar-sync/route.ts` (Bearer `CRON_SECRET`), scheduled **every 15 min** in `vercel.json` (`*/15 * * * *`); plus on-demand `app/api/admin/agenda/sync/route.ts` (any authed member, refreshes cache only).
- Read/assembly: `lib/agenda/service.ts` `getAgenda()` `:58-123` reads `calendar_events` through the **session** client (RLS does delegation), **merges `/meet` bookings** not already represented by a synced google event (dedupe on `google_event_id`, `:101-103`). Backing schema + RLS in `create_agenda_delegations_and_calendar_events.sql` (`calendar_events` `:70-95`, read policy = `ops.read` AND (own row OR delegation) `:106-119`).

### Push channel / watch / sync token?

**NOT FOUND.** Grep for `watch|nextSyncToken|syncToken|channels.watch` → no calendar usage (only unrelated severity="watch" strings). The sync is a **full-window poll** (lookback 1d / lookahead 21d), **not** an incremental `syncToken` sync and **not** a `events.watch` push subscription. Every 15-min run re-lists the whole window.

### ⚠️ Gap / risk

- Polling-only: no realtime push, and the 21-day horizon means anything further out isn't cached. Re-listing the full window every 15 min is wasteful vs. `syncToken`, and there's no incremental cursor stored (unlike Gmail's `last_internal_date`).
- `calendar_events.source` is constrained to `'google'|'booking'` but the sync only ever writes `'google'`; the `'booking'` rows are *merged at read time* in `getAgenda`, not persisted. A two-way engine that wants bookings as first-class rows would change this.

### ✅ VERDICT C

**Yes — calendar read exists today, in two forms** (direct env reads + a cached 15-min cron sync into `calendar_events` with delegation-aware RLS). What does **not** exist: any push/`watch` channel or `syncToken` incremental sync.

---

## D. Gmail sync — the ingestion + matching template

Core files: `lib/fundraising/gmail-sync.ts` (orchestration), `lib/google/gmail-read.ts` (fetch/parse), route `app/api/admin/fundraising/gmail-sync/route.ts`, cron `app/api/cron/gmail-sync/route.ts` (`45 * * * *`). Job table created in `add_email_logging_to_interactions.sql:26-40`.

- **Paging:** `gmail-read.ts:69-86` `users.messages.list` with `pageToken`; one page (PAGE=40) per `advanceGmailJob` call, `page_token` persisted on `gmail_sync_jobs`. Incremental mode queries `after:${last_internal_date/1000}` (`gmail-sync.ts:103-106`); backfill mode has no query.
- **Participant extraction:** `gmail-read.ts:43-60` `parseAddresses()` pulls bare addresses from From/To/Cc; `counterpartyEmails()` filters out staff.
- **Constituent match:** `gmail-sync.ts:143-148` — `.overlaps("emails", parties)` against the `constituents.emails` array (GIN-indexed), scoped to `org_id` when present.
- **interactions write:** `gmail-sync.ts:164-179` sets `org_id, constituent_id, kind:"email", direction, subject, thread_id, body_preview, occurred_at, matched_email, logged_by:"gmail", external_source:"gmail", external_id:<gmail msg id>, is_private:false, shannon_present`.
- **Idempotency:** unique index `interactions (external_source, external_id, constituent_id)` (`fix_interactions_external_idx_full_unique.sql:18-20`) + `.upsert(rows, { onConflict: "external_source,external_id,constituent_id", ignoreDuplicates: true })` (`gmail-sync.ts:181-183`). DB-enforced, safe on re-run.
- **is_private / shannon_present:** `is_private` is **hardcoded `false`** (`gmail-sync.ts:177`). `shannon_present` = true iff `shannon@ambitionangels.org` appears in From/To/Cc, computed by `shannonPresent()` → `isShannonAddress()` (`gmail-read.ts:31-41`), set at `gmail-sync.ts:178`.
- **Client:** service-role `getSupabaseAdmin()` (`route.ts:14,31`; def `lib/supabase/admin.ts:10-23`).

### ⚠️ Gap / risk

- Matching is **email-array exact-overlap only** — no name/fuzzy/domain matching. A meeting attendee not already in `constituents.emails` won't match.
- `is_private` is never actually derived (always false); `shannon_present` is **hardcoded to one person** (Shannon), not generalized. Meeting ingestion that needs privacy/attendee semantics has no existing classifier to reuse.
- No `partners`/`partner_contacts` matching path here — Gmail matcher only hits `constituents`. Meeting ingestion that should match partners would be net-new.

### ✅ VERDICT D

**Yes, reusable as a template.** The shape — paged fetch → participant extraction → array-overlap match → idempotent upsert into `interactions` keyed on `(external_source, external_id, constituent_id)` via service role — transfers directly to transcript/meeting ingestion. **What's missing for meetings:** a new `external_source` (e.g. `'meeting'`/`'transcript'`), partner-contact matching (not just constituents), real `is_private` derivation, and generalized attendee flags instead of the hardcoded `shannon_present`.

---

## E. ops_tasks — creation, linking, today/this-week primitives

- **Creation:** `app/api/admin/ops/tasks/route.ts:38-122` (POST) and `lib/admin/ops/ingest.ts:35-93` (`ingestTask`, used by MCP + ingest route). **Required fields: `title`, `category` (validated `isTaskCategory`), `created_by`** (inferred from auth). Schema `create_ops_projects_and_tasks.sql`.
- **Polymorphic link:** `linked_entity_type ∈ {'partner','constituent'}` (CHECK in `link_ops_tasks_to_entities.sql:8-15`), `linked_entity_id uuid`, `linked_label text` (denormalized display name). Both concrete types appear in practice: `partner` (e.g. `app/admin/partners/page.tsx:32`, `TaskRow.tsx:188-196`) and `constituent` (e.g. `app/admin/fundraising/donors/page.tsx:278`, `meet/NewConnectionForm.tsx:155` which creates a constituent-linked task on booking).
- **pinned_for_today / pinned_for_this_week:** plain `boolean not null default false` (`create_ops_projects_and_tasks.sql:95-96`). Written: POST/PATCH (`tasks/route.ts:97-98`, `tasks/[id]/route.ts:166-167`), TaskRow toggles (`TaskRow.tsx:231-244`), ingest defaults `pinned_for_today:true` (`ingest.ts:74`). Read/filtered: ops landing (`app/admin/ops/page.tsx:49-59`), Monday/Friday pages, and GET filters (`tasks/route.ts:168-173`).
- **Planning views already exist:** `TodayView` + `ThisWeekView` on `/admin/ops`, plus dedicated **`app/admin/ops/monday/page.tsx`** (Monday Plan) and **`app/admin/ops/friday/page.tsx`** (Friday Review). Status lifecycle: `todo|in_progress|done|blocked` (`_types/ops.ts:39`); completion = `status:"done"` + `completed_at` timestamp set on transition (`tasks/[id]/route.ts:136-140`); separate `archived_at` two-step archive.

### Week-awareness & rollover (the seed question)

- **Pins are relative booleans with NO date/week anchor.** Columns are `boolean`; "today"/"this week" are interpreted at **read time** (filter/group), never stored against a date. A pin set last week stays set until manually toggled.
- **Rollover/reset/carryover: NOT FOUND.** No cron, nightly sweep, or reset job touches `pinned_for_*`. The only "carry forward" is **manual**, surfaced by the Monday Plan page, which deliberately *queries last week's still-pinned, not-done tasks* as a "From last week" section (`monday/page.tsx:79-88`) with manual "Carry over / mark done / drop" buttons — proof that pins persist across the Monday boundary with no automatic reset. Friday's "Push to next week" is likewise a manual button.

### ⚠️ Gap / risk

A drag-tasks-into-calendar-blocks UX (layer 2 of the brief) has **no scheduling primitive** today: tasks have `due_date` (a date) but **no time-of-day, no start/end, no calendar-block link**. Dragging a task into a time block would require a new column/table (e.g. `scheduled_start/scheduled_end` or a join to `calendar_events`). None exists.

### ✅ VERDICT E

Tasks, linking, and Today/This-Week + Monday/Friday surfaces are built. **Pins are anchorless booleans; no rollover exists** — that's the clean seed for a Monday/Friday rhythm. But there is **no task↔time-block scheduling field**, which the drag-into-calendar layer will have to add.

---

## F. Meetings/scheduling UI and admin nav

- **Sidebar:** `app/admin/_components/Sidebar.tsx:25-99` defines `NAV_SECTIONS`. The **Operations** section already contains, in order: `Tasks` → **`Monday Plan`** (`/admin/ops/monday`) → **`Friday Review`** (`/admin/ops/friday`) → `Projects` → **`Meetings`** (`/admin/meet`, `:41`) → `Team` (soon) → `Documents` (soon). Command Center section: Overview, Strategy, Executive Briefing.
- **Existing scheduling UI:** `/admin/meet` is built (`app/admin/meet/page.tsx` + `MeetAdmin.tsx`, tabs: Connections, Bookings, Types, Blackouts) — it manages *outbound bookings*, not a personal calendar grid. Public scheduler at `app/meet/*` (landing, `[slug]` flow, `booked/[token]`). There is **no page literally named "Meetings"/"Schedule"** beyond the `/admin/meet` booking admin.
- **Agenda/today widgets:** `app/admin/_components/overview/TodayAgenda.tsx` (reads `getAgenda()`), `AgendaList.tsx`, `SchedulingLaneWidget.tsx`, `MyQueueWidget.tsx`.
- **Command Center "Mine" lens:** **NOT built in the cockpit.** `CommandCenter.tsx` only toggles CEO (Remi) vs Ops (Shannon) role views. A `Mine` lens (`LensKey = "org"|"area"|"mine"`) exists **only** in the Strategic Plan module (`app/admin/strategic-plan/_components/StrategyControls.tsx:13-21`). So: **specced/proven pattern, but not wired into Command Center.**
- **Drag-into-calendar grid:** **NOT FOUND.** No `@dnd-kit`, `react-big-calendar`, `FullCalendar`, or week/time-grid component anywhere. The only drag-and-drop is a **native HTML5 task status board** (`app/admin/ops/_components/TaskBoardView.tsx`) — columns, not a time grid.

### ⚠️ Gap / risk

The "Meetings" nav entry currently points at the **outbound booking admin** (`/admin/meet`), not the meeting-record + follow-up + calendar-grid product the brief describes. Reusing the label means either repurposing `/admin/meet` or adding a sibling route. The calendar-grid drag UX is entirely net-new.

### ✅ VERDICT F

Nav has a slot (Meetings, Monday Plan, Friday Review all present); agenda widgets exist; the "Mine" lens exists as a portable pattern but **is not in Command Center**; and there is **no drag-and-drop calendar/time-grid** to build on.

---

## G. Executive Briefing assembly

- **Assembler:** `lib/admin/briefing/gather.ts` `gatherBriefingView(now)` `:179-190` → `gatherInputs()` (parallel data spine) → deterministic `buildBriefing()` (`engine.ts:104`, ranks by severity/weight/due, caps to 5) → `buildPulse()` → `getFundraisingPriorities()`. Page entry `app/admin/briefing/page.tsx:18-20`; manual regen `app/api/admin/briefing/narrative/route.ts`.
- **Inputs:** finance snapshot, `ops_tasks` (open + follow-up labelled), `compliance_items`, `opportunities`, `gifts`, `cohort_sessions`/`attendance`, `plan_*` (strategy), `fr_nba_suggestions` — gathered in `gather.ts:29-100`. **Calendar IS already read:** `lib/admin/briefing/narrate.ts:39-59` `agendaSummary()` reads `calendar_events` (next 7 days) and passes today/7-day/external counts to the model. `ops_tasks` read at `gather.ts:57-62` and `:93-99`.
- **Deterministic vs LLM:** ranking/sources/pulse/summary are pure deterministic (`engine.ts`, `sources/*`, `pulse.ts`, `summary.ts`). Narration is Claude `claude-sonnet-4-6` (`narrate.ts:61`), fed only deterministic `factSheet()` facts. Narrative cached in **`bloomos_briefing_narrative`** (upsert `onConflict:"brief_date"`, `narrate.ts:296-312`; read `:328-332`). Per-item decisions in `bloomos_briefing_state`. The **`briefings`** table is the *legacy weekly* path (`lib/briefing.ts:171-178` insert, `kind:"weekly"|"on_demand"`).
- **Cadence:** daily narrative pre-warm via `app/api/cron/daily-reminders` (`prewarmNarrative()`), plus `app/api/cron/weekly-digest` (`30 14 * * 1` = Mondays) which builds the legacy `briefings` row. **No forward-look/backward-look variant of the v2 briefing exists** (grep `forward|recap|lookback` → NOT FOUND in briefing code); the Monday/Friday *concept* lives separately in the ops pages (§E), not in the briefing engine.

### ⚠️ Gap / risk

Two parallel briefing systems exist: the **v2 engine** (`lib/admin/briefing/*` → `bloomos_briefing_narrative`/`bloomos_briefing_state`) and the **legacy weekly** (`lib/briefing.ts` → `briefings`). A Monday/Friday rhythm should extend the v2 engine (which already reads calendar + tasks), not the legacy weekly digest, to avoid a third system.

### ✅ VERDICT G

The v2 briefing is modular and **already reads the calendar and ops_tasks**, so a Monday forward-look / Friday backward-look should be added as new *sources* + a `briefingType` param reusing `gatherInputs()`/`buildBriefing()`/`narrate.ts` — **extend, don't duplicate.** No day-of-week briefing variant exists yet.

---

## SUMMARY

1. **Calendar scopes — re-consent needed? → NO (for AA).** The env `GOOGLE_REFRESH_TOKEN` already holds the full **`calendar`** scope (read+write), plus `gmail.send` and `gmail.readonly`; proven by live event insert/list/patch/delete + freebusy. Re-consent is only needed to onboard *new* users/tenants, because **no in-app OAuth consent flow exists** (tokens are minted out of band).
2. **Reuse booking write path for a calendar-write engine? → PARTIALLY.** `createEvent/updateEvent/cancelEvent` in `lib/google/calendar.ts` are clean and worth reusing, but they're hard-wired to the **env single-account auth** and the `primary` calendar, and set **no `extendedProperties`** (echo-prevention gap). Multi-user write needs auth parametrization + event metadata.
3. **Does any calendar read exist today? → YES.** Direct reads (`listUpcomingEvents`, `getFreeBusy`) feeding /meet + cockpit, **and** a cached per-user cron sync (`lib/agenda/calendar-sync.ts`, every 15 min) into a `calendar_events` table with delegation-aware RLS. No `watch`/push and no `syncToken` incremental sync.
4. **Is the Gmail matcher reusable for meeting ingestion? → YES, with additions.** Same paged-fetch → array-overlap match → idempotent upsert-into-`interactions` pattern transfers. Missing for meetings: a `meeting`/`transcript` `external_source`, **partner-contact matching** (Gmail only matches `constituents.emails`), real `is_private` derivation, and generalized attendee flags (today `shannon_present` is hardcoded to one person).

**Bonus (pins/rollover):** `pinned_for_today` / `pinned_for_this_week` are **relative booleans with no date or week anchor**, and **no rollover/reset code exists** (NOT FOUND) — the only carry-forward is the manual Monday Plan "From last week" surface. There is also **no task↔time-block scheduling field**, which the drag-into-calendar layer must add.

**Biggest surprise:** layer (3) is not greenfield — an Agenda subsystem and a `specs/bloomos-agenda.md` design doc (with a passed Phase-0 recon dated today) already exist; read them before spec/build.
