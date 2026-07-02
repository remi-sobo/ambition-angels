# Strategic Plan Editability — Findings & Proposal

*Research date: 2026-07-02. Scope: make the whole BloomOS strategic plan (foundation, objectives, goals, KPIs/measures, initiatives, reviews) editable, and understand the downstream implications.*

## TL;DR

The plan is **already ~70% editable**. Every OGSM entity lives as editable rows in
`plan_*` tables with full CRUD API routes (`app/api/admin/plan/*`) and extensive
inline editing in the UI (`app/admin/strategic-plan/_components/PlanControls.tsx`).
The remaining work is not "build an editor" — it's three things:

1. **Close a handful of CRUD gaps** (reordering, KPI auto/manual rebinding,
   initiative descriptions).
2. **Add guardrails**, because full editability can *silently break* the funder
   narrative, readiness score, auto-refresh, and the strategy→ops rollup — all of
   which address plan rows by hardcoded `metric_key` strings or cascade rules.
3. **Fix existing drift/footguns** discovered during research (a seed button that
   overwrites an edited mission, a metric catalog already out of sync, one KPI
   route with a weaker auth gate).

---

## 1. Where things stand today

### Backend (Supabase)

One OGSM tree per org, all editable rows, no hardcoded content in the schema:

| Table | Contents | Notes |
|---|---|---|
| `plan_foundation` | mission, vision, values[], behaviors[], proof_points[] | one row per org |
| `plan_objectives` | title, three_year_statement, owner, status, status_override(+reason), sort_order | |
| `plan_goals` | title, description, target_date, owner, objective_id, status, status_override, sort_order | objective FK `ON DELETE SET NULL` |
| `plan_initiatives` | title, description, owner, status (todo/in_progress/done), sort_order | goal FK `ON DELETE CASCADE` |
| `plan_kpis` | title, unit, target, current, baseline(+date), owner, cadence, source (auto/manual), metric_key, status | attaches to goal or objective (CASCADE) |
| `plan_kpi_snapshots` | one value per KPI per day | feeds sparklines / deltas |
| `plan_reviews` | conducted_at/by, notes, next_review_at | append-only ritual log |

RLS: read = `reports.read`, write = `org.manage`, uniform across all plan tables.
No org_id defaults (tenancy-hardened; ratchet test enforces this for new tables).

Entities are identified by **UUID only** — no code/slug columns. The coupling
downstream is through `plan_kpis.metric_key` string literals (see §3).

### API layer (`app/api/admin/plan/*`)

Full CRUD exists and is `org.manage`-gated:

- `foundation` — PUT (upsert all five fields)
- `objectives`, `objectives/[id]` — POST / PATCH / DELETE (incl. `sort_order`, `status_override`)
- `goals`, `goals/[id]` — POST / PATCH / DELETE (incl. reparenting via `objective_id`)
- `initiatives`, `initiatives/[id]` — POST / PATCH / DELETE
- `kpis`, `kpis/[id]` — POST / PATCH / DELETE (every field incl. `target`, `current`, `metric_key`, `source`, `baseline`)
- `kpis/refresh` — POST (recompute auto KPIs), `kpis/metrics` — GET (bindable auto metrics)
- `reviews` — POST only (append-only)
- `seed` — POST (one-time content load; see footguns, §4)

Reed can only **propose** plan changes (`reed_plan_proposals`, inert); a human with
`org.manage` accepts/dismisses via `app/api/reed/proposals/[id]`. This shape is
right and unchanged by this work.

### Frontend (`app/admin/strategic-plan/`)

Already editable inline (click-to-edit `EditableText`, PATCH + `router.refresh()`):

- **Foundation** — full form (mission/vision/values/behaviors/proof points)
- **Objectives** — title, owner, 3-year statement, status override + reason, create/delete
- **Goals** — title, owner, description, target date, status override, reparent, create/delete
- **KPIs** — title, current (manual only), target, baseline, status, and unit/owner/cadence behind `⋯`; create (manual or auto-bound via metrics picker)/delete; also inline value edit on the Scorecard
- **Initiatives** — add, title/owner edit, done toggle, delete
- **Reviews** — log a review (notes + next date)
- **SetupWizard** — guided creation for gaps

---

## 2. Gaps to full editability (Bucket 1 — small)

1. **No reordering anywhere.** `sort_order` exists on all four entities, but only
   the objectives API exposes it, and no UI writes it. → Add `sort_order` to the
   goals/initiatives/kpis PATCH routes and add up/down controls (or drag) in
   `PlanControls`.
2. **KPI auto/manual rebinding is create-only.** `metric_key`/`source` are
   PATCHable via API, but the UI only offers the binding at creation
   (`NewKpiForm`). → Add a "Tracking" control in the KPI `⋯` details panel that
   reuses the existing `/api/admin/plan/kpis/metrics` picker (manual ↔ auto,
   rebind key).
3. **Initiative description** is writable via API but has no edit surface in the
   UI (only title/owner). → Add to the initiative row.
4. **Reviews are append-only** (no PATCH/DELETE). Recommend keeping them
   append-only as a ritual log; optionally allow editing `notes` on the most
   recent review.

## 3. Guardrails (Bucket 2 — the real work)

Full editability is only safe if edits can't silently break the things that read
the plan. The failure modes found:

