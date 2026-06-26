# Recon: planning + task layer (keystone = week-aware tasks)

**Mode:** read-and-report only. No code, migrations, or mutations were made.
**Date:** 2026-06-26 · **Repo:** `remi-sobo/ambition-angels` · **Supabase project:** `kzzdtibbwsucloaoqpqa`
**Branch:** `claude/meetings-calendar-sync-recon-xzp7pj`
**Scope:** `ops_tasks`, `ops_projects`; pages `/admin/ops`, `/admin/ops/monday`, `/admin/ops/friday`; CEO cockpit task widget.

> **Headline for the migration designer.** The two pins are `boolean not null default false` with **no date/week anchor and no rollover code** — confirmed exhaustively below. **"Push to next week" is a near no-op**: it writes `pinned_for_this_week: true` to a task the query already filtered as `pinned_for_this_week = true`, so it changes nothing but `updated_at`. **"This week" is computed in server-local (= UTC on Vercel) time**, anchored on Monday, in *page code* (duplicated, inlined in two files), never in the DB. And **every planning read/write runs on the service-role client** (`getSupabaseAdmin`), gated only by `isAuthed()` — RLS is not in play, and "read-only" is a client-only prop. A `planned_week` column is greenfield (no collision), but it must be fed by writes that today don't even pass `org_id`.

---

## A. Week definition

### Where "this week" is computed

**Inlined in the page files, duplicated, not a shared helper.** Both Monday and Friday define their own `thisMonday()`:

```ts
// app/admin/ops/monday/page.tsx:19-25  (identical copy in friday/page.tsx:19-25)
function thisMonday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();                 // 0=Sun … 6=Sat
  d.setDate(d.getDate() - ((dow + 6) % 7)); // back up to Monday
  return d;
}
function lastMonday(): Date { const d = thisMonday(); d.setDate(d.getDate() - 7); return d; } // monday:26-30
```
The week **anchors on Monday** (`(dow + 6) % 7` maps Mon→0 … Sun→6, subtracting that many days). The "Week of Jun 22" header is `monday.toLocaleDateString("en-US", {month, day, year})` (`monday/page.tsx:31-37, 210`). There is **no `startOfWeek`/`weekStart` helper in `lib/`** — grep finds none; the only related shared helper is `todayISO()` in `_types/ops.ts:218-226`.

### Timezone of the boundary

**Server-local time, which is UTC on Vercel.** `new Date()` + `setHours(0,0,0,0)` + `getDay()` all operate in the server process timezone; `mondayISO = thisMonday().toISOString()` (`monday/page.tsx:65`) then serializes that local-midnight Monday to UTC. `todayISO()` says so explicitly:
```ts
// app/admin/ops/_types/ops.ts:218-220
// Server-local YYYY-MM-DD. Acceptable for v1 — admin users are all in
// the same broad timezone band.
```
This is **inconsistent with the Agenda layer**, which uses a hardcoded `America/Los_Angeles` (`lib/agenda/service.ts:36`). ⚠️ On Vercel (UTC), Sunday afternoon/evening Pacific is already Monday UTC, so the week silently rolls forward ~Sun 4–5pm PT. The queries that compare `updated_at`/`completed_at` against `mondayISO` (a UTC instant) inherit this skew.

### ✅ VERDICT A

`planned_week` should store a **`date`** holding the **Monday of the planned week**. To match *existing* query behavior exactly, compute it the same way `thisMonday()` does (server/UTC) and store that Monday's calendar date. ⚠️ But that bakes in the UTC-vs-Pacific skew above — if you want it correct for AA, anchor the Monday computation in `America/Los_Angeles` and update `thisMonday()`/`todayISO()` to match, otherwise the new `planned_week` and the old `updated_at >= mondayISO` filters will disagree by a few hours each weekend. **Name `planned_week` does not collide** with any existing column (see §F).

---

## B. The two pin booleans: every read and write site

Schema: both are `boolean not null default false`, each with a partial index where true (`create_ops_projects_and_tasks.sql:95-96, 112-114`). Type: `OpsTask.pinned_for_today` / `pinned_for_this_week` (`_types/ops.ts:78-79`).

### `pinned_for_today` — blast radius

