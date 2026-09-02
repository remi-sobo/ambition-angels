# Spec: Calendar & Time Blocking (the week grid)

Status: **SHIPPED 2026-09-02** (all six phases, same day as the draft — see the ship notes on §7 and the recon findings in §12). Design researched against the live codebase and against the shipped Wild Wanderers schedule feature (`wildwanderers-app`, `schedule_blocks` + `ScheduleGrid`), whose task-in-block mechanics this borrows — structural inspiration only, no code or data crosses the entity boundary. Builds directly on `specs/bloomos-agenda.md` (calendar cache, delegation) and `specs/bloomos-operating-rhythm-v2.md` (My Week, planner, task blocks); where those specs shipped something, this spec upgrades it rather than rebuilding it. Supabase project kzzdtibbwsucloaoqpqa; the Phase 1 migration is applied live.

## The idea in one screen

BloomOS already knows your meetings (the per-user Google Calendar mirror in `calendar_events`) and already knows your work (`ops_tasks` with priority, due date, project, planned week). What it can't show is the shape of a week: a real time grid where meetings sit as fixed rock and the gaps between them are where the work happens. Today a "time block" is one task wearing one Google event. The upgrade is to make the block the container: draw a work block into an open gap, fill it with the highest-priority open tasks, check them off inside the block as you finish, and let the same grid answer the manager's question — where did the time go, and what got done in it — for themselves and for the people they manage.

One sentence: **the calendar becomes the surface where tasks, time, and people meet, for the owner of the week and for the person accountable for it.**

## 1. Problem statement

* There is no time-grid view anywhere in BloomOS. Every calendar surface is a list: `AgendaList` groups events by day, `WeekPlanner` stacks day cards. You cannot see the shape of a week — where the meetings cluster, where the open water is, whether Thursday is already sunk.
* A scheduled task is one Google event (`ops_tasks.calendar_event_id` → `lib/agenda/task-blocks.ts`). There is no way to say "this 2-hour block is for these four tasks" and tick them off in place. Real work blocks hold several small things or one big thing plus overflow; the one-task model forces a fake choice.
* Working hours are hardcoded 09:00–17:00 in `lib/admin/ops/open-blocks.ts`, so "open time" is wrong for anyone whose day isn't that.
* Managers have no view of a report's week. `agenda_delegations` exists (seeded Remi→Shannon) but is a manual grant, disconnected from the org chart that already lives in `staff.reports_to`. And even a delegate sees only events — not what work was planned into the blocks or whether it got done.
* Weekly planning (`/admin/ops/monday`) plans against day cards and a computed open-blocks list, not against the visual week. The Friday close accounts for tasks but not for time: "planned 14, done 9" says nothing about whether the blocked hours produced the done tasks.
* There is no `/admin/calendar` route and no calendar item in `lib/admin/nav.ts`. The org's single most universal surface has no front door.

## 2. Who's affected

* Remi (owner). Wants the week at a glance, blocks drawn into the gaps, the right tasks pulled into each block by priority, and a Friday answer to "did the blocked time produce the work."
* Shannon (staff). Runs her own week the same way; already reads Remi's calendar by delegation. The manager view formalizes what she half-does by hand.
* Every future manager at AA or tenant two. `staff.reports_to` is the org chart; a manager should see a direct report's week — meetings, blocks, and block outcomes — with zero configuration. If it only works because AA has two named people, it fails tenant two.
* Every future staff member. The grid, prefs, and fill-the-block flow are per-user from day one; nothing keys on a handle or a name.

## 3. Current behavior

