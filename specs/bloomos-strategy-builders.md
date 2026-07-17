# BloomOS — Strategy builders: the OGSM creator (Phase F, spec #6)

Status: draft for review, 2026-07-17
Depends on: Phase C complete (org-scoped writes); the strategy module's existing CRUD surface (`/admin/strategic-plan`, `app/api/admin/plan/*`); Phase E not required.
Companion docs: `specs/bloomos-core-fence.md` (§5 names this: "tenant-facing OGSM setup UX; AA's plan was seeded by SQL, no second tenant can onboard without this"), `specs/bloomos-strategy.md` (the module's original build), `supabase/migrations/2026_ogsm_reseed.MANUAL.sql` (AA's live plan — the reference for "fully functioning").

## 1. Problem statement

The strategy module is complete for *maintaining* a plan and empty-handed for *starting* one. Every editing surface exists — foundation panel, objective/goal/strategy/measure CRUD, health statuses, auto-metric refresh, monthly reviews — but there is no path from a blank org to a working OGSM. Worse, the one "start" affordance that does exist (`SeedButton` → `/api/admin/plan/seed`) is a hardcoded content lift of **Ambition Angels' actual mission, vision, values, and 2026 OGSM**: a Safespace admin clicking "Load starter strategy" would get AA's strategy under their own org id. A second tenant cannot have a functioning strategy today without Remi writing SQL — and the module's promise ("run your org on your plan") is exactly the thing a new tenant should experience in week one.

## 2. Who's affected

- **Safespace (and every future tenant)**: `modules.strategy` is in the standard entitlement set, but the module is a dead end for them until they can author a plan.
- **Remi**: today the only path is hand-SQL (the reseed file); the creator makes strategy onboarding a product motion.
- **AA**: must be untouched — its live plan (1 foundation, 4 objectives, 10 goals, 24 strategies, 18 measures) renders and edits exactly as before. Losing the AA-content seed route costs nothing (AA is seeded; the content lives in git history and the MANUAL reseed file).
- **The scorecard, narrative, reviews, and Reed**: all read the same `plan_*` tables — a creator-authored plan lights up every downstream surface with no extra work.

## 3. Current behavior

- **Schema (all org-scoped, RLS `reports.read` / `org.manage`)**: `plan_foundation` (mission/vision/values/behaviors, one row per org) → `plan_objectives` (health status, 3-year statement) → `plan_goals` (owner, target date) → `plan_initiatives` ("strategies") and `plan_kpis` ("measures": unit/target/current/cadence, `source` manual|auto, `metric_key`). Plus `plan_kpi_snapshots`, `plan_reviews`, objective notes/tasks.
- **CRUD exists end to end**: `FoundationPanel`, `NewObjectiveForm`/`ObjectiveCard`, `NewGoalForm`/`GoalCard`, initiative + KPI forms; API routes under `app/api/admin/plan/*` (writes require `org.manage` via `ctxHasPermission`).
- **Auto metrics are already tenant-generic**: `lib/admin/plan/metrics.ts` `PLAN_METRICS` — ~10 org-parameterized computed measures (grant dollars YTD, grants submitted, corporate dollars, donor updates, active participants, secured vs floor/ceiling, weighted pipeline, corporate raised, cash runway) refreshed by button + weekly cron; `PLAN_METRIC_INFO` carries display labels/units.
- **The empty org experience**: empty sections plus `SeedButton` ("Load starter strategy") which upserts AA's foundation verbatim and seeds AA's 4 objectives / goals / KPIs into the caller's org. The button's label gives no hint the content is another organization's strategy.
- AA's plan was actually installed by SQL (`2026_ogsm_reseed.MANUAL.sql`), not the seed route.

## 4. Desired behavior

