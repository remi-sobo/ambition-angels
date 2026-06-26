# Spec: Operating Rhythm v2 (My Week — Plan & Close)

Status: Phase 0 complete; reframe approved 2026-06-26; Phase 1 in progress. Both blocking decisions resolved (area axis = `category`; time-blocks private-and-persist). Borrows the ritual shape of a guided weekly team meeting (orient, walk the areas, walk the days, close out). Nothing here connects to Trellis, Cy, or any SOBO family product; structural inspiration only, per the entity boundary.

## Phase 0 outcome — approved reframe (2026-06-26)

Recon (`specs/bloomos-operating-rhythm-v2-phase0-findings.md`) found the original "build from scratch" framing materially stale. **Three premises were false** and the build order below is the approved reframe; where this section and the older §7 phases conflict, this section wins.

* **Monday/Friday already exist.** `app/admin/ops/monday/` (page + `WeekPlanner`) and `app/admin/ops/friday/` are live and in the sidebar; the `planned_week`/`planned_day`/`day_order`/pin fields are in active read/write use via `app/api/admin/ops/tasks/[id]/route.ts`. The job is to **unify** these under the hub + `RhythmWizard`, not rebuild them.
* **The calendar write path already exists.** `lib/agenda/task-blocks.ts` (`scheduleTaskBlock`/`moveTaskBlock`/`unscheduleTaskBlock` → Google `events.insert/patch/delete`), `app/api/admin/agenda/blocks/route.ts`, round-trip identity + echo prevention (`lib/agenda/calendar-sync.ts`), all shipped and wired into `WeekPlanner`. AA's Google grant is **already `calendar` read/write** — no scope upgrade / re-consent needed. The original Phases 6–7 collapse to: wire existing functions into the wizard + add overlap/conflict flagging + a connect-prompt dead-end.
* **The accept-suggested-task path already exists**, server-guarded against double-accept, setting `meeting_record_id` and flipping status — `app/api/admin/meetings/[id]/suggestions/route.ts`. The Friday recap is **ritual framing over this existing route**.

