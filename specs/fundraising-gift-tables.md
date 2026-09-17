# Spec: Gift Tables

**Status:** v3, Phase 0 complete, pending Remi's approval to start Phase 1.
**Owner:** Remi
**Builds on:** `specs/fundraising-plan.md` (approved 2026-09-02), `specs/bloomos-v2-spec-fundraising.md` (V2 nav)
**Phase 0:** `specs/fundraising-gift-tables-phase0-findings.md` (2026-09-15)
**Fixtures:** `tests/fixtures/gift-tables/` holds AA Year-End 2026, EPA Young Life FY2027, and SafeSpace. Remi drops these in by hand; the sandbox blocked the copy.

The one-line requirement: **a gift table isn't done when the math works. It tells the people raising the money who to work, what to do next, and where the plan is most likely to break.** The pyramid is the structure. Names, warm paths, next moves, commitments, and gaps are the product.

---

## Changes in v3 (from Phase 0 and a live schema read)

1. **Route is nested:** `/admin/fundraising/campaigns/gift-tables/[id]`. The unnested route rendered with no tab row. The v2 remedy ("v2routes mapping") would have redirected the page away, because `v2routes.ts` is a redirect map, not an alias table.
2. **Recon correction:** nothing outside the plan pages reads `fr_plan_strategies`. Today's goal band doesn't. Open decision 8 keeps its conclusion on a different footing.
3. **`stage_type` has four values:** open, won, lost, on_hold. `stageRoles()` maps all four explicitly.
4. **The pledged flag seeds every org, not just AA.** Live read: all four tenants have `pledged` at stage_type open, probability 90. Wherever new orgs get their stage seed, the flag is set too.
5. **Migration sequencing rule.** `migration-ledger.yml` fails any PR carrying a migration production hasn't applied, and `BASELINE` only shrinks. Remi applies from the PR branch before the PR is expected green.
6. **Constituent merge rule.** The merge route's hardcoded `CHILD_TABLES` would cascade-delete or 500 on placements, and a naive reassign collides with the unique index. Placements now follow the primary constituent, and the duplicate's placement is removed on collision, with an audit entry.
7. **Don't read `v_fr_rollups.next_step`.** Its open-ask filter is V1 math (`stage not in ('steward','lost')`) and admits closed asks. Pools and work cards read `opportunities` via stage config. The view fix ships as its own PR.
8. **Today surface named:** `/admin/fundraising/today`. `v_obligations` (Home Today, Reed's queue) is out of scope.
9. **Start ask** reads `pipelines.is_default`. That's new behavior: both existing create routes hardcode `"default"`, which happens to match every tenant today. Start ask uses an extracted shared create path, so HubSpot mirroring behaves exactly like every other Bloom-created ask (Open decision 11).
10. **Table goal rounding is a table setting.** EPA rounds to thousands ($238,108.80 becomes $238,000). AA and SafeSpace don't.
11. **SafeSpace fixture filled in** from the workbook, including the tie-break case. Warm path is on 10 of 20 named rows, not "most".
12. **Fixture numbers are transcribed into tests**, with workbooks committed as provenance. No xlsx dependency in tests.
13. **Reuse, don't invent:**
    - owner uses `assigneeSlug` plus `deriveAssigneeOptions`
    - history uses `getEntityHistory` and `EntityHistory`, extended to return `before`
    - possible matches reuse the constituent + amount + ±7-day key from `dedup_commitments_against_gifts.sql`
    - placing an unlinked bench row uses `resolveConstituent`, not the promote route
14. **Enforcement tests:** a source fence asserts Reed and the dossier loader never reference `fr_gift_table_`. `TENANT_TABLES` gains the four new tables, plus the two `fr_plan_*` tables it's missing today.
15. **Phase 5 XLSX needs a new dependency.** Recommend `exceljs`; your call.

---

## Recon findings (current)

Verified from repo HEAD and the live schema on 2026-09-15.

1. **v1 gift table:** `fr_plan_strategies` 0 rows, `fr_plan_gift_levels` 0 rows (live). Levels callers are listed in Phase 0 §2. `fr_plan_strategies` is read only by the plan pages and plan API routes. `plan_strategy_id` columns on opportunities, grants, and campaigns are applied and indexed.
2. **Nav:** `/admin/fundraising/plan` 308s to Campaigns (exact). Fundraising tabs: Today, Donors & Funders, Pipeline, Grants, Campaigns. Active tab resolves by href prefix (`activeShellKey`, `V2TabRow`). Campaigns has not absorbed any plan content yet.
3. **Stages:** `pipeline_stages.stage_type` is in (open, won, lost, on_hold). Every tenant has a `default` pipeline with `is_default = true` and `pledged` as open at 90 (live). `firstOpenStageKey`, `stageKeysOfType`, `stagesForPipeline` exist.
4. **Pledged is special-cased by literal in three places:**
   - `stage-sets.ts`
   - `PledgesSection.tsx`
   - `v_revenue_schedule`, which identifies pledged money by HubSpot dealstage id. That means non-AA tenants' pledged asks never reach finance runway or Horizon: a live tenant-neutrality bug outside this spec that `counts_as_pledged` makes fixable.
5. **Opportunities:**
   - `expected_close` is nullable.
   - `POST /api/admin/opportunities` requires only a constituent. It doesn't accept `plan_strategy_id` or `affinity_rating`, and it pushes to HubSpot after insert.
   - Ratings are filled on 8 of 598 opportunities (live).
6. **Pledges:** the model is "the gift is the money, the payment is the expectation" (`pledge_payments.gift_id`). Nothing dedupes a pledged opportunity against a `pledges` row, and `PledgesSection` offers to create one from the other. AA pledges live as opportunities (11 pledged, 4 past close at $115k).
7. **Recurring plans:** `frequency` is free text with no check constraint. All 7 live rows are `monthly`. There is no annualization helper anywhere.
8. **Households:** `constituents.household_id` is set by importers and merge, with no trigger. `households.salutation` exists. `households.org_id` has no default in production (live), even though the migration ledger baseline still lists the drop as unapplied, so the baseline is stale. `v_fr_rollups` doesn't expose `household_id`.
9. **Merge:** `app/api/admin/constituents/merge/route.ts` reassigns a hardcoded `CHILD_TABLES` list, deletes the duplicate's journey enrollments on collision, hard-deletes the duplicate, and runs with no transaction.
10. **Owners:** free-text lowercase first-name handles (`lib/admin/assignees.ts`), options from memberships, round-tripped to profile uuids by `owner_uuid_promotion.sql`.
11. **Audit and history:**
    - `audit()` is service-role, swallows errors, and requires a uuid `entityId`.
    - `getEntityHistory` returns `after` only.
    - `EntityHistory` is live on three detail pages.
12. **Today's Moves** (`/admin/fundraising/today`) assembles six parallel reads in the page, using static stage lists.
13. **Board portal** reads no fundraising tables. **Reed** touches fundraising through `get_fundraising_forecast`, `get_constituent_dossier` (`lib/meetings/dossier.ts`, gated on `fundraising.read`), and `get_needs_you_queue` (`v_obligations`).
14. **Exports:** no XLSX library. All exports are hand-built CSV or ICS.
15. **CI:** migration ledger check on every PR, `tests/migrations.test.ts` idempotency rule, `tests/tenant-isolation.test.ts` hardcoded `TENANT_TABLES` (missing `fr_plan_*` today).
16. **Goal inconsistency** is unchanged. AA `fin_config`: $1,247,982, fiscal start 1. Workbook: $875,000, July to June. Plan floor: $1,117,782. Read by `lib/admin/finance.ts` (default fiscal start 1) and `lib/admin/strategy/money.ts`.

### Fixture math (transcribed from the workbooks in Phase 0)

**Ambition Angels, Year-End 2026.** Sept 14 to Dec 31, basis window, all one-time, no rounding.

- Target $350,000 × 1.2 = **table goal $420,000**
- 9 levels, 72 gifts, **table shape $445,000**
- **143** prospects needed (4 per gift at levels 01 to 04, 3 at 05 to 08, 1 at 09)
- **107** names
- `overallShort` **36**, `unfilledSlots` **42**
- Per-level gaps: 0, 3, 3, 7, 0, 1, 6, 17, 5
- `riskiestLevel` **02 ($75,000)** at $56,250 at risk, ahead of $25k ($43,750) and $50k ($37,500)

**EPA Young Life, FY2027.** Oct 1, 2026 to Sept 30, 2027. Basis annual, full term visible, rounding to thousands.

- $198,424 × 1.2 = $238,108.80, rounded to **table goal $238,000**
- Levels 01 to 06 are annual on a 3-year term: $50k, $25k, $10k, $5k, $2.5k, $1k
- Levels 07 to 10 are monthly, stored native: $500, $250, $100, $50
- **Table shape $238,200 per year**
- Levels 01 to 06: $216,000 per year, $648,000 over three years
- Monthly levels: $22,200 per year, estimated
- Three-year labels, kept separate: shape × 3 = **$714,600**, goal × 3 = **$714,000**
- **137** needed, **74** names, `overallShort` **63**, `unfilledSlots` **69**
- `riskiestLevel` **04 ($5,000/yr)** at $21,667. Levels 07, 08, and 09 tie at $6,000 below it.
- The test asserts native monthly amounts and derives the workbook's per-year column.

**SafeSpace.** Basis full term, 3 years, multiplier 1.25, no rounding.

- Three-year cost $1,623,814 × 1.25 = **table goal $2,029,767.50**
- Levels (per year / gifts): $150,000/1, $75,000/2, $44,982/3, $22,491/6, $13,760/4, $5,000/6, $1,000/22
- **Table shape $2,030,796 full term** ($676,932 per year)
- **144** needed, **0** names placed, `overallShort` **144**, `unfilledSlots` **144**
- `riskiestLevel` **01**: levels 01 and 02 tie at $450,000, and the tie breaks to the larger level. This fixture proves the tie-break.
- Warm path is present and rendered on the placements that have one (10 of 20 named rows).
- Don't assert the workbook's "Gift level to target" column. It mixes annual and three-year values, which is the coverage-basis failure mode living in the source document.

**Workbook bugs not to copy:**
- AA's Score formula self-references and skips Capacity.
- EPA's Gap column computes names minus needed.
- SafeSpace has no per-level names or gap column.

The product uses one convention, **gap = max(0, needed minus names)**, and states it on the page.

---

## Problem statement

A gift table is the first thing a fundraising consultant hands a nonprofit. The pyramid is quick. The value is who's really at each level, and the work that follows: collect what was promised, move the asks already open, find names where levels are thin, renew people nobody asked again.

Today that lives in spreadsheets that are stale on export (AA's already disagrees with the spine on pledges). They can't see Bloom's pledge or touch data, and they don't tell anyone what to do Monday. They get rebuilt by hand for every client, in three different conventions across our three live examples.

## Who's affected

- **Remi**, running AA's Sept 14 to Dec 31 push and the January to June window after it.
- **Shannon**, who owns the year-end appeal (OGSM 5.3) and pledge follow-through.
- **SOBO Consulting**, who produces gift tables as a coaching deliverable (EPA YL and SafeSpace are live examples).
- **Every future tenant**, across three archetypes:
  - an active push with deep history (AA)
  - a household renewal and multi-year plan (EPA YL)
  - a greenfield relationship campaign (SafeSpace)

## Current behavior

- A strategy can generate a pyramid and count linked opportunities per level, by calendar year. Nobody has created a strategy, and the page is only reachable by a direct URL.
- There's no window, multiplier, level purpose, prospect ratio, cadence, gap column, or named inventory.
- A donor with giving history and no open opportunity can't appear on a table.
- Scoring, warm paths, and lapsed lists live in Excel. Nothing tells anyone what to work next.

## Desired behavior

Shannon opens **Campaigns**, sees a Gift tables section, and opens **Year-End 2026**. The first thing she reads is the verdict:

> "$445,000 on the table against a $420,000 goal. 42 prospect slots unfilled across levels, 36 names short overall. The $75,000 level is the biggest risk: 1 of 4 names. 4 pledged asks ($115,000) past due, not yet attributed to this table."

Below the verdict:

- **Four work cards:** Collect, Move, Fill, Renew.
- **The table:** level, need, committed, pledged, asked, names placed, names needed, gap.
- **A level drawer:** clicking a level shows placed names (four scores, warm path, next step, owner, Start ask) and the candidate pools below them.

It stays connected:
- The donor profile shows the placement.
- Start ask creates a real opportunity on the org's default pipeline.
- `/admin/fundraising/today` shows next steps due from active tables.
- Closing the table stores plan vs actual.

## Scope

**In**

- **Tables:** `fr_gift_tables`, `fr_gift_table_levels`, `fr_gift_table_placements`, `fr_gift_table_credits`.
- **Pledged flag:** `pipeline_stages.counts_as_pledged`, seeded for every org's `pledged` stage and set by new-org stage seeding.
- **Computed at read time:**
  - table goal (with rounding), table shape, credited value by basis
  - names per level, both gaps, riskiest level
  - work groups, verdict
  - suggested capacity and affinity
  - candidate pools and possible matches
- **Placement flows:**
  - the Gift tables section on Campaigns and the nested detail route
  - the donor profile chip and the prospect bench action
  - the `/admin/fundraising/today` queue and the Start ask sheet
- **Constituent merge support** for placements.
- **History and lifecycle:**
  - lifecycle behavior and the closed snapshot
  - audit on every write, with before and after visible in placement history
- **Tests:**
  - three transcribed fixtures in Phase 1
  - source fences for Reed and the dossier loader
  - tenant isolation coverage
- **XLSX export** in the workbook shape (Phase 5, pending the dependency decision).

**Out**

- Wealth screening or capacity imports.
- A composite prospect score.
- Linking warm paths to `relationships` rows.
- Channel close-time guidance as schema.
- Fiscal-year rework of `plan_year`.
- Horizon, pipeline KPIs, `v_obligations`, Reed, or the board portal reading placements.
- Workbook import through the UI.
- Fixing `v_fr_rollups.next_step` or `v_revenue_schedule`'s HubSpot-id pledge detection. Both are separate PRs, listed under Follow-ups.

---

## Architecture sketch

```
 fr_gift_tables
   org_id, name, starts_on, ends_on, status (draft|active|closed|archived)
   target, multiplier, goal_round_to (null | 1000 | ...), coverage_basis (window|annual|full_term),
   default_term_years, monthly_modeled_years,
   ratio_major, ratio_mid, ratio_base, major_threshold,
   target_rationale, multiplier_rationale, notes,
   strategy_id?, campaign_id?, closed_at?, closed_snapshot jsonb?
      │ 1:n                      │ 1:n                           │ 1:n
      ▼                          ▼                               ▼
 fr_gift_table_levels       fr_gift_table_placements        fr_gift_table_credits
   label, amount (native),    constituent_id (primary),       source_type (gift|pledge|
   cadence (one_time|         household_id? (trigger-set),     recurring_plan|grant),
   annual|monthly),           level_id, opportunity_id?,       source_id, placement_id?,
   term_years?, gifts_needed, target_amount, cadence/term      attributed_by, note
   prospects_per_gift,        overrides?, 4 scores?, warm_path,
   purpose, sort              why_note, status, next_step,
                              next_step_due, owner (assignee slug)
                                         │
             lib/fundraising/gift-table.ts   (pure, no Supabase import)
               tableGoal · tableShape · creditedValue(item, basis, window)
               normalizeFrequency(text) → monthly|quarterly|annual|unknown
               stageRoles(pipelineConfig) → open | pledged | won | lost | on_hold
               slotNames · gaps → { overallShort, unfilledSlots, riskiestLevel }
               workGroups · verdict · pools · possibleMatches
               suggestCapacity · suggestAffinity · closeSnapshot
                                         │
 Reads: session client, RLS, .eq("org_id", ctx.orgId)
   constituents, households, v_fr_rollups (giving totals only, never next_step),
   opportunities, pipelines, pipeline_stages, gifts, pledges, pledge_payments,
   recurring_plans, grants, fr_prospects, campaigns
                                         │
 Pages  /admin/fundraising/campaigns                         + Gift tables section
        /admin/fundraising/campaigns/gift-tables/[id]         detail (tab row by prefix)
 API    /api/admin/fundraising/gift-tables                    POST, PATCH (incl. status)
        .../gift-tables/[id]/levels                           PUT
        .../gift-tables/[id]/placements                       POST, PATCH, DELETE
        .../gift-tables/[id]/placements/[pid]/start-ask       POST
        .../gift-tables/[id]/credits                          POST, DELETE
        fundraising.write, org_id from getOrgContext(), audit() on every write
 Shared lib/fundraising/create-opportunity.ts  (extracted; used by opportunities POST,
        prospects promote, and start-ask; reads pipelines.is_default; HubSpot push unchanged)
 Touch  donors-funders/[id] chip · prospects bench "Place on gift table" (resolveConstituent)
        /admin/fundraising/today queue · plan/[id] link · constituents/merge CHILD handling
        lib/admin/history.ts returns before
```

### Rules

**Household-first placement**
- A trigger sets `household_id` from the constituent, never from the request body.
- Two partial unique indexes allow one non-removed placement per `(gift_table_id, household_id)` when householded, and one per `(gift_table_id, constituent_id)` when not.
- The display shows `households.salutation` when present, otherwise the constituent name.
- If a constituent joins a household after placement, the table shows a "two placements, one household" warning with a merge action.

**Constituent merge**
- `fr_gift_table_placements.constituent_id` uses `on delete restrict`, so any delete path that forgets placements fails loudly instead of losing strategy.
- The merge route handles placements before the final delete:
  - reassign the duplicate's placements to the primary
  - on a unique collision (both placed on one table), keep the primary's placement, mark the duplicate's `removed` with a note naming the merge, and audit it
  - re-run the household trigger
- Because the route has no transaction, placements go first among the reassignments, and a failure aborts before the constituent delete.

**Do not contact**
- DNC blocks new placements and Start ask with a 4xx.
- Pools show DNC rows greyed, with no action.
- If a donor turns DNC after being placed or credited, the placement and money stay visible and counted, with a no-contact badge. They drop out of Move and Renew.

**Amount, cadence, and coverage basis**
- A level's `amount` is native to its cadence. `term_years` applies to annual levels. Monthly levels use `monthly_modeled_years` and always carry an estimated badge.

| Cadence | window basis | annual basis | full_term basis |
|---|---|---|---|
| one-time | amount | amount | amount |
| annual × term | installment in window | amount | amount × term_years |
| monthly | amount × charges in window | amount × 12 | amount × 12 × monthly_modeled_years |

- The UI shows the native amount, plus annualized and full-term values where they differ, labeled.
- Recurring plans pass through `normalizeFrequency()`. Unknown values render as "frequency not recognized" and credit nothing until fixed. They're never assumed monthly.

**Goal and shape, labeled, never merged**
- Table goal = target × multiplier, rounded to `goal_round_to` when set.
- Table shape = sum of level value on the basis × gifts needed.
- Multi-year views label shape × term and goal × term separately.

**Gaps**
- `overallShort` = max(0, total needed minus total names placed).
- `unfilledSlots` = sum of max(0, needed minus placed) per level. The verdict leads with this number.
- `riskiestLevel` = the highest (gap ÷ prospects per gift) × level value on the basis. Ties break to the larger level.

**Names**
- A name counts only when placed.
- A placement's level defaults to the highest level its target reaches, and the user can override it.
- Removed and declined placements don't count.

**Status from tenant stage config**
- Unlinked placements take a manual status: prospect, cultivating, ready, declined, removed.
- Linked placements take status from the opportunity's stage, via `stageRoles()`:
  - `won` means committed
  - `open` with `counts_as_pledged` means pledged
  - other `open` means asked
  - `lost` means declined
  - `on_hold` means on hold, excluded from Move and from committed
- A linked placement's target shows the opportunity's `ask_amount` and is read-only.
- Open asks count regardless of a stale close date, with a flag.
- New code never imports `OPEN_STAGE_KEYS` or `WON_STAGE_KEYS`.

**Money attribution**
- Money fills a table automatically only through one of three paths:
  1. an opportunity linked to a placement on the table
  2. a gift, pledge, or recurring plan on a campaign linked to the table
  3. a `fr_gift_table_credits` row
- Other money in the window from a placed household appears as a possible match, using the constituent + amount + ±7-day key from `dedup_commitments_against_gifts.sql`. Attaching a match writes a credit row.
- A source credited to two tables with overlapping windows shows an overlap warning on both.
- A pledged opportunity and a `pledges` row for the same household and amount in the window count once, with the overlap shown.

**Candidate pools**
- Nothing in a pool counts until it's placed.
- Pools read `opportunities` through stage config, never `v_fr_rollups.next_step`. Household grouping needs a second read against `constituents`.
- The pools:
  - **Active asks:** open, not linked to a placement on this table.
  - **Pledged:** `counts_as_pledged` asks, plus active `pledges` with unpaid installments. Past-due first.
  - **Renewals:** gave in the comparable prior period, with no gift or open ask this period.
  - **Lapsed:** gave before the prior period, nothing since, no open ask.
  - **Upgrade candidates:** the same amount in 2 or more of the last 3 years, with no open ask.
  - **Prospect bench:** `fr_prospects` rows. Placing an unlinked row calls `resolveConstituent`, sets `fr_prospects.constituent_id`, leaves status `active`, then places it. Three writes, three audits, no opportunity.
  - **Recurring:** active recurring plans, for monthly levels.
  - **Search:** all constituents.

**Work the table** (active tables only)
- **Collect:** pledges past their date, or installments due within 14 days.
- **Move:** placements, or linked asks, with a next step due within 7 days or overdue.
- **Fill:** levels with a gap, sorted by dollars at risk.
- **Renew:** renewal-pool donors, and placements with no next step.
- The verdict names the worst true thing first. Draft tables show the verdict but no work cards.

**Lifecycle**
- **Draft** feeds nothing.
- **Active** feeds `/admin/fundraising/today` and the donor chip.
- **Closed** writes `closed_snapshot`, stops creating work, and freezes placements except notes. It's prompted once `ends_on` passes.
- **Archived** is hidden from default lists.
- Reopening a closed table is allowed and audited.

**Start ask**
- The confirmation sheet has:
  - ask amount (prefilled)
  - pipeline (`pipelines.is_default`)
  - owner (assignee options)
  - next step and due date
  - expected close (optional, left null if blank)
- It calls the shared `createOpportunity()`:
  - stage = `firstOpenStageKey()` for the chosen pipeline
  - `plan_strategy_id` comes from the table
  - the placement is linked
  - both writes are audited
- HubSpot mirroring follows whatever the shared path does for every other Bloom-created ask (Open decision 11).

**Audit and history**
- `audit()` with before and after runs on every table, level, placement, credit, and Start ask write.
- Action names follow the dotted convention: `fundraising.gift_table.*` and `fundraising.gift_table_placement.*`.
- `getEntityHistory` gains `before`, which also improves its three existing consumers.
- Placement history renders through `EntityHistory` behind a quiet history link.

**Access**
- `fundraising.read` to view, `fundraising.write` to edit.
- Placements, scores, warm paths, and credits are never added to `lib/meetings/dossier.ts`, `lib/agents/reed/tools.ts`, `v_obligations`, or the board portal. A source-fence test enforces it.

### Migration shape

`fundraising_gift_tables.sql` is idempotent and follows `fundraising_plan.sql`. Remi applies it.

- **Preamble:** re-declare `set_updated_at()` and re-pin its search_path.
- **Four tables:** each has `org_id uuid not null references orgs(id)` with no default, plus the check constraints listed in the architecture sketch. `ends_on >= starts_on`. Scores are smallint 1 to 5.
- **Levels:** cascade from `fr_gift_tables`.
- **Placements:**
  - cascade from the table
  - `constituent_id` on delete restrict
  - `opportunity_id` on delete set null
  - `household_id` references households
- **Credits:** unique `(gift_table_id, source_type, source_id)`.
- **Household trigger** plus the two partial unique indexes.
- **Org-match triggers** on each child table, covering the parent table, constituent, opportunity, level, and credit source. They raise a clear exception naming the mismatch.
- **`set_updated_at` triggers** on tables and placements.
- **RLS loop:** read on `fundraising.read`, all on `fundraising.write`.
- **Pledged flag:** `pipeline_stages.counts_as_pledged boolean not null default false`.
- **Foot:** verification selects with "Expect:" lines, in house style.
- **Separate seed:** `seed_pledged_stage_flag.MANUAL.sql` sets the flag true where `key = 'pledged'` for every org. That's four rows today, all on pipeline `default`.
- **Untouched:** `fr_plan_gift_levels` stays until Phase 4.

**Sequencing rule:**
1. The Phase 1 PR opens as a draft.
2. Remi applies the migration from the PR branch through the dashboard.
3. The ledger check goes green and the PR is marked ready.
4. `BASELINE` is never extended to make CI pass.
5. The same order holds for the Phase 4 drop migration.

---

## Staged build order

- **Phase 0: recon.** Done. Commit point: `specs/fundraising-gift-tables-phase0-findings.md`.
- **Phase 1: schema + domain logic.**
  - Files:
    - `fundraising_gift_tables.sql` and `seed_pledged_stage_flag.MANUAL.sql`
    - `lib/fundraising/gift-table.ts` and `tests/gift-table.test.ts` (three transcribed fixtures plus the rule tests)
    - `tests/fixtures/gift-tables/*.xlsx` (provenance, committed by Remi)
    - `TENANT_TABLES` gains the four new tables plus both `fr_plan_*` tables
    - the new-org stage seed sets `counts_as_pledged`
    - source-fence test for Reed and the dossier loader
  - Commit point: `feat(fundraising): gift tables schema and domain logic`. Tests green. Migration applied by Remi before ready-for-review.
- **Phase 2: table builder.**
  - Gift tables section on Campaigns and the nested detail route.
  - Create and edit table, including goal rounding and basis. Draft and active transitions.
  - Levels editor with cadence and purpose. Goal vs shape, and the verdict.
  - Commit point: `feat(fundraising): gift table builder`.
- **Phase 3: placements, pools, merge, history.**
  - Level drawer and placements CRUD: scores with suggestions, warm path, next step, assignee owner.
  - Household and DNC rules.
  - Candidate pools, gaps, possible matches with Attach.
  - Merge route changes.
  - `getEntityHistory` returns `before`, and placement history renders.
  - Commit point: `feat(fundraising): gift table placements, pools, merge safety`.
- **Phase 4: work the table and wiring.**
  - Work cards and Start ask via the extracted `createOpportunity()`.
  - Donor chip, bench action, `/admin/fundraising/today` queue, `plan/[id]` link.
  - Re-aim Today's `MomentQueue` link away from the redirected `/plan`.
  - Remove v1 levels UI and callers (Phase 0 §2), then the `fr_plan_gift_levels` drop migration with a 0-row check at drop time.
  - Commit point: `feat(fundraising): work the table and wiring`.
- **Phase 5: close, history, export.**
  - Close with snapshot, plan vs actual, reopen, archived filter.
  - XLSX export (Start Here, Gift Table, Inventory, Pools) if the dependency is approved. Otherwise, four CSVs.
  - Commit point: `feat(fundraising): gift table close and export`.

## Follow-ups (separate PRs, not this spec)

- **Fix `v_fr_rollups.next_step`.** Its open-ask filter is V1 math, so Donors & Funders can show a next step from a closed ask today. Small, user-visible, do soon.
- **Move `v_revenue_schedule`'s commitment branch** off HubSpot dealstage ids onto `counts_as_pledged`, right after Phase 1 lands. Today SafeSpace's and YGB's pledged asks never reach finance runway or Horizon.
- **Refresh the migration ledger `BASELINE`.** `drop_households_org_id_default` is applied in production but still listed as file-only.
- **Add a check constraint** on `recurring_plans.frequency`, once importers are confirmed to write known values.
- **Add a "gift table coverage" metric** to the Metrics Library for OGSM binding.
- **Link warm paths to `relationships`.**

## Definition of done

**Math and money**
- AA's table shows table goal $420,000 and shape $445,000, both labeled. With the fixture's names placed, it shows 36 short, 42 unfilled slots, and the $75,000 level as riskiest.
- EPA's table shows table goal $238,000 (rounded) and shape $238,200 per year. A $500 monthly level credits $6,000 annually with an estimated badge.
- SafeSpace's table resolves the $450,000 tie at levels 01 and 02 to level 01.
- An annual $25,000 level on a 3-year term credits $25,000 on an annual table and $75,000 on a full-term table.
- A recurring plan with an unrecognized frequency credits nothing and says why.
- A $25,000 gift in window from a placed donor, not traceable to the table, appears as a possible match and fills nothing until attached.
- An open ask with an expected close in May 2026 still counts, flagged.

**People and records**
- Placing a second member of a placed household is rejected, with a message naming the existing placement.
- Placing a DNC constituent is rejected. A credited pledge from a donor who later turns DNC still counts, badged, and leaves Move.
- Merging two constituents placed on the same table leaves one placement on the primary and one `removed` placement noted with the merge, plus an audit row. The merge completes.

**Start ask and stages**
- Start ask creates an opportunity on the `is_default` pipeline at its first open stage, with expected close null when left blank, and the placement's status then follows the stage.
- A placement linked to a `pledged` opportunity shows pledged in every tenant once the seed is applied.

**Surfaces and lifecycle**
- A draft table adds nothing to `/admin/fundraising/today`. An active one adds its due next steps, and closing it removes them and shows plan vs actual.
- Changing a capacity score from 5 to 2 shows "from 5 to 2" in the placement's history.
- The detail page renders the Fundraising tab row with Campaigns active. No new tab exists, and `nav.ts`, `v2routes.ts`, and `next.config.mjs` are unchanged by Phases 2 and 3.

**Safety and CI**
- The source fence fails if `fr_gift_table_` appears in `lib/meetings/dossier.ts` or `lib/agents/reed/tools.ts`.
- As a second tenant on preview, none of AA's tables, placements, scores, warm paths, or credits are visible, and inserting a row referencing an AA id fails at the database.
- `npm test`, `npx tsc --noEmit`, `npm run lint`, and the migration ledger check all pass.
- Manual smoke on preview as Remi and as a `fundraising.read`-only user.

## Failure modes to watch for

- **Placements become a second pipeline or inflate the forecast.** Mitigations: target is read-only once linked, placements are never read outside gift-table code, and a test shows pipeline KPIs don't change when placements are added.
- **Coverage basis confusion.** SafeSpace's own workbook already mixes bases. Mitigation: basis in the header and on every total, with the native amount always visible.
- **Wrong-table money.** Mitigation: traceable-only attribution, possible matches, overlap warnings.
- **Double-counted pledges.** `PledgesSection` actively creates the pledged-opportunity-plus-pledges-row pair. Mitigation: count-once rule plus a named fixture case.
- **Pledged invisible.** A tenant gets provisioned without the flag. Mitigation: the new-org seed sets it, and the table page says "no pledged stage configured" when none exists.
- **Merge destroys or blocks.** Mitigation: restrict FK, placement-first handling in the merge route, collision rule, DoD test.
- **Stale next steps.** Mitigation: never read `v_fr_rollups.next_step`, and fix the view separately.
- **Tab row missing.** Mitigation: nested route and the DoD line.
- **Red CI on a correct PR.** Mitigation: the draft-then-apply sequencing rule.
- **Zombie work.** Mitigation: lifecycle gating and the close prompt.
- **Suggested capacity lies for a new tenant.** Mitigation: source-labeled suggestions, per-table bands, typed overrides.
- **Cross-tenant write.** Mitigation: session client, org_id from the parent row, org-match triggers, `TENANT_TABLES`.
- **Sensitive strategy leaks or changes invisibly.** Mitigation: permission-gated reads, source fence, audit with before and after.

## Open decisions (with recommendations)

1. **Where it lives.** Recommend Campaigns, nested route, no new tab. If you want the tab called "Plan," rename Campaigns in its own PR.
2. **Pledged flag.** Recommend `counts_as_pledged` on `pipeline_stages`, seeded for all orgs.
3. **Warm path linked to people.** Recommend text now, `relationships` later.
4. **One source credited to multiple tables.** Recommend allowed, with an overlap warning.
5. **Composite score.** Recommend no.
6. **Seed AA's year-end table.** Recommend a reviewed `seed_aa_year_end_gift_table.MANUAL.sql` at the end of Phase 3, so the push is in Bloom by mid-October.
7. **AA's goal and fiscal start.** Settle the FY27 number and set `fiscal_year_start_month` before the Phase 2 smoke. `lib/admin/finance.ts` defaults to 1, which is wrong if AA runs July to June.
8. **Keep `fr_plan_strategies`.** Recommend yes. The reason isn't Today (nothing there reads it). It's the applied `plan_strategy_id` links, which Start ask writes.
9. **Fixture approach.** Recommend numbers transcribed into tests, workbooks committed as provenance, no xlsx dev dependency.
10. **Phase 5 export.** Recommend adding `exceljs` so the export is a real multi-sheet workbook a client recognizes. The fallback is four CSVs.
11. **HubSpot on Start ask.** Recommend identical behavior to every other Bloom-created ask, by extracting one shared create path. A gift table shouldn't invent its own HubSpot rule while HubSpot is being retired. Revisit all ask creation together when the mirror is turned off.
12. **EPA YL live table.** It waits on the tenant import. The fixture ships now.

---

## Phase 1 kickoff prompt (paste into Claude Code after approval)

```
Phase 1 of specs/fundraising-gift-tables.md (v3). Read the spec and
specs/fundraising-gift-tables-phase0-findings.md first. Schema and pure domain logic only:
no pages, no API routes, no nav edits, no lib/database.types.ts.

Before writing anything:
- Confirm tests/fixtures/gift-tables/ holds the three workbooks and specs/ holds both spec files.
  If not, stop and tell me; I'll add them.
- Find where new orgs receive their pipeline_stages seed so counts_as_pledged can be set there.

Build, in this order, committing at the end:

1. supabase/migrations/fundraising_gift_tables.sql
   Follow fundraising_plan.sql conventions exactly and the "Migration shape" section of the spec.
   Four tables, no org_id default, household trigger and partial unique indexes, org-match
   triggers, set_updated_at with search_path re-pin, RLS loop, pipeline_stages.counts_as_pledged.
   placements.constituent_id is ON DELETE RESTRICT. Verification selects with "Expect:" lines.
   Must pass tests/migrations.test.ts idempotency rules.

2. supabase/migrations/seed_pledged_stage_flag.MANUAL.sql
   Set counts_as_pledged = true where key = 'pledged', every org. Expect 4 rows today.
   Update the new-org stage seed so future tenants get the flag.

3. lib/fundraising/gift-table.ts
   Pure functions, no Supabase import: tableGoal, tableShape, creditedValue, normalizeFrequency,
   stageRoles (all four stage_type values plus counts_as_pledged), slotNames, gaps, workGroups,
   verdict, pools, possibleMatches (constituent + amount + ±7 days), suggestCapacity,
   suggestAffinity, closeSnapshot. Do not import OPEN_STAGE_KEYS or WON_STAGE_KEYS.

4. tests/gift-table.test.ts
   Three fixtures with the numbers transcribed from the spec's "Fixture math" (AA, EPA native
   monthly amounts, SafeSpace tie-break). Rule tests: credited value per cadence × basis, goal
   rounding, household uniqueness logic, DNC, stale close dates, stageRoles from config incl.
   on_hold and pledged, attribution and possible matches, pledged-opportunity vs pledges overlap
   counted once, unknown recurring frequency credits nothing.

5. tests/tenant-isolation.test.ts
   Add the four new tables plus fr_plan_strategies and fr_plan_gift_levels to TENANT_TABLES.

6. Source fence test: fail if "fr_gift_table_" appears in lib/meetings/dossier.ts or
   lib/agents/reed/tools.ts. Model it on tests/reed-documents.test.ts.

Rules:
- Do not apply migrations. Open the PR as a draft and hand me both SQL files to review and apply.
  Do not add anything to the migration ledger BASELINE.
- npm test, npx tsc --noEmit, npm run lint must pass locally.
- Commit: feat(fundraising): gift tables schema and domain logic

When done, report: files changed, test count and results, any place the spec was ambiguous
and what you chose, and the exact order I should apply the two SQL files.
```
