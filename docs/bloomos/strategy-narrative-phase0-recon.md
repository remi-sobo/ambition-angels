# Strategy Narrative — Phase 0 Recon Findings

Status: **Phase 0 complete (read-and-report).** No UI, no schema changes, no
migration applied. Date: 2026-06-26. Project: `kzzdtibbwsucloaoqpqa`
(Ambition-Angels). Org: `17c75da8-082d-4c8f-b00b-a4100fb2eb22`.

Scope: confirm the spec (`specs/strategy-narrative.md`) against the real repo
and the live Supabase schema, map the five things Phase 0 was asked to map
(strategy routing, the `plan_*` / `fin_*` data-access layer, the design-token
module, the status-scale + thresholds, the auth gate), and propose the
smallest Phase 1 PR.

Bottom line: the spec is sound and the engine it wants already exists, with
**four corrections** to fold into the build:

1. **The route is wrong in the spec.** The strategy section is
   `/admin/strategic-plan`, not `/admin/strategy`. The Narrative lands at
   **`/admin/strategic-plan/narrative`**.
2. **Finance is already multi-tenant.** Every `fin_*` table plus `gifts` and
   `opportunities` carries `org_id` (verified live). The spec's single-tenant
   caveat is moot — the money module scopes everything by `org_id`, same as the
   plan reads.
3. **The floor target does not exist in the DB yet.** `plan_kpis.metric_key =
   'dollars_raised_fy26'` returns **0 rows** today. It is created by the OGSM
   reseed (`supabase/migrations/2026_ogsm_reseed.MANUAL.sql`), which has **not
   been applied**. Movements 1–2 render the *old* plan until Remi runs the two
   manual SQL files. This is a hard data dependency, not a code dependency.
4. **Do not reuse `getForecast()` for the ask.** The existing pipeline math
   counts `steward` at full value and does not exclude `won`. The spec requires
   each dollar in exactly one state and `steward`/`lost` excluded. The Narrative
   needs its **own** shared money module with that rule.

---

## 1. Strategy section routing

The section is **`app/admin/strategic-plan/`** (the spec's `/admin/strategy/…`
guess is stale — that prefix is the public donor-facing strategy room and the
fundraising angle pages, not the OGSM section).

| URL | File | Renders |
|---|---|---|
| `/admin/strategic-plan` | `page.tsx` | Foundation + Org/Area/Mine lens, objective→goal→KPI→initiative tree, unassigned-metric tray |
| `/admin/strategic-plan/scorecard` | `scorecard/page.tsx` | Owner-segmented KPI cards, pacing, 12-mo sparkline |
| `/admin/strategic-plan/review` | `review/page.tsx` | Monthly OGSM review walk-through + review history |
| `/admin/strategic-plan/objective/[id]` | `objective/[id]/page.tsx` | Objective drill-in (tree + tasks via `ops_projects`→`ops_tasks`) |
| `/admin/strategic-plan/setup` | `setup/page.tsx` | Setup gaps wizard |
| `/admin/strategic-plan/people` | `people/page.tsx` | Per-person performance agreements |

**Narrative route:** `app/admin/strategic-plan/narrative/page.tsx` →
`/admin/strategic-plan/narrative`. Presenter mode is the **same route** under
`?present=1` (simplest; no nested layout needed, inherits the admin gate).

All pages are async **server components** (`export const dynamic =
"force-dynamic"`), gate inline on `getOrgContext()`, then read via the
service-role client. No client-side fetching of money/plan data. The Narrative
follows this exact shape — which is also the guard against the "stale targets
after reseed" failure mode (server read every load, no long cache).

## 2. Data-access layer

### `plan_*` (targets, the plan tree)

Reads are **direct service-role selects**, org-scoped. Canonical pattern
(`app/admin/strategic-plan/page.tsx:63-87`):

```ts
const ctx = await getOrgContext();
if (!ctx) return <…not authorized…>;
const supabase = getSupabaseAdmin();
await Promise.all([
  supabase.from("plan_foundation").select("*").eq("org_id", orgId).maybeSingle(),
  supabase.from("plan_objectives").select("*").eq("org_id", orgId).order("sort_order").order("created_at"),
  supabase.from("plan_goals").select("*").eq("org_id", orgId).order("sort_order")…,
  supabase.from("plan_kpis").select("*").eq("org_id", orgId)…,
  supabase.from("plan_initiatives").select("*").eq("org_id", orgId).order("sort_order")…,
]);
```

Cached rollups already exist and can be reused for Movement 1's headline tiles
rather than re-querying:
- `lib/admin/overview/sources.ts` → `getStrategyRollup()` (React `cache()`): 4
  objectives + headline KPIs + review dates.
