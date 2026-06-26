# specs/bloomos-reed-strategy.md — Reed for strategy (OGSM)

Status: design, not built. Schema recon done 2026-06-25 (live).
Owner: Remi. Builder: Claude Code. Depends on: `specs/bloomos-reed.md` (Reed must exist — Phases 1–7 shipped).

Reed helps the operator build and sharpen their plan: Objectives, Goals, Initiatives, KPIs. Two
modes — **reflect** (review an existing plan and give grounded feedback) and **design** (propose a
plan, or fill its gaps, from the mission down). Everything Reed writes is an inert proposal a human
accepts; Reed never silently edits the plan.

---

## Problem statement

BloomOS already has a full OGSM module (`plan_*` tables, a `/admin/strategic-plan` surface, a review
cadence in `plan_reviews`) but no intelligence over it. A small nonprofit's strategy tends to drift
into the classic failure modes — too many objectives to focus, goals that aren't measurable,
initiatives that don't ladder to a goal, vanity KPIs (activity, not outcome), targets with no
baseline, owners missing, reviews overdue. An ED rarely has a development director or a strategy
consultant to catch these. The data to catch them is right there in `plan_objectives → plan_goals →
plan_initiatives → plan_kpis`, plus the finance reality (`fin_config`, runway) and the mission
(`plan_foundation`). Reed is the assistant that already reads that data; strategy is where his
judgment adds the most and risks the least.

## Why strategy is the right surface for a generative Reed

- **It's the safest place for Reed to generate.** The Reed spec's cardinal rule is "don't author the
  numbers the operator trusts." Cash-on-hand has one right answer; an objective has many reasonable
  ones. Strategy is judgment, not a trusted figure — so Reed can be far more creative here than in
  finance without crossing the trust boundary. The one carve-out is KPI *actuals* (see Boundary).
- **Critique beats generation.** Generating an OGSM is easy and tends toward generic. *Critiquing*
  one plays to exactly what an LLM is good at — matching a plan against a framework — and it sharpens
  the operator's own thinking instead of replacing it. Reflect mode is the higher-value mode and
  ships first.
- **It reuses everything Reed already has.** The orchestrator (`/api/reed/ask`), entitlement gate,
  cost cap, logging, the draft/propose-decide inert pattern, `hasPermission` gating, session-client
  reads. This is a thin feature on a built platform.
- **It's the cleanest Bloom Flourish hand-off.** Reed does the structure, the draft, the coherence
  check (the 80%); the hard board-alignment and judgment calls tee up SOBO coaching (the 20%). The
  `coaching` entitlement already gates that seam.

## Who's affected

- **The operator (ED/buyer).** Gets a strategy sparring partner: a coherence review on demand, and a
  co-design partner when starting or revising the plan.
- **AA (tenant one).** First user; AA's plan lives in `plan_*` already.
- **SOBO / Bloom Flourish.** Reed handles the structural 80%; coaching takes the 20%.

## Current behavior

- OGSM data model exists and is RLS-protected (`reports.read` to read, leadership writes):
  `plan_foundation`, `plan_objectives`, `plan_goals`, `plan_initiatives`, `plan_kpis`,
  `plan_kpi_snapshots`, `plan_reviews`. (Full shape in Appendix A.)
- `/admin/strategic-plan` renders the plan. `plan_reviews` logs periodic reviews (`conducted_at`,
  `conducted_by`, `notes`, `next_review_at`).
- Reed today reads foundation + KPIs via `get_org_foundation_and_outcomes`, but has no plan-level
  tool, no coherence logic, and no strategy surface/entry point.

## Desired behavior

One Reed, opened from the strategy surface (or the FAB with `surface: "strategy"`), in two modes:

