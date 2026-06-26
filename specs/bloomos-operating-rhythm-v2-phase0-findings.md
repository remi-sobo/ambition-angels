# Phase 0 recon findings — Operating Rhythm v2 ("My Week")

Read-only recon per `specs/bloomos-operating-rhythm-v2.md` §11. No code, migrations, or edits made.
Date: 2026-06-26. Branch: `claude/operating-rhythm-v2-spec-7vt7nk`.

**Verdict up front: the spec is materially out of date. Three of its load-bearing premises are
false — the Monday/Friday flow already exists and is in the nav, the Google Calendar *write* path is
already built and wired into the Monday UI, and the accept-suggested-task path already exists fully
server-guarded.** What the spec frames as a ground-up build (Phases 3–9) is, in large part, already
shipped. The genuinely-new work is narrower: the `rhythm_sessions` artifact, the unifying **hub +
time-aware summon card**, the **deterministic role-weighted verdict line**, a real **identity
resolver**, and the **carryover / meeting-recap / nudge** steps as guided ritual rather than the
loose surfaces that exist today. Two adjacent landmines surfaced that the spec doesn't mention: a
live `org_id` **default** on `ops_tasks`, and a `calendar_events.source` **CHECK-constraint mismatch**
against the `'bloomos'` value the deployed write code already writes. Details below; recommended spec
changes in §9.

A note on confidence: the four recon agents disagreed on two points (does a calendar write path
exist; does `ops_tasks` have `org_id`/RLS). I resolved both by reading the files directly — findings
below reflect the verified state, and I flag where an agent was wrong so the error doesn't propagate.

---

## 1. ops_tasks usage — the planning fields are ALREADY in active use

**Contradicts the spec's central premise.** The spec says "the Monday flow does not exist… exactly
one task has a `planned_week` set." That was true when the spec was drafted; it is not true now.

### 1a. Two full weekly-planning pages exist and are in the sidebar