- `lib/admin/plan/glance.ts` → `getStrategyGlance()`: verdict line + exceptions
  + objective tiles.
- `lib/admin/plan/health.ts` → `deriveHealth` / `worstHealth` / `isOffTrack`:
  the objective/goal/KPI health roll-up (worst-wins).

Plan row types are defined inline in
`app/admin/strategic-plan/_components/PlanControls.tsx:9-65` (`PlanObjective`,
`PlanGoal`, `PlanKpi`, `PlanInitiative`, `PlanFoundation`). Key `plan_kpis`
columns: `target`, `current`, `unit`, `status`, `metric_key`, `source`,
`goal_id`, `objective_id`. **Targets** for the Narrative come from
`plan_kpis.target` by `metric_key`; **actuals** are computed from finance, not
read from `plan_kpis.current` (all reseeded KPIs are `source = 'manual'`, so
`current` is hand-entered and will drift — see §6).

### `fin_*` + `gifts` + `opportunities` (actuals, the money math)

`lib/admin/finance.ts` → **`getFinanceSnapshot()`** is THE canonical money
snapshot (React `cache()`), returning `cashOnHand`, `burn3mo`, `runwayMonths`,
`runway`, `revenueYTD` / `expenseYTD` / `netYTD`, and the monthly buckets.
Definitions are locked in the file header (cash = anchor balance + Σ txns after
anchor; burn = 3-mo trailing average expense; runway = cash / burn). Movement 2
**reuses this** for cash/burn/runway rather than recomputing.

- **Raised-to-date** (`gifts`): `sum(amount)` where `gift_date` in fiscal-year
  bounds (`fiscalYearBounds(year, startMonth)` in `finance.ts`). Pattern in
  `lib/admin/overview/sources.ts` and `lib/kpis.ts`.
- **Weighted pipeline** (`opportunities`): existing math in
  `sources.ts::getForecast()` and `lib/kpis.ts` weights open stages by
  `probability/100`, counts `steward` at **full value**, and excludes only
  `lost`. ⚠️ The Narrative must **not** reuse this verbatim (see §4 / failure
  modes). Live stages verified: `identify, qualify, cultivate, solicit,
  steward, lost` (no `won` present).
- **Budget allocation** (`fin_budget` + `fin_categories`): grouped by
  `fin_categories.group_name`; per-line value `base_amount +
  activated_contingency`. The staged tiers live in `contingency_t1` /
  `contingency_t2` (the rebase moves video→t1, contract engagement→t2). Pattern
  in `app/admin/finance/page.tsx` and `finance/budget/page.tsx`.
- **`fin_config`** singleton (`id = 1`, now also `org_id`-bearing):
  `cash_starting_balance`, `cash_starting_date`, `monthly_burn_baseline`,
  `forward_horizon_months`, `fundraising_goal`, `current_year`,
  `fiscal_year_start_month`.

## 3. Design tokens

`tailwind.config.ts` — admin cream-workspace palette (admin-only, never bleeds
to the public brand):
- Surfaces: `app` `#F5EFE2` (workspace bg), `surface` `#FFFDF8` (cards), `tile`
  `#FBF6EC` (recessed), `hairline` `#E7DCC9`, `outline` `#C7B18C`.
- Ink ramp: `ink-1` `#2A201A`, `ink-2` `#6B5C4E`, `ink-3` `#9A8B7C`.
- `attention` `#23160D` / fg `#F5EFE2` — the deliberate dark "attention"
  surface (AAA light-on-dark). **This is the presenter-mode background** — it
  already passes AA/AAA, which closes the "contrast drift in presenter mode"
  failure mode without inventing a new palette.
- Type roles: `lib/admin/typeScale.ts` → `TYPE.{pageTitle, sectionHeader,
  cardMetric, cardLabel, body, metadata}`. Presenter mode scales these up but
  keeps the same families (Big Shoulders / Poppins / DM Sans).
- Shared primitives: `app/admin/_components/PageHeader.tsx`, `StatCard.tsx`,
  `StatusChip` (consumes the status scale below).

## 4. Status scale + thresholds (central config)

- `lib/admin/status.ts` → **`planHealthToStatus(health)`** maps plan health
  (`not_started · on_track · at_risk · behind · done`) onto the five-value
  scale (`critical · watch · due · healthy · neutral`). `STATUS_CHIP` gives the
  chip tint+dot classes. The Narrative reuses this so a color means one thing.
- `lib/admin/thresholds.ts` → `FINANCE.runwayCriticalMonths = 3`,
  `runwayWatchMonths = 6`, `cashFloorUsd = 25_000`. Movement 2's runway status
  reads these — no hardcoded cutoffs in the component.