**Writes (7 sites):**
| Site | Trigger | Sets |
|---|---|---|
| `app/api/admin/ops/tasks/route.ts:97` | POST create | `body.pinned_for_today === true` |
| `app/api/admin/ops/tasks/[id]/route.ts:166` | PATCH | `body.pinned_for_today === true` |
| `app/admin/_components/QuickAddModal.tsx:101` | "Quick add" create | from `pinToday` toggle |
| `app/admin/_components/TaskEditModal.tsx:136` | Edit modal save | from `pinToday` state (init `:57`) |
| `app/admin/ops/_components/TaskRow.tsx:233` | Hover-menu "Pin/Unpin from today" | `!task.pinned_for_today` (toggle) |
| `lib/admin/ops/ingest.ts:74` | MCP/ingest create | **defaults `true`** (`t.pin_today === undefined ? true : …`) |
| `app/api/admin/report/route.ts:140` | Bug/report intake → task | hardcoded `false` |

**Reads (6 sites):**
| Site | Use |
|---|---|
| `lib/admin/overview/sources.ts:640` (select) + `:660` (`pinnedToday` map) | CEO cockpit queue — feeds tier logic (§Secondary) |
| `app/admin/ops/page.tsx:49-56` | Ops landing "Pinned for today" slice |
| `app/api/admin/ops/tasks/route.ts:168-169` | GET `?pinned_for_today=true` filter |
| `app/admin/ops/_components/TaskRow.tsx:235` | Menu label (read current value) |
| `app/admin/_components/TaskEditModal.tsx:57` | Seed toggle state |
| `app/admin/ops/_components/TodayView.tsx:7` | Behavior comment (renders the slice from page.tsx) |

### `pinned_for_this_week` — blast radius

**Writes (7 distinct code sites):**
| Site | Trigger | Sets |
|---|---|---|
| `app/api/admin/ops/tasks/route.ts:98` | POST create | `=== true` |
| `app/api/admin/ops/tasks/[id]/route.ts:167` | PATCH | `=== true` |
| `app/admin/_components/QuickAddModal.tsx:102` | Quick add | from `pinWeek` |
| `app/admin/_components/TaskEditModal.tsx:137` | Edit save | from `pinWeek` (init `:58`) |
| `app/admin/ops/_components/TaskRow.tsx:239` | Hover-menu pin/unpin week | toggle |
| `app/admin/ops/monday/page.tsx:192,194,197,200` | Monday buttons: "Carry to this week"/"Pin for this week" → `true`; "Drop"/"Unpin" → `false` | via PATCH |
| `app/admin/ops/friday/page.tsx:117,118` | Friday buttons: "Push to next week" → `true`; "Unpin" → `false` | via PATCH |

**Reads (9 query points across 6 files):**
| Site | Use |
|---|---|
| `app/admin/ops/monday/page.tsx:83` | Section 1 "From last week": `pinned=true` AND `updated_at` in [lastMon, thisMon) |
| `app/admin/ops/monday/page.tsx:93` | Section 2 "This week": `pinned=true` |
| `app/admin/ops/monday/page.tsx:102` | Section 3a "Candidates": `pinned=false` |
| `app/admin/ops/monday/page.tsx:121` | Section 3c other person's pinned: `pinned=true` |
| `app/admin/ops/friday/page.tsx:63` | Section 2 "Still pinned, not done": `pinned=true` |
| `app/admin/ops/page.tsx:57-59` | Ops landing "This Week" slice |
| `app/api/admin/ops/tasks/route.ts:171-172` | GET `?pinned_for_this_week=true` filter |
| `app/admin/ops/_components/TaskRow.tsx:242` | Menu label |
| `app/admin/_components/TaskEditModal.tsx:58` + `ThisWeekView.tsx:5` | Seed state / behavior comment |

### Is `pinned_for_today` ever cleared?