* `calendar_events` mirrors each connected user's Google Calendar (15-min cron + push channels, `lib/agenda/calendar-sync.ts`), window −1d/+21d, with echo prevention and a two-way flow-back for BloomOS-owned task blocks (`extendedProperties.private.bloomos_task_id`).
* ⚠️ Known drift: the committed CHECK on `calendar_events.source` is `('google','booking')` while deployed code writes `'bloomos'` (`lib/agenda/task-blocks.ts:65`, flagged in the rhythm spec). Phase 0 verifies the live constraint; Phase 1 commits the widening either way.
* `scheduleTaskBlock` / `moveTaskBlock` / `unscheduleTaskBlock` write one Google event per task, tag it, mirror it, and stamp `ops_tasks.calendar_event_id` + `planned_day` + `planned_week`. Wired into `WeekPlanner`'s ScheduleCell. Block contract everywhere is `{ day: 'YYYY-MM-DD', start_minute, duration_minute }` resolved via `dayStartInstant()` (`lib/admin/ops/week.ts`, ORG_TZ = America/Los_Angeles).
* `computeOpenBlocks(dayMidnightMs, busy[])` merges busy intervals inside hardcoded 09:00–17:00, min 30 min.
* `agenda_delegations(grantor, grantee)` grants calendar read; RLS on `calendar_events` = `ops.read` AND (own OR delegated). No manager derivation, no write delegation.
* `ops_tasks` carries everything the fill picker needs: `priority`, `due_date`, `project_id`, `category`, `planned_week`, `planned_day`, `pinned_for_this_week`, `roll_count`, `assigned_to`. Completion via PATCH `/api/admin/ops/tasks/[id]` sets `completed_at`.
* `staff.reports_to` (self-FK on `staff`, cycle-guarded) is the org chart edge; `staff.user_id` links a staff row to an auth user.

## 4. Desired behavior

### The week grid (`/admin/calendar`)

* A new sidebar destination in the Work section (tabs become My Week / Calendar / Tasks / Projects in `lib/admin/nav.ts`). Mon–Sun columns, hour rows, the user's own working-hours window, LA week math from `lib/admin/ops/week.ts` (never re-derived).
* **Meetings** (source `google`/`booking`) render as fixed, read-only cards — title, time, external dot, attendee hint — visually distinct from blocks. Overlaps share a column via lane layout (equal-width lanes within an overlap cluster). All-day events sit in a thin header strip.
* **Work blocks** render as BloomOS-styled cards. Pointer-drag on empty grid creates one (15-min snap, drag up or down); drag moves it (across days too); a bottom strip resizes; a plain click opens it. A click-vs-drag is disambiguated by whether the pointer moved — one handler, no mode switch.
* **Open time** is quiet, not loud: gaps ≥ 30 min inside working hours show a faint "+ open" affordance; tapping it creates a block filling the gap. The open-hours total for the week feeds the summary strip and the Monday verdict.
* A **now line** in today's column; a "synced N min ago" freshness chip that goes ochre past 20 minutes with a Refresh action, same pattern as `AgendaList`.
* Progressive disclosure by block height: title always; time from ~40px; task checklist from ~60px. Small blocks stay legible.
* Every write goes through the existing block contract shape and syncs to Google as **one event per block** (`extendedProperties.private.bloomos_block_id`); moving or deleting the event in Google flows back to the block via the existing sync loop, exactly as task blocks do today. Deleting in Google (or in the grid) never deletes tasks — it unschedules them.

### Fill the block

