# Spec: Strategy Plan — Funder Readiness

*Two builds. Build 1 fail-proofs the Ambition Angels plan and the Narrative surface so it survives a live funder walkthrough. Build 2 upgrades BloomOS itself so no plan — this org's or the next tenant's — can render the same incoherencies again. Paste-ready kickoff prompts at the top of each build. No implementation code until the build is approved.*

---

## Why this exists

A consultant read the live Strategy Narrative (`/admin/strategic-plan/narrative`) the way a program officer or a serious individual donor would, against the real rows in `plan_*`, `fin_*`, `strategy_angles`, and `opportunities`. The arithmetic ties out — the floor allocation sums to exactly $1,117,782, and floor + $250K staged = the $1,367,782 ceiling. The problems are not math. They are **credibility tells, an unclosed bridge from "realistic" to the floor, internal strategy leaking into a funder-facing view, and the absence of the three things that make a plan actionable: time, baselines, and proof.**

This spec turns that review into buildable work. Every finding below is tagged with the build that fixes it.

### Findings → build map

| # | Finding (what a funder sees) | Build |
|---|---|---|
| F1 | Internal playbook language ("do not lead with it", "reject cold proposals", "lands better") renders in the funder view via `strategy_angles.ask`/`approach`. | 1 + 2 |
| F2 | Two "raised to date" numbers disagree: floor-raised **$198,309.71** vs ceiling-raised **$196,310**. Ceiling can't be raised less than floor. | 1 + 2 |
| F3 | All four objectives show **On track** while their KPIs read Behind / Not started. The roll-up contradicts the leaves. | 1 + 2 |
| F4 | The "$400K non-negotiable platform build" is named three times in prose but has no visible line in the allocation. | 1 |
| F5 | The $1,117,782 floor is not decomposed by source (foundations / corporate / individual / AIG / earned). | 1 + 2 |
| F6 | The math to the floor doesn't close: honest gap ~$683K, gap-to-floor ~$919K, weighted pipeline only $236,500, pipeline *target* only $650K. ~$450K is unsourced. | 1 + 2 |
| F7 | 2.26-month runway is buried as one stat among six; there is no near-term bridge ask separate from the annual floor. | 1 + 2 |
| F8 | $4.07M of "steward" pipeline (233 records) is excluded and never explained — correct to exclude, but it reads as a void and undersells the org. | 1 |
| F9 | The staged-tier unlock trigger (`fin_config.contingency_unlock_threshold = 1.09`) is asserted as "unlocks as money lands" with no dollar figure. | 1 |
| F10 | No timeline anywhere — everything is annual "2026", no quarters, no sequencing, even where the plan states a dependency ("program lead gates Coach"). | 1 + 2 |
| F11 | KPIs have no baselines — a wall of "Not started" with null currents, even where prose says a starting count exists ("roughly 20 current partners"). | 1 + 2 |
| F12 | No traction / proof anchor before the asks (the public site has 3,500+ teens, 87% Title I, 1,100+ hours). | 1 |
| F13 | Key-person concentration: nearly every initiative and KPI is owned by Remi, including the entire $1.1M raise. | 1 |
| F14 | "AIG" is an undefined acronym in a funder-facing doc and has a count target (10) but no dollar target. | 1 |
| F15 | "Place-Based" is labelled "our cleanest validated angle" but has **0** funders mapped; 5 of 8 doors have 0 funders; 8 prospects total against a $1.1M raise. | 1 + 2 |
| F16 | Depth vs breadth unreconciled: "four internships a year" vs "1,000 teens active 2×/week". | 1 |
| F17 | FOS lift shows 14% **On track** on an instrument the plan itself calls "not a validated instrument this year". | 1 |

---
---

# BUILD 1 — Fail-proof the Ambition Angels plan & the Narrative

## Paste-ready kickoff prompt for Claude Code