- **A guided OGSM creator** walks a new org from nothing to a functioning strategy: **Foundation** (mission, vision, values, behaviors) → **Objectives** (the 3–5 standing pillars + 3-year statements) → per objective, **Goals** (the year's measurable outcomes, with owners) → per goal, **Strategies** (`plan_initiatives`) and **Measures** (`plan_kpis`). Each step teaches the OGSM shape as you fill it (inline explanations + example placeholders in the youth-org register), with a completeness meter, not hard blocks.
- **Measures can be live from day one**: the measure step offers a "live metric" picker sourced from the `PLAN_METRICS` catalog (label + unit from `PLAN_METRIC_INFO`); picking one sets `source='auto'` + `metric_key`, and the org's own numbers fill on the next refresh/cron. Anything else is a manual measure.
- **Start from a template**: one generic nonprofit starter (youth-org-flavored, visibly placeholder) pre-fills the wizard for editing — never saved until the user advances through it.
- **Draft it with Reed** (gated by `ai.reed`): a short intake (mission, program model, this year's focus, budget reality) produces a full draft OGSM that hydrates the wizard for human editing. The draft never writes to the database by itself; the wizard remains the only writer, and only catalog keys may come back as auto measures.
- **Finishing lands you on your working plan**: the populated `/admin/strategic-plan`, health statuses ready, scorecard live, reviews armable — the same surfaces AA uses daily.
- **The AA-content seed is retired**: button and route deleted. The empty state becomes the creator's front door ("Build your strategy").

## 5. Scope

**In:**
- The creator wizard (`/admin/strategic-plan/setup`) + the empty-state front door on `/admin/strategic-plan`.
- Progressive saves **through the existing `app/api/admin/plan/*` routes** — the creator is UI orchestration; no new write paths, no schema change (see §6).
- The live-measure picker over the `PLAN_METRICS` catalog.
- One generic starter template (code-side content, `lib/admin/plan/template.ts`).
- The Reed draft accelerator (`ai.reed`-gated; one new read-only draft route; `ai_calls_ledger` logged).
- Retiring `SeedButton` + `/api/admin/plan/seed`.
- Pure-logic vitest coverage (completeness rules, draft validation, template hydration).

**Out (deliberate):**
- New `plan_*` schema of any kind — the existing model already expresses a full OGSM.
- The funder-facing strategy room (`/strategy`, `strategy_angles`, proof points, narrative content) — separate surface, already spec'd elsewhere.
- Multi-year planning / plan versioning ("2027 plan alongside 2026") — the model is single-current-plan; versioning is a later spec.
- New auto-metric keys (the catalog ships as-is; per-tenant metric authoring is the metrics module's concern).
- Review cadence changes (`plan_reviews` already works; the creator just points at it when done).
- Renaming AA's FY26-flavored metric keys — cosmetic, deferred.

## 6. Architecture sketch

```
/admin/strategic-plan (empty org)
  └─ "Build your strategy" hero ──► /admin/strategic-plan/setup
                                        │
     ┌──────────────────────────────────┴───────────────────────────┐
     │ SetupWizard (client)                                         │
     │  state = the draft tree (foundation, objectives[goals[...]]) │
     │  Step 1 Foundation ── save → POST/PUT api/plan/foundation    │
     │  Step 2 Objectives ── save → POST api/plan/objectives        │
     │  Step 3 Goals      ── save → POST api/plan/goals             │
     │  Step 4 Strategies + Measures ─→ POST api/plan/initiatives,  │
     │         live-measure picker      POST api/plan/kpis          │
     │  Step 5 Review ("what a functioning strategy has") → done ──►│ /admin/strategic-plan
     │                                                              │
     │  "Start from template" → hydrate state from                  │
     │        lib/admin/plan/template.ts (no write)                 │
     │  "Draft with Reed" (ai.reed) → POST api/admin/plan/draft     │
     │        intake → model → validated draft JSON → hydrate state │
     └──────────────────────────────────────────────────────────────┘
```

- **Progressive saves, resumable by construction.** Each step persists through the same org-fenced, `org.manage`-gated routes the inline editors use — so an abandoned wizard leaves a *partially built but fully editable* plan, and re-entering the wizard reads current rows back into state. No draft table, no batch-commit transaction, no second write path to keep consistent. The trade-off (a half-built plan is visible on the plan page) is acceptable because the plan page is the editing surface anyway; the completeness meter names what's missing.
- **Completeness is a pure function** (`lib/admin/plan/completeness.ts`): given the tree, report *functioning* (foundation mission set; ≥3 objectives; every objective ≥1 goal; every goal ≥1 measure) vs. *gaps listed*. Used by the wizard's meter, the review step, and the empty-state hero (which becomes a "finish your strategy" card when a partial plan exists).
- **The Reed draft route** returns JSON only (never writes): intake answers → prompt → draft tree. A validator clamps it to the schema the wizard accepts: statuses defaulted, owners optional, and **auto measures allowed only when `metric_key` ∈ the `PLAN_METRICS` catalog** — anything else is demoted to manual. Logged to `ai_calls_ledger` like other model calls.
- **Template** is data in code (same shape the wizard state uses), placeholder text in brackets ("[Your mission — one sentence…]") so unedited lines are visually loud and the review step can flag them.

## 7. Staged build order

Each a PR; deploy-anytime (no migrations in the whole phase).

- **F1 `feat(strategy): creator shell + foundation step; retire AA seed`** — `/admin/strategic-plan/setup` with the step frame + Foundation step (writes through the existing foundation route); empty-state hero replaces `SeedButton`; delete the seed button + route. AA (has objectives) sees zero change.
- **F2 `feat(strategy): objectives → goals → strategies + measures steps`** — the full hierarchy authoring with progressive saves, the live-measure picker over `PLAN_METRICS`, the completeness meter + review step, resume-from-current-rows. This is the spec's core; after F2 a tenant can build a functioning strategy end to end.
- **F3 `feat(strategy): generic starter template`** — `lib/admin/plan/template.ts` + "Start from template" hydration + unedited-placeholder flagging in review.
- **F4 `feat(strategy): Reed draft accelerator`** — intake UI + `POST /api/admin/plan/draft` (ai.reed-gated, ledger-logged) + draft validation/demotion rules. Ships last; everything before works without AI.

## 8. Definition of done (observable)

1. A fresh org with `modules.strategy` (no plan rows) lands on `/admin/strategic-plan`, sees "Build your strategy", and can reach a **functioning strategy** — foundation with mission, ≥3 objectives with statements, each with ≥1 goal, each goal with ≥1 measure — entirely through the wizard, no SQL.
2. Picking a live measure in the wizard creates a `plan_kpis` row with `source='auto'` + a catalog `metric_key`, and "Refresh metrics" fills `current` with that org's own number.
3. AA's plan page renders and edits exactly as before (it has objectives, so it never sees the empty state or the wizard unprompted).
4. `SeedButton` and `/api/admin/plan/seed` are gone; `git grep "Load starter strategy"` and a request to the route both come up empty (404).
5. Abandoning the wizard mid-way leaves a partial plan that (a) is fully editable inline, and (b) resurfaces as "Finish your strategy" with the missing pieces named; re-entering the wizard shows current data, not stale drafts.
6. Template start: the wizard pre-fills with bracketed placeholder content; the review step flags any unedited placeholder line; the saved plan contains no AA-specific strings.
7. Reed draft: on an `ai.reed` org, the intake produces a draft that hydrates the wizard without writing; a draft measure with an unknown `metric_key` arrives demoted to manual; an `ai_calls_ledger` row exists per draft. On a non-AI org the button is absent and the route 402/403s.
8. `tests/plan-completeness.test.ts` (and siblings) cover the completeness rules, draft validator demotion, and template hydration as pure functions.

## 9. Failure modes to watch for

- **The half-built plan confuses instead of invites.** An abandoned wizard leaves two objectives and no measures; the plan page looks broken-ish. Mitigation: the completeness card names exactly what's missing and deep-links back into the wizard at the right step; nothing downstream (scorecard, reviews) errors on partial data today — verify, don't assume.
- **Reed drafts plausible garbage** — measures bound to metric keys that don't exist, twelve objectives, essay-length titles. Mitigation: the validator is structural (counts, lengths, catalog-membership) and demotes rather than rejects where possible; the human edit pass is the design, not a fallback.
- **Template text ships unedited** ("[Your mission…]" live on a board-visible page). Mitigation: bracketed placeholders + review-step flagging + the completeness rule counting a bracketed mission as missing.
- **Deleting the seed route breaks an AA workflow.** Mitigation: AA's plan is live data; the route was one-time-guarded anyway (`already seeded`); content preserved in git history + the MANUAL reseed file. Checked with a prod query before F1 merges (objectives exist → route is dead code for AA).
- **Wizard/inline-editor write races** (wizard open in one tab, inline edits in another). Mitigation: same routes, last-write-wins, and the wizard re-reads on entry — no second source of truth to diverge.
- **A non-`org.manage` member opens the wizard** and every save 403s. Mitigation: gate the setup page on the same permission server-side and show the read-only explanation instead of a broken form.

## 10. Open decisions

1. **Progressive saves vs. batch commit.** Recommend progressive (above): resumability and inline-editability for free, no draft-table schema, no transaction machinery. The visible-partial-plan trade-off is handled by the completeness card.
2. **"Functioning" thresholds.** Recommend: mission present, ≥3 objectives, every objective ≥1 goal, every goal ≥1 measure — soft (meter + review flags), never a hard block on saving.
3. **Reed plumbing for the draft** (which model wrapper, intake length). Deferred to F4; constraint fixed now: JSON-only response, validator-clamped, ledger-logged.
4. **Where "Build your strategy" also appears.** Recommend: the strategic-plan empty state only (not the sidebar) — one front door.

## 11. Paste-ready kickoff prompt (F1)

```
BloomOS Phase F (strategy builders): F1 — creator shell + foundation step;
retire the AA seed. Spec: specs/bloomos-strategy-builders.md §7.

Ground rules: one PR per commit point. No migrations anywhere in Phase F.
The creator writes ONLY through the existing app/api/admin/plan/* routes.

F1 scope:
- /admin/strategic-plan/setup: wizard frame (step rail, completeness meter
  stub) + Step 1 Foundation (mission/vision/values/behaviors), saving via
  the existing foundation route; server-gated on org.manage with a
  read-only explanation otherwise.
- /admin/strategic-plan empty state (org has no objectives): "Build your
  strategy" hero linking to /setup, replacing SeedButton.
- DELETE app/api/admin/plan/seed/route.ts and the SeedButton component;
  verify AA prod has objectives first (route is dead code for AA).
- lib/admin/plan/completeness.ts with the §10.2 rules + vitest.

Verify: fresh org sees the hero and completes Step 1; AA page unchanged;
seed route 404s; completeness tests green. Stop after F1.
```
