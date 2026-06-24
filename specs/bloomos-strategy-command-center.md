# Spec: Strategy in the Command Center (one spine, three lenses)

> This makes the strategic plan the front door of BloomOS, retires "KPIs" as a standalone destination, and gives executives and team members one view of the plan they can filter to their area, their objectives, and their numbers. It builds directly on `specs/bloomos-strategy.md` (Phases 1–4, shipped): the data spine, the auto-metric registry, the work/health rollups, and the cockpit widgets already exist. This is the surface and information-architecture pass on top of them.
> Status: design only, for Remi's review. No implementation code in this document.

---

## Problem statement

The strategy spine works, but it's filed and split wrong, so it doesn't read like a cockpit.

1. **It's buried.** `/admin/strategic-plan` is the *last* item under **Governance** — the lowest section in the sidebar (`app/admin/_components/Sidebar.tsx`, `NAV_SECTIONS`). For a nonprofit executive the plan *is* the home screen. It's sitting next to compliance filings.

2. **KPIs are two disconnected systems and nobody knows which to trust.**
   - `/admin/kpis` shows **12 computed metrics** from the spine (revenue YTD, donor retention, overdue moves…) — the org's *live vital signs*, defined in code at `lib/kpis.ts`.
   - `/admin/strategic-plan` `plan_kpis` shows **strategic measures** tied to goals/objectives — the *targets we chose*.
   - Same status scale, different nav sections, no link in the UI between them. A KPI with no objective above it is just a number on a wall — which is exactly the "not sure what the KPI is doing" feeling.

3. **There's no single answer to "are we winning, and who owns it?"** The CEO cockpit has a Strategy Health widget (`app/admin/_components/overview/StrategyHealthWidget.tsx`), but the deep plan, the plan scorecard (`/admin/strategic-plan/scorecard`), the per-person view (`/admin/strategic-plan/people`), and the computed metrics (`/admin/kpis`) are four separate routes telling four partial stories.

## Who is affected

- **Remi (CEO), first.** Wants to open BloomOS and read "are we winning" at a glance, then drill into an area or his own numbers before the Monday plan and the monthly review.
- **Shannon and future AA staff.** Want their slice: the objectives, goals, KPIs and initiatives they own, and only those.
- **Tenant nonprofit leaders, later.** Same need at the executive altitude — the plan as a cockpit, not a CRUD tree.

## Current behavior

- Strategy lives at `/admin/strategic-plan` (a Foundation → Objectives → Goals → KPIs + Initiatives tree, `app/admin/strategic-plan/page.tsx`) with four sub-routes: `setup`, `scorecard`, `people`, `review`.
- Computed metrics live at `/admin/kpis` (`app/admin/kpis/page.tsx`), driven by the `lib/kpis.ts` registry, with per-metric target/owner settings in `kpi_settings` and weekly history in `kpi_snapshots`.
- Both "KPIs" and "Strategic Plan" sit under the **Governance** nav section.
- `plan_kpis.metric_key` + `source='auto'` already lets a strategic KPI bind to a computed metric, and `RefreshMetricsButton` recomputes them — but nothing in the UI lets a user *pick* a metric to bind, so the two worlds stay separate in practice.
- Ownership everywhere is free-text (`owner` on objectives/goals/KPIs/initiatives; `assigned_to: "remi" | "shannon" | null` only on ops tasks/projects). The People page buckets by splitting the free-text owner on `/` and `,`.

## Desired behavior

**One spine. One place. Three lenses. Every number has a parent and an owner.**

- The strategic plan is promoted into the **Command Center** section of the nav and becomes the default executive surface — vision at the top, objective health below.
- "KPIs" disappears as a standalone nav destination. The 12 computed metrics become a **Metrics Library**: a data *source* that strategic KPIs bind to, not a peer page. A KPI only ever appears *under the objective/goal it serves*.
- Computed metrics nobody has tied to strategy yet surface in an **Unassigned vital signs** tray — a nudge to either attach a metric to a goal or stop tracking it. This is what answers "what is this KPI doing" for every number.
- The Strategy surface offers three lenses over the same data:
  - **Org lens** (default): vision banner + objective grid, each tile showing health, headline measures, and initiative completion. "Are we winning" at a glance.
  - **Area lens**: filter to one objective (Program / Fundraising / Recruitment / Infrastructure) and see its goals, every measure, and every initiative with task rollup. The department deep-dive.
  - **My lens**: "show me the objectives, goals, KPIs and initiatives I own" — the per-person accountability view, formalizing today's People page.