* Opening a block shows: editable title, time, and its **task checklist** — each row a checkbox, title, priority chip, due label, project name. Ticking a box completes the task through the existing PATCH (single source of truth: `ops_tasks.status`/`completed_at`; recurrence, ledgers, and every other surface behave identically). Unticking un-dones it.
* Below the checklist, **"Fill this block"**: the user's open tasks (`assigned_to` = self or unassigned, status ≠ done/archived), default-sorted planned-this-week first, then `pinned_for_this_week`, then priority, then due date — with one-tap re-sorts and filters by **priority, project, category, and due window**. This is the "show me what to work on" moment; the default order should make the top of the list the right answer.
* A task already sitting on another block shows "On Wed 2p — tap to move." A task lives on **one block at a time**; adding it elsewhere is a move, not a copy. When it's done, it stays on the block it was finished in — that's the productivity record.
* Adding a task to a block stamps `planned_day` (the block's day) and `planned_week`, keeping the rhythm fields truthful; removing it from a block clears `planned_day` but keeps the task.

### The manager view

* An **owner switcher** on the grid: self by default; the menu lists everyone whose calendar you may read — explicit `agenda_delegations` grantors **plus your direct reports via `staff.reports_to`**, derived, zero-config. Read-only: a manager sees the report's meetings, blocks, block task lists with done-state, and the summary strip. No write, no task edit, from someone else's week.
* A **week summary strip** on every grid (own or viewed): meeting hours / blocked hours / open hours, and "N of M block tasks done." Deterministic, computed from the same rows the grid renders — no AI, no separate store.
* External-meeting detail respects the same visibility the agenda already grants; the manager view adds work blocks and outcomes, not new meeting detail.

### Weekly rhythm integration

* Monday planner: the Days step gains "Open the week grid →" and the open-hours figure comes from per-user prefs instead of the hardcoded 9–5. The grid is where drag-to-block happens; the wizard remains the ritual wrapper. (Replacing the Days step's day cards with an embedded grid is a later decision, once the grid has earned it.)
* Friday close: the verdict line gains time accounting — "You blocked 11h and finished 9 of 13 block tasks; 4h of blocks went unused." Unfinished block tasks roll through the existing carryover flow with their `roll_count`.

### Preferences

* A "Working hours" card in `/admin/settings`: day start, day end, default block length. Stored per user, feeding both the grid extent and `computeOpenBlocks`. Save-on-change.

## 5. Scope

In:

* New tables: `work_blocks`, `work_block_tasks`, `calendar_prefs`, with RLS including derived manager read.
* Widen the `calendar_events.source` CHECK to include `'bloomos'` (commit the live reality).
* `/admin/calendar` week grid (client component + server readers), nav entry, freshness chip.
* Generalized block service (`lib/agenda/work-blocks.ts`, superseding `task-blocks.ts`): block CRUD → one Google event per block, mirror row, flow-back, backfill of existing single-task blocks into one-task work blocks.
* Fill-the-block panel: checklist wired to the existing task PATCH, picker with priority/project/category/due sort and filters, one-home-per-task move semantics, `planned_day`/`planned_week` stamping.
* Manager read: `reports_to`-derived visibility on `calendar_events`, `work_blocks`, `work_block_tasks`; owner switcher; week summary strip.
* Working-hours prefs card; `computeOpenBlocks` reads prefs.
* Monday/Friday wiring (link + verdict figures), not a wizard rebuild.

Out (explicitly):

* **Recurring block templates** (a weekly-repeating "Deep work MWF 8–10"). The Wild Wanderers `grp` fan-out (one row per day sharing a group id, materialized, no rule evaluation) is the proven reference when this comes; it needs its own exception model against a real Google calendar, so it's a follow-on spec, not a stretch goal here.
* **Delegated writing** — Shannon blocking time on Remi's calendar. Already open decision #6 on the agenda spec; stays there.
* AI auto-scheduling / auto-fill. The default sort should be good enough that filling is one tap; automation later, if ever, on top of the same data.
* Changes to `/meet` availability or booking.
* Per-tenant timezone. ORG_TZ stays LA and stays centralized in `week.ts`; the known "derive from `orgs.settings`" TODO is not this spec's work.
* Mobile drag interactions. The grid must render and scroll on mobile; block create/edit falls back to tap-a-gap + form. Desktop is where weeks get planned.

## 6. Architecture sketch

### Schema (all idempotent, all `org_id` **without default** — the org_id default trap is live on `ops_tasks`, do not repeat it)

```sql
create table if not exists work_blocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  owner_user_id uuid not null references auth.users(id),
  day date not null,                       -- LA-local day, same contract as /api/admin/agenda/blocks
  start_minute int not null check (start_minute >= 0 and start_minute < 1440),
  duration_minute int not null check (duration_minute > 0 and duration_minute <= 1440),
  title text not null default 'Work block',
  google_event_id text,
  calendar_event_id uuid references calendar_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists work_blocks_owner_day_idx on work_blocks (org_id, owner_user_id, day);

create table if not exists work_block_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  block_id uuid not null references work_blocks(id) on delete cascade,
  task_id uuid not null references ops_tasks(id) on delete cascade,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (task_id)                         -- one home at a time; moving is an upsert on task_id
);
create index if not exists work_block_tasks_block_idx on work_block_tasks (block_id, position);

create table if not exists calendar_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references orgs(id),
  day_start_minute int not null default 540,    -- 09:00
  day_end_minute int not null default 1020,     -- 17:00
  default_block_minute int not null default 60,
  updated_at timestamptz not null default now()
);
```

Minutes-from-midnight over `time`/`timestamptz` on the block itself is deliberate: it matches the existing `/api/admin/agenda/blocks` contract, makes snap/pixel math integer arithmetic, and pushes the single DST-sensitive conversion into the one existing function that already does it (`dayStartInstant`). The Google event and the `calendar_events` mirror carry the absolute instants.

`work_block_tasks.unique (task_id)` encodes "a task lives on one block at a time" in the database; the move flow is an upsert `on conflict (task_id)`. A done task keeps its row — that row *is* the record of where the work happened. No completion flag on the join: `ops_tasks.status` stays the only truth.

### RLS

* Manager derivation, one helper: `private.manages_user(target_user uuid) returns boolean` — exists a `staff` row for `target_user` whose `reports_to` points at a `staff` row with `user_id = auth.uid()`, same `org_id`. Direct reports only.
* `work_blocks` select: `has_permission(org_id,'ops.read')` AND (`owner_user_id = auth.uid()` OR delegated via `agenda_delegations` OR `private.manages_user(owner_user_id)`). Insert/update/delete: owner only (plus `ops.write`).
* `work_block_tasks` rides the block: visible/writable iff the block is, via `exists (select 1 from work_blocks b where b.id = block_id)` under the caller's own block policies. (Note: this can reveal a block-task's existence to someone who can see the block but not the task row itself; the reader below joins task titles server-side under the same visibility, which is the intended behavior for managers.)
* `calendar_events` select gains the same `manages_user` arm alongside the existing delegation arm.
* `calendar_prefs`: own row only.
* Extend `supabase/tests/rls-leak-test.sql`: no cross-org read via the manager arm; a non-manager, non-delegate staff peer sees nothing; a manager cannot write a report's blocks.

### Services and routes

* `lib/agenda/work-blocks.ts` — `createWorkBlock`, `moveWorkBlock`, `retitleWorkBlock`, `deleteWorkBlock` (Google event insert/patch/delete tagged `bloomos_block_id`, mirror upsert `source:'bloomos'`, tolerate 404/410 on delete); `addTaskToBlock` (upsert on task_id + stamp `planned_day`/`planned_week`/`pinned_for_this_week`), `removeTaskFromBlock` (clear `planned_day`, keep task). `NoCalendarConnection` still maps to 409.
* `app/api/admin/agenda/work-blocks/route.ts` (+ `[id]`) — session-client, RLS-enforced, same `{day, start_minute, duration_minute}` shape.
* `lib/agenda/calendar-sync.ts` — flow-back learns `bloomos_block_id` beside the existing `bloomos_task_id`: a Google move re-stamps the block (and its tasks' `planned_day`); a Google delete removes the block and unschedules its tasks. Echo prevention unchanged.
* `lib/agenda/week-summary.ts` — pure: `(events, blocks, blockTasks, prefs) → { meetingMin, blockedMin, openMin, blockTasksDone, blockTasksTotal }`. Unit-testable, shared by grid strip and Friday verdict.
* `lib/admin/ops/open-blocks.ts` — signature gains `{ dayStartMin, dayEndMin }`, callers pass prefs.

### UI

* `app/admin/calendar/page.tsx` (server: `getOrgContext`, parallel reads — agenda via `getAgenda`, blocks, block tasks joined to task fields, prefs, visible owners) → `WeekGrid.tsx` (client).
* Grid mechanics proven in the Wild Wanderers build and reused as *patterns*: px-per-minute geometry, 15-min snap, window-level pointer listeners with a drag-state ref, moved-flag click-vs-drag, cluster-then-greedy-lane overlap layout, CSS repeating-gradient hour rules, height-gated block content, 60s now-line tick.
* Block panel as a right-side sheet (not a modal) so the grid stays visible while filling. Typography via `TYPE` from `lib/admin/typeScale.ts`; colors from the existing token set (meetings on `tile`/`hairline`, blocks on `orange`-tinted surface, open affordances `status.healthy`); nothing outside the five-value status scale gets a status color.
* `app/admin/settings` gains the Working hours card (`CalendarPrefsCard`, save-on-change).

### Backfill

One migration + script pass: every `ops_tasks` row with `calendar_event_id` becomes a `work_blocks` row (day/minutes derived from the mirrored event via `laDateOf`) + one `work_block_tasks` row; the Google event gains `bloomos_block_id` on next touch. `ops_tasks.calendar_event_id` is left in place during transition and dropped in a later cleanup once `WeekPlanner`'s ScheduleCell writes through the new service.

## 7. Staged build order

Phase 0 — Recon gate (no code). Verify against the live project: the actual `calendar_events.source` CHECK; whether any `ops_tasks.calendar_event_id` rows exist to backfill; `agenda_delegations` contents beyond the AA seed; which `staff` rows carry `user_id` and `reports_to` (the manager arm is only as real as this data); Google grant scopes; any drift on `open-blocks.ts` callers. Findings appended below; corrections folded into phases.
**[2026-09-02: DONE — findings in §12. Two plan changes: the backfill is a no-op (zero linked tasks live, because the source CHECK made every mirror write fail), and the RLS scratch DB excludes the staff migrations, so `manages_user` guards on `to_regclass('public.staff')` and the leak test seeds a minimal staff fixture.]**

Phase 1 — Schema. `work_blocks` + `work_block_tasks` + `calendar_prefs` + widened `source` CHECK + `private.manages_user` + RLS + leak-test cases. Useful alone: the constraint drift is fixed and the manager read arm lights up delegated agenda surfaces immediately.
Commit: `BloomOS calendar: work-block schema, prefs, manager read (Phase 1)`
**[2026-09-02: SHIPPED and applied to the live project via MCP (`create_work_blocks_and_calendar_prefs`). Full leak suite passes locally against a scratch Postgres, tenant-default ratchet included.]**

Phase 2 — Read-only week grid. `/admin/calendar` + nav entry rendering meetings, existing task blocks, open time, now line, freshness chip; prefs card in Settings; `computeOpenBlocks` takes prefs. No block writes yet.
Commit: `BloomOS calendar: week grid read view + working-hours prefs (Phase 2)`

Phase 3 — Blocks live. `work-blocks.ts` service + routes + grid create/move/resize/delete + Google mirror + flow-back + backfill of single-task blocks.
Commit: `BloomOS calendar: draggable work blocks synced to Google (Phase 3)`
**[2026-09-02: Phases 2–3 SHIPPED as one commit (`week grid read view + block write engine`) — with zero existing blocks, the read-only slice alone had no standalone value, and the server engine is the reviewable unit. Deviations, deliberate: Google sync is best-effort (a user without a connection gets a local block flagged "not on Google yet" instead of the old hard 409 — Shannon can block time before ever connecting); no backfill shipped (nothing to backfill, see Phase 0); the summary strip and the owner switcher landed here rather than Phase 5, since the week-view assembler computes both anyway.]**

Phase 4 — Fill the block. Panel with checklist (completion through the existing task PATCH), sorted/filtered picker, one-home move semantics, `planned_day` stamping; `WeekPlanner` ScheduleCell rerouted through the new service.
Commit: `BloomOS calendar: fill-the-block task checklist + picker (Phase 4)`

Phase 5 — Manager view. Owner switcher, read-only rendering of a report's week, `week-summary.ts` + summary strip on every grid.
Commit: `BloomOS calendar: manager week view + time summary (Phase 5)`

Phase 6 — Rhythm wiring. Monday Days step links to the grid and uses prefs-based open hours; Friday verdict gains block accounting; carryover picks up unfinished block tasks.
Commit: `BloomOS calendar: weekly rhythm integration (Phase 6)`
**[2026-09-02: Phases 4–6 SHIPPED as one commit (`draggable blocks, fill-the-block, rhythm wiring`). The block sheet is a right-side panel (grid stays visible while filling); sort pills are Smart / Priority / Due with search + a project filter; on-block mini-checkboxes complete tasks in place. Weekends were counted as open time in the first cut — fixed: open-time math and gap affordances are Mon–Fri only, matching the planner. WeekPlanner's ScheduleCell was NOT rerouted — the legacy one-task path still works and now succeeds (the CHECK fix), so retiring it is follow-up cleanup, not a blocker. Carryover already picks up unfinished block tasks via `planned_week`, no extra wiring needed. Verified end-to-end in the running app against a Supabase mock (per `.claude/skills/verify`): login, grid render, panel, drag-create all exercised with screenshots.]**

## 8. Definition of done

* `/admin/calendar` shows a real Mon–Sun time grid of the signed-in user's meetings, work blocks, and open time within their own working hours, with a now line and the standard freshness chip.
* Drawing a block on the grid creates exactly one Google Calendar event on the owner's connected calendar; moving/resizing/deleting in either direction converges within one sync cycle; deleting never deletes a task.
* A block's checklist completes tasks through the same path as `/admin/ops` — `completed_at` set, recurrence spawned, every other surface consistent — and a completed task remains on its block.
* The picker surfaces open tasks sorted planned-week → pinned → priority → due by default, filterable by priority, project, category, and due window; a task placed on a second block moves rather than duplicates.
* A manager (via `staff.reports_to`) and a delegate (via `agenda_delegations`) can open a report's/grantor's week read-only, including block contents and the summary strip; a peer with neither relationship cannot, and nobody crosses an org. The RLS leak test proves all three.
* Working-hours prefs change the grid extent and the open-block computation for that user only.
* Friday's verdict includes blocked hours and block-task completion; Monday's open-hours figure comes from prefs.
* `npm run build`, `npm test`, and the RLS workflow pass; new pure logic (`week-summary`, lane layout, open-blocks with prefs) has vitest coverage.

## 9. Failure modes to watch for

* **Echo loops.** A block patch → Google webhook → sync → mirror update must not re-patch Google. The existing echo prevention in `calendar-sync.ts` handles task blocks; the block flow-back must go through the same gate, and Phase 3 tests the round trip.
* **The org_id default trap.** None of the three new tables gets a default `org_id`. Service-role readers always `.eq("org_id", orgId)` even where RLS also applies.
* **Delegation/manager leak.** The manager arm must join through `staff` rows in the *same org* and must never grant write. The leak test is the gate, not code review.
* **Two truths for "when."** Once a task is on a block, the block's day is authoritative for `planned_day`; direct `planned_day` edits on a blocked task (from the planner) must either move the block or detach the task — never silently disagree. Decide in Phase 4 and enforce in the PATCH route.
* **DST and the LA day.** All day↔instant conversion stays in `dayStartInstant`/`laDateOf`. No `new Date(day + "T09:00")` anywhere near this feature.
* **Grid SSR clock.** Week anchor and now line resolve client-side against ORG_TZ; the server must not bake its own clock into the first paint.
* **Second-tenant survival.** No handle, name, or AA category hardcoded; the owner switcher, manager arm, and prefs all derive from data.
* **Backfill duplication.** Re-running the backfill must be idempotent (keyed on `calendar_event_id`), per the migrations test's spirit.
* **Sync staleness masquerading as truth.** A manager reading a report's week at 4pm off a 3-hour-old sync draws wrong conclusions; the freshness chip and on-demand refresh must be on every grid, not just one's own.

## 10. Open decisions

1. **One home per task** — `unique (task_id)` means a task can't sit on today's block and next Tuesday's. Recommendation: keep it; the move-not-copy semantic is simpler and matches how the planner already thinks (`unique(task_id, week_start)` proved this shape in the reference build). Revisit only if real usage begs for multi-placement.
2. **Manager depth.** Direct reports only, or the transitive chain? Recommendation: direct only. The chain invites the CEO-sees-everyone panopticon by accident; a skip-level can be granted explicitly via `agenda_delegations`.
3. **WeekPlanner Days step: link or embed?** Recommendation: link in Phase 6, consider embedding (or replacing the day cards) in a rhythm-spec amendment once the grid is proven daily-driver quality.
4. **Google event body for blocks.** Mirror the task list into the event description so it's visible on a phone? Recommendation: title + task count only ("Work block · 4 tasks"), no task titles — descriptions drift instantly as tasks complete, and patching Google on every checkbox is sync noise. The phone shows the shape; BloomOS shows the contents.
5. **Does a manager see task detail or just titles?** Recommendation: title, priority, due, done-state — the coaching conversation needs that much; task description/notes stay out of the manager read in v1.
6. **Block colors/kinds.** A `kind` enum (deep work / admin / comms) with per-user colors, à la the reference build's block types? Recommendation: defer; title is enough until someone asks, and the status-color rule limits the palette anyway.

## 11. Phase 0 kickoff prompt (historical — recon is done, findings in §12)

> Run Phase 0 recon for `specs/bloomos-calendar-time-blocking.md` against the live Supabase project. Report, with evidence: (1) the actual CHECK constraint on `calendar_events.source` and whether any rows carry `'bloomos'`; (2) all `ops_tasks` rows with non-null `calendar_event_id` (count + sample) for backfill sizing; (3) full contents of `agenda_delegations`; (4) which `staff` rows have `user_id` set and what `reports_to` edges exist — can the manager arm work today for anyone; (5) the Google OAuth scopes on active `connections` rows; (6) every caller of `computeOpenBlocks` and of `scheduleTaskBlock`/`moveTaskBlock`/`unscheduleTaskBlock`; (7) any schema drift on `ops_tasks`/`calendar_events` versus the committed migrations. Append findings to the spec under "Phase 0 recon findings" and flag anything that changes the phase plan. No code changes.

## 12. Phase 0 recon findings (2026-09-02, live project kzzdtibbwsucloaoqpqa)

1. **`calendar_events.source` CHECK was still `('google','booking')`** and zero rows carried `'bloomos'` — meaning every mirror write from `scheduleTaskBlock` since Agenda Phase 4 has failed the constraint. The "adjacent landmine" was live. Phase 1 widened it; the legacy path works again as a side effect.
2. **Zero `ops_tasks` rows had `calendar_event_id` set** (consequence of #1) — the planned backfill is a no-op and was dropped.
3. **`agenda_delegations`** holds exactly the AA seed (Remi → Shannon).
4. **`staff.reports_to` is real in both orgs**: AA has Shannon → Remi; the second tenant has a full org chart (five reports_to edges), all rows with `user_id` set — the manager arm lights up with live data on day one, in both tenants.
5. **Google connections**: Remi's AA calendar is the primary; a second user carries a stack of non-AA personal/family calendars (entity-bleed adjacency — untouched by this feature, `is_primary` selection already isolates it, but worth eyes on a future pass).
6. **`private` helpers** available: `has_permission`, `is_org_member`, `shares_org` — `manages_user(p_owner, p_org)` joined them, `security definer stable, search_path = ''`, matching house style.
7. **The RLS scratch harness (`scripts/test-rls.sh`) excludes `bloomos_staff_phase1..4.sql`** (their seeds FK the real AA org id). Consequences folded in: `manages_user` returns false when `public.staff` doesn't exist (`to_regclass` guard), and the leak test creates a minimal staff fixture to exercise the manager arm.
8. **`npm run build` needs env** (`UNSUBSCRIBE_SECRET`, Stripe, Supabase publics) for pre-existing routes at page-data collection — CI gates on typecheck + lint + tests; the build runs green with those set (verified against the mock).