- **Monday Plan** — `app/admin/ops/monday/page.tsx` + `app/admin/ops/monday/WeekPlanner.tsx`.
  Sections: "From last week" (carryover), "This Week, by day" (`WeekPlanner` — 7-day board with
  read-only calendar context, day placement, day-order reordering, and a "+ time" button that already
  calls the calendar-block write path), "Candidates for this week" (unpinned tasks, neglected
  projects, counterpart's pinned tasks). Linked at `Sidebar.tsx:39` as **"Monday Plan"**.
- **Friday Review** — `app/admin/ops/friday/page.tsx`. Sections: "The week, day by day"
  (`planned_week = thisMonday()`), "Still open — roll forward" (mark done / push to next week / unpin),
  "Slipped categories". Linked at `Sidebar.tsx:40` as **"Friday Review"**.

So the spec's Phases 3, 4, 5, and 8 are substantially built, just not unified under a hub and missing
specific steps (verdict, area-walk-with-initiative, meeting prep/recap, nudges, session artifact).

### 1b. Planning-field reads/writes (verified)

All writes route through one PATCH handler — `app/api/admin/ops/tasks/[id]/route.ts`:

- `planned_week`: set explicitly (`:175-179`); auto-set to `thisMonday()` when `pinned_for_this_week`
  flips true (`:189`); auto-set to `mondayOf(planned_day)` when a day is placed (`:203`); Friday
  "push to next week" writes `nextMonday()` (`app/admin/ops/friday/page.tsx:144`).
- `planned_day` + `day_order`: set in the same handler (`:195-227`), with `day_order` auto-incremented
  to max+1 on a new placement; drag-to-day and reorder in `WeekPlanner.tsx:152-200`.
- `pinned_for_this_week`: PATCH `:169`, with the `planned_week` sync above; "carry to this week" at
  `monday/page.tsx:270`.
- `pinned_for_today`: writable (`:168`) but **no UI reads it yet** — the "Today" surface isn't built.

### 1c. Status transitions + archive

- `todo → done`: handler sets/clears `completed_at` (`route.ts:138-142`); "mark done" buttons in both
  pages and the WeekPlanner.
- `archived_at`: column from `add_ops_tasks_archived_at.sql`; PATCH accepts it (`route.ts:162-167`);
  active surfaces filter `archived_at IS NULL` (partial index `ops_tasks_active_idx`). **No "drop /
  archive" button exists in the UI yet** — the spec's carryover "drop (archive)" action needs wiring,
  but the column + filter are ready.

### 1d. Week math is ALREADY centralized — do not build a new helper

**Contradicts the spec's failure-mode worry ("centralize `weekStart`").** It is already centralized
in `lib/admin/ops/week.ts`: `thisMonday()`, `mondayOf(dateISO)`, `nextMonday()`, `lastMonday()`,
`addDays()`, `weekDays(mondayISO)`, `laDateOf(instant)`, `dayStartInstant(dateISO)`, `todayInTZ()`,
and `ORG_TZ = "America/Los_Angeles"`. Every consumer imports from here (`monday/page.tsx`,
`friday/page.tsx`, `ops/tasks/[id]/route.ts`, `lib/agenda/calendar-sync.ts`, `lib/agenda/task-blocks.ts`).
No inline week math found. **Reuse `week.ts` verbatim; the spec's `weekStart(date)` already exists as
`mondayOf`.**

---

## 2. Identity resolution — the wrinkle is real, no resolver exists

- **Role**: `getOrgContext()` (`lib/admin/auth.ts:28-51`) → `auth.getUser()` then first `memberships`
  row → `{ userId, email, orgId, role }`, role typed `owner|admin|staff|finance|board_viewer`.
- **Legacy handle**: `getAdminUser()` (`lib/admin/auth.ts:57-62`) derives `"remi" | "shannon"` from the
  email local-part. Its own comment says this is display-compat that "will be replaced by real user
  references."
- **"Mine" filter today**: the Monday/Friday pages read an `admin_user` **cookie** via
  `readCurrentUser()` (`monday/page.tsx:39-40`) and filter
  `assigned_to.eq.${currentUser},assigned_to.is.null` (`monday/page.tsx:62`). Cookie-driven, only
  validates the value is literally `"remi"`/`"shannon"`.
- **No `auth.uid() → handle` resolver exists.** The spec's `resolveUserHandle()` recommendation stands
  and is the right fix — route every "mine" filter through it and retire the cookie. This is real,
  net-new work and a prerequisite for the ritual being trustworthy per-user.

---

## 3. Calendar — the WRITE path already exists and is wired into the UI

**This is the biggest divergence. The spec dedicates Phases 6–7 to building calendar write-back; it is
already built and deployed.** (Recon agent "ops_tasks" wrongly reported "no Google write exists
anywhere"; recon agent "calendar" was correct. I verified by reading the files.)

### 3a. Read path (reusable)

- `getAgenda(range)` — `lib/agenda/service.ts:58-123`. Session client, RLS-scoped. Returns
  `AgendaItem[]` with `owner_user_id` per row.
- Delegation: `getVisibleOwners()` — `lib/agenda/service.ts:44-56` reads `agenda_delegations` where
  `grantee_user_id = auth.uid()` (seeded Remi → Shannon). RLS on `calendar_events` gates to own +
  delegated. **Reuse `getAgenda` for the day walk.**

### 3b. Write path (already implemented + wired)

- **`lib/agenda/task-blocks.ts`** (verified, full read):
  - `scheduleTaskBlock()` `:78-123` → `cal.events.insert()` with
    `extendedProperties.private.bloomos_task_id`, then upserts a `calendar_events` mirror
    (`source:'bloomos'`, `onConflict:'owner_user_id,google_event_id'`) and stamps
    `ops_tasks.calendar_event_id` + `planned_day` + `planned_week` + `pinned_for_this_week`.
  - `moveTaskBlock()` `:149-183` → `cal.events.patch()` + mirror + `planned_day` update.
  - `unscheduleTaskBlock()` `:186-214` → `cal.events.delete()` (idempotent on 404/410), clears
    `calendar_event_id` + `planned_day`, deletes the mirror.
  - Uses the **per-user** connection (`getActiveCalendarConnection` → `calendarClientFromRefreshToken`),
    not an env account.
- **API**: `app/api/admin/agenda/blocks/route.ts` — POST/PATCH/DELETE call the three functions.
- **UI**: `WeekPlanner.tsx` already exposes "+ time" / drag to schedule a block.
- **Round-trip identity** (`lib/agenda/calendar-sync.ts`): import maps `source:'bloomos'` when the
  event carries the `bloomos_task_id` extended property (`:80-101`); upsert keys on
  `(owner_user_id, google_event_id)` (`:206-215`); stale-delete only touches `source:'google'` rows
  (`:237-246`) with a 5-minute grace; a moved block flows `planned_day`/`planned_week` back to the task
  (`:217-228`). **Echo prevention, de-dup, and flow-back are all present.**

**Net:** spec Phases 6 and 7 are ~80% done. The remaining gaps are (a) conflict/overlap flagging on
the grid ("meeting lands on a block"), (b) the explicit re-consent dead-end UX, and (c) wiring these
existing functions into the *new wizard* rather than the standalone WeekPlanner.

### 3c. OAuth scope — already read/write; the spec's "read-only grant, re-consent needed" is wrong for AA

- There is **no in-app OAuth consent flow** (no `generateAuthUrl`/code-exchange callback anywhere).
  `app/api/admin/agenda/connect-google/route.ts` merely **adopts an existing refresh token** — the env
  `GOOGLE_REFRESH_TOKEN` or one supplied in the request body — and stores it encrypted on
  `connections` (`upsertGoogleCalendarConnection`).
- Per `.env.example:60-69`, that token is consented with the **`calendar`** scope (full read/write) +
  `gmail.send`. The deployed write path uses the **same** `conn.refreshToken` as reads — proof the
  grant is already read/write. **AA needs no scope upgrade or re-consent.**
- **The real gap the spec mislabels:** there is no *self-serve* OAuth consent UI. A second tenant can't
  click "Connect Google" and grant calendar write — they'd need an out-of-band token. So "Phase 6:
  re-consent for scope upgrade" should become "build a proper OAuth consent/callback flow for tenant
  onboarding" — a different, smaller, tenant-two problem, not an AA blocker.
- Tokens: `connections.refresh_token_enc` is AES-256-GCM (`lib/crypto/secret-box.ts`,
  key `BLOOMOS_TOKEN_ENC_KEY`); `calendarClientFromRefreshToken` (`lib/google/connection.ts:194-201`)
  lets the googleapis client auto-refresh the access token per call. No manual refresh helper needed.

### 3d. `source='bloomos'` vs the CHECK constraint — a real schema/code mismatch (NEW, flag it)

`calendar_events.source` is declared `not null default 'google' check (source in ('google','booking'))`
(`create_agenda_delegations_and_calendar_events.sql:85`). **No migration ever adds `'bloomos'` to that
constraint** (grepped all migrations). Yet `task-blocks.ts:65` and `calendar-sync.ts` both write
`source:'bloomos'`. Either an out-of-band `ALTER` was applied to the live DB and never captured in a
migration, or the block-write path has never actually executed against this schema. Recon can't tell
which without DB access. **This isn't Operating-Rhythm work, but the ritual leans on `source='bloomos'`
to render BloomOS blocks; verify the live constraint and capture the fix in a migration before relying
on it.**

---

## 4. Meetings — the accept-suggestion path ALREADY exists, fully guarded

**Contradicts the spec's Phase 9 framing ("accept inserts linked task, server-guarded" as new work).**

- Surfaces: `app/admin/meetings/page.tsx` (list, grouped by follow-up status),
  `app/admin/meetings/[id]/` (detail + `MeetingDetailClient.tsx`, which already renders suggested
  tasks and a follow-up-status selector). Read helper: `lib/meetings/read.ts` (`getMeetingDetail`).
- **Accept/dismiss**: `app/api/admin/meetings/[id]/suggestions/route.ts` —
  - accept creates an `ops_task` with `meeting_record_id` set (`:76`), CRM link fields (`:77-79`);
  - flips the suggestion to `'accepted'` server-side (`:86-89`);
  - **idempotent double-accept guard** (`:48-49`, returns `alreadyAccepted`);
  - auto-sets the meeting's `follow_up_status = 'has_follow_up'` (`:90-94`);
  - dismiss path at `:39-45`.
- `follow_up_status` is also settable directly via `PATCH app/api/admin/meetings/[id]/route.ts:40-54`.
  Enum: `needs_follow_up` (default) | `has_follow_up` | `none_needed` | `dismissed`
  (`create_meeting_records.sql:19`). Coverage/gap counting reads it in `lib/meetings/coverage.ts:25`.

**Net:** the Friday "recap the meetings" step can **call the existing accept/dismiss route directly**.
What's missing is only the *ritual framing*: list this-week `needs_follow_up` meetings inside the
wizard and "mark done" at the end. Note a vocabulary mismatch: the spec says recap sets the meeting to
`'done'`, but the live enum has no `'done'` — it uses `has_follow_up` / `none_needed`. Align the spec
to the existing enum rather than adding a value.

---

## 5. Light-nudge sources — `fr_touches` is empty; the live nudge reads `opportunities`

- **`fr_touches` is a legacy placeholder, currently empty** (noted in `lib/admin/rail/needs-you.ts`).
  The actual "needs you" fundraising nudge reads `opportunities.next_step` / `next_step_due`:
  `getNeedsYou()` (`lib/admin/rail/needs-you.ts:75-139`) surfaces overdue tasks (`:80-91`) and the next
  overdue fundraising move (`:92-104`), linking to `/admin/fundraising/today`. **The spec's "overdue
  `fr_touches`" source is stale** — either point Friday's nudge at `getNeedsYou()` (recommended, it's
  built and org-scoped) or commit to populating `fr_touches` first.
- **`plan_kpis` staleness**: no dedicated staleness query exists. `kpiHealth()`
  (`lib/admin/plan/metrics.ts:139-151`) computes `on_track|at_risk|behind|not_started` from
  current-vs-target/pacing; freshness would be a simple `last_updated_at` age check in the UI layer.
  The "Metrics Library" is **not a page** — it's the API route `app/api/admin/plan/kpis/metrics/route.ts`
  + the `PLAN_METRIC_META` registry (`metrics.ts:229-276`). Link the Friday nudge there, or build the
  page; the spec's "link to the Metrics Library" assumes a page that doesn't exist yet.

---

## 6. Strategy tie-in — a reusable project→initiative read exists

- Project → initiative resolution: `app/admin/ops/projects/[id]/page.tsx:22-57` builds
  `InitiativeOption { id, label: "Goal · Initiative" }` by joining `plan_initiatives` + `plan_goals`.
- A heavier rollup (tasks done/total per initiative) lives at
  `app/admin/strategic-plan/page.tsx:71-107` (`InitiativeRollup`). **Reuse the `[id]/page.tsx` pattern
  for the area-walk's quiet "serves initiative X" line.**

---

## 7. RLS + multi-tenant — confirmed, with the `org_id` default trap LIVE on ops_tasks

(Recon agent "RLS" read only the base `create_ops_projects_and_tasks.sql` and wrongly concluded
`ops_tasks` has no `org_id` and no RLS. Later migrations add both — verified.)

- **`org_id` on `ops_tasks`/`ops_projects`**: added by `add_org_id_to_tenant_tables.sql`, which for
  ~30 tenant tables (incl. `ops_tasks`, `ops_projects`) does
  `alter column org_id set default '<AA org id>'`. **The org_id default trap the spec warns about is
  live on the very tables this feature reads/writes.** Only `households` had its default removed
  (`drop_households_org_id_default.sql`). App routes set `org_id` from `getOrgContext().orgId`, so the
  default is normally overridden — but it remains a latent tenant-two hazard. **The spec is correct:
  `rhythm_sessions.org_id` must have NO default and be set from session context.**
- **RLS**: `enable_rls_per_domain.sql` maps `ops_tasks`/`ops_projects` (and `meeting_types`,
  `bookings`, `blackouts`) to the `'ops'` domain and generates read/write policies on
  `has_permission(org_id, 'ops.read' | 'ops.write')`. Confirmed pattern for the spec.
- **`has_permission`**: `private.has_permission(p_org uuid, p_perm text)`
  (`create_bloomos_core.sql:71-84`) and a public RPC shim `public.has_permission`
  (`create_reed_schema.sql:28-40`, `execute` granted to `authenticated`, revoked from `anon`).
  House RLS idiom wraps the call as `(select private.has_permission(...))` (initplan caching) with
  `for <op> to authenticated`. **Minor spec correction:** the spec says "use `public`" for the RLS
  policies — but existing RLS policies call **`private.`**; `public.` is only for app-code RPC. Match
  the house idiom: RLS → `private.has_permission`, any app-layer check → `public.has_permission`.
- `getOrgContext()` (`lib/admin/auth.ts:28-51`) is the canonical session→org/role resolver; reuse it
  to stamp `rhythm_sessions.org_id`.

---

## 8. Nav + component primitives

- **Sidebar**: static `NAV_SECTIONS` array in `app/admin/_components/Sidebar.tsx` (items
  `{ label, icon, href, soon? }`, longest-prefix active match). "Tasks / Monday Plan / Friday Review /
  Projects / Meetings" already live in the Operations section (`:38-42`). Add **"My Week"** here
  (new `IconName` + `ICON_NODES` entry + `NavItem`). Open question: do "Monday Plan" / "Friday Review"
  stay as deep links, or collapse into the hub? (See §9.)
- **Command Center**: no ranking/trigger engine — cards are **statically composed** in
  `app/admin/_components/overview/CeoCockpit.tsx` and `OpsPanel.tsx` (Ops uses an `OpsBoard` widget
  array with localStorage reordering). The time-aware "summon" card must be a new statically-placed
  widget that reads the day via `todayInTZ()` and routes to Plan (Mon–Wed) / Close (Thu–Sun). No engine
  to register into.
- **Stepper/wizard**: **no shared primitive**, but three bespoke wizards exist to model `RhythmWizard`
  on — `app/admin/finance/close/_components/CloseWizard.tsx` (closest analog: a periodic "close"
  ritual), `app/admin/strategic-plan/setup/_components/SetupWizard.tsx`,
  `app/admin/fundraising/import/_components/ImportWizard.tsx`. Build `RhythmWizard` new (one stepper,
  `mode: 'monday_plan' | 'friday_close'` config), using `CloseWizard` as the structural reference.

---

## 9. Where the code diverges from the spec — and recommended spec changes

**A. Reframe from "build the ritual" to "unify + complete what exists."** Monday Plan, Friday Review,
the planning-field read/writes, centralized week math, the calendar write path, and the meeting-accept
path are all built. Rewrite Phases 3–9 as: (1) wrap the existing surfaces in the hub + `RhythmWizard`;
(2) add the genuinely-missing steps — verdict line, area-walk initiative read, carryover *drop*,
meeting prep (Monday) and recap *framing* (Friday), nudges, and the `rhythm_sessions` artifact.

**B. Drop Phase 6 as written.** AA's grant is already `calendar` read/write and the write client
exists. Replace it with a smaller, tenant-two-scoped item: "self-serve Google OAuth consent/callback
flow" (today `connect-google` only adopts an env/supplied token; there's no `generateAuthUrl`). Keep
the re-consent **dead-end UX** (detect `NoCalendarConnection` / insufficient scope and route to a
connect prompt) as a small task, since `task-blocks.ts` already throws `NoCalendarConnection`.

**C. Phase 7 is mostly done.** Reduce it to: wire the existing `scheduleTaskBlock` / `moveTaskBlock` /
`unscheduleTaskBlock` into the new wizard's day walk, plus the missing **overlap/conflict flag** on the
grid (the "meeting lands on a block" failure mode is not handled today).

**D. Phase 9 is mostly done.** Reduce it to ritual framing over the existing
`/api/admin/meetings/[id]/suggestions` route. **Fix the spec's meeting vocabulary**: there is no
`follow_up_status='done'`; use the live enum (`has_follow_up` / `none_needed`).

**E. Phase 10 nudges: repoint the sources.** `fr_touches` is empty; use `getNeedsYou()`
(`opportunities`-based) or populate `fr_touches` first. The "Metrics Library" is an API route + meta
registry, not a page — link there or build the page.

**F. Keep the spec's `org_id`-no-default rule — it's even more warranted than stated.** The AA-org
default is live on `ops_tasks`/`ops_projects` themselves. `rhythm_sessions.org_id` must have no default;
stamp from `getOrgContext()`. (Optional, out of scope: a follow-up to drop the stray defaults from the
other tenant tables, mirroring `drop_households_org_id_default.sql`.)

**G. Correct two RLS details:** RLS policies call `private.has_permission` (not `public`); and reuse
`lib/admin/ops/week.ts` (`mondayOf` == the spec's `weekStart`) rather than building a new helper.

**H. New, unflagged: the `calendar_events.source` CHECK-constraint mismatch (§3d).** Verify the live
constraint actually permits `'bloomos'` and capture it in a migration before the ritual depends on
BloomOS-block rendering.

---

## Architecture match — yes/no

**Partial.** The schema, RLS idiom, week math, calendar read **and write** subsystems, meeting-accept
path, and strategy-read all match (and several exceed) the spec's assumptions — but the spec
under-counts what's already shipped and mis-states the calendar scope/consent situation. The
`rhythm_sessions` table, the hub + summon card, the deterministic role-weighted verdict, the
`resolveUserHandle()` identity fix, and the carryover-drop / meeting-recap-framing / nudge steps are
the real net-new surface.

**Recommendation:** before Phase 1, get Remi to rule on (1) the reframing in §9-A (unify vs rebuild)
and the fate of the standalone Monday Plan / Friday Review nav items (§8), (2) whether the
calendar-scope reframe in §9-B is accepted (it removes a whole phase), and (3) the `source`-constraint
verification in §3d/§9-H (needs a quick look at the live DB). §9-C/D/E/F/G are spec edits to fold in.
Then proceed to Phase 1 (`rhythm_sessions` + RLS, no `org_id` default). Stopping here per the recon
brief; awaiting approval.
