# SPEC · Load the 2026–27 OGSM (v3) into BloomOS

**Tenant:** Ambition Angels
**org_id:** `17c75da8-082d-4c8f-b00b-a4100fb2eb22`
**Source document:** `ambition-angels-ogsm-2026-27-v3.md`
**Written:** August 11, 2026

---

## PROBLEM STATEMENT

BloomOS holds the 2026 calendar-year OGSM for the Ambition Angels tenant: four objectives, KPI values current as of August 11. That plan is superseded.

The new plan runs **June 2026 to June 2027**, has **six objectives**, and changes the strategy in three ways that touch the data model:

1. The plan year is no longer a calendar year. Target dates now span two calendar years.
2. Ambition Coach is its own objective with seven measures, not a single goal with one measure.
3. Board and compliance move from a single infrastructure goal into two goals with real measures.

This is a data change to one tenant's strategy records. It is not a BloomOS product change. If the new plan does not fit the existing schema, that is the finding, and it gets reported before anything is written.

---

## LOCKED DECISIONS

- **This is a tenant data change.** Ambition Angels is a user of BloomOS. Do not modify BloomOS product code, shared components, or schema to accommodate one tenant's plan unless Phase 0 proves the schema cannot hold it.
- **Supersede, do not delete.** The 2026 OGSM stays in the database, marked superseded. Historical KPI values are a record of what was true and they do not get overwritten.
- **Migrations are not auto-applied.** If a schema change is required, produce the SQL and stop. It gets run by hand in the Supabase SQL editor.
- **Never touch `app/admin/page.tsx`.**
- **One PR.** No stacking.
- **Every write scoped to `org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'`.**
- **Three measures carry the WALL flag** and no others: raised, teens active twice a week, Ambition Plans completed.
- **Reuse existing metric keys** where the measure is the same measure. Only mint new keys for genuinely new measures.

---

## PHASE 0 · READ AND REPORT

No writes. No schema changes. No code. Read and report only.

Report back:

1. **The schema.** Every table holding OGSM structure: objectives, goals, strategies, measures, KPI values, provenance. Columns, types, foreign keys, constraints.
2. **The current data.** Every OGSM row for this org_id. Objectives, goals, strategies, measures, current values, owners, target dates, status.
3. **Metric keys in use.** The full list, which are auto-computed versus manual, and where each manual one sources from. Start from `lib/admin/plan/provenance.ts` and `lib/admin/plan/metricCatalog.ts`.
4. **Can the schema hold the new plan?** Specifically:
   - Is there a plan-period or fiscal-year concept, or are target dates free-form?
   - Is there a supersede or archive mechanism on an OGSM, or only delete?
   - Is there a WALL or priority flag on a measure?
   - Can a measure hold a non-numeric target (`yes`, `reported`)?
   - Is there an owner field on strategies, and does it reference a user record or a free-text name?
5. **What breaks.** Any place in the UI or computation that assumes four objectives, a calendar-year plan, or the current metric key set.
6. **RLS status** on every table touched. Six tables were previously flagged with RLS disabled. Report which.

**Gate:** stop after the report. Do not proceed to Phase 1 without approval.

---

## PHASE 1 · SUPERSEDE THE CURRENT PLAN

- Mark the 2026 OGSM superseded using whatever mechanism Phase 0 found. If none exists, propose the smallest one that works and stop for approval.
- Preserve all historical KPI values.
- Confirm the admin UI renders a superseded plan without breaking.

**Done when:** the 2026 plan is visible as history, not as the active plan, and nothing in the UI errors.

---

## PHASE 2 · SEED THE NEW PLAN

Insert the six objectives, their goals, strategies, and measures exactly as written in the source document.

| # | Objective | Owner |
|---|---|---|
| 1 | Ship a platform a classroom can run without us in the room | Demetric |
| 2 | Get into ten sites and make them run | Remi |
| 3 | Every teen who is ready leaves with a plan | Remi |
| 4 | Prove it inside a bell schedule | Remi |
| 5 | Fund the year | Remi |
| 6 | Build an organization that does not depend on one person | Shannon |

Rules:

- Target dates come from the source document. Do not normalize them to December 31.
- Strategy owners are Remi, Demetric, Shannon, or Demetra. Preserve them.
- Set the three WALL measures. No others.
- Current values start empty except where an existing auto-computed metric already populates them.
- Do not invent measures that are not in the source document.

**Done when:** the six objectives render in the admin strategy section with every goal, strategy, and measure present and correctly attributed, and a diff against the source document shows no additions or omissions.

---

## PHASE 3 · METRIC KEYS AND PROVENANCE

- Map every measure to a metric key. Reuse where the measure is unchanged.
- Mint new keys only for genuinely new measures. Expect new keys for: Ambition Plans completed, coaches trained, application to match rate, days to first session, verdict split, 90-day follow-through, coach return rate, cross-login shipped, days to produce a unit, board fundraising participation, board-sourced introductions, background check completion.
- Add a provenance entry for every manual key naming its real source of truth.
- Wire auto-computation only where the data already lives in BloomOS. Do not build new pipelines in this PR.

**Done when:** every measure has a key, every manual key has provenance, and no key is orphaned.

---

## PHASE 4 · OPEN ITEMS

Three open items in the source document need a home. Put them wherever BloomOS already tracks open questions against a plan. If there is no such place, report that and leave them out rather than inventing a table.

1. Floor reconciliation, $1,117,782 versus $875,000. Owner Remi, due August 31, 2026.
2. Cash runway at 1.26 months against a target of 6.
3. Per-teen figure verification before the case for support goes out.

---

## FAILURE MODES

**The schema cannot hold a non-calendar plan year.** Most likely failure. Report in Phase 0 rather than forcing dates.

**Metric key collision.** A new measure looks like an old key but means something different. Sprint completion is not plan completion. Mint a new key.

**Silent data loss.** Superseding drops KPI history. Verify before and after counts.

**Tenant bleed.** A write without an org_id filter touches another tenant. Every statement gets the filter.

**Scope creep into product.** The temptation will be to improve the OGSM feature while in here. Do not. Note it and move on.

---

## THE PROMPT

Paste this into Claude Code.

> Read `docs/specs/ogsm-2026-27-v3-load.md` and `docs/specs/ambition-angels-ogsm-2026-27-v3.md` before doing anything else.
>
> This is a tenant data change for Ambition Angels, `org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'`. It replaces the active 2026 calendar-year OGSM with a six-objective plan running June 2026 to June 2027.
>
> Start with Phase 0 and stop there. Read and report only. No writes, no schema changes, no code, no migrations. I want the schema, the current OGSM rows for this org, the metric key inventory with auto versus manual, a direct answer on whether the schema can hold a non-calendar plan year and a WALL flag and non-numeric targets, anything in the UI that assumes four objectives or a calendar year, and RLS status on every table you touched.
>
> Do not proceed past Phase 0 without my approval. If a migration turns out to be needed, write the SQL and stop. I apply migrations by hand in the Supabase SQL editor. Do not open `app/admin/page.tsx`.
>
> One PR when we get there. Small and reversible.

---

*Spec for the Ambition Angels tenant · BloomOS is the platform, Ambition Angels is a user of it*