1. **Reflect / review (read-only).** "Reed, review my strategy." Reed reads the whole OGSM tree +
   finance + foundation, and returns a structured critique: what's incoherent, unmeasurable,
   unrealistic, unfocused, unowned, or misaligned with the mission — grounded in real figures, with
   specific pointers ("Goal *G3* has no KPI"; "you're targeting 3 new programs on 7 months of
   runway"). Optionally persisted as a shareable review.
2. **Design / co-design (propose, inert).** "Help me draft objectives for next year," or "fill the
   gaps." Reed proposes Objectives / Goals / Initiatives / KPIs as **inert proposals** a human edits,
   accepts, or dismisses. Accepted proposals are applied to `plan_*` only by an explicit, gated human
   action. Reed never writes the plan directly.

## The deterministic boundary (specific to strategy)

- **Structural checks are deterministic.** Whether a goal has a KPI, whether a KPI has a target/owner/
  source, whether an initiative ladders to a goal, the objective count, whether the review is overdue
  — these are computed in code (`get_strategy_coherence`), not by the model. This mirrors the
  briefing's deterministic verdict line: trustworthy structural findings, with Reed narrating and
  adding judgment on top. Reed never *miscounts* the plan.
- **KPI actuals stay data-grounded.** Reed may design *what* to measure and propose a *target*, but
  the *current value* comes from `plan_kpis.current` / the KPI's `metric_key`/`source` — Reed never
  fabricates where you are, only argues about where to aim. Proposed targets are labelled proposals
  to calibrate, ideally against the KPI's snapshot baseline.
- **Reed proposes; the human owns the plan.** Outputs are provocations and drafts. The point is to
  make the operator argue with a sharper plan, not to rubber-stamp Reed's.

## Scope

### In
- New read-only tools on the session client (`reports.read`-gated): `get_strategy_plan` (the nested
  OGSM tree) and `get_strategy_coherence` (deterministic structural findings + the overdue-review
  signal). Reuse `get_org_foundation_and_outcomes` and the finance tools for grounding.
- A strategy entry point: "Review my strategy" / "Design with Reed" on `/admin/strategic-plan`, and
  `surface: "strategy"` on the orchestrator with the plan as `context_ref`.
- Reflect mode end to end (the coherence linter), with optional persistence of the write-up.
- Design mode: structured OGSM proposals via an inert proposal store, surfaced in the Reed review
  inbox, with a gated apply-on-accept that inserts into `plan_*`.

### Out (later / separate)
- Auto-applying proposals without human accept. Never.
- Changing the deterministic structural findings into AI guesses. Never.
- Reframing or replacing the `/admin/strategic-plan` UI itself — Reed augments it.
- Multi-year scenario modelling / financial projection of initiatives (a bigger bet).

## The coherence rubric (what the linter checks)

Deterministic (computed in `get_strategy_coherence`, always reliable):
- **Laddering:** objectives with no goal; goals with no initiative; goals with no KPI; initiatives
  whose `goal_id` is null/dangling; KPIs whose `objective_id` ≠ their goal's `objective_id`.
- **Measurability:** KPIs missing `target`, `unit`, `source`/`metric_key`, `cadence`, or `owner`;
  goals missing `target_date` or `owner`.
- **Focus:** objective count outside a healthy band (OGSM discipline ≈ 3–5); goals-per-objective and
  KPIs-per-goal sprawl.
- **Freshness:** `plan_reviews.next_review_at` overdue; KPIs with stale `last_updated_at` /
  no recent snapshot.
- **Status hygiene:** active goals under a paused/archived objective, etc.

Judgment (Reed, grounded in the deterministic findings + finance + foundation):
- **Vanity vs. outcome:** does a KPI measure an outcome the mission cares about, or just activity?
- **Mission alignment:** do the objectives actually serve `plan_foundation.mission`/`vision`?
- **Realism:** are the targets achievable against runway, cash, and team capacity? (pull finance.)
- **Coherence of story:** do the initiatives plausibly move their goal's KPI?

## Architecture sketch

- **Reuses the one orchestrator.** UI calls `POST /api/reed/ask` with `surface: "strategy"` and a
  `context_ref` for the plan (or a specific objective/goal). Entitlement, cost cap, logging,
  thread/message persistence all already exist.
- **Reads: two new session-client tools, `reports.read`-gated.**
  - `get_strategy_plan` → the nested tree (objectives → goals → initiatives → KPIs, with owners,
    statuses, targets/currents). One RLS-scoped read per level.
  - `get_strategy_coherence` → runs the deterministic rubric above over that tree (+ `plan_reviews`)
    and returns structured findings. This is the trustworthy spine Reed narrates.
- **Reflect output.** Reed returns the critique in the panel. Optionally persists it as a
  `reed_drafts` row of a new kind `strategy_review` (so it's shareable / attachable to a
  `plan_reviews` entry). No plan writes.
- **Design proposals (inert).** Structured OGSM elements don't fit the flat `reed_suggestions`
  shape, so add `reed_plan_proposals` (Appendix B): `proposed_type` (objective|goal|initiative|kpi),
  `parent_ref` (the proposed/real parent it ladders to), `payload jsonb` (the fields for that level),
  `status` (proposed|accepted|dismissed), `decided_by`. Membership-scoped RLS like the other `reed_*`
  tables. A `propose_plan_element` tool (gated by the plan write permission — `org.manage`) writes
  these; proposing recommends, it never applies.
- **Apply-on-accept (gated write, later phase).** In the Reed review inbox, accepting a proposal
  calls a server route that inserts the payload into the matching `plan_*` table on the session
  client, behind `org.manage`, resolving parent ids (an accepted goal needs its objective to exist or
  be accepted first). This is the only path that writes the real plan, and it's human-initiated.
- **Session client only; never authors numbers.** Same rules as base Reed: no service-role client in
  any strategy tool; numeric/structural facts come from tool output.

## Staged build order

**Phase 0 — Recon gate (done, this spec).** OGSM schema confirmed live (Appendix A). Confirm the
plan write permission (`org.manage` vs a `reports.write` if one is added) before Phase B.

**Phase A — Reflect (read-only coherence review). First build, lowest risk, highest insight.**
`get_strategy_plan` + `get_strategy_coherence` tools; a "Reed: review my strategy" entry point on
`/admin/strategic-plan`; the system prompt teaches the rubric and the "deterministic findings first,
judgment second" discipline. Optionally persist the write-up as a `strategy_review` draft.
Commit: `reed: strategy review`.

**Phase B — Design (inert proposals).** `reed_plan_proposals` table + `propose_plan_element` tool
(gated). Reed proposes objectives/goals/initiatives/KPIs grounded in foundation + reality; they land
in the Reed review inbox to edit/accept/dismiss. No plan writes yet.
Commit: `reed: strategy proposals`.

**Phase C — From-scratch facilitation.** When the plan is empty or thin, a guided flow: mission →
2–3 objectives → goals → measures, one level at a time, each proposed inert. Mostly prompt + UX over
Phase B's machinery. Commit: `reed: strategy co-design`.

**Phase D — Apply-on-accept (gated write) + coaching seam.** Accepting a proposal inserts it into
`plan_*` behind `org.manage`, parent-id-resolved. Surface the Bloom Flourish coaching hand-off for
the judgment-heavy 20%. Commit: `reed: strategy apply + coaching handoff`.

## Definition of done (early phases)

- "Reed: review my strategy" returns a critique whose **structural claims are exactly correct** —
  every "goal G3 has no KPI" verifies against the data (the deterministic tool guarantees this).
- The review cites real figures (runway, goal, KPI currents) pulled from tools, never invented.
- A user without `reports.read` gets no strategy data from Reed (verified).
- In design mode, nothing is written to `plan_*` without an explicit human accept; proposals are
  inert and editable.
- KPI *current* values in any proposal come from data, never the model.
- Every strategy call logs to `reed_activity_log` with cost; the per-org cap still applies.

## Failure modes

- **Generic, vapid strategy.** Mitigation: ground every output in this org's foundation + real
  figures; lead with the deterministic findings; prefer critique over fresh generation; cite records.
- **Fabricated KPI actuals.** Mitigation: currents come from `plan_kpis`/snapshots via tools;
  proposed targets are labelled proposals and calibrated against the baseline.
- **Reed silently rewriting the plan.** Mitigation: proposals are inert; only a gated, human-initiated
  accept writes `plan_*`.
- **AI replacing judgment.** Mitigation: frame as a sparring partner; keep human ownership; tee up
  coaching for the hard calls.
- **Unrealistic targets.** Mitigation: the realism check pulls finance/capacity; flag, don't assert.
- **Coherence false positives.** Mitigation: structural checks are deterministic over real rows, so
  "missing KPI" can't be a hallucination; only the judgment layer is fuzzy, and it's framed as such.
- **Permission leak.** Mitigation: `reports.read`-gated reads, `org.manage`-gated proposals/applies,
  session client only.

## Open decisions

1. **Plan write permission.** Is leadership write on `plan_*` `org.manage`, or should a
   `strategy.write` / `reports.write` be introduced? (Phase B confirms.)
2. **Where the review write-up lives.** A `reed_drafts` `strategy_review` kind, an attachment to a
   `plan_reviews` row, or both.
3. **Proposal granularity.** One proposal per element (objective/goal/initiative/kpi) vs. a whole
   proposed sub-tree accepted atomically.
4. **Healthy-band thresholds.** The exact "too many objectives" / sprawl numbers for the focus check.
5. **Model choice.** Sonnet (Reed's default) vs. a stronger model for the design/critique passes
   (ties to base-Reed Open Decision 7).
6. **Proactive review nudges.** Whether Reed proactively flags an overdue `plan_reviews.next_review_at`
   (ties to base-Reed Open Decision 3, proactive vs. reactive).

---

## Appendix A — OGSM schema (live, 2026-06-25)

All `reports.read` to read (or `org.manage`), RLS on. org_id NOT NULL.

- `plan_foundation (org_id, mission, vision, values jsonb, behaviors jsonb, …)` — the why.
- `plan_objectives (id, org_id, title, three_year_statement, owner, status, sort_order, …)` — O.
- `plan_goals (id, org_id, objective_id, title, description, target_date, owner, status, sort_order, …)` — G.
- `plan_initiatives (id, org_id, goal_id, title, description, owner, status, sort_order, …)` — S (initiatives/strategies).
- `plan_kpis (id, org_id, goal_id, objective_id, title, unit, target, current, owner, cadence, source, metric_key, status, last_updated_at, …)` — M.
- `plan_kpi_snapshots (org_id, kpi_id, captured_on, value, …)` — KPI trend/baseline.
- `plan_reviews (id, org_id, conducted_at, conducted_by, notes, next_review_at, …)` — review cadence.

Hierarchy: Objective → Goal → Initiative; KPIs measure a Goal (`goal_id`) under an Objective
(`objective_id`). `strategy_angles` (fundraising-domain) is separate and out of scope here.

## Appendix B — reed_plan_proposals (Phase B, sketch)

```sql
create table if not exists public.reed_plan_proposals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id),
  proposed_type text not null check (proposed_type in ('objective','goal','initiative','kpi')),
  parent_ref    jsonb,                 -- { type, id }  (real or another proposal's id)
  payload       jsonb not null,        -- the fields for that level (title, target, owner, …)
  rationale     text,
  status        text not null default 'proposed' check (status in ('proposed','accepted','dismissed')),
  created_by    text,
  decided_by    text,
  decided_at    timestamptz,
  source_activity_id uuid references public.reed_activity_log(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- membership-scoped RLS, set_updated_at trigger (same idiom as reed_drafts/reed_suggestions).
-- Reads members; writes via propose_plan_element (org.manage); apply-on-accept inserts into plan_*.
```
