# Spec: Strategy in the Command Center (one spine, three lenses) — v2.1, UX pass + sequenced build

> Builds on `specs/bloomos-strategy.md` (Phases 1–4, shipped): the spine, auto-metric registry, rollups, and cockpit widgets exist. This is the surface, information-architecture, and **UX/visual design** pass on top of them. v2 adds the design craft the IA-only draft was missing: a verdict line, an exception list, a warm-palette status system, trust and staleness cues, the lens-as-altitude interaction, owner identity, and progressive density. **v2.1 resequences the build order to resolve internal dependency conflicts and fixes four references** (see "Changes in v2.1").
> Status: design only, for Remi's review. No implementation code in this document.

## Changes in v2.1 (review pass)

- **Status tokens already exist (recon).** `tailwind.config.ts` already ships a WCAG-verified `status.*` scale (`healthy`, `watch`, `critical`, `due`, `neutral`, each with `-text`/`-bg`), explicitly intended for chips and the briefing engine. So Phase A needs no token work; the chip component (start of B1) consumes `status.*`, and D audits the *usage* (replacing ad-hoc `bg-expense`/`#C8881B` with the scale).
- **Minimal owner→person resolver pulled into B2.** The Mine lens needs it; only the polish (chips, filter ordering) stays in D.
- **Phase A redirect dropped (recon).** `/admin/kpis` (the 12 computed metrics) and `/admin/strategic-plan/scorecard` (plan KPIs by owner) show *different datasets*, so redirecting one to the other would hide the computed-metric editor. Phase A instead **de-links `/admin/kpis` from the nav but keeps it reachable**; the redirect waits for the unified Measures view in Phase C.
- **Dangling `bloomos-to-ten` reference replaced** with the real design-system source: `tailwind.config.ts` + `globals.css` `.admin-shell`.
- **Verdict-line template grammar pinned** (see UX §"The verdict line") so it can't drift or lie.
- **Mine-default vs. remember-last-used tiebreak** defined (see Open decisions #2).
- **B split into B1 (the glance) and B2 (lens-as-altitude)** so the highest-leverage, lowest-risk slice ships on its own.

---

## Problem statement

The strategy spine works, but it's filed and split wrong, so it doesn't read like a cockpit.

1. **It's buried.** `/admin/strategic-plan` is the last item under **Governance**, the lowest sidebar section (`Sidebar.tsx`, `NAV_SECTIONS`). For a nonprofit executive the plan is the home screen, not a neighbor of compliance filings.
2. **KPIs are two disconnected systems and nobody knows which to trust.** `/admin/kpis` shows 12 computed metrics (the org's live vital signs, `lib/kpis.ts`). `/admin/strategic-plan` `plan_kpis` shows strategic measures tied to goals (the targets we chose). Same status scale, different nav sections, no UI link between them. A KPI with no objective above it is just a number on a wall.
3. **No single answer to "are we winning, and who owns it?"** The cockpit's Strategy Health widget, the deep plan, the scorecard, the per-person view, and the computed metrics are five surfaces telling five partial stories.

And the deeper one v2 fixes:

4. **Even consolidated, the plan reads like a database, not a cockpit.** A tree of objectives, goals, KPIs, and initiatives is a CRUD structure. An executive opening it still has to assemble the verdict in their head. The surface has to do that work for them.

## Who is affected

- **Remi (CEO), first.** Opens BloomOS and reads "are we winning" at a glance, then drills into an area or his own numbers before the Monday plan and the monthly review.
- **Shannon and future AA staff.** Want their slice: the objectives, goals, KPIs, and initiatives they own, and only those.
- **Tenant nonprofit leaders, later.** The plan as a cockpit, not a CRUD tree, at executive altitude.

## Current behavior

- Strategy lives at `/admin/strategic-plan` (Foundation → Objectives → Goals → KPIs + Initiatives) with sub-routes `setup`, `scorecard`, `people`, `review`.
- Computed metrics live at `/admin/kpis` (`lib/kpis.ts` registry, `kpi_settings` targets, `kpi_snapshots` history).
- Both "KPIs" and "Strategic Plan" sit under **Governance**.
- `plan_kpis.metric_key` + `source='auto'` already lets a strategic KPI bind to a computed metric, but no UI lets a user pick a metric to bind, so the two worlds stay separate.
- Ownership is free-text everywhere; the People page guesses by splitting `owner` on `/` and `,`.

## Desired behavior

**One spine. One place. Three lenses. Every measure has a parent, an owner, and a date.**

- The strategic plan is promoted into the **Command Center** nav and becomes the default executive surface: a verdict, then objective health, then the exceptions.
- "KPIs" disappears as a standalone destination. The 12 computed metrics become a **Metrics Library**, a data source that strategic KPIs bind to. A measure only ever appears under the objective or goal it serves.
- Orphan metrics surface in an **Unassigned vital signs** tray, a gentle nudge to attach or retire each one.
- Three lenses over the same data: **Org** (are we winning), **Area** (the department deep-dive), **Mine** (per-person accountability), with a persistent filter bar (area, owner, status, due-for-review).
- KPIs stay with Strategy (are we winning), not Ops (are we doing the work). The **initiative** is the bridge between them.

## Scope

**In:**
- IA: move Strategy into **Command Center**; remove **KPIs** and **Strategic Plan** from Governance.
- A unified Strategy surface: the verdict line, the objective grid, the exception list, the three lenses, and the filter bar, replacing the four-route sprawl with one workspace (sub-routes may remain as deep links).
- The full **UX and visual design** in the section below: status system, trust and staleness cues, lens-as-altitude, owner identity, progressive density, all in the cream-and-espresso admin system.
- The **Metrics Library** fold-in: a metric picker in the KPI editor; the Unassigned vital signs tray; the consolidated Measures view.
- Lightweight **owner→person resolution** so Mine and the owner filter work.
- Retire `/admin/kpis` as a destination (redirect); consolidate `scorecard` + `kpis` into one Measures view.

**Out:**
- New strategy data tables. The existing spine is sufficient.
- Moving KPIs under Team/Ops (re-orphans measures, the bug we're fixing).
- HR machinery (review cycles, 9-box, comp) and any AI authoring of strategy.

## UX and visual design

This is the heart of v2. The surface must do the executive's reading for them.

### Design north star
A nonprofit CEO opens BloomOS and knows "are we winning" in three seconds, with no clicks, then can drop to an area or their own numbers. Serve the glance first, the drill second. This is a cockpit, not a database.

### The verdict line (new)
Above the grid, one synthesized sentence in plain language: e.g. "3 of 4 objectives on track. Fundraising is behind: the grants goal is $180k short with two asks closing this month." Deterministic, assembled from the rollup, no AI. Voice rules apply: specific numbers, no hedging, no filler. This is the three-second answer; the grid below is the evidence.

**Template grammar (pinned, v2.1).** The line is a fixed template over the rollup, never free-form:
- **Clause 1 — the count:** `"{onTrack} of {total} objectives on track."` where `onTrack` counts objectives whose rolled-up health is `on_track`/`done`.
- **Clause 2 — the worst exception** (omitted when none): `"{objectiveTitle} is {status}: {worstMeasureClause}{, asksClause}."`
  - `worstMeasureClause` = the most-behind measure under that objective, phrased by unit: money → `"the {goalTitle} goal is ${gap}k short"` (gap = `target − current`); percent → `"{goalTitle} at {current}% vs {target}%"`; count → `"{goalTitle} at {current} of {target}"`.
  - `asksClause` (fundraising only, optional) = count of `opportunities` with `next_step_due` within the current month, e.g. `"two asks close this month"`. Omitted when zero or non-fundraising.
- No clause is ever invented; every number traces to a rollup field. If a value is missing, the clause is dropped, not guessed.

### Management by exception, made visual
When things are fine the screen looks calm; it looks hot exactly where something is wrong. Healthy objectives recede (quiet taupe, low contrast, no accent). At-risk and behind objectives advance (more weight, a warm accent, an exception badge). The eye is pulled to the problem without hunting for it. A screen that is all one color when healthy and visibly flares where it isn't.

### Status system (solving RAG in a warm palette)
Standard red/amber/green clashes with cream and espresso and fails colorblind users, which would break the locked WCAG AA/AAA targets. So status never relies on hue alone. Each status is a **dot + label + weight**:
- **healthy** — calm neutral or muted sage, low emphasis, recedes.
- **at-risk** — ochre, stays in the warm family, medium emphasis.
- **behind** — a sparing brick red, high emphasis, used rarely so it means something.
- **not-started / neutral** — hairline outline, no fill.
Shape and text carry meaning; color reinforces. Every status chip passes contrast on cream. **The named scale already exists** in `tailwind.config.ts` as `status.*` — `status-healthy` (sage `#2F7D5B`), `status-watch` (ochre `#B5762A`), `status-critical` (brick `#B5482F`), `status-due` (clay `#C0703C`), `status-neutral` (`#6B5C4E`), each with `-text` (AA on cream) and `-bg` (pale tint) variants. B1's chips consume this scale; the only remaining work (Phase D) is replacing ad-hoc usage (`bg-expense`, hardcoded `#C8881B`, `bg-revenue`) on existing surfaces so there's one chip vocabulary.

### The exception list (new)
Directly under the verdict: a short "Needs attention" list, the at-risk and behind items plus overdue reviews, each row linking straight into its Area lens. This is where the eye lands second. A handed-to-you list beats badges scattered across tiles that force a scan. **Reuse the existing `BriefingStrip` ("Needs you today") pattern** so it reads as native BloomOS.

### Trust and staleness on every measure
A measure shows whether you can believe it:
- **auto** measures (live from the spine) carry a quiet "live" tick and their refresh time.
- **manual** measures show last-updated, and go stale-styled when past their cadence ("updated 47 days ago" in ochre).
This is what truly answers "what is this KPI doing." A number you can't date is a number you don't trust.

### Every measure wears its parent and owner
A KPI never floats. In every lens it shows the goal above it and an owner chip beside it. The Unassigned vital signs tray is the explicit home for orphans, designed as accumulating debt (a growing tray should feel like something to clean up), not an error state.

### Owner as identity, not text
Resolve owners to people as initials chips; external owners (Empathy Labs, a contractor) render as visibly different labeled chips. The owner chip is the thread that makes accountability legible and powers Mine and the owner filter.

### Lens-as-altitude (interaction)
Org → Area → Mine is a zoom on one dataset, not three pages. The chrome and filter bar stay put; only the body morphs (grid ⇄ tree). It should feel like zooming in, not navigating. URL-synced so a lens and filter set are shareable and bookmarkable. The lens pill mirrors the existing CEO/Ops role pill for consistency.

### Progressive density
- **Org**: low density, glanceable. Verdict, objective grid, exception list, review nudge, unassigned tray.
- **Area**: medium density. The full objective tree (goals, measures, initiatives) for one objective, with full CRUD parity.
- **Mine**: that tree filtered to the viewer.
The deep editor lives one altitude down, never at the home screen. This is the real cure for "the plan reads like a database."

### Vision banner
Mission and vision at the top, quiet, low-contrast, collapsible. The "why," present but never competing with status. Keeps culture visible without preaching.

### Motion and feedback
Subtle and restrained, matching the brand. Status changes and the verdict update live on edit; saves show a quiet "saved" tick (the existing debounced-persist path). No celebration, no confetti.

### Stay inside the system
The BloomOS admin design system is the source of truth, defined in `tailwind.config.ts` and `app/globals.css` (`.admin-shell` scope): cream workspace (`app: #F5EFE2`), espresso chrome (`#23160D`), taupe (`outline: #C7B18C`) borders and hairline dividers, and the existing chip/type conventions. The Strategy surface should look like it was always part of BloomOS.

## The surface

Route: keep `/admin/strategic-plan` as the canonical route and promote it in nav (smaller blast radius — see Open decisions #1), or move to `/admin/strategy` with a redirect. Opens on **Org** with the lens pill and the filter bar.

```
┌─────────────────────────────────────────────────────────────┐
│  STRATEGY                          [ Org · Area · Mine ]      │  ← lens pill
│  Filter:  Area ▾   Owner ▾   Status ▾   Due for review ▾      │  ← filter bar
├─────────────────────────────────────────────────────────────┤
│  ▸ Vision banner (mission + vision, quiet, collapsible)      │
│  "3 of 4 on track. Fundraising is behind: grants $180k       │  ← verdict line
│   short, 2 asks close this month."                           │
│  NEEDS ATTENTION                                              │  ← exception list
│   • Grants goal $180k short  · Remi   → Fundraising           │
│   • FOS review 12 days overdue · Remi → Program              │
├─────────────────────────────────────────────────────────────┤
│  [ objective grid: 4 tiles, healthy ones quiet, off-target   │
│    ones weighted with a warm accent + exception badge ]      │
│  Unassigned vital signs (tray)                               │
└─────────────────────────────────────────────────────────────┘
```

**Org lens (default, "are we winning").** Verdict line, then a grid of objective tiles (reusing `getStrategyRollup` and `lib/admin/plan/health.ts`). Each tile: objective title + owner chip, status dot + label, 2–3 headline measures as mini current/target bars, initiative completion (`tasksDone/tasksTotal`), and an exception badge when off target. Click drops into Area for that objective. Below: the review nudge and the Unassigned vital signs tray.

**Area lens (the deep-dive).** The existing `ObjectiveCard → GoalCard →` KPIs + Initiatives tree (`PlanControls.tsx`), scoped to the selected objective, full CRUD parity preserved. Measures show the auto/manual badge, last-updated, and trend.

**Mine lens (per-person).** The same tree filtered to items the viewer owns, owner filter defaulted to the logged-in user. Formalizes today's People page.

## Folding KPIs in (the Metrics Library)

**a. Metric picker in the KPI editor.** Editing a `plan_kpi`, offer "Track automatically" → a dropdown of `lib/kpis.ts` entries (label + current live value). Selecting one sets `source='auto'` and `metric_key`; `current` then refreshes via the existing `RefreshMetricsButton` path. Manual measures keep `source='manual'`. The binding columns already exist; this is the missing glue.

**b. Unassigned vital signs tray.** On Org, list `lib/kpis.ts` metrics bound to no `plan_kpi`. Each row: label, live value, and two actions, "Attach to a goal" (opens the KPI editor pre-filled) or "Hide" (`kpi_settings.active = false`). Either a metric proves a goal, or it parks here pending a decision.

**c. Consolidate the scorecards.** `/admin/kpis` (computed) and `/admin/strategic-plan/scorecard` (plan KPIs) merge into one **Measures view** reachable from Strategy: all measures, grouped by objective or owner (toggle), each with current/target bar, sparkline (`kpi_snapshots`/`plan_kpi_snapshots`), status, and the auto/manual + staleness badge. `/admin/kpis` redirects here (Phase C).

## Owner → person resolution

- A small resolver maps an `owner` string to an `AdminUserId` (`remi`/`shannon`) on a confident name match, leaving external owners as free-text labels.
- Mine filters to items whose resolved owner = the logged-in user. The owner filter lists resolved people first, then distinct labels.
- No new table for AA; the resolver is a pure function over existing `owner` strings plus the `AdminUserId` set. Real people-tables are a later, tenant concern.

## Information architecture

```
Current:  Command Center  Overview · Executive Briefing · How-To Guide
          Governance       Board · Compliance · KPIs · Strategic Plan

Target:   Command Center  Overview · Strategy · Executive Briefing · How-To Guide
          Governance       Board · Compliance
```

Strategy becomes the second Command Center item. KPIs leaves the nav (route redirects into Strategy). Governance returns to board and compliance. Nav label "Strategy"; keep "Strategic Plan" as the page H1 if the formal name is wanted.

## Component & route plan (for the build phase)

- **Reuse:** `getStrategyRollup`, health/work rollups (`lib/admin/plan/health.ts`, `lib/admin/overview/sources.ts`); `ObjectiveCard`/`GoalCard`/KPI + initiative rendering (`PlanControls.tsx`); `lib/kpis.ts` + `computeKpis`; the existing snapshot/sparkline rendering; the `BriefingStrip` pattern for the exception list.
- **New:** a `StrategyWorkspace` client shell (lens pill + filter bar + URL-synced state); the verdict line and "Needs attention" list (deterministic from the rollup); the Org-lens objective grid; the Metrics Library picker; the Unassigned tray; the `owner→person` resolver; the warm-palette status chip set.
- **Nav:** edit `NAV_SECTIONS` in `Sidebar.tsx`; the `IconName` union already has `strategy` and `kpis`.
- **Redirects:** `/admin/kpis` stays reachable but de-linked from nav in Phase A; redirect to the unified Measures view in Phase C; keep `/admin/strategic-plan/*` resolving throughout.

## Staged build order (resequenced, v2.1)

- **Phase A — Promote & reframe (nav only, ~1 PR).** Move Strategy into the Command Center section, second item after Overview. Remove KPIs and Strategic Plan from Governance. `/admin/kpis` stays reachable (still linked from the How-To guide and direct URL) but leaves the nav; its redirect waits for the Measures view in Phase C. No token work needed — the `status.*` scale already exists. No data changes, no component rewrites. Commit point: leadership reaches the plan from the top of the nav; Governance is back to board + compliance; the confusing standalone KPIs item is gone from the nav.
- **Phase B1 — The glance (highest leverage, low risk).** The status-chip component (built first, on the Phase A tokens); the deterministic verdict line and "Needs attention" exception list; the Org objective grid — all on the Strategy route, read-only over `getStrategyRollup`. No lens machinery yet. Commit point: opening Strategy reads "are we winning" in three seconds.
- **Phase B2 — Lens-as-altitude.** The `StrategyWorkspace` shell: Org/Area/Mine lens pill + filter bar, URL-synced. Area = the existing tree scoped/filtered with full CRUD parity. Mine = owner-filtered, using a **minimal `owner→person` resolver** (pulled forward from D). Commit point: one workspace, three lenses, shareable URLs.
- **Phase C — Metrics Library fold-in.** Metric picker in the KPI editor; the consolidated Measures view; the Unassigned vital signs tray; trust/staleness badges on every measure. Re-point `/admin/kpis` from the interim scorecard to the unified Measures view. Commit point: every computed metric is bound to a goal or sitting in the tray; the two scorecards are one.
- **Phase D — Polish.** Owner-resolution polish (initials chips, external-owner labels, filter ordering); the status-system **audit** (grayscale test, contrast-check on cream across all surfaces); staleness styling everywhere. Commit point: each person opens Strategy and sees their slice, and status reads correctly without relying on color.

## Definition of done

- Strategy is in Command Center; no standalone KPIs, no Strategic Plan under Governance.
- Opening Strategy shows the vision, the verdict line, the objective grid with live health, and the "Needs attention" list, without drilling.
- The verdict and exceptions are deterministic and match the rollup.
- Status reads correctly in grayscale (color is reinforcement, not the only signal); chips pass contrast on cream.
- Switching to Area shows one objective's full tree with full CRUD; Mine shows only what the viewer owns.
- Every `lib/kpis.ts` metric is bound to a `plan_kpi` (under its goal) or listed in the Unassigned tray, with auto/manual and staleness visible.
- The two scorecards are one Measures view; `/admin/kpis` redirects to it.
- A staff member opens Strategy → Mine and sees their slice with no setup.

## Failure modes to watch for

- **The lens switch becomes three half-built pages.** Mitigation: all three render the same spine data; only the filter and top-level layout (grid vs tree) change. Build the data path once.
- **KPIs feel hidden instead of confusing.** Mitigation: the Unassigned tray and in-context measures keep every number visible. Watch the tray stays small; a large tray means strategy and metrics drifted apart again.
- **Status by color alone.** Mitigation: dot + label + weight, tested in grayscale, contrast-checked on cream.
- **The verdict line lies or hedges.** Mitigation: it's a deterministic template (grammar pinned above) over the rollup, never free-form; it states the worst true thing plainly and drops any clause whose data is missing.
- **Owner resolution mislabels external owners.** Mitigation: resolve to a person only on a confident match; otherwise a free-text label. Mine under-includes rather than wrongly claims.
- **Broken bookmarks.** Mitigation: keep `/admin/strategic-plan/*` and `/admin/kpis` resolving (redirect/alias), no hard deletes.
- **Over-consolidation hides the deep editor.** Mitigation: Area must keep full CRUD parity with today's tree. Promotion must not cost editing power.

## Open decisions for Remi

1. **Route name.** Keep `/admin/strategic-plan` and promote in nav (smaller blast radius, no redirects of the main route) vs. new `/admin/strategy` with a redirect. Recommendation (v2.1): **keep `/admin/strategic-plan`** for Phases A–B; revisit a rename only if the formal route name matters, since B builds the new workspace there anyway.
2. **Default lens.** Org for admins (shared reality on a small team), **Mine for non-admin staff** so they land on their slice. **Tiebreak (v2.1):** the role-based default applies on first visit only; once a user manually switches lenses, remember last-used per device and let it win on return.
3. **Nav label.** "Strategy" in the nav, "Strategic Plan" as the H1 if you want the formal name somewhere. Recommendation: yes to both.
4. **Unassigned tray placement.** Org lens only (exec triage) vs. also in Measures. Recommendation: Org only, so Measures stays about tracking, not triage.
5. **Verdict line.** In or out for Phase B1. Recommendation: **in.** It's the single highest-leverage UX element and it's cheap (a deterministic template over data you already roll up).

## Phase A kickoff prompt (paste-ready, recon then one small PR)

```
Read-and-report first, then one small PR. No migrations (this phase is nav and
routing only).

Context: spec at specs/bloomos-strategy-command-center.md. We're promoting
Strategy into the Command Center and retiring the standalone KPIs page. Phase A
is the nav-and-redirect slice only, the lowest-risk piece.

Step 1, report before changing anything, then stop:
- Show the current NAV_SECTIONS in app/admin/_components/Sidebar.tsx exactly as
  written.
- Show where /admin/kpis renders and everything that links to it.
- Show the links inside app/admin/_components/overview/StrategyHealthWidget.tsx.
- Confirm the canonical route stays /admin/strategic-plan (v2.1 decision). List
  every internal link that points at /admin/kpis and would need repointing.
- List the exact file diffs you propose for Phase A.

Step 2, only after I confirm:
- Move Strategy into the Command Center section, second item after Overview.
- Remove KPIs and Strategic Plan from Governance.
- Leave /admin/kpis reachable (de-linked from nav only); its redirect waits for
  the Measures view in Phase C. Keep /admin/strategic-plan/* resolving.
- No token work (the status.* scale already exists), no data changes, no
  component rewrites, no lens work (that's Phase B).

Rules: one PR, small radius, reversible. Stop after the Step 1 report.
```

---

*Spec ends. No implementation code is part of this document.*
