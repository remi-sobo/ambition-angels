# Spec: Strategy Narrative (BloomOS strategy section)

*Paste-ready Claude Code kickoff prompt at the top. Full spec below. No implementation code until the spec is approved.*

---

## Paste-ready kickoff prompt for Claude Code

> We are building a new surface in BloomOS called the Strategy Narrative: a login-gated, presentation-grade view inside the strategy section that Remi pulls up live while talking to a funder. It reads from the OGSM tables and the finance tables and tells one flow: the plan, what it costs us to raise, and how we raise it. Visual reference is ambitionangels.org/update (scrollytelling, cream-and-brown, big serif headers), but this version shows the engine, the OGSM and the money math, not the polished public pitch.
>
> Do Phase 0 first and stop. Phase 0 is read-and-report only: no UI, no schema changes. Report back the strategy section routing, the existing data-access layer for plan_* and fin_* tables, the design tokens in use, and the auth gate, then propose the smallest Phase 1 PR. One PR at a time. Small reversible changes. Do not touch the metered Claude agent. Do not auto-apply migrations.

---

## Problem statement

Remi needs to walk a funder through the strategy and the ask in a single, credible flow, live, on a screen, without flipping between a deck, a spreadsheet, and the CRM. Today the plan lives in the strategy tables, the money lives in the finance tables, and the story lives in his head or in a static page. He wants one place he logs into that renders the current plan, the rebased raise, and the funding approach as a guided narrative, always reflecting live numbers, so he is never presenting a stale slide.

## Scope

**In:**
- A new tab/route in the strategy section: the Strategy Narrative.
- Three movements in fixed order: (1) The Plan, (2) What We Need to Raise, (3) How We Raise It.
- Reads live from `plan_foundation`, `plan_objectives`, `plan_goals`, `plan_initiatives`, `plan_kpis`, `funder_angles`, and from `fin_config`, `fin_budget`, `gifts`, `opportunities`.
- A presenter mode: full-screen, large type, keyboard navigation between sections, safe to show in a room.
- Cream-and-brown palette, WCAG AA contrast, the shared status scale, thresholds from the central config module.

**Out:**
- No editing of the plan or the money here. This surface is read-only. Editing stays in the existing strategy and finance admin screens.
- No changes to the public ambitionangels.org/update page (that follows later, by hand, once this reads right).
- No new schema, no migrations. If a number needs a home (for example the committed floor), it already lives in `plan_kpis` by `metric_key`; read it from there.
- No write to the metered research agent or the daily briefing surface.

## Architecture sketch

Route sits inside the existing strategy section (Phase 0 confirms the exact path, likely `/admin/strategy/narrative`, with presenter at the same path under a `?present=1` mode or a nested `/present`).

Data flow, all server-side reads, no client fetching of secrets:

```
Movement 1  The Plan
  plan_foundation         -> mission / vision framing
  plan_objectives (4)     -> sorted by sort_order
    plan_goals            -> by objective_id, sort_order
      plan_initiatives    -> by goal_id (the strategies)
      plan_kpis           -> by goal_id (the measures), target vs current, status

Movement 2  What We Need to Raise
  plan_kpis (by metric_key)        -> targets: dollars_raised_fy26 (floor 800k),
                                      dollars_ceiling_fy26 (1,247,982), cash_runway_months
  gifts (gift_date in FY)          -> raised to date (live actual)
  opportunities (open, FY close)   -> weighted pipeline = sum(ask_amount * probability/100)
  fin_config                       -> cash_starting_balance, monthly_burn_baseline
  fin_budget + fin_categories      -> allocation breakdown (where the money goes)
  derive: gap = floor - raised; realistic = raised + weighted

Movement 3  How We Raise It
  funder_angles (8)                -> the doors and the warm-intro frame
  opportunities grouped by stage   -> live pipeline shape
  plan_kpis (corporate_raised, aig_multiyear_commitments) -> channel progress
```

Targets come from the OGSM (`plan_kpis`), actuals are computed from finance, so the narrative and the plan never drift. One shared computation module for the money math, reused by this surface and any forecast view, so a dollar is counted in exactly one state.

## Staged build order

- **Phase 0: Recon (read and report, stop).** Map the strategy section routing, the existing data-access helpers for `plan_*` and `fin_*`, the design-token module, the status-scale and threshold config, and the auth gate. Propose the Phase 1 PR. No code. Commit point: a recon note, no app changes.
- **Phase 1: Read layer.** One server module that returns the three movements as typed data (plan tree, money summary, funding approach). No UI yet. Commit point: functions return correct shapes, verified against live rows.
- **Phase 2: Movement 1, The Plan.** Render foundation, objectives, goals, strategies, measures, using existing tokens and the status scale. Commit point: the seeded OGSM renders correctly at the route.
- **Phase 3: Movement 2, The Raise.** Floor, ceiling, secured, weighted pipeline, gap, runway, allocation. Numbers match what the finance screens show. Commit point: a known figure (raised to date) matches the finance view to the dollar.
- **Phase 4: Movement 3, How We Raise It.** Angles from `funder_angles`, live pipeline by stage, channel progress. Commit point: angles and pipeline render from live data.
- **Phase 5: Presenter mode.** Full-screen, large type, keyboard nav, no chrome. Commit point: Remi can run the full flow start to finish on one screen with arrow keys.

## Definition of done

- Remi logs in, opens the strategy section, opens the Narrative tab, and walks Plan, then Raise, then How, in order.
- Every number on the Raise movement matches the finance screens to the dollar on the same day.
- Targets shown trace back to `plan_kpis`; actuals trace back to finance reads; nothing is hardcoded in the component.
- Presenter mode fills the screen, reads at arm's length, and advances by keyboard.
- Changing a goal or a KPI in the strategy admin changes what the Narrative shows on next load, with no code edit.

## Failure modes to watch for

- **Hardcoded numbers.** A figure typed into the component instead of read from the tables. Manifests as the Narrative disagreeing with the finance screen after any change. Guard: all numbers come from the read module.
- **Double-counting dollars.** Weighted pipeline that includes already-won or stewardship opportunities, inflating the ask. Manifests as a realistic total higher than reality. Guard: the shared money module counts each dollar in exactly one state (open-weighted, committed, or realized), and excludes `steward` and `lost`.
- **Stale targets after a reseed.** The OGSM is reseeded but the Narrative caches old values. Manifests as old goals showing after a known change. Guard: server reads on each load, no long cache on this surface.
- **Contrast drift in presenter mode.** Large cream-on-cream type that fails AA when projected. Manifests as unreadable text in a bright room. Guard: AA check on the presenter palette specifically.
- **Auth gap.** The route renders outside the admin gate and leaks the money math. Manifests as the page loading without login. Guard: confirm the gate in Phase 0 and verify before Phase 2.

---

*Spec written. Review it, then say approved or describe changes. No code will be written until you approve. Phase 0 is recon only.*