> We are fail-proofing the Ambition Angels Strategy Narrative for a live funder walkthrough. Two kinds of change: (A) data corrections to the live `plan_*`, `fin_*`, and `strategy_angles` rows in the Ambition-Angels Supabase project, and (B) read/render changes in `lib/admin/strategy/narrative.ts` and `app/admin/strategic-plan/narrative/_components/*`. Do Phase 0 first and stop: read the current rows and report exactly which values you would change and which component lines you would touch, with before/after. No data writes and no schema changes in Phase 0. One reversible PR per phase after that. Do not touch the metered Claude agent. Do not auto-apply migrations. The money math already lives in `lib/admin/strategy/money.ts` — reuse it, never hardcode a number in a component.

## Scope

**In:**
- Correcting the AA plan content so it is internally consistent and funder-safe (data in Supabase + a small amount of narrative copy).
- Narrative-app changes that *render* the corrections and prevent the incoherent ones from showing (objective status from roll-up; one computed "raised"; a coverage/bridge block; a runway-bridge callout; a funder-safe view of the doors; a proof strip).
- No new tenant-wide schema beyond what Build 1 strictly needs (a couple of nullable columns are allowed where a value has nowhere to live today; anything structural is Build 2).

**Out:**
- The generalized engine, the funder-readiness linter, and the internal/external field model — those are Build 2.
- The public `/update` page.
- Any change to how gifts, opportunities, or finance are recorded.

## What changes, finding by finding

### 1A — Data corrections (Supabase, Ambition-Angels project `kzzdtibbwsucloaoqpqa`, org `17c75da8-…`)

- **F2 — one "raised" number.** Stop surfacing two manual "raised" values. Bind both the floor metric (`dollars_raised_fy26`) and the ceiling metric (`dollars_ceiling_fy26`) progress to the live computed `secured` from `computeSecuredFy`, so "raised toward floor" and "raised toward ceiling" are the *same* secured dollars measured against two different targets. Net: the $198,309 / $196,310 split disappears.
- **F4 — give the $400K build a home.** Add a visible allocation line for the platform build (either its own `fin_categories` row in the PROGRAM group, or split PROGRAM into "Platform build $400K" + "Program delivery $99K"). The number featured in prose must be a number a funder can point at in the allocation bars. Floor total must still sum to $1,117,782.
- **F5 — decompose the floor by source.** Stand up the channel target rows so the $1,117,782 is shown as a sum across foundations / corporate / individual / AIG / earned. Corporate already exists ($100K). Remi sets the rest; they must sum to the floor. (Decision input — see "Decisions required".)
- **F8 — explain steward.** Add one line of copy to Movement 2/3 defining steward (active/renewing relationships) and, if available, a "likely renewals" figure, so $4M of stewarded relationships is acknowledged rather than void.
- **F9 — state the unlock trigger.** Surface the dollar figure behind `contingency_unlock_threshold` (1.09 × floor ≈ $1.218M) as the explicit point the $250K staged tiers turn on.
- **F11 — baselines.** Populate `current` for the KPIs that have a real starting value today (partners running 2×/week, active teens, MOUs, etc.). Where the model has no baseline field, use Build 2's `baseline` column; for Build 1, at minimum set today's `current` so nothing reads "—".
- **F13 — distribute ownership.** Re-assign `owner` on initiatives/KPIs to the real owners (Demetric already owns platform items; name board members on board-fundraising; Shannon on compliance). The $1.1M raise should show named board give/get owners, not Remi alone.
- **F14 — define AIG.** Expand the acronym in the KPI title and the door copy, and add a dollar target to the AIG channel (not just "10 commitments").
- **F15 — map prospects to doors.** Either map the existing place-based prospects (StriveTogether et al.) onto the Place-Based angle and add named funders to the live doors, or set the 5 empty doors to a non-rendering/"draft" state so the funder view only shows doors with real prospects behind them.
- **F17 — down-rank FOS honesty.** Mark FOS lift as explicitly directional in its title/footnote and don't show it with an "On track" green chip as if it were a validated outcome; let careers-exposed be the hard outcome it's billed as.
- **F1 — funder-safe door copy.** Move the internal strategy out of `ask`/`approach` (see 1B for the render rule). For Build 1, rewrite the AA `ask` fields into clean funder-facing asks and relocate the coaching notes to `approach` (which Build 1 stops rendering in the funder view).

### 1B — Narrative app changes (code)