### 3a. Auto-KPI binding can silently die
`refreshOrgPlanMetrics` (`lib/admin/plan/metrics.ts`) skips any `source='auto'`
KPI whose `metric_key` isn't in the code-defined `PLAN_METRICS` registry (10 keys)
— no error, value just goes stale forever while still wearing the "auto" badge.
→ **Server-side validation** in the KPI POST/PATCH routes: reject
`source='auto'` unless `metric_key ∈ PLAN_METRICS`. Keep the UI picker as the
only way to set auto bindings. (Creating genuinely *new* auto metrics stays a
code change — engineers define, users bind. That's the right boundary.)

### 3b. Load-bearing metric_keys
`lib/admin/strategy/narrative.ts` and `readiness.ts` address specific KPIs *by
key string*: `dollars_raised_fy26` (floor), `dollars_ceiling_fy26` (ceiling),
`corporate_raised`, `aig_multiyear_commitments`, `cash_runway_months`, and the
`floor_source_*` prefix family. Renaming or deleting any of these nulls the
funder-narrative floor/ceiling/channels and trips readiness blockers — silently,
from the editor's point of view.
→ Export a shared `LOAD_BEARING_KEYS` set; the KPI edit/delete UI shows a
specific warning ("The funder narrative reads this measure by its key") and the
API echoes a warning in its response. Readiness B1/B2 already act as a backstop.

### 3c. Cascade-aware deletes
- Objective delete → KPIs CASCADE-deleted, goals kept but unlinked.
- Goal delete → initiatives CASCADE-deleted → linked `ops_projects.initiative_id`
  set NULL → those projects **drop out of the strategy→ops work rollup** and the
  Monday area-walk labels.

Current `confirm()` dialogs are generic. → Replace with impact-aware confirms
("Delete this goal? 3 initiatives will be deleted and 2 ops projects unlinked"),
counts fetched server-side (small GET or returned by a dry-run flag).

### 3d. Fix existing drift found during research
- **`AUTO_METRIC_CATALOG` is already out of sync**: missing
  `dollars_ceiling_fy26`, which exists in `PLAN_METRICS`/`PLAN_METRIC_META`
  despite the "Keys MUST match" comment. → Fix, and add a **vitest** asserting
  `AUTO_METRIC_CATALOG` keys ≡ `PLAN_METRICS` keys ≡ `PLAN_METRIC_META` keys so
  this can't drift again.
- **`dollars_ceiling_fy26` is seeded `source='manual'`** in the 2026 reseed but
  defined as an auto fn — so it never auto-refreshes as seeded. → One-row data
  fix (`update plan_kpis set source='auto' where metric_key='dollars_ceiling_fy26'`).

### 3e. Auth alignment
`app/api/admin/kpis/[metric_key]` (legacy `kpi_settings` registry) is writable by
*any authenticated member* (`isAuthed()` only), unlike every plan route which
requires `org.manage`. → Align to `org.manage`.

## 4. Footguns to defuse

- **The seed button can overwrite an edited plan foundation.** `POST
  /api/admin/plan/seed` always upserts the hardcoded 2025 `FOUNDATION` constant
  — even when the OGSM tree already exists — so one click on "Load AA strategy"
  reverts an edited mission/vision/values. Its OGSM catalog is also the *stale
  2025 plan* (different goals and metric_keys than the live 2026 reseed).
  → Make the foundation upsert conditional on the foundation being empty, or
  retire the seed button entirely now that the plan is live. Recommendation:
  guard it (keep the route for future tenants, hide the button when a plan
  exists).
- **Two divergent seeders.** The TS seed route and
  `2026_ogsm_reseed.MANUAL.sql` carry different plans; `narrative.ts` /
  `provenance.ts` are aligned to the reseed's key set. A future tenant seeded via
  the API route gets a plan the narrative can't resolve (no floor key). Not
  urgent for AA, but note it before onboarding tenant #2.

## 5. Data-driven metadata (Bucket 3 — optional, later)

- **Provenance**: `MANUAL_SOURCE` in `lib/admin/plan/provenance.ts` is a
  hand-maintained 17-key map; user-created KPIs fall back to generic text. → Add
  a nullable `plan_kpis.source_of_truth` text column, editable in the KPI `⋯`
  panel, falling back to the map. Eventually delete the map.
- **Narrative role binding**: replacing key-name coupling with a
  `narrative_role` enum column (`floor` / `ceiling` / `floor_source` / `channel`)
  would make renames safe, but it's heavier. Defer — the §3b key protection is
  cheaper and sufficient at current scale.
- **Plan-year re-planning**: the FY26 plan was installed via manual SQL. If
  "fully editable" eventually includes "start FY27 in-app," that's an
  archive-and-restart flow (new plan year, snapshot the old tree). Future scope;
  flagging so it's a known boundary.

## 6. What is *not* in scope

- `lib/kpis.ts` (the legacy 12-metric org-wide registry feeding the v0 weekly
  digest and `kpi_settings`/`kpi_snapshots`) is a separate, fully code-defined
  system. It is not the plan and shouldn't be made editable here; the
  command-center spec already envisions merging it into plan metrics later.
- Reed's propose-only flow — already correct, no changes.
- `/strategy` (Strategy Room) — separate `strategy_angles` tables, already
  DB-driven with its own editability; not part of the OGSM plan.

## 7. Suggested phasing

**Phase 1 — gaps + footguns (~1 day)**
Reorder support (API + UI), KPI rebind UI, initiative description edit, seed
foundation guard, `kpi_settings` route auth fix, catalog drift fixes + key-sync
vitest, `dollars_ceiling_fy26` source fix.

**Phase 2 — guardrails (~1–2 days)**
Auto-key server validation, `LOAD_BEARING_KEYS` warnings on rename/delete,
cascade-aware delete confirmations.

**Phase 3 — optional polish**
`source_of_truth` column, review-notes editing, narrative role binding,
plan-year archiving.

Testing/CI implications are light: new vitest for catalog sync; any new
migration is auto-covered by the idempotency test and the RLS workflow; existing
plan RLS policies cover new columns without changes.