- A persistent **filter bar** across all lenses: by area (objective) · by owner · by status (at-risk / behind) · by review cadence (what's due).
- KPIs stay with Strategy, not Ops. Strategy answers *are we winning* (objectives, goals, measures/outcomes). Ops/Team answers *are we doing the work* (initiatives, projects, tasks). The **initiative** is the bridge — bottom of Strategy, top of Ops.

## Scope

**In:**

- IA change: move Strategy into the **Command Center** nav section; remove the **KPIs** item from Governance; remove **Strategic Plan** from Governance.
- A unified Strategy surface with the three lenses and the filter bar, replacing the four-route sprawl with one workspace (sub-routes may stay as deep-link targets, but the default experience is consolidated).
- The **Metrics Library** fold-in: a metric picker in the KPI editor so a measure can bind to a `lib/kpis.ts` metric_key (`source='auto'`); an **Unassigned vital signs** tray listing computed metrics not bound to any goal/objective.
- A lightweight **owner→person resolution** so "My lens" and the owner filter work reliably, without building HR machinery.
- Retire `/admin/kpis` as a destination (redirect to the Strategy surface's measures view); consolidate `/admin/strategic-plan/scorecard` and `/admin/kpis` into one measures view.

**Out:**

- New strategy data tables. The spine from `specs/bloomos-strategy.md` is sufficient.
- Moving KPIs under Team/Ops (re-orphans measures from strategy — the bug we're fixing).
- HR machinery: review cycles, 9-box, compensation. Same boundary as the parent spec.
- Any AI authoring of strategy. The Metrics Library binds existing computed metrics; it invents nothing.

## The design

### 1. Information architecture

Current nav (`Sidebar.tsx`):

```
Command Center   Overview · Executive Briefing · How-To Guide
…
Governance       Board · Compliance · KPIs · Strategic Plan
```

Target nav:

```
Command Center   Overview · Strategy · Executive Briefing · How-To Guide
…
Governance       Board · Compliance
```

- **Strategy** becomes the second item in Command Center — the first thing leadership reaches after the daily Overview.
- **KPIs** is removed from the nav. Its route redirects into the Strategy surface (Measures view). No "KPIs" link anywhere; measures are only seen in context.
- **Strategic Plan** is removed from Governance (it now lives in Command Center as "Strategy"). Governance returns to what it's for: board and compliance.

Naming: call it **Strategy** in the nav (shorter, executive), keep "Strategic Plan" as the page title if Remi prefers the formal name.

### 2. The Strategy surface: one workspace, a lens switch

Route: `/admin/strategy` (new canonical) or keep `/admin/strategic-plan` and restructure in place — build-time call, surfaced in the PR. The page opens on the **Org lens** with a lens switch (pill toggle, mirroring the Command Center's existing CEO/Ops role pill) and the filter bar beneath it.

```
┌─────────────────────────────────────────────────────────────┐
│  STRATEGY                          [ Org · Area · Mine ]      │  ← lens pill
│  Filter:  Area ▾   Owner ▾   Status ▾   Due for review ▾      │  ← filter bar
├─────────────────────────────────────────────────────────────┤
│  ▸ Vision banner (mission + vision, quiet, collapsible)      │
│  ▸ Lens body (below)                                          │
└─────────────────────────────────────────────────────────────┘
```

**Org lens (default — "are we winning").**
A grid of objective tiles (reusing the rollup behind `StrategyHealthWidget` / `getStrategyRollup`). Each tile:
- Objective title + owner.
- Health dot (worst-of-children, already computed in `lib/admin/plan/health.ts`).
- 2–3 headline measures as mini progress bars (current / target).
- Initiative completion (`tasksDone / tasksTotal` rollup already computed on the plan page).
- "N off target" / "N at risk" exception badges.
- Click → drops into the **Area lens** for that objective.

Below the grid: the **monthly review nudge** (already in `StrategyHealthWidget` via `reviewLine`) and the **Unassigned vital signs** tray (see §3).

**Area lens (the department deep-dive).**
The existing `ObjectiveCard` → `GoalCard` → KPIs + Initiatives tree (`app/admin/strategic-plan/_components/PlanControls.tsx`), scoped to the selected objective (or all, when no area filter is set). This is essentially today's `/admin/strategic-plan` body, now reachable as a lens and filterable. Measures here show the auto/manual badge and last-updated time; auto ones are bound to the Metrics Library.

**My lens (per-person accountability).**
The same tree, filtered to items the viewer owns — formalizing `/admin/strategic-plan/people`. Defaults the owner filter to the logged-in user. Shows their objectives, the goals/KPIs/initiatives under them they own, with status and what's due. This is the "filter by which objectives, goals, KPIs you're associated with" the request asks for.

### 3. Folding KPIs in (the Metrics Library)

Two changes turn the standalone KPI page into a layer:

**a. A metric picker in the KPI editor.** When creating/editing a `plan_kpi`, offer "Track automatically" → a dropdown of `lib/kpis.ts` registry entries (label + current live value). Selecting one sets `source='auto'` and `metric_key`; `current` is then computed and refreshed (the `RefreshMetricsButton` path already exists). Manual measures keep `source='manual'` and a hand-entered `current`. This is the only missing glue — the binding columns already exist.

**b. Unassigned vital signs tray.** On the Org lens, list `lib/kpis.ts` metrics whose `metric_key` is bound to *no* `plan_kpi`. Each row: label, live value, and two actions — "Attach to a goal" (opens the KPI editor pre-filled) or "Hide" (writes `kpi_settings.active = false`). This keeps the 12 vital signs visible and useful while pushing every one toward a strategic home. It is the answer to "what is the KPI doing": either it proves a goal, or it's parked here pending a decision.

**c. Consolidate the two scorecards.** `/admin/kpis` (computed) and `/admin/strategic-plan/scorecard` (plan KPIs by owner) merge into one **Measures view** reachable from the Strategy surface — all measures, grouped by objective or by owner (toggle), each with the current/target bar, the sparkline from `kpi_snapshots`/`plan_kpi_snapshots`, RAG status, and the auto/manual badge. `/admin/kpis` redirects here.

### 4. Owner → person resolution (so "Mine" and the owner filter work)

Today owner is free-text and the People page guesses by splitting on `/` and `,`. To make "My lens" and the owner filter reliable without HR machinery:

- Add a small resolver: map an `owner` string to an `AdminUserId` (`remi` / `shannon`) when it contains that person's name, leaving external owners (Empathy Labs, contractor) as unresolved free-text labels.
- "My lens" filters to items whose resolved owner = the logged-in user. The owner filter dropdown lists resolved people first, then the distinct free-text labels.
- No new table required for AA; the resolver is a pure function over the existing `owner` strings plus the `AdminUserId` set. (If tenants later need real people, that's a separate table, out of scope here.)

### 5. What the Command Center Overview keeps

The Overview home (`CeoCockpit` / `OpsPanel`) keeps its `StrategyHealthWidget` as the *glance* — four objective tiles + key measures + review nudge — now with "Strategy" one click away in the same nav section instead of buried in Governance. No change to the widget itself beyond pointing its links at the new Strategy route.

## Component & route plan (for the build phase)

- **Reuse:** `getStrategyRollup` and the health/work rollups (`lib/admin/plan/health.ts`, `lib/admin/overview/sources.ts`); `ObjectiveCard` / `GoalCard` / KPI + initiative rendering (`PlanControls.tsx`); the `lib/kpis.ts` registry and `computeKpis`; the snapshot/sparkline rendering from the existing scorecards.
- **New:** a `StrategyWorkspace` client shell (lens pill + filter bar + URL-synced state), an Org-lens objective grid, the Metrics Library picker in the KPI editor, the Unassigned vital signs tray, and an `owner→person` resolver util.
- **Nav:** edit `NAV_SECTIONS` in `Sidebar.tsx` (move Strategy up, drop KPIs and Strategic Plan from Governance); the `IconName` union already has `strategy` and `kpis`.
- **Redirects:** `/admin/kpis` → Strategy Measures view; keep `/admin/strategic-plan/*` working (or 301 to the new route) so existing links/bookmarks survive.

## Staged build order

Each phase ships useful on its own and is low-risk in isolation.

- **Phase A — Promote & reframe (nav only, ~1 PR).** Move Strategy into Command Center; remove KPIs and Strategic Plan from Governance; redirect `/admin/kpis` into the strategy surface; repoint `StrategyHealthWidget` links. No data changes. Commit point: leadership reaches the plan from the top of the nav; there's no orphan "KPIs" page.
- **Phase B — The lens shell.** Build `StrategyWorkspace` with the Org / Area / Mine pill and the filter bar (URL-synced). Org lens = objective grid from the existing rollup; Area lens = the existing tree scoped/filtered; My lens = owner-filtered tree. Commit point: one workspace, three lenses, filterable by area/owner/status.
- **Phase C — Metrics Library fold-in.** Metric picker in the KPI editor (bind to `metric_key`), the consolidated Measures view, and the Unassigned vital signs tray. Commit point: every computed metric is either bound to a goal or visible in the tray; the two scorecards are one.
- **Phase D — Owner resolution polish.** The `owner→person` resolver, "My lens" defaulting to the logged-in user, the owner filter listing resolved people. Commit point: each person opens Strategy and sees their slice without configuration.

## Definition of done

- Strategy is in the Command Center nav; there is no standalone "KPIs" item and no "Strategic Plan" under Governance.
- Opening Strategy shows the vision, the objective grid with live health, and (for Remi) the at-risk items and the review nudge — without drilling.
- Switching to Area shows one objective's full tree; switching to Mine shows only what the viewer owns.
- Every `lib/kpis.ts` metric is either bound to a `plan_kpi` (shown under its goal) or listed in the Unassigned vital signs tray.
- The two scorecards are one Measures view; `/admin/kpis` redirects to it.
- A team member opens Strategy → Mine and sees their objectives, goals, KPIs, and initiatives, filtered by their ownership, with no setup.

## Failure modes to watch for

- **The lens switch becomes three half-built pages.** Mitigation: all three lenses render the *same* spine data; only the filter and the top-level layout (grid vs tree) change. Build the data path once.
- **KPIs feel hidden now instead of confusing.** Mitigation: the Unassigned tray and the in-context measures keep every number visible — KPIs move from a wrong room to the right room, they don't vanish. Watch that the tray stays small (a large tray means strategy and metrics have drifted apart again).
- **Owner resolution mislabels external owners.** Mitigation: only resolve to a person on a confident name match; leave everything else as a free-text label rather than guessing. "Mine" under-includes rather than wrongly claims.
- **Broken bookmarks.** Mitigation: keep `/admin/strategic-plan/*` and `/admin/kpis` resolving (redirect or alias), don't hard-delete routes.
- **Over-consolidation hides the deep editor.** Mitigation: the Area lens must keep full CRUD parity with today's `/admin/strategic-plan` tree — promotion must not cost editing power.

## Open decisions for Remi

1. **Route name.** New `/admin/strategy` (cleaner, matches the nav label) vs. restructure in place at `/admin/strategic-plan`. Recommendation: new `/admin/strategy`, redirect the old route.
2. **Default lens.** Org lens for everyone, vs. My lens for non-CEO staff (Shannon lands on her slice). Recommendation: Org lens default, remember last-used per device.
3. **Nav label.** "Strategy" (short, executive) vs. "Strategic Plan" (formal). Recommendation: "Strategy" in the nav, "Strategic Plan" as the page H1 if you want the formal name somewhere.
4. **Unassigned tray placement.** Org lens only (exec decision surface) vs. also in the Measures view. Recommendation: Org lens only, to keep the Measures view about tracking, not triage.

---

*Spec ends. No implementation code is part of this document.*