- **F3 — objective status from the roll-up.** `MovementPlan` currently renders `objective.status` (a hand-set dropdown). Change Movement 1 to derive the displayed objective/goal status from its KPI roll-up (the same `deriveHealth(...)` already used by `PlanControls`/`RollupChip`), or show both with the roll-up dominant. The green header can no longer sit on red leaves. *File:* `app/admin/strategic-plan/narrative/_components/MovementPlan.tsx`, reusing `lib/admin/plan/health`.
- **F2 — render one raised number** off `money.secured` (already computed in `getRaiseMovement`) anywhere a "raised" figure appears in Movement 1's KPI rows, not the stale `plan_kpis.current`. *File:* `lib/admin/strategy/narrative.ts` (Movement 1 fundraising KPIs read computed actuals like Movement 2 does).
- **F6 — a coverage / bridge block in Movement 2.** Add an explicit "How the floor closes" breakdown: secured → + weighted pipeline → + named coverage → residual to floor. Today Movement 2 shows the gap and "the honest number" but not the bridge that closes it. Render the residual as the unsourced amount in plain sight (a funder will compute it anyway; better we show it). *File:* `MovementRaise.tsx` + a `coverage` field added to `MoneySummary` in `narrative.ts`.
- **F7 — runway-bridge callout.** Promote runway from one of six stat tiles to a distinct near-term ask: "$X to bridge to [date] while the annual raise closes," driven by `cashOnHand`, `monthly_burn_baseline`, and `runwayMonths` from the finance snapshot, with the threshold colors from `lib/admin/thresholds`. *File:* `MovementRaise.tsx`.
- **F1 — stop rendering internal door notes.** Movement 3 renders `a.ask` and (implicitly) internal notes. Render only the funder-safe `hook` + a clean `ask`; never render `approach`. *File:* `MovementHow.tsx`.
- **F10 — quarterly sequence.** Render `target_date` (already on `plan_goals`) and add a simple Q1–Q4 marker per objective/goal so the plan shows *when*, not just *what*. *Files:* `MovementPlan.tsx`, plus populate `plan_goals.target_date` in 1A.
- **F12 — proof strip.** Add a short traction band before Movement 1 (3,500+ teens / 87% Title I / 1,100+ hours) so a cold funder gets "why you / what's worked" before the asks. Pull from a single source, not re-hardcoded (these stats live in several public pages per `CLAUDE.md` — read them from one place). *File:* `MovementPlan.tsx` header or a new `MovementProof` lead.
- **F15 — hide empty doors in the funder view** (render only doors with ≥1 mapped funder, or a `draft` flag), so the funder never sees five empty frames. *File:* `MovementHow.tsx`.
- **F16 — reconcile depth vs breadth** in copy: state the relationship between 1,000 active teens and the 4-internships rhythm (one explanatory line). Data/copy only.

## Decisions — LOCKED (2026-06-26)

1. **The $400K build** — it is the **tech partner** build, and it already exists as a discrete budget line (`program.tech-app`, "App creation & maintenance", $400,000) inside the PROGRAM group. No data change needed; the Narrative renders budget line-items within each group so the $400K shows.
2. **Floor by source** (sums to $1,117,782): **Corporate $100,000 · Individual $510,000** (multi-year individual / "AIG" folded in here) **· Foundations $507,782 · Earned $0.** Individual is the largest; foundations a few thousand under it.
3. **Runway bridge** — computed, not typed: restore the 6-month cushion = 6 × $50K burn − $113K cash = **$187,000**, shown as the urgent ask distinct from the annual floor.
4. **Residual to the floor** — shown explicitly as **"named coverage still to develop,"** not hidden, closing by naming prospects against the Movement 3 doors.

## Build 1 — executed (2026-06-26)

**Shipped (code):** status roll-up so an objective can't show greener than its measures (F3); one reconciled "raised" number (F2, ceiling bound to live secured); the **bridge to the floor** block — secured → +weighted → residual-as-named-coverage → floor (F6); the **near-term runway bridge** callout (F7); the **how the floor is sourced** block (F5); budget **line-items** within each allocation group, surfacing the $400K platform build (F4); the staged-tier **unlock trigger** dollar figure (F9); a steward definition (F8); a **proof strip** before the plan with FOS marked directional (F12, F17).