Corrections folded in: week math is already centralized in `lib/admin/ops/week.ts` (`mondayOf` == `weekStart`) — reuse it. RLS policies call **`private.has_permission`** (not `public`; `public` is the app-code RPC shim). The meeting enum has **no `'done'`** — use `has_follow_up`/`none_needed`. `fr_touches` is empty — repoint the Friday nudge at `getNeedsYou()` (`lib/admin/rail/needs-you.ts`). The "Metrics Library" is an API route + meta registry, not a page. **The `org_id` AA-default is live on `ops_tasks`/`ops_projects`** (`add_org_id_to_tenant_tables.sql`) — `rhythm_sessions.org_id` must have no default. Adjacent landmine (not this feature's work, but flag): `calendar_events.source` CHECK is `('google','booking')` while deployed code writes `'bloomos'` — verify the live constraint.

**Reframed build order** (supersedes §7): **P1** `rhythm_sessions` + RLS (no `org_id` default). **P2** "My Week" hub + sidebar item + time-aware Command Center summon card + deterministic role-weighted verdict; `resolveUserHandle()` identity resolver (retire the `admin_user` cookie). **P3** `RhythmWizard` shell (`mode` config) wrapping the existing Monday surfaces; add carryover **drop/archive** + roll-count. **P4** area walk: per-`category` projects/tasks + initiative read (reuse `ops/projects/[id]` pattern) + `pinned_for_this_week`. **P5** day walk over `getAgenda` + open-block computation + `planned_day` slotting + meeting **prep** + commit (stamp `planned_week`, write `rhythm_sessions`). **P6** wire the existing `task-blocks` write fns into the wizard day walk + grid overlap/conflict flag + connect-prompt on `NoCalendarConnection`. **P7** Friday truth + deliberate rollover + close-out (`completed_at`). **P8** Friday meeting **recap** framing over the existing suggestions route (align to the live follow-up enum). **P9** Friday light nudges via `getNeedsYou()` + stale-`plan_kpis` link-out. (Deferred, separate specs: self-serve Google OAuth consent flow for tenant two; delegated planning; per-tenant `ops_categories`; Reed-assisted planning.)

## The idea in one screen

A week has two honest questions.

* Monday is Aim: where is my time actually going, and is it going to what matters?
* Friday is Account: what's true now, and what did I fail to close?

Monday plans against the time you actually have (the calendar is the spine, not a side panel), so the plan doesn't become fiction by Wednesday. Friday accounts against that plan and rolls the remainder deliberately, so nothing leaks. Monday should feel like taking the wheel; Friday like putting the week down.

The ritual is role-shaped, not person-shaped. The steps are identical for everyone; the verdict's emphasis changes by role (CEO leads with runway and asks; ops lead leads with queue and follow-through). That's what makes it portable to Shannon and to the next org without a config screen.

## 1. Problem statement

There's no ritual that turns the week on and off, and nothing summons one. The schema has the bones of weekly planning (`ops_tasks.planned_week`, `planned_day`, `day_order`, the pinned flags) but no flow drives them, so exactly one task has a `planned_week` set. Mondays start cold against a flat task list with no view of the calendar, what carried over, or which area is starving. Fridays end loose: meetings sit at `needs_follow_up` forever, suggested tasks pile up at `pending`, finished work is never truthed against what was planned, and the remainder rolls by accident instead of by choice. The task list drifts from reality and the week has no open and no close.

## 2. Who's affected

* Remi (owner). Runs his own Plan and Close. Wants the three-second read, then a guided pass that ends with a placed, realistic week, not a longer list.
* Shannon (staff). Runs the same ritual against the ops slice, and partly plans for Remi (she manages his calendar). The Friday recap and follow-up clearing are built for her hands first.
* Future tenant staff and EDs. A solo ED or a 4-person nonprofit needs the open/close ritual more than AA does. If it only works because AA has two named people and a fixed category list, it fails tenant two. Built area-driven and role-driven so it survives.

## 3. Current behavior

* Task surfaces render `ops_tasks` by status/category with manual pinning. No week framing, no calendar, no ritual.
* `planned_week` / `planned_day` / `day_order` / pinned flags exist and are writable but nothing populates them as a flow.
* `calendar_events` (cached Google mirror) is read by the Agenda surface only.
* `meeting_records.follow_up_status` defaults to `needs_follow_up`; `meeting_suggested_tasks` sit at `pending`. Cleared ad hoc, if ever.
* `fr_touches` lives only in the fundraising surfaces.
* `plan_reviews` is the strategy/OGSM monthly review (no `week_of`, no `type`). Wrong artifact for a weekly cadence.

## 4. Desired behavior

### Navigation and trigger

* One sidebar item, "My Week" (internal name: Operating Rhythm). It lands on a small hub, not a tab toggle: this week's verdict line plus two doors, Plan and Close, with the time-appropriate door emphasized (Mon–Wed lights Plan; Thu–Sun lights Close). Each door opens its stepper. A hub beats flip-tabs because Plan and Close are sequential modes of the week, not parallel views, and tabs invite half-doing both.
* The ritual is summoned, not navigated to. A Command Center card appears time-aware: "It's Monday, plan your week →" / "Close out your week →", dropping the user straight into the right mode. Navigation is the backup. This is the adoption mechanism; the absence of a summon is why the current fields are unused.

### Monday — "Plan" (Aim). Steps in order, because the order is the discipline.

1. Orient / verdict. One deterministic sentence: "This week: 14 open across 4 areas, 5 carried over, 6 meetings booked, ~11 hours open." Calm if calm, flares where it's not.
2. Clear the carryover. Rolled-over and overdue `todo` tasks, oldest first, each showing roll-count. Mark done / plan to a day / push / drop (archive). Empty the deck before adding. (Also surfaces a safety-net line if last week's meetings were never recapped, since a skipped Friday shouldn't drop follow-ups.)
3. Walk the areas. For each `category` with active work: its live `ops_projects` (status + next action) and loose tasks. Decide the few things that must move; pin up to a small cap per area (`pinned_for_this_week`). Each project quietly shows the strategy initiative it serves (`ops_projects.initiative_id` → `plan_initiatives`), so the area walk doubles as an "are we working on what matters" check. Empty areas collapse to one quiet line.
4. Walk the days, open blocks + meeting prep. Mon–Fri, each day rendering its `calendar_events` and the computed open blocks (gaps in working hours). Two levels of placement: assign a task to a day (`planned_day`, `day_order`), and/or drag a task into an open block, which writes a real time-block event onto the user's Google Calendar and links it to the task. Thinking through what goes in each open block is the core planning act, not a nicety. For each meeting, especially external/donor/board, prompt for prep; accepting creates a prep task placed before the meeting. This step is where "plan against real time" actually happens.
5. Commit. Stamp `planned_week` (this Monday) on everything chosen, write the `rhythm_sessions` row, show the week-ahead summary. Quiet saved tick, no celebration.

### Friday — "Close" (Account).

1. Verdict. "Planned 14, done 9, 5 open, 3 meetings need follow-up."
2. Truth the tasks. Everything with `planned_week = this week`: done / roll to next week (re-stamp `planned_week` to next Monday, clear `planned_day`) / drop. Rolling is a deliberate act, surfaced with roll-count.
3. Recap the meetings. `meeting_records` with `follow_up_status='needs_follow_up'` and `occurred_at` this week. Per meeting, review `meeting_suggested_tasks`: accept (creates an `ops_task` linked via `meeting_record_id`, server-guarded against double-accept) or dismiss, then mark the meeting `done`. For a fundraiser, every donor conversation's follow-up lives or dies here.
4. Log the touches + check the numbers (light). Overdue/due `fr_touches` surfaced with link-out to act; stale manual `plan_kpis` get a one-line "N numbers are stale" linking to the Metrics Library. No inline CRM, no inline metric entry.
5. Close out. Short checklist + note to next week. Sets `completed_at`. Put it down.

## 5. Scope

In:

* New `rhythm_sessions` table (session artifact).
* "My Week" hub + Command Center time-aware trigger card.
* A shared `RhythmWizard` stepper with two mode configs (`monday_plan`, `friday_close`).
* Monday: orient, carryover, area walk (projects + tasks + initiative read), day walk with calendar read, open-block display, task slotting, drag-to-calendar time-blocking (writes Google events), and meeting prep.
* Friday: task truthing + deliberate rollover, meeting recap through `meeting_suggested_tasks`, light fundraising and stale-KPI nudges, close-out.
* Deterministic verdict lines (no AI), role-weighted.
* Role-aware entry (owner/admin org-wide + own; staff own slice). Area walk driven by `category`.
* RLS via `has_permission(org_id, 'ops.read'|'ops.write')`.
* Google Calendar write path: OAuth scope upgrade + re-consent, a write client (create/move/delete events), and round-trip identity so synced-back blocks don't duplicate.
* Open-block (free/busy gap) computation within working hours.

Out:

* Delegated planning (Shannon planning Remi's week through `agenda_delegations`). v1 is own-week; delegated view is a fast follow. (Open decision 2.)
* Per-tenant configurable `category` list (a future `ops_categories` table). Flagged, not built.
* Inline KPI/metric entry; inline CRM. Link out instead.
* Fixing legacy free-text `assigned_to` ('remi'/'shannon') to real user IDs. Worked around, flagged.
* Reed-generated plans. The ritual is human-driven; Reed assist is a later layer.
* Mobile-specific layout. Desktop-first.
* finance / board_viewer flavored rituals. v1 serves owner/admin/staff.

## 6. Architecture sketch (grounded in live schema)

Reads:

* `ops_tasks` — unit of planning. `planned_week date`, `planned_day date`, `day_order int`, `pinned_for_this_week`, `pinned_for_today`, `status` ('todo'|'done'), `priority`, `due_date`, `category`, `assigned_to text`, `project_id`, `meeting_record_id`, `calendar_event_id`, `archived_at`.
* `ops_projects` — area context. `category`, `status`, `assigned_to`, `due_date`, `initiative_id` (→ `plan_initiatives`, the strategy tie-in).
* `calendar_events` — the schedule for the day walk. `owner_user_id uuid`, `start_time`, `end_time`, `all_day`, `title`, `attendees`, `is_external`. Per-user; delegation via `agenda_delegations`.
* `connections` — per-user encrypted Google tokens (`access_token_enc`, `refresh_token_enc`, `expires_at`, `meta`, `user_id`). The current grant is read-only; time-blocking needs a read/write scope (re-consent).
* `meeting_records` — Friday recap. `follow_up_status`, `occurred_at`, `owner_user_id`, `calendar_event_id`. Also read on Monday for the prep step (upcoming) and the un-recapped safety net.
* `meeting_suggested_tasks` — staged items. `status` ('pending'), `suggested_title`, `suggested_category`, `suggested_entity_type/id`, `meeting_record_id`.
* `fr_touches` — follow-through nudge. `occurred_at`, `touch_type`, `hubspot_contact_id`.
* `plan_kpis` — stale-number nudge (manual past cadence).
* `profiles` / `memberships` — resolve auth user → role → legacy `assigned_to` handle.

Writes:

* `ops_tasks`: Monday stamps `planned_week`, `planned_day`, `day_order`, `pinned_for_this_week`. Friday re-stamps `planned_week` (rollover) or sets `status='done'` / `archived_at`. Inserts on prep-task creation and on accepting a suggested task (with `meeting_record_id`, `category`).
* `meeting_suggested_tasks.status` → 'accepted' | 'dismissed'.
* `meeting_records.follow_up_status` → 'done'.
* `rhythm_sessions`: one row per run.

Calendar write subsystem (new; today's sync is pull-only):

* Today `calendar_sync_jobs` only pulls inbound (counts `fetched/upserted/deleted` from Google). There is no write path.
* Scope upgrade + re-consent. `calendar.readonly` cannot create events. Detect insufficient scope on a write attempt, prompt the user to re-authorize for read/write calendar, store the upgraded grant on `connections`. Gates all write-back. One-time per user.
* Write client. Create / patch (move) / delete Google events, with token refresh and retry. On create, stamp a private extended property `bloomos_task_id` (and `bloomos_block=true`) on the Google event.
* Round-trip identity. Persist the returned `google_event_id` on a `calendar_events` row with `source='bloomos'`, and set `ops_tasks.calendar_event_id` to it. Pull-sync upserts match on `google_event_id`, so the block round-trips as an update, never a duplicate, and renders as a BloomOS block rather than an external meeting.
* Open blocks. Compute free/busy gaps from `calendar_events` within working hours (read-only). This ships with the day walk independent of write-back.
* Time-block semantics. New block = drag task to gap (create event). Move = drag block (patch event time). Unschedule = explicit delete (delete event, clear `ops_tasks.calendar_event_id`). Complete task = leave the block as a record (do not auto-delete). Default block visibility = private on Google. (Open decision 1.)

New table:

```
rhythm_sessions
  id            uuid pk default gen_random_uuid()
  org_id        uuid not null references orgs(id)        -- NO column default; set from session context
  user_id       uuid not null                            -- auth user who ran it (matches calendar_events.owner_user_id convention)
  kind          text not null check (kind in ('monday_plan','friday_close'))
  week_of       date not null                            -- canonical Monday
  status        text not null default 'in_progress' check (status in ('in_progress','completed'))
  checklist     jsonb not null default '{}'
  stats         jsonb not null default '{}'              -- {planned, rolled_over, completed, follow_ups_cleared, prep_tasks_created, ...}
  notes         text
  started_at    timestamptz not null default now()
  completed_at  timestamptz
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()
  unique (org_id, user_id, kind, week_of)
```

RLS: enable; `select` = `has_permission(org_id,'ops.read')`, `insert/update` = `has_permission(org_id,'ops.write')`. Policies ship in the same migration. `has_permission(p_org uuid, p_perm text)` exists in `private` and `public`; use `public`.

Identity wrinkle (called out, not solved): `ops_tasks.assigned_to` is free text while calendar/meeting tables use `owner_user_id uuid`. "My week" needs a resolver: `auth.uid()` → `profiles`/`memberships` → handle. Build one `resolveUserHandle()` and route every "mine" filter through it.

Verdict weighting by role: one deterministic builder takes the same counts and orders them by role. owner/admin: runway/asks/personal-moves/fires first. staff: queue/acknowledgments/scheduling/follow-through first. No AI.

Component shape: one `RhythmWizard` stepper taking a `mode` config (steps, loaders, commit handlers). The "My Week" hub is a thin shell around the verdict + two entry buttons. Altitude not navigation: chrome and progress persist, the body changes. Cream surfaces, warm-RAG status, no confetti.

## 7. Staged build order

One PR each, independently useful and reversible.

Phase 0: Recon. Read and report (prompt below). No code.
Phase 1: `rhythm_sessions` + RLS. Reviewable SQL to Remi (no `org_id` default). He applies. Smoke as real user.
Phase 2: "My Week" hub + Command Center trigger + verdict. Sidebar item, hub with two doors, time-aware card, deterministic verdict. Commit point: the hub reads true and routes.
Phase 3: Monday — orient + carryover. Stepper shell + carryover writing `planned_day`/`status`/`archived_at`, with roll-count. Commit point: carryover can be cleared.
Phase 4: Monday — area walk. Per-category projects + tasks, initiative read, `pinned_for_this_week`. Commit point: areas reviewed and pinned.
Phase 5: Monday — day walk (read) + open blocks + meeting prep + commit. Calendar read per day, open-block computation, day-level task slotting (`planned_day`), prep-task creation, commit stamps `planned_week` + writes session. No Google writes yet. Commit point: a full Monday run produces a placed, day-level week and shows open blocks.
Phase 6: Calendar write foundation. OAuth scope upgrade + re-consent flow; the Google write client (create/move/delete); round-trip identity (`google_event_id`, `source='bloomos'`, extended property). Proven by creating, moving, and deleting ONE block by hand and confirming a clean round-trip on next sync. Not wired into the wizard UI yet. Commit point: one block round-trips without duplicating.
Phase 7: Monday — drag-to-block time-blocking. Wire the day walk to the write client: drag a task into an open block to create the event, drag to move, unschedule to delete, set `ops_tasks.calendar_event_id`. Conflict handling on the grid. Commit point: blocks created from the wizard appear on Google and survive sync.
Phase 8: Friday — truth + rollover + close-out. Task truthing, deliberate rollover, checklist + notes, `completed_at`. Commit point: a full Friday run truths and rolls.
Phase 9: Friday — meeting recap. `needs_follow_up` meetings, accept/dismiss suggestions (accept inserts linked task, server-guarded), mark done. Commit point: meeting backlog clears.
Phase 10: Friday — light nudges. Overdue `fr_touches` + stale `plan_kpis` with link-outs. Commit point: nudges appear and link, nothing rebuilt.

(Deferred, separate specs: delegated planning; per-tenant `ops_categories`; Reed-assisted planning.)

## 8. Definition of done (observable)

* A Monday run yields `ops_tasks` with `planned_week` = this Monday and `planned_day` on slotted tasks, prep tasks placed before their meetings, and a completed `rhythm_sessions` row (`kind='monday_plan'`).
* The Monday verdict matches a hand count of open/carried/meetings/open-hours.
* A Friday run moves every truthed task to `done` or re-stamps `planned_week` to next Monday, and writes a `rhythm_sessions` row with populated `stats` and `completed_at`.
* After Friday, no this-week `meeting_records` remain at `needs_follow_up` unless explicitly skipped; accepted suggestions exist as `ops_tasks` carrying their `meeting_record_id`.
* The day walk shows each day's events and its open blocks; assigning a task to a day sets `planned_day`.
* Dragging a task into an open block creates a Google Calendar event (private), sets `ops_tasks.calendar_event_id` and `calendar_events.source='bloomos'`, and on the next pull-sync the block updates in place rather than duplicating or showing as an external meeting. Moving updates the event time; unscheduling deletes it.
* A user on a read-only Google grant who attempts a block is prompted to re-consent, and time-blocking works after the upgraded grant is stored.
* The "My Week" hub shows the verdict and lights the time-appropriate door; the Command Center card appears on the right days and routes into the right mode.
* Shannon (staff) sees the ops slice by default; lens switch to org-wide changes the body, not the chrome, and lives in the URL.
* Second-tenant smoke (throwaway org, no `program` tasks): empty areas collapse, no AA bleed, `rhythm_sessions.org_id` set from session context, never the AA default.
* Grayscale check: every status in both wizards reads without color.

## 9. Failure modes to watch for

* The org_id default trap, repeated. A hardcoded AA default on `rhythm_sessions.org_id` silently writes tenant-two data into AA. No default; set from session.
* "My week" leaking across users. Free-text `assigned_to` plus a sloppy filter shows the wrong person's tasks. Route every "mine" filter through one resolver.
* Rollover furniture. A task rolled every Friday forever becomes invisible. Surface roll-count and weight high roll-counts for attention.
* Double-creating tasks from meetings. Accepting the same suggestion twice duplicates tasks. Guard on `status != 'pending'` server-side.
* Empty calendar reads as broken. Sync lag or no Google connection makes the day walk look blank. Show an explicit "no events synced / connect calendar" state.
* Block duplicates on re-sync. If a BloomOS-written block isn't matched on `google_event_id` at next pull, it reappears as a second event. Write must persist the returned `google_event_id` before the next sync, and the upsert must key on it.
* Re-consent dead end. A user on the read-only scope drags a block and gets a silent failure. Detect insufficient scope and route to re-consent; never fail quietly.
* Token expiry mid-write. A stale `access_token_enc` makes a create/move fail halfway. Refresh-and-retry once; on failure, leave the task unscheduled and surface it, don't leave a phantom `calendar_event_id`.
* Meeting lands on a block. A real meeting syncs in over an existing time-block. Detect the overlap and flag it in the day walk rather than silently double-booking; let the user move the block.
* Deleting the wrong thing. Unschedule must only delete `source='bloomos'` blocks, never an external meeting. Guard the delete on source server-side.
* Week boundary math. `planned_week` must be one canonical Monday everywhere (timezone, week start). Centralize `weekStart(date)`; use it on every read and write.
* Monday becomes a wish list. If the day walk is skippable or the calendar is decorative, people overcommit and the plan rots (today's failure mode). The placement step against real calendar time is the cure; don't let commit happen without it.
* Prep/recap duplication. If recap leaks onto Monday, follow-ups sit over the weekend and Friday and Monday fight. Prep = Monday, recap = Friday; Monday only shows a safety-net line for un-recapped meetings.
* Strategy review collision. Keep the weekly close out of `plan_reviews` (the monthly OGSM review). Different cadence, different table.

## 10. Open decisions (with recommendations)

1. Time-block visibility and cleanup. DECIDED: blocks default to private on Google; completing a task leaves its block as a record; unschedule is the explicit delete. Write-back is in, sequenced behind the re-consent + write foundation in Phases 6–7.
2. Delegated planning in v1? Recommend no; v1 is own-week, delegated view (Shannon plans Remi's week via `agenda_delegations`) is a fast follow. Real for AA, not load-bearing for the first cut.
3. Hub vs flip-tabs for "My Week"? Recommend hub (verdict + two doors), not toggle-tabs. Plan and Close are sequential modes; tabs invite half-doing both. (Made this call in the design; override if you prefer tabs.)
4. Naming. Recommend sidebar "My Week", doors "Plan" / "Close", internal name "Operating Rhythm". "Close" over "Review" because Friday is active finishing, not passive looking. Your call, cheap to change.
5. Area axis = `category`. DECIDED: yes. Intrinsic work axis every nonprofit has; empty categories collapse for tenants that don't use them. Known debt: `category` is a hardcoded text list, not per-tenant. Recommend a future `ops_categories` table before tenant two, tracked separately, not built here.
6. Which roles get the ritual? Recommend owner/admin/staff in v1. finance/board_viewer excluded for now (board_viewer is read-only governance; finance could get a runway-flavored close later).

## 11. Paste-ready Phase 0 recon prompt (Claude Code)

```
Recon only. Read and report. Write no code, propose no migration yet. Stop at the end with findings.

Context: Building Operating Rhythm v2, a "My Week" hub with two guided wizards, Monday "Plan"
(orient, clear carryover, walk areas, walk days + meeting prep, commit) and Friday "Close"
(truth tasks, recap meetings, light nudges, close out). The DB has the planning fields already;
we need to know what in the repo touches them before building. Spec: specs/bloomos-operating-rhythm-v2.md.

Find and report, with file paths and line refs:

1. ops_tasks usage.
   - Every read/write of planned_week, planned_day, day_order, pinned_for_this_week,
     pinned_for_today. Any existing weekly-planning route/page/component? If so, what it does and
     whether it's in the nav.
   - status transitions ('todo'->'done') and archived_at handling today.
   - Where the canonical start-of-week / Monday calculation lives, if anywhere. One weekStart
     helper, or inline week math in several places?

2. Identity resolution.
   - How the current authed user resolves to (a) role (owner/admin/staff/finance/board_viewer)
     and (b) the legacy ops_tasks.assigned_to text handle ('remi','shannon').
   - Any helper mapping auth.uid() -> profiles/memberships -> handle? If not, where is "my tasks"
     filtering done and how does it match the handle?

3. Calendar reads, and the write path (now in scope).
   - How the Agenda surface reads calendar_events (per-user via owner_user_id, delegation via
     agenda_delegations). Identify the reusable read function.
   - Confirm the sync is pull-only today (calendar_sync_jobs). Is there ANY existing Google write
     (create/update/delete event) anywhere? Report it if so.
   - connections table: what Google scope is actually stored/requested today (look at the OAuth
     consent config and the scope strings in code, not the encrypted tokens). Confirm it's
     read-only and identify exactly where scopes are declared, so we can plan the read/write
     upgrade + re-consent. Do NOT print token values.
   - How tokens are refreshed today (refresh_token_enc usage), so the write client can reuse it.

4. Meetings.
   - How meeting_records and meeting_suggested_tasks are surfaced today. Any existing
     "accept suggested task -> create ops_task" path? Where, and does it set meeting_record_id and
     flip the suggestion status server-side?
   - How follow_up_status is set/cleared today, if at all.

5. Light-nudge sources.
   - Where fr_touches overdue/next-touch logic lives (the function the Right Rail / ops panel uses).
   - Where manual plan_kpis staleness is computed (cadence vs last-updated), and the Metrics
     Library route to link to.

6. Strategy tie-in.
   - ops_projects.initiative_id -> plan_initiatives: is there an existing read that resolves a
     project to its initiative/goal for display? Reuse it if so.

7. RLS + multi-tenant.
   - Confirm has_permission(org_id, 'ops.read'|'ops.write') is the pattern on existing
     ops_tasks/ops_projects policies. Paste the existing ops policies.
   - Confirm how org_id is set on insert for ops_tasks today (session context vs hardcoded
     default), so rhythm_sessions inserts match the correct pattern and rely on no column default.

8. Nav + component primitives.
   - How sidebar items and the Command Center cards are registered/rendered (so we can add the
     "My Week" item and the time-aware trigger card).
   - Any existing stepper/wizard primitive to reuse (onboarding, scheduling flows), or build a new
     RhythmWizard? Report what exists.

Output: a findings doc. Flag anything contradicting the spec's assumptions (an existing planning
UI, week math already centralized, an accept-suggestion path already built, a stepper primitive).
Recommend spec changes. Then stop and wait for approval before Phase 1.
```
