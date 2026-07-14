# KPI Scorecard — where the data comes from, and the decision we need

*Fact-finding note for Remi, answering Shannon's question from the in-app reporter
("where is this information coming from? There isn't a way to edit the items or
update or make notes or assign to a team member. Is this a live tool?").*

**Short answer: it is a live tool, not a static page — but only partly editable
where Shannon was looking, and two of the things she asked for (notes and
assigning owners from the scorecard) don't exist yet. That's the decision below.**

## 1. Where the data comes from

The scorecard (`/admin/strategic-plan/scorecard`) is **not hardcoded**. Every
card is read live from our Supabase database on each page load:

- **`plan_kpis`** — one row per measure: title, owner, target, current value,
  status, unit, and whether it's `auto` or `manual`.
- **`plan_kpi_snapshots`** and **`metric_snapshots`** — the dated value history
  that draws each card's sparkline and "▲ since start" delta.
- **`plan_goals` / `plan_objectives`** — the "↳ goal · objective" line on each card.

The measures themselves were seeded from the **2026 OGSM plan** (a one-time SQL
load, `supabase/migrations/2026_ogsm_reseed.MANUAL.sql`), so the titles, owners
(Remi / Shannon), and targets you see are the 2026 plan as written.

There are two kinds of measures, and each card's badge tells you which:

- **Auto** (green badge) — computed from real BloomOS data: grants secured,
  corporate dollars, weighted pipeline, cash runway, active teens, etc.
  (`lib/admin/plan/metrics.ts`). They recompute when someone clicks
  **↻ Refresh metrics** at the top of the scorecard, and on a scheduled cron
  (`/api/cron/metric-snapshots`). Nobody types these numbers.
- **Manual** (gray badge) — hand-entered. The small print at the bottom of each
  card names the real-world source of truth (e.g. "Gifts received this fiscal
  year · Finance").

## 2. Is it editable? Partly — here's exactly what exists today

- **On the scorecard itself:** the big number on any *Manual* card is
  click-to-edit — click it, type, press Enter. The change saves to the database,
  snapshots into the trend history, and flows to the Strategic Plan page and the
  Strategy Narrative (all three read the same rows). The affordance is subtle
  (a small ✎ pencil next to the number), which is very likely why it read as
  read-only. *Auto* cards are intentionally locked, since the system computes them.
- **Everything else is edited on the plan page** (`/admin/strategic-plan`), by
  design ("read-mostly scorecard, editable plan"): title, target, baseline,
  status, unit, cadence, adding/deleting measures — and **owner assignment**,
  which is there but buried behind the "⋯" toggle on each measure row.
- **Permissions caveat:** saving any edit requires the `org.manage` permission.
  If Shannon's account doesn't have it, the pencil still shows but saves fail
  with a generic "Could not save" — worth confirming her role if she tried and
  it didn't take.

## 3. What genuinely doesn't exist anywhere

- **Notes on a measure.** There is no notes field on `plan_kpis` at all — not
  on the scorecard, not on the plan page. The only narrative context today is
  the weekly review log (`/admin/strategic-plan/review`, which has a notes box
  per review) and the "override reason" on goal/objective status overrides.
- **Assigning an owner from the scorecard.** Owners exist and the scorecard
  groups by them, but changing one means finding the measure on the plan page
  and opening its "⋯" details.

## 4. The decision needed (no dev work started)

Shannon's instinct was right that the scorecard reads as informational. The
question for Remi:

**Option A — keep the split, fix discoverability.** Scorecard stays the
"glance" view; make the manual-edit affordance obvious (visible Edit button,
"edit on the plan →" link per card). Small effort, no schema change.

**Option B — make the scorecard the working tool.** Add in-place editing of
status and owner, plus a new notes field per measure (requires a `notes` column
on `plan_kpis` + UI on both surfaces). Medium effort; turns the scorecard into
the place the team actually runs KPIs from.

Either way, the data layer is already live and shared across the plan,
scorecard, and narrative — this is a UI/workflow decision, not a plumbing one.