**Shipped (data, Ambition-Angels project):** ceiling raised reconciled to live secured and set to auto (F2); "AIG" renamed to "Multi-year individual commitments (3-year)" (F14); three `floor_source_*` channel-target KPIs summing to the floor (F5); internal coaching moved out of the funder-facing `ask` into `approach` across the doors (F1).

**Deferred to Remi (need real-world inputs, not fabricated):** quarterly `target_date`s / sequencing (F10); manual KPI baselines where no live metric exists — e.g. current partner count, active-teen baseline (F11); board give/get owners on the raise (F13); mapping named prospects onto the doors and deciding which empty doors to hide (F15); the one-line depth-vs-breadth reconciliation copy (F16). These are the structural defaults Build 2 will enforce.

## Staged build order

- **Phase 0 — Recon (read & report, stop).** Dump the current AA rows for every finding, list the exact data edits and the exact component lines, with before/after. No writes.
- **Phase 1 — Consistency data fixes (F2, F4, F14, F17, F1-data).** The corrections that have one right answer. Commit point: the two raised numbers reconcile; the build line shows; AIG is defined.
- **Phase 2 — Roll-up & render guards (F3, F1-render, F15-render).** Objective status from roll-up; internal door notes no longer render; empty doors hidden. Commit point: no green header over red leaves; no internal copy in the funder view.
- **Phase 3 — The money bridge (F5, F6, F7, F8, F9).** Floor-by-source, coverage/bridge block, runway-bridge callout, steward line, unlock trigger. Commit point: a funder can trace secured → realistic → floor with the residual in plain sight.
- **Phase 4 — Actionability (F10, F11, F12, F13, F16).** Baselines, quarterly markers, proof strip, ownership, depth/breadth line. Commit point: every KPI has a baseline or a reason it doesn't; the plan shows when and who.

## Definition of done

- No two numbers on the surface that claim to be the same thing disagree.
- No objective shows a status greener than its own measures.
- No internal targeting language renders in the funder view.
- A funder can read floor → sources → secured → pipeline → named coverage → residual, and the residual is shown, not hidden.
- The runway bridge is a distinct, datable ask.
- Every funder-facing door has at least one mapped prospect, or it isn't shown.
- Changing a row in the strategy/finance admin still changes the Narrative on next load (no regressions to the live-read guarantee).

## Failure modes to watch

- **Re-hardcoding.** Any corrected number typed into a component instead of read from `money.ts`/`narrative.ts`. Guard: all numbers trace to the read module.
- **Roll-up that hides a real red.** Deriving objective status from KPIs must not average a Behind into On-track. Guard: worst-leaf-dominates, matching `deriveHealth`.
- **Over-hiding.** Hiding empty doors must not also hide a door Remi *wants* to pitch with a named-but-unlinked prospect. Guard: a `draft` flag Remi controls, not an automatic count cutoff alone.
- **Baseline backfill that fabricates.** Only set `current` where a real number exists; leave honest blanks where there is no measurement, with a "baseline TBD" rather than a fake 0.

---
---

# BUILD 2 — Upgrade BloomOS so no plan can drift

*Build 1 fixes this plan. Build 2 makes the platform enforce funder-grade structure for every org, so the same class of incoherence can't reappear after the next reseed or in the next tenant.*

## Paste-ready kickoff prompt for Claude Code

> We are upgrading the BloomOS strategy engine so a plan cannot render the incoherencies we just hand-fixed for Ambition Angels. Five capabilities: (1) computed status roll-up as the default for objectives/goals; (2) a baseline field and a "no metric without a baseline-or-reason" rule; (3) an internal-vs-funder-facing field model for the doors so internal strategy can never leak; (4) a money "bridge" model — sources, named coverage, residual — computed in one place; (5) a Funder-Readiness Linter that scores a plan and lists every blocker before it can be presented. Do Phase 0 first and stop: audit the current schema (`plan_*`, `strategy_angles`, `fin_*`), the roll-up helper `lib/admin/plan/health`, the money module `lib/admin/strategy/money.ts`, and the auto-metric registry `lib/admin/plan/metrics.ts`, and report the smallest migration set. One reversible migration + PR per phase. Never auto-apply migrations. Everything stays org-scoped.