- Tailwind `status.*` tokens are AA-verified (`*-text` AA on cream, `*-bg`
  pale tint with AAA ink-1 label).

## 5. Auth gate

`lib/admin/auth.ts` → `getOrgContext()` (Supabase session + a `memberships`
row; RLS-backed). Two layers protect the route:
1. **`middleware.ts`** bounces unauthed `/admin/*` to `/admin` (login).
2. **Page-level** `getOrgContext()` → `if (!ctx) return "Not authorized"`,
   which every strategic-plan page does. The Narrative does the same **before
   any money read**, closing the "auth gap / leaked money math" failure mode.

The route also inherits `app/admin/layout.tsx` (`robots: noindex`, PWA chrome).
Presenter mode (`?present=1`) renders chrome-free *inside* the same gated
layout, so full-screen never means unauthed.

## 6. Live-data deltas the build must respect

| Fact (verified live) | Implication |
|---|---|
| 4 objective UUIDs in the seed all exist & match | Reseed `UPDATE`s hit real rows; objectives are preserved, not recreated. |
| Today: **13 goals, 0 initiatives, 24 KPIs** (old plan) | After reseed: **10 goals, 24 initiatives, 18 KPIs**. The Narrative renders whatever is live — so it shows the old plan until the seed runs. |
| `metric_key='dollars_raised_fy26'` → **0 rows** | Movement 2's floor target is absent until the reseed. Build Movement 2 to read the target by `metric_key` and degrade gracefully (show "target not set") when missing. |
| All reseeded KPIs are `source='manual'` | Read **targets** from `plan_kpis`; compute **actuals** from finance. Never show `plan_kpis.current` as the live raise. |
| `fin_*`, `gifts`, `opportunities` all carry `org_id` | Money module scopes by `org_id` everywhere; no single-tenant special-casing. |
| Budget cats `program.tech-app` ($400K build) + 3 others exist; `payroll.program-lead` absent | The finance rebase SQL is valid as written (`INSERT … ON CONFLICT DO NOTHING` creates the net-new line). |
| `funder_angles` → **8 rows** | Movement 3 reads all 8; matches the spec's "funder_angles (8)". |

### Hard ordering (the "process")

```
[Remi, manual, Supabase SQL editor]  Apply 2026_ogsm_reseed.MANUAL.sql      ─┐
[Remi, manual, Supabase SQL editor]  Apply 2026_finbudget_rebase.MANUAL.sql ─┤  data: 2026 plan + rebased money
                                                                              │
[Claude Code, app]  Phase 1 read module ─► P2 Plan ─► P3 Raise ─► P4 How ─► P5 Presenter
```

The app phases can be built before the SQL runs (they compile against the
schema, which is unchanged), but they only render the *2026* story once the two
manual files are applied. The SQL files are **manual-apply, not part of any
auto-run migration chain** — they keep their `Apply MANUALLY` headers and the
`.MANUAL.sql` suffix so nothing picks them up automatically.

---

## Proposed Phase 1 PR (smallest reversible step)

**One server module, no UI, no route, no schema.**

`lib/admin/strategy/narrative.ts` exporting three typed reads, all `org_id`-
scoped, all server-side:

- `getPlanMovement(orgId)` → foundation + objectives (by `sort_order`) →
  goals → initiatives + KPIs, with `planHealthToStatus` applied. (Reuses
  `getStrategyRollup` where it already returns the shape.)
- `getRaiseMovement(orgId)` → a **`MoneySummary`** computed by one shared
  helper: `floor`/`ceiling` from `plan_kpis` by `metric_key` (null-safe),
  `secured` from `gifts` (FY), `weightedPipeline` from `opportunities` with the
  **corrected one-state rule** (open stages × prob; exclude `steward`, `lost`,
  `won`), `gap = floor − secured`, `realistic = secured + weighted`, plus
  `cashOnHand`/`runwayMonths` from `getFinanceSnapshot()`, and the
  `fin_budget` allocation breakdown.
- `getHowMovement(orgId)` → `funder_angles` (8) + `opportunities` grouped by
  stage + channel-progress KPIs (`corporate_raised`, `aig_multiyear_commitments`).

Commit point (per spec): the three functions return correct shapes verified
against live rows, with a known figure (raised-to-date) matching the finance
screen to the dollar. No component renders yet. Next PR is Phase 2 (Movement 1
UI) only after this is approved.

**Not in Phase 1:** any `.tsx`, the route, presenter mode, edits to
`getForecast()` or the metered Reed agent. One PR at a time.