**Only by manual action — never automatically.** Cleared by: PATCH with `false` (the unpin path used by TaskRow `:233`, TaskEditModal `:136`, QuickAddModal). It is **not** cleared on read, and **no cron clears it** (the brief's prior "no rollover/reset" finding is confirmed in §C). Proof it persists across day boundaries: the ops-landing read (`page.tsx:49-56`) filters `pinned_for_today` with no date predicate at all — a task pinned days ago still shows as "pinned for today" until someone unpins it.

### ⚠️ Collision/break risk

- A keystone that introduces `planned_week`/`planned_day` must decide each pin's fate. If `pinned_for_this_week` is **kept** alongside `planned_week`, every one of the 9 read points above keeps using the boolean and won't see the new column — they'd silently diverge. If it's **replaced/derived**, all 7 writes + 9 reads must change together, including the 3 modal/quick-add components and the GET query-param filters.
- `pinned_for_today` is set to `true` by **ingest default** (`ingest.ts:74`) — a backfill/migration that reasons about "today" must account for tasks auto-pinned by the MCP path.

---

## C. Friday Review "Push to next week"

### The handler

It's a declarative PATCH action, not a custom handler:
```ts
// app/admin/ops/friday/page.tsx:115-119
const stillPinnedActions: TaskRowAction[] = [
  { label: "Mark done",          variant: "primary", patch: { status: "done" } },
  { label: "Push to next week",  variant: "default", patch: { pinned_for_this_week: true } },  // ← :117
  { label: "Unpin",              variant: "ghost",   patch: { pinned_for_this_week: false } },
];
```
`TaskRowWithActions.applyPatch` simply `fetch(PATCH /api/admin/ops/tasks/[id], body=patch)` (`TaskRowWithActions.tsx:73-89`).

### What it writes today

**`{ pinned_for_this_week: true }` — on a task the Section-2 query already filtered to `pinned_for_this_week = true`** (`friday/page.tsx:60-66`). So the only observable DB effect is the PATCH bumping `updated_at` (the trigger/`now()`), since `pinned_for_this_week` is already `true`. It does **not** move the task to next week, set any date, or distinguish "next week" from "this week." There is **no `planned_week`/`scheduled_for` to advance** — nothing exists to write.

⚠️ Subtle secondary effect: bumping `updated_at` *to now* means that next Monday this task will **fail** the "From last week" slipped query, which requires `updated_at < thisMonday` (`monday/page.tsx:86-87`). So "Push to next week" today actively *hides* a task from next week's carry-forward surface — the opposite of its label.

### ✅ VERDICT C

**You are adding rollover from scratch, and simultaneously correcting a misleading button.** "Push to next week" writes nothing meaningful today (re-sets an already-true flag) and, via the `updated_at` bump, can even drop the task out of the Monday "From last week" view. The keystone should make this button advance `planned_week` to next Monday.

---

## D. Monday Plan candidate + "From last week" queries

### "Candidates … sorted by due date, then most-neglected first"

```ts
// app/admin/ops/monday/page.tsx:99-107  (Section 3a)
supabase.from("ops_tasks").select("*")
  .eq("pinned_for_this_week", false)
  .neq("status", "done")
  .or(`assigned_to.eq.${currentUser},assigned_to.is.null`)   // mineFilter :69
  .order("due_date", { ascending: true, nullsFirst: false }) // soonest due, undated last
  .order("updated_at", { ascending: true })                  // then least-recently-touched
  .limit(26);                                                 // 25 + 1 to detect "more"
```
**"Most-neglected" = `updated_at` ascending** (oldest touch first), applied as the secondary sort after due date. There's no separate score; neglect is literally staleness of `updated_at`.

### "From last week" carry-forward surface

```ts
// app/admin/ops/monday/page.tsx:80-88  (Section 1)
supabase.from("ops_tasks").select("*")
  .eq("pinned_for_this_week", true)
  .neq("status", "done")
  .or(mineFilter)
  .gte("updated_at", lastMondayISO)   // touched on/after last Monday
  .lt("updated_at", mondayISO)        // …but before this Monday
  .order("updated_at", { ascending: true });
```
It reads the **pin boolean** (`pinned_for_this_week=true`) and **`updated_at`** as the week proxy — **not `due_date`**, not any week column. "Last week" is inferred entirely from the `updated_at` window `[lastMonday, thisMonday)`. ⚠️ This is the fragile heart of the current pseudo-rollover: a task pinned three weeks ago but touched yesterday would *not* appear (its `updated_at` is after `lastMondayISO`… actually after `thisMondayISO`, so excluded); and any unrelated PATCH that bumps `updated_at` moves a task in/out of this surface. A real `planned_week` column would replace this `updated_at`-window heuristic.

### "Pin for this week" action on a candidate

```ts
// app/admin/ops/monday/page.tsx:199-201
const candidateActions: TaskRowAction[] = [
  { label: "Pin for this week", variant: "primary", patch: { pinned_for_this_week: true } },
];
```
Writes `pinned_for_this_week: true` (via the same PATCH path). No date/week is recorded.

---

## E. Client + permissions on planning writes

### Which Supabase client

**Service-role everywhere on this path.** All three surfaces and the write endpoints use `getSupabaseAdmin()`:
- `app/admin/ops/monday/page.tsx:3,61`, `app/admin/ops/friday/page.tsx:3,45`, `app/admin/ops/page.tsx:1,22` — reads.
- `app/api/admin/ops/tasks/route.ts:104` (create), `app/api/admin/ops/tasks/[id]/route.ts:73,212` (PATCH/DELETE) — writes.

So **RLS is bypassed** on every planning read and write. ⚠️ The brief's requirement — "rollover writes must be session-client so RLS applies" — is **not met today**; converting to the session client would be a behavior change (RLS policies on `ops_tasks` would suddenly apply; see `enable_rls_per_domain.sql` which touches `ops_tasks`). "Current user" is not the Supabase auth user at all — it's read from a **cookie** `admin_user` (`monday/page.tsx:43-46`, `friday/page.tsx:34-37`) or `getAdminUser()`.

### What gates task writes

**Only `isAuthed()`** — a session-exists check — on POST/PATCH/DELETE (`tasks/route.ts:39`, `tasks/[id]/route.ts:64,209`). There is **no per-task ownership/assignment check**: any authed admin can PATCH any task id, including someone else's.

The Friday/Monday "Shannon's pinned tasks — read-only" is **purely client-side presentation**: the page passes `readOnly` to `TaskRowWithActions`, which then renders no action buttons and a non-interactive title (`TaskRowWithActions.tsx:54,123-138,205`). The "(0)" count comes from the Section-3c query filtered to `assigned_to = otherPerson` (`monday/page.tsx:117-126`). ⚠️ Nothing server-side enforces read-only — a crafted PATCH to the other person's task id would succeed.

### ⚠️ Collision/break risk

Rollover that runs server-side (cron or a "roll forward" button) on the service-role client will write across **all** orgs unless it filters `org_id` itself (RLS won't save you). If instead you move planning to the session client to satisfy the brief, you take on RLS correctness for every read in §B/§D at once.

---

## F. Collision + existing-scheduling check

### Any scheduling/date column beyond `due_date`?

**No week/day/slot/schedule column exists.** Full `ops_tasks` shape (`_types/ops.ts:65-92`, schema `create_ops_projects_and_tasks.sql:78-114`): the only date-ish fields are `due_date` (date), `created_at`, `updated_at`, `completed_at`, `archived_at`. The only ordering field is `display_order integer` (nullable). Grep for `scheduled_for|scheduled_start|planned_week|planned_for|week_of|week_start|slot_` across `lib/app/supabase` → **NONE** on `ops_tasks`.

**The one calendar-adjacent column is `booking_id`** (`_types/ops.ts:86`; migration `add_booking_id_to_ops_tasks.sql`) — a nullable FK to a `/meet` **`bookings`** row (connection-backlog only), **not** a `calendar_events` link.

### Any in-flight migration adding week/day/schedule columns?

**NOT FOUND.** Every migration that touches `ops_tasks`:
`create_ops_projects_and_tasks.sql`, `upgrade_ops_tasks_priority_subtasks_labels.sql`, `add_ops_tasks_archived_at.sql`, `link_ops_tasks_to_entities.sql`, `add_booking_id_to_ops_tasks.sql`, `add_org_id_to_tenant_tables.sql`, `enable_rls_per_domain.sql`, `create_connection_candidates.sql` (references), `add_grant_id_to_ops_projects.sql` (projects). None adds a week/day/schedule column. So `planned_week`, `planned_day`, `scheduled_for`, `calendar_event_id` are all **free names with no collision**.

### Any `ops_tasks` ↔ `calendar_events` link?

**NOT FOUND.** No `calendar_event_id` (or any FK to `calendar_events`) on `ops_tasks`. The drag-task-into-a-calendar-block feature has no backing link today.

### ⚠️ The org_id default trap (relevant to all planning writes)

`add_org_id_to_tenant_tables.sql:38-44` adds `org_id` to `ops_tasks`, backfills to the AA org, sets `NOT NULL`, **and sets a hardcoded default to the AA org uuid**. The create route (`tasks/route.ts:86-102`) and PATCH (`tasks/[id]/route.ts`) **do not pass `org_id`** — they rely on that AA default. ⚠️ Confirmed: planning writes do **not** pass `org_id` from session; any server-side rollover must pass `org_id` explicitly (and filter by it) or it will stamp/scan only AA and silently misbehave for a second tenant.

---

## SECONDARY (consumers of the new model)

### CEO cockpit "most urgent tasks" widget

`getQueueTasks(assignee)` (`lib/admin/overview/sources.ts:635-674`, service-role) selects `assigned_to=assignee`, `status≠done`, `archived_at is null` (limit 40), then **JS-sorts** by a tiered comparator and slices to 12. The tiers (`queueTier`, `:604-609`):
```
0 overdue (due < today) · 1 due today OR pinnedToday · 2 priority urgent · 3 rest
```
within tier: soonest due (nulls last) → `priorityRank` → `updated_at` (`compareQueue` `:616-633`). **So "due today first, then urgent" and "pinned-for-today folded into the due-today tier" already live here at `sources.ts:604-633`** — and `pinnedToday` is read at `:640/:660`. Remi's note ("pinned for today needs the same filter applied") maps to this comparator: the keystone's week/today model should feed `queueTier` so the cockpit and the ops surfaces agree. Surfaced via `MyQueueWidget` (cockpit + ops panel).

### Create/update lib fn — required fields, display_order, linked_entity

- **Create** (`app/api/admin/ops/tasks/route.ts:38-109`): required **`title`** (`:52-55`) and **`category`** (`:56-58`, `isTaskCategory`); `created_by` from `getAdminUser()` (`:42`). `ingestTask` (`lib/admin/ops/ingest.ts`) is the MCP/ingest variant (defaults `assigned_to/created_by = shannon`, `pinned_for_today = true`).
- **`display_order`**: **not set on create** (absent from the insert at `:86-102`) → stays `null`. Only mutated via PATCH `display_order` (`tasks/[id]/route.ts:168-173`). Ops landing orders `display_order asc nullsFirst:false, then created_at` (`page.tsx:31-32`). ⚠️ **There is no per-day or per-week ordering** — `display_order` is a single global manual order; Monday/Friday ignore it entirely (they order by `due_date`/`updated_at`). A drag-to-reorder-within-a-day feature has no per-day order field today.
- **`linked_entity_*`**: set together at create (`:77-84, 99-101`), `linked_entity_type ∈ {partner,constituent}`, `linked_entity_id` a uuid, `linked_label` denormalized (≤200 chars). **The PATCH route does not accept `linked_entity_*` updates** — they're create-time only.

### org_id default on ops_tasks

Confirmed AA-hardcoded default (above). Planning writes pass **no** `org_id` → rely on the default. Keystone rollover writes should pass `org_id` from session/context.

---

## SUMMARY

1. **Week anchor + timezone → what should `planned_week` store?** A `date` = the **Monday** of the planned week. Existing code computes Monday in **server-local (UTC on Vercel)** time, inlined as `thisMonday()` in `monday/page.tsx:19-25` and `friday/page.tsx:19-25` (no shared helper). Match that to stay consistent with the `updated_at >= mondayISO` filters — but note it's UTC-skewed vs the Agenda layer's `America/Los_Angeles`; fixing the skew means changing `thisMonday()`/`todayISO()` too.
2. **Does "Push to next week" write anything real today? → NO.** It PATCHes `{ pinned_for_this_week: true }` onto a task already filtered as pinned (`friday/page.tsx:117`); only `updated_at` changes — and that bump actually *removes* the task from next Monday's "From last week" window. You're building rollover from scratch and fixing a misleading button.
3. **Blast radius of the two pins.** `pinned_for_today`: ~**7 write** sites / ~**6 read** sites. `pinned_for_this_week`: ~**7 write** sites / **9 read** query points across 6 files (4 of them in `monday/page.tsx` alone). Full table in §B.
4. **Session client or service-role on planning writes? → SERVICE-ROLE** (`getSupabaseAdmin`) on every read and write; gated only by `isAuthed()`; "current user" from an `admin_user` cookie; "read-only" is client-only. RLS is bypassed today — the brief's "must be session-client" requirement is unmet.
5. **Any existing scheduling/date column or `calendar_events` link on `ops_tasks`? → NO.** Only `due_date` (date) + `display_order` (global, nullable) + a `booking_id` FK to `/meet` `bookings` (not `calendar_events`). No `planned_week`/`scheduled_for`/`calendar_event_id`, and no in-flight migration adds one — all those names are collision-free. ⚠️ But `ops_tasks.org_id` has a hardcoded AA default and planning writes don't pass `org_id`.