## Scope

**In:**
- Tenant-wide schema and engine changes so the patterns Build 1 hand-applied become structural defaults.
- A linter surface in the strategy admin that blocks/flags a plan that isn't funder-ready.

**Out:**
- AA-specific content (that's Build 1).
- The public site, the metered research agent, finance recording mechanics.

## Principle #0 — everything editable at its source

No funder-facing value lives hardcoded in a component. Anything Remi might want to change — proof points, channel targets, the runway target, door copy, status — is stored in a table and editable from the strategy/finance admin, with the Narrative reading it live. Every upgrade below is held to this: if it adds a value, it adds the place to edit it.

## Phase 1 — executed (2026-06-26): the Build-1 additions are now editable at source

- **Proof points** moved out of the component into `plan_foundation.proof_points` (jsonb, additive migration `strategy_proof_points.sql`). Edited in the Foundation panel on `/admin/strategic-plan` (one `value | label` per line); read live by Movement 1, with the headline stats as a fallback only until an org sets its own.
- **KPI targets** (including the floor-by-source amounts: Individual $510K / Foundations $507,782 / Corporate $100K) are now inline-editable in `KpiRow` — the target is a human goal, editable on every KPI including auto ones (the system computes the actual, you set the target). The API already accepted `target`; this adds the control.
- **Still code-config, flagged for a later phase:** the runway *target* months (6) lives in `lib/admin/thresholds` (`FINANCE.runwayWatchMonths`). Surfacing a thresholds editor (or moving it to `fin_config`) is B2-4's runway-bridge work.

## The five upgrades

### B2-1 — Computed status roll-up (fixes F3 class)
*Build 1 already ships the roll-up in the Narrative read layer; B2-1 makes it the platform default in `PlanControls`/scorecard and adds the reasoned-override model.*
Today objective/goal `status` is a free dropdown that can contradict its KPIs (the Narrative even reads the manual value). Make the **roll-up the default**: objective status = worst-leaf of its goals' KPIs via `deriveHealth`; goals = worst-leaf of their KPIs. Allow a manual override only with a stored reason (`status_override`, `status_override_reason`), and render the override visibly as an override. The Narrative and `PlanControls` both read the computed value. *Touches:* `lib/admin/plan/health`, `plan_objectives`/`plan_goals` (add override columns), `narrative.ts`, `PlanControls.tsx`.

### B2-2 — Baselines & the "no naked target" rule (fixes F11/F10 class)
Add `baseline` and `baseline_date` to `plan_kpis`. Every KPI carries where it started, not just target and current, so the surface can always show momentum (start → now → target) instead of a wall of "Not started". Add an optional `due_date`/cadence so "by when" is structural. The KPI editor requires a baseline or an explicit "baseline TBD" reason. *Touches:* `plan_kpis` (migration), `PlanControls.tsx` `NewKpiForm`/`KpiRow`, the narrative `MeasureRow`.

### B2-3 — Internal vs funder-facing field model (fixes F1 class)
Split the doors so internal strategy can never render to a funder. Either add `audience` to the relevant text fields, or formalize: `hook` + `funder_ask` = funder-facing; `approach` + a new `internal_notes` = internal-only, never rendered outside an internal/presenter-internal mode. The Narrative funder view reads only funder-facing fields by contract. Generalizes to any tenant's `strategy_angles`. *Touches:* `strategy_angles` (migration), `narrative.ts` (`getHowMovement` selects funder-facing only), `MovementHow.tsx`, the angle editor.

### B2-4 — The money bridge model (fixes F5/F6/F7 class)
Make "how the floor closes" a first-class, single-source computation, not a per-surface derivation:
- **Sources:** a `fundraising_sources` (or `plan_channels`) concept so the floor is decomposed by channel and the decomposition is *required to sum to the floor* (a stored invariant, surfaced as a lint error if it doesn't).
- **Named coverage:** beyond `secured` and `weightedPipeline`, a place to attach named prospects as coverage so the residual is computed (`floor − secured − weighted − namedCoverage`) rather than left implicit.
- **Runway bridge:** a computed near-term bridge figure (cash, burn, horizon) exposed as its own value alongside the annual floor.
All of it extends `lib/admin/strategy/money.ts` so the scorecard, the Narrative, and any forecast read the identical bridge. *Touches:* `money.ts`, a migration for sources/coverage, `narrative.ts` `MoneySummary`.

### B2-5 — The Funder-Readiness Linter (the keystone)
A function + admin surface that scores a plan against the funder-readiness rules and lists every blocker, so a plan is never presented half-baked. Checks, each mapped to a finding class:
- no two "same-thing" numbers disagree (F2)
- no status greener than its leaves (F3)
- floor decomposition sums to the floor (F5)
- floor is fully covered by secured + weighted + named coverage, or the residual is explicitly acknowledged (F6)
- a runway bridge exists when runway < threshold (F7)
- every funder-facing door has ≥1 mapped prospect or is `draft` (F15)
- every KPI has a baseline or a "TBD" reason (F11)
- no `internal_notes`/`approach` field is reachable by the funder view (F1)
- every objective/goal/KPI has an owner and a date (F10/F13)
Render it as a "Funder readiness: 8/11 — 3 blockers" panel on `/admin/strategic-plan` with a click-through to each offending row. Presenter mode refuses (or warns hard) below a threshold. *New:* `lib/admin/strategy/readiness.ts`, a panel component, a check on the Narrative/presenter route.

## Staged build order

- **Phase 0 — Schema & engine audit (read & report, stop).** Confirm columns, the roll-up helper, the money module, the metric registry; propose the minimal migration set per upgrade. No code.
- **Phase 1 — Roll-up default (B2-1).** Migration for override columns; engine + Narrative + controls read computed status. Commit point: status can't contradict leaves without a visible, reasoned override.
- **Phase 2 — Baselines (B2-2).** Migration; editor + render show start → now → target. Commit point: no naked targets.
- **Phase 3 — Internal/external fields (B2-3).** Migration; funder view reads funder-facing only, by contract. Commit point: internal notes are unreachable from the funder view in code, not by discipline.
- **Phase 4 — Money bridge (B2-4).** Sources + named coverage + runway bridge in `money.ts`; invariant that sources sum to floor. Commit point: one computation feeds scorecard + Narrative; residual is explicit.
- **Phase 5 — Readiness linter (B2-5).** The scoring function + the admin panel + the presenter gate. Commit point: a plan reports its blockers, and presenter mode won't show a plan that fails the hard checks.

## Definition of done

- Reseeding the OGSM or onboarding a new tenant produces a plan that, if incoherent, *fails the linter loudly* rather than rendering quietly.
- Objective status is computed; manual overrides are visible and reasoned.
- Every KPI has start / now / target.
- The funder view cannot reach an internal field — enforced in the read layer, not by copy discipline.
- The floor's source decomposition is required to sum to the floor; the residual to close is always computed and shown.
- The strategy admin shows a funder-readiness score and a blocker list; presenter mode respects it.

## Failure modes to watch

- **Migration risk on live tenants.** Additive, nullable columns only; backfill in a separate step; never block existing rows. Guard: one reversible migration per phase, never auto-applied.
- **Linter that cries wolf.** Too many soft warnings and it gets ignored. Guard: separate hard *blockers* (presenter-gating) from soft *advice*; keep blockers few and unarguable.
- **Roll-up override abuse.** If override is frictionless it just recreates F3. Guard: override requires a reason and renders as an override, not as truth.
- **Double-counting in the bridge.** Named coverage that overlaps weighted pipeline or secured re-inflates the close. Guard: reuse the "one dollar, one state" rule from `money.ts`; coverage is a distinct state from open-weighted and realized.

---

## Sequencing the two builds

Build 1 is the urgent, funder-facing pass — it makes the current plan safe to present and can ship in days against the live AA rows. Build 2 is the durable pass — it converts every Build 1 correction into a structural default and a linter so the fix sticks across reseeds and tenants. Ship Build 1 first; start Build 2 from the patterns Build 1 proves by hand.

---

*Spec written. Review it, then say approved or describe changes. No code or data writes until you approve. Phase 0 of each build is recon only.*
