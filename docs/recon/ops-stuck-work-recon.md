# Recon: Stuck Work detection — Phase 0 findings

Spec: `specs/ops-stuck-work.md`. Recon only — no view, no component written.
Verified against the repo and the live DB (project `kzzdtibbwsucloaoqpqa`) on 2026-06-29.

## TL;DR for the architect

1. **The audit touch-count input is effectively empty.** `audit_log` carries
   `ops_task` rows, but the only action is `ops.task.ingest` (creation). Task
   *mutations* (PATCH, status changes, edits) are **never** audited. So
   `audit_touch_count` ≈ 1-per-task-at-birth, not a "reviewed repeatedly"
   signal. **The Phase 0 gate fails: `stuck` must ship on age + `roll_count`,
   not audit touches.** (Spec's stated failure mode #1.)
2. **RLS mismatch between the two tables the view wants to join.** `ops_tasks`
   is gated by `ops.read`/`ops.write`; `audit_log` is gated by `org.manage`. A
   `security_invoker` view joining both would demand *both* grants — Shannon
   (ops, likely no `org.manage`) would see the audit side RLS-denied. This
   reinforces #1: leave audit out of the v1 view.
3. **`roll_count` is already fully wired** — increment logic, both re-plan
   trigger paths, and a read surface. It's `0/160` only because no Friday/Monday
   roll has been *exercised* in prod yet, not because the path is missing. Spec
   build-item #6 is essentially done; re-scope it to "verify + surface," not
   "wire."

---

## 1. audit_log coverage for tasks

Query (spec's, adapted — the timestamp column is `ts`, not `created_at`):

```sql
select entity_type, action, count(*) from audit_log
where action ilike 'ops.task%' or entity_type ilike '%task%'
group by 1,2 order by 3 desc;
-- → ops_task | ops.task.ingest | 51   (the ONLY task row)
```

Join coverage:

```sql
select count(*) ingest_rows, count(distinct entity_id) distinct_ids,
       count(entity_id) filter (where t.id is not null) matched
from audit_log a left join ops_tasks t on t.id = a.entity_id
where a.entity_type='ops_task';
-- → 51 rows, 51 distinct ids, 50 matched (1 points at a since-deleted task)
```

- `entity_type` for tasks is the stable string **`ops_task`** (singular).
- Only action is **`ops.task.ingest`** — written from `lib/admin/ops/ingest.ts`.
- `entity_id` is a real `uuid` and joins cleanly to `ops_tasks.id` (50/51; the
  orphan is a deleted task — expected).
- Timestamp column is **`audit_log.ts`** (`timestamptz`). There is **no**
  `created_at` on `audit_log` — the spec's mental model used the wrong column.
- `audit_log` schema: `id, ts, org_id, actor_user_id, action, entity_type,
  entity_id, before, after, ip, user_agent, request_id`.

**The gap:** `app/api/admin/ops/tasks/[id]/route.ts` (PATCH/DELETE) and
`tasks/route.ts` (POST) do **not** call `audit()` (`lib/audit.ts`). Only the
ingest path audits. So status changes, re-plans, and edits leave no audit trail.
`days_since_last_touch` / `audit_touch_count` derived from `audit_log` would
measure "days since created," which `ops_tasks.created_at` already gives us for
free.

→ **Recommendation:** v1 `v_ops_task_health` computes health from
`ops_tasks` alone — `age_days` from `created_at`, staleness from `updated_at`
(present on the table, `timestamptz`), and `roll_count`. Drop the `audit_log`
join entirely for v1. If a real "reviewed-not-advanced" signal is wanted later,
the cheaper fix is to add `audit()` calls to the task PATCH route (a write path
the spec explicitly scoped *out* of v1), not to mine the current log.

## 2. Where task-open happens; any open/review event?

- `app/admin/ops/_components/TaskRow.tsx` — title button `onClick`
  (line ~144) sets local `editOpen` state → renders
  `app/admin/_components/TaskEditModal.tsx` (line ~262). Pure client state.
- `TaskEditModal` save = one `PATCH /api/admin/ops/tasks/[id]` with all
  editable fields; delete = `DELETE` same route.
- **No open/review event is emitted anywhere** — not to `click_events`, not to
  `audit_log`, nowhere. Opening a task is invisible to the backend.

→ The spec's forcing-prompt strip belongs in `TaskEditModal` purely as a
client-side render keyed off the health read passed down with the task; there's
no existing telemetry to hook and none should be added for v1.

## 3. Monday/Friday rhythm re-plan path & roll_count

**`roll_count` is wired end-to-end already** (contrary to the spec's "never
written" framing — true of the *data*, false of the *code*):

- **Increment** — `tasks/[id]/route.ts` PATCH, lines ~190–192: when
  `planned_week` is set to a date **`> thisMonday()`**, it does
  `roll_count = (current.roll_count ?? 0) + 1`. Pulling a task *into* the
  current week (`= thisMonday()`) is deliberately **not** a roll. Clean.
- **Trigger paths (both exist):**
  - Friday close — `app/admin/ops/friday/page.tsx` ~143: "Roll to next week"
    action → `{ pinned_for_this_week: false, planned_week: nextMonday() }`.
  - Monday carryover — `app/admin/ops/monday/page.tsx` ~268: "Push" action →
    `{ planned_week: nextMonday() }`. ("Pull into this week" uses
    `planned_week: mondayISO` → correctly does **not** increment.)
  - Both dispatch via `TaskRowWithActions.tsx` `applyPatch` →
    `PATCH /api/admin/ops/tasks/[id]`.
- **Already surfaced** — `monday/page.tsx` ~293 reads `t.roll_count` to show a
  "rolls" count on carryover rows.

DB state: `roll_count` exists (`integer not null default 0`,
`add_roll_count_to_ops_tasks.sql`); `0/160` rows, `max = 0`. The path simply
hasn't been exercised in prod (Rhythm v2 is new; no roll has been committed).

→ **Re-scope build-item #6** from "wire roll_count in rhythm re-plan" to
"confirm the existing roll path fires + surface it distinctly from stuck."
Decision #3 (define here, increment in rhythm work) is already satisfied in code.
The remaining work is keeping the **punt** signal (`roll_count`) visually
distinct from the **stuck** badge (age) — spec failure mode #2.

## 4. ops.read / ops.write usage to mirror on the view

- API routes under `app/api/admin/ops/tasks/*` gate with `getOrgContext()`
  (`lib/admin/auth.ts`) then use `createServerSupabase()` — the **session**
  client, so Postgres RLS is the real enforcement (no service-role bypass).
- Live RLS on `ops_tasks`:
  - SELECT — `members read ops_tasks`: `private.has_permission(org_id,'ops.read')`
  - ALL — `members write ops_tasks`: `private.has_permission(org_id,'ops.write')`
- Live RLS on `audit_log`:
  - SELECT — `org managers read audit log`:
    `private.has_permission(org_id,'org.manage')` ← **different domain.**

→ `v_ops_task_health` should be a **`security_invoker = on`** view so it
inherits `ops_tasks`' `ops.read` policy for the querying user — Shannon and Remi
both have it. Because audit is dropped from v1 (#1/#2), there's no `org.manage`
collision to resolve. Mirror nothing extra: select through the view, RLS on the
base table does the work.

## Net effect on the spec

| Spec assumption | Reality | Action |
|---|---|---|
| audit_log carries task touches | only `ingest`; mutations unaudited | v1 health = age + `updated_at` + `roll_count`; no audit join |
| `roll_count` never written (code) | increment + both triggers + read all exist | re-scope #6 to verify/surface, not wire |
| view joins audit_log under ops.read | audit_log is `org.manage`-gated | dropping audit also dodges this; `security_invoker` over `ops_tasks` only |
| `audit_log.created_at` | column is `ts` | n/a once audit is dropped |

Thresholds (aging 7d / stuck 14d) stay config, as specced. With audit gone,
"stuck" = `age_days >= 14 AND status='todo' AND days_since_last_touch >= N`
(from `updated_at`), optionally weighted by `roll_count`. Still useful — the
spec anticipated this degraded path.
