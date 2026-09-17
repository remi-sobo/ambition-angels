# Phase 0 findings — Gift Tables

**Spec:** `specs/fundraising-gift-tables.md` (v2, design, pending Remi's approval)
**Read:** 2026-09-15, repo at `claude/new-session-f8iu2z`
**Status:** read-and-report only. No code, no migrations, no schema. Stop and wait for approval.

---

## 0. Method, and what I could not verify

**The Supabase MCP server failed to connect this session (503, `CLIENT_HTTP_NOT_IMPLEMENTED`).** There is no
database URL in the environment either. So I could not run a single query against the live schema.

Everything below comes from the repo at HEAD: migration files, application code, tests, and the
migration-ledger baseline. Where the kickoff prompt asked a question only the database can answer,
the finding says **UNVERIFIED** and names the proxy I used instead. Those five must be re-checked before
Phase 1 code depends on them:

| Claim | Status | Proxy used |
|---|---|---|
| `fr_plan_gift_levels` has 0 rows in all four tenants | **UNVERIFIED** | none — needs a query |
| `fr_plan_strategies` / `fr_plan_gift_levels` are applied | **Verified indirectly** | `fundraising_plan` is absent from `BASELINE.fileOnly` in `scripts/check-migration-ledger.ts`, so CI would fail if it were unapplied |
| `stage_type` values in use *per org* | **UNVERIFIED** | the seed in `fundraising_pipeline_config.sql` (what every org got) |
| AA has 11 `pledged` opportunities | **Corroborated** | `fundraising_pipeline_remap.sql:493` verification comment: "Expect: closed_won 226, closed_lost 146, needs_appointment 15, **pledged 11**" |
| `opportunities.capacity_rating` / `affinity_rating` are 0-filled | **UNVERIFIED** | columns exist (`create_opportunities.sql:32-33`); fill rate needs a query |

The three workbooks I *could* verify completely — I parsed all four sheets of each from the XLSX XML,
formulas included. §1 is the result.

---

## 1. Fixtures: the numbers, verified from the files

All three workbooks were attached to this session. **They are not yet in the repo** — see §17.

### 1a. Ambition Angels, Year-End 2026 — basis `window`, cadence `one_time`

Start Here: FY27 goal $875,000 · raised since Jul 1 $288,238 · remaining $586,762 ·
window target **$350,000** · multiplier **1.2** · **TABLE GOAL $420,000** (`=C10*C12`, no rounding) ·
pledged past close date $190,000 · new money still to close $160,000 ·
prospects per gift: 4 at levels 01–04, 3 at 05–08.

| Level | Amount | Gifts | Total | Prospects/gift | Needed | Names | Gap | $ at risk |
|---|---|---|---|---|---|---|---|---|
| 01 | $100,000 | 1 | $100,000 | 4 | 4 | 5 | 0 | — |
| 02 | $75,000 | 1 | $75,000 | 4 | 4 | 1 | **3** | **$56,250** |
| 03 | $50,000 | 2 | $100,000 | 4 | 8 | 5 | 3 | $37,500 |
| 04 | $25,000 | 3 | $75,000 | 4 | 12 | 5 | 7 | $43,750 |
| 05 | $10,000 | 4 | $40,000 | 3 | 12 | 17 | 0 | — |
| 06 | $5,000 | 5 | $25,000 | 3 | 15 | 14 | 1 | $1,667 |
| 07 | $2,500 | 4 | $10,000 | 3 | 12 | 6 | 6 | $5,000 |
| 08 | $1,000 | 12 | $12,000 | 3 | 36 | 19 | 17 | $5,667 |
| 09 | $200 | 40 | $8,000 | 1 | 40 | 35 | 5 | $1,000 |
| **Total** | | **72** | **$445,000** | | **143** | **107** | **42** | |

`overallShort` **36** · `unfilledSlots` **42** · `riskiestLevel` **$75,000** ($56,250, ahead of $25k at
$43,750 and $50k at $37,500). **Every number in the spec's AA fixture block is correct**, including the
v1 correction from 104 to 143 prospects.

Other sheets: Prospect Inventory 59 named rows in 6 tiers, Capacity/Affinity pre-scored,
Connection/Readiness blank by design. Lapsed Donors 81 names, $1,470,191 lifetime, 65 with no open deal
($667,341). Scoring Key defines the four factors and the 1–5 scale, plus channel close-time guidance
(which the spec correctly scopes **out** as schema).

### 1b. EPA Young Life, FY2027 — basis `annual`, full term visible

Start Here: FY27 goal $198,424 · FY28 $310,508 · FY29 $392,866 · three years $901,798 ·
raised FY26 $108,187 (11 households) · committed $25,000 (O'Hara y2 of 5) ·
multiplier 1.2 · **TABLE GOAL $238,000** (`=ROUND(198424*1.2,-3)`, so rounding to thousands is real
and load-bearing — 238,108.80 → 238,000) · prospects per gift: 4 at $10,000+, 3 below.

| Level | Native amount | Cadence | Gifts | Per year | Needed | Names | Gap |
|---|---|---|---|---|---|---|---|
| 01 | $50,000/yr | annual ×3 | 1 | $50,000 | 4 | 9 | 0 |
| 02 | $25,000/yr | annual ×3 | 2 | $50,000 | 8 | 9 | 0 |
| 03 | $10,000/yr | annual ×3 | 5 | $50,000 | 20 | 19 | 1 |
| 04 | $5,000/yr | annual ×3 | 10 | $50,000 | 30 | 17 | **13** |
| 05 | $2,500/yr | annual ×3 | 4 | $10,000 | 12 | 10 | 2 |
| 06 | $1,000/yr | annual ×3 | 6 | $6,000 | 18 | 10 | 8 |
| 07 | $500/mo | monthly | 1 | $6,000 | 3 | 0 | 3 |
| 08 | $250/mo | monthly | 2 | $6,000 | 6 | 0 | 6 |
| 09 | $100/mo | monthly | 5 | $6,000 | 15 | 0 | 15 |
| 10 | $50/mo | monthly | 7 | $4,200 | 21 | 0 | 21 |
| **Total** | | | **43** | **$238,200** | **137** | **74** | **69** |

Committed levels 01–06: **$216,000/yr**, **$648,000** over three years. Monthly: **$22,200/yr**,
`estimated`. Three years of the whole table if everyone commits: $714,600 (workbook also shows
$714,000 = table goal × 3 on Start Here — two different "three-year" numbers, both labeled).
`overallShort` **63** · `unfilledSlots` **69** · `riskiestLevel` **level 04** ($5,000/yr, $21,667 at risk;
next are levels 07/08/09 tied at $6,000, which the spec's "ties break to the larger level" rule resolves
to level 07).

**All EPA numbers in the spec are correct.** Note the workbook stores monthly levels as per-year amounts
($6,000, $3,000, $1,200, $600); the spec's model stores the native monthly amount ($500/$250/$100/$50)
with `cadence = monthly`, and annual basis = amount × 12. Both reach $238,200. The fixture test should
assert on the native form and derive the workbook's column.

### 1c. SafeSpace — basis `full_term`, 3-year. **The spec's TBD, now filled in.**

Start Here: three-year program cost **$1,623,814** (FY27 $493,366 + FY28 $512,479 + FY29 $617,969) ·
multiplier **1.25** · **CAMPAIGN GOAL $2,029,767.50** (`=C6*C7`, **not** rounded — unlike EPA) ·
prospects per gift: 4 at the top four levels, 3 below.

| Level | Per year | Over 3 years | Gifts | Total at level (3yr) | Needed | Names |
|---|---|---|---|---|---|---|
| 01 | $150,000 | $450,000 | 1 | $450,000 | 4 | 0 |
| 02 | $75,000 | $225,000 | 2 | $450,000 | 8 | 0 |
| 03 | $44,982 | $134,946 | 3 | $404,838 | 12 | 0 |
| 04 | $22,491 | $67,473 | 6 | $404,838 | 24 | 0 |
| 05 | $13,760 | $41,280 | 4 | $165,120 | 12 | 0 |
| 06 | $5,000 | $15,000 | 6 | $90,000 | 18 | 0 |
| 07 | $1,000 | $3,000 | 22 | $66,000 | 66 | 0 |
| **Total** | | | **44** | **$2,030,796** | **144** | **0** |

Assertions for the Phase 1 fixture test:

- table goal **$2,029,767.50**, table shape (full term) **$2,030,796**, shape per year **$676,932**
- prospects needed **144**, names placed **0**, `overallShort` **144**, `unfilledSlots` **144**
- `riskiestLevel` **level 01** — levels 01 and 02 tie at $450,000 at risk, and the tie breaks to the
  larger level. **This fixture is the one that exercises the tie-break rule.** Keep it.
- annual/full-term divergence is the whole point: level 03 reads $44,982 native, $134,946 full term.

It proves what the spec said it must: a greenfield table (zero names on the table), per-year amounts
held three years counted at full term, names sourced from a manually qualified bench rather than lapsed
history (there is **no Lapsed sheet** — SafeSpace has none to build).

**One correction to the spec.** §Fixture math says the SafeSpace fixture must prove "a warm-path value on
most placements". The Prospect Inventory has 20 real names plus one "Example: Jane Doe" row; **10 of the
20** carry a "Who knows them" value (Susan, Liesl, or both). Half, not most. The column is still the
central one — it is the second column of the sheet, before any score — but the assertion should say
"present on a placement and rendered", not "on most".

**Do not assert on SafeSpace's "Gift level to target" column.** It mixes bases: $67,473 for the example
row is level 04's *three-year* value, while $150,000 and $75,000 are levels 01/02's *annual* values. The
workbook's own blocking CONFIRM is about exactly this ("is the $150,000 Lead Partner an annual gift or a
three-year total?"). That ambiguity is the argument for `coverage_basis` being explicit and on every
total — it is the spec's "Coverage basis confusion" failure mode, already live in the source document.

### 1d. Workbook bugs — both confirmed, plus a third quirk

- **AA's Score formula.** Column M is `=IF(COUNT(J6:M6)=4,SUM(J6:M6),"")`. J–M is Affinity, Connection,
  Readiness, **and Score itself**. It self-references and **skips Capacity (column I)**. Confirmed.
- **EPA's Gap column.** `=K5-J5` — names minus needed, the opposite sign of AA's `=MAX(0,I5-J5)`.
  Confirmed. EPA's totals row therefore reads "gap −13" where the product reads "gap 13".
- **Third, worth naming:** SafeSpace's Gift Table has **no Gap column and no per-level names column at
  all** — the names total is a single 0. So of three consultant deliverables, three different
  conventions. The spec's "one convention: gap = max(0, needed − names)" is the right call and should be
  stated on the page itself, not just in code.

SafeSpace's own Score formula (`=IF(COUNT(E7:H7)=4,SUM(E7:H7),"")`, E–H = Capacity, Affinity,
Connection, Readiness) is **correct** — the AA bug is AA's alone.

---

## 2. Q1 — Every caller of `fr_plan_gift_levels`, `generateGiftLevels`, `matchGiftLevels`

**Table `fr_plan_gift_levels`** (2 call sites):

| File | Line | What |
|---|---|---|
| `app/admin/fundraising/plan/[id]/page.tsx` | 95 | `.from("fr_plan_gift_levels")` — read for the strategy detail |
| `app/api/admin/fundraising/plan/levels/route.ts` | 47, 51 | PUT: delete-all-then-insert, wholesale replace |

**`generateGiftLevels`** — defined `lib/fundraising/plan.ts:~200`; called
`app/admin/fundraising/plan/_components/PlanControls.tsx:11, 281` ("propose levels" button);
tested `tests/fundraising-plan.test.ts:5, 92–118`.

**`matchGiftLevels`** — defined `lib/fundraising/plan.ts:~250`; called
`app/admin/fundraising/plan/[id]/page.tsx:13, 144`; tested `tests/fundraising-plan.test.ts:6, 121–160`.

Also depended on: the private helpers `niceUp` / `niceDown` exist only to serve `generateGiftLevels`.

**To retire the v1 gift-level UI in Phase 4, five deletes and one drop:**

1. delete `app/api/admin/fundraising/plan/levels/route.ts` (whole route)
2. delete the levels block in `app/admin/fundraising/plan/[id]/page.tsx` (the read at :95, the
   `matchGiftLevels` call at :144, the table it renders, the import at :13)
3. delete the "propose levels" control in `PlanControls.tsx` and the `GiftLevel` state it drives
4. delete `generateGiftLevels`, `matchGiftLevels`, `LevelMatch`, `GiftLevel`, `niceUp`, `niceDown` from
   `lib/fundraising/plan.ts` — the rest of that file (trust labels, `rollupStrategy`, the ask calendar)
   stays; it is the strategy rollup, not the gift table
5. delete `tests/fundraising-plan.test.ts:92–160`
6. then the drop migration, with the 0-row check executed at drop time, not trusted from Phase 0

`fr_plan_strategies` is untouched by all of this — nothing in the levels path is shared with it.

**0 rows: UNVERIFIED** (see §0). The spec's claim is plausible — the plan pages are reachable only via a
route that 308s away, and `fr_plan_strategies` has no seed migration — but it needs a query.

## 3. Q2 — How Campaigns renders, where a "Gift tables" section goes, and how the active tab is decided

**Campaigns today** (`app/admin/fundraising/campaigns/page.tsx`, 155 lines, `force-dynamic`): a flat V1-era
page. `PageHeader` with a `NewCampaignForm` action → a 3-up `StatCard` grid (campaigns, attributed
giving, unattributed gifts) → a conditional `BulkAttributeForm` → `<div className="space-y-4">` of one
`<section>` per campaign with a goal bar and appeal chips → `EmptyState`. Four parallel Supabase reads,
all `.eq("org_id", ctx.orgId)`. Controls live in `_components/CampaignControls.tsx` (224 lines, three
client forms).

**It has not absorbed the plan detail.** There is no strategy, goal-decomposition, or gift-level content
on it — that still only exists at `plan/[id]`, which the redirect deliberately leaves live.

**Cleanest place for a Gift tables section:** a new `<section>` between the stat grid and the campaigns
list, i.e. directly after the `BulkAttributeForm` block — a heading, a "New gift table" control matching
`NewCampaignForm`'s shape, and one row per table (name, window, basis badge, goal vs shape, verdict
one-liner). It needs one more parallel read added to the existing `Promise.all`. The page is small
enough that this is additive, not a rewrite.

**Active-tab resolution — and the spec's route does not work.** Two mechanisms, both prefix matches:

- `lib/admin/v2shellNav.ts:activeShellKey(pathname, nav)` picks the *destination* (sidebar highlight and
  whether a tab row renders at all): for every tab it tests `path === seat || path.startsWith(seat + "/")`
  against both `tab.href` and `tab.canonical`, longest match wins, `null` if nothing matches.
- `app/admin/_components/v2/V2TabZone.tsx:V2TabRow` picks the *tab*: `path === t.href || path.startsWith(t.href + "/")`.

Fundraising's five tabs are `today`, `donors-funders`, `pipeline`, `grants`, `campaigns`
(`lib/admin/nav.ts:125-131`) — exactly as the spec's recon says.

`/admin/fundraising/gift-tables/[id]` is a prefix of **none** of them. `activeShellKey` returns `null`,
`V2TabZone` returns `null`, and the page renders with **no tab row and no sidebar highlight at all**.
That fails the spec's own DoD line ("the gift table page highlights Campaigns").

The spec's remedy — "v2routes + nav active-tab mapping for the new route" — is not a mechanism that
exists. `lib/admin/v2routes.ts` is the **V1→V2 redirect map**, not an alias table. Adding an `ACTIVE`
row for the gift-table path would make `activeRedirects()` emit a real 308 in `next.config.mjs` and
**redirect the page out of existence**; `tests/redirects-v2.test.ts` asserts config and map agree, so it
would also have to be mirrored into the config by hand. An `AT_CUTOVER` row would highlight correctly
without redirecting, but its documented meaning is "this V1 path will 308 here once its seat is built",
which is false for a route being born.

**Recommendation: nest the route — `/admin/fundraising/campaigns/gift-tables/[id]`.** It highlights
Campaigns and renders the Fundraising tab row structurally, with **zero** edits to `nav.ts`,
`v2routes.ts`, `v2shellNav.ts` or `next.config.mjs`, and it makes the "no new tab" DoD line true by
construction rather than by convention. It also reads honestly: the table lives *inside* Campaigns,
which is the decision the spec is defending in Open decision 1.

## 4. Q3 — `pipelines` / `pipeline_stages` as applied, and who already special-cases "pledged"

`supabase/migrations/fundraising_pipeline_config.sql` (applied — absent from the ledger baseline):

```
pipelines        (id, org_id, key, label, sort_order, is_default, created_at, updated_at,
                  unique (org_id, key))
pipeline_stages  (id, org_id, pipeline, key, label, sort_order, stage_type, external_stage_id,
                  probability_default, is_active, created_at, updated_at,
                  unique (org_id, pipeline, key))
```

**`stage_type` has FOUR values, not three:** `check (stage_type in ('open','won','lost','on_hold'))`.
The spec's recon §3 says "(open, won, lost)". `lib/fundraising/stages.ts` types it the same four ways.
`stageRoles(pipelineConfig)` must map `on_hold` explicitly — it is neither open nor lost, it is excluded
from weighted pipeline *and* from committed by decision D2, and the spec's own rules already say "on hold
renders as on hold and isn't in Move". Just make the fourth value explicit in the type, not implicit.

**Seed (what each org has, absent a query):** every org gets the ten-stage Sales taxonomy on pipeline
`default`, `is_default = true` — `identified`, `researched`, `needs_appointment`,
`appointment_scheduled`, `meeting_complete`, `ask_made`, **`pledged` (open, probability 90)**,
`closed_won` (won), `closed_lost` (lost), `on_hold` (on_hold, null probability). AA additionally has
three pipelines on the legacy five-stage funnel (`59855776` retired Partnership, `727459407` Angel
Connectors, `archived_partnership`), seeded only so the composite FK holds. AA's default-pipeline rows
carry real HubSpot dealstage ids; other orgs' are null.

**How the default pipeline is chosen: it isn't, in practice.** `pipelines.is_default` exists and
`loadPipelineConfig` surfaces it as `PipelineOption.isDefault`, but **nothing reads it.** Both routes
that create an ask hardcode the literal:

- `app/api/admin/opportunities/route.ts:50` — `pipeline: "default"`, `stagesForPipeline(config, "default")`
- `app/api/admin/fundraising/prospects/promote/route.ts:56` — same

So Start ask's "pipeline (org default, via `pipelines.is_default`)" is **new behavior**, not reuse. It is
the right behavior; the spec should just not describe it as existing.

**Code that already treats "pledged" specially — three places, all hardcoded, all AA-shaped:**

1. `lib/fundraising/stage-sets.ts:37` — `"pledged"` is a literal member of `OPEN_STAGE_KEYS`.
2. `app/admin/fundraising/pledges/PledgesSection.tsx:60` —
   `.in("stage", [...WON_STAGE_LIST, "pledged"])`, with the comment "pledged is an open Sales stage, but
   the donor has committed — exactly what a pledge schedule is". This is the exact reasoning behind
   `counts_as_pledged`, written out longhand against a string literal.
3. **The strongest evidence for Open decision 2, and the spec doesn't cite it:**
   `supabase/migrations/surface_committed_deals_in_revenue_schedule.sql:284` —
   `where o.external_stage in ('3448542950', '59189578')`. `v_revenue_schedule`'s commitment branch (the
   one that feeds **finance runway and Horizon**) identifies pledged money by **HubSpot dealstage id**.
   A standalone tenant's opportunities have `external_stage = null`, so **a non-AA org's pledged
   commitments never reach the forecast at all.**

That third one is a live tenant-neutrality bug outside this spec's scope, but `counts_as_pledged` is
precisely the fix for it. Recommend a follow-up line in the spec: once the flag is seeded, migrate
`v_revenue_schedule`'s commitment branch onto it. Not in this spec's scope — but say out loud that it
becomes possible, so it doesn't get lost.

## 5. Q4 — `expected_close` nullability, and what create-opportunity requires today

**`opportunities.expected_close date`** — nullable, no default (`create_opportunities.sql:29`). Start ask
can leave it blank at the database level with no change.

**`POST /api/admin/opportunities` requires exactly one thing:** `constituent_id` **or** `constituent_name`
(resolved via `lib/fundraising/constituent-resolve.ts`, which creates a person constituent on no match
and returns a `warning`). Everything else is optional and only written when it type-checks:
`expected_close` is set **only** if it matches `/^\d{4}-\d{2}-\d{2}$/`, so **omitting it leaves it null —
never fabricated.** Exactly what the spec's DoD line needs.

Three things the spec should know about reusing this route for Start ask:

- **It does not accept `plan_strategy_id`.** Start ask must either extend the route or write directly.
- **It hardcodes `pipeline: "default"`** (§4) and derives the stage from `firstOpenStageKey()` of that
  pipeline — correct shape, wrong source.
- **It calls `pushOpportunityToHubSpot(opp.id)`** after insert. Start ask from a gift table will mirror a
  deal into AA's HubSpot. That is probably desirable, but it is a side effect the spec doesn't mention,
  and it should be a stated decision rather than a surprise.
- It sets `owner` from `getAdminUser()` and accepts `capacity_rating` but **not** `affinity_rating`.

## 6. Q5 — How pledges and pledge_payments are modeled, displayed, and deduped

**Schema** (`create_pledges.sql`): `pledges (org_id, constituent_id nullable, total_amount,
installment_count, frequency in weekly|monthly|quarterly|annually, start_date, campaign_id, fund_id,
status in active|completed|cancelled, notes)`; `pledge_payments (org_id, pledge_id, due_date,
expected_amount, status in scheduled|paid|skipped, gift_id, paid_at)`. The comment states the model
plainly: **"the gift is the money, the payment is the expectation"** — `pledge_payments.gift_id` is the
join that prevents double-counting.

**Display:** `app/admin/fundraising/pledges/PledgesSection.tsx` aggregates payments per pledge into
paid / balance / overdue-count / next-due. The list route `/admin/fundraising/pledges` **308s to
`/admin/finance/forecast`** (`v2routes.ts`, Spec Finance N4), narrowed to `exact` so `pledges/[id]` stays
live. Schedule generation is `lib/fundraising/pledges.ts`.

**Existing dedupe — one, and it is not the one the spec needs.**
`dedup_commitments_against_gifts.sql` excludes a `v_revenue_schedule` commitment row when a gift already
matches on **constituent + amount + a ±7-day window** — the same key the HubSpot sync uses. That is a
ready-made, precedented shape for the spec's `possibleMatches()` and for the "double-counted pledges"
failure mode, and I'd reuse it rather than invent a new tolerance.

**Nothing dedupes a `pledged` opportunity against a `pledges` row.** `PledgesSection` actively offers to
*create* a pledge schedule from a won-or-pledged opportunity (`wonRes`), which is the exact mechanism by
which a household ends up with both. The spec's rule ("if both exist for one household in the window,
count once and show the overlap") is new logic with no precedent to copy. Worth a named fixture case.

## 7. Q6 — `recurring_plans` amount/frequency, and any annualization helper

```
recurring_plans (id, org_id, constituent_id nullable, amount numeric(12,2) not null,
                 frequency text not null default 'monthly',   -- NO check constraint
                 status in active|paused|cancelled, external_source, external_id, ...)
```

`frequency` is **free text with no constraint** — unlike `pledges.frequency`, which is constrained to
four values. So a Stripe/GiveButter importer could have written anything. `amount` is the per-charge
amount at that frequency.

**There is no annualization helper anywhere in the codebase.** I grepped `lib/fundraising`, `lib/finance`
and `lib/admin`: the only hits are `engagement.ts`'s unrelated `frequencyPoints()` and
`pledges.ts`'s `addInterval()`. `v_fr_rollups` exposes only a boolean `recurring_active`.

So the monthly-cadence arithmetic in `creditedValue()` — `amount × charges in window`, `amount × 12`,
`amount × 12 × monthly_modeled_years` — is entirely new code, and the Recurring candidate pool has to
normalize the free-text `frequency` itself (with a visible fallback for a value it doesn't recognize —
don't silently treat an unknown frequency as monthly).

## 8. Q7 — Households: how the id gets set, how merges work, what the rollup exposes

**How `constituents.household_id` gets set:** `uuid references households(id) on delete set null`
(`create_fundraising_core.sql:50`), nullable, **no trigger, no default**. It is set by importers and by
the merge route. `households` itself is `(org_id, name, salutation)` — and `salutation` is exactly the
field the spec's "show the household salutation when present" rule needs.
`drop_households_org_id_default.sql` removed the resident default (it sits in the ledger's
`fileOnly` baseline — i.e. **committed but never applied**; worth confirming when the DB is reachable).

**How merges work — and this is the finding that will bite Phase 3.**
`app/api/admin/constituents/merge/route.ts` reassigns child records by `constituent_id` across a
**hardcoded list**:

```ts
const CHILD_TABLES = ["gifts","opportunities","interactions","pledges",
                      "recurring_plans","soft_credits","email_sends"] as const;
```

then `grants.funder_id`, `relationships.a_id`/`b_id`, **deletes** `journey_enrollments` for the duplicate
("just drop the duplicate's rather than risk a unique collision on reassign"), unions contact fields
(`household_id` adopted only if the primary has none), and **hard-deletes the duplicate constituent**.

Two consequences for `fr_gift_table_placements`:

1. **It must be added to `CHILD_TABLES`, or the merge breaks.** Left out, the final delete either cascades
   the placement away silently (if the FK is `on delete cascade`) or 500s the merge (if it restricts) —
   after the child reassignments have already committed, since there is no transaction.
2. **A naive reassign will violate the new partial unique index.** If both constituents are placed on the
   same table, `update ... set constituent_id = primary` hits "one placement per (table, constituent)".
   The `journey_enrollments` precedent is the right one: on collision, keep the survivor's placement,
   drop the duplicate's, and audit it. This needs to be written into the spec, not discovered in Phase 3.

The spec's "two placements, one household" warning covers the *household* drift case but not this
*constituent merge* case.

**`v_fr_rollups` does NOT expose `household_id`.** The view selects `c.id, c.org_id, c.type,
first_name, last_name, org_name, emails, tags, do_not_contact, archived_at` plus the rollups — no
household. Household-first pools need either a second query against `constituents` or a change to the
view (which is `security_invoker = on` and covered by `supabase/tests/rls-leak-test.sql`, so changing it
is cheap but not free).

**Second, unrelated-looking but load-bearing:** the view's "next move" sub-select is
`where stage not in ('steward','lost')` — **V1 five-stage math left in place after the ten-stage remap.**
Under the current taxonomy that filter admits `closed_won`, `closed_lost` and `on_hold`, so
`v_fr_rollups.next_step` can come from a **closed** opportunity. The Renew pool ("prior donors with no
ask or next move") and the Move card would both inherit that error. Either fix the view in its own PR or
do not read `next_step` from it — read `opportunities` directly with `stageKeysOfType`. I'd do the
latter in Phase 3 and file the view fix separately.

## 9. Q8 — The owner/assignee pattern to reuse

**Free text, lowercase first-name handle** — `lib/admin/assignees.ts`:
`assigneeSlug(name)` = first token of `profiles.display_name`, lowercased, with PostgREST filter
characters stripped. Options come from **org memberships** (`deriveAssigneeOptions`, `board_viewer`
excluded), never a hardcoded list — `tenant_neutral_assignees.sql` dropped the old
`check (assigned_to in ('remi','shannon'))` constraints for exactly that reason.
`owner_uuid_promotion.sql` adds a trigger that maps a handle onto a real profile uuid by matching the
first token of the display name, so the handle round-trips.

`opportunities.owner` is plain text set from `getAdminUser()`. **Recommendation:**
`fr_gift_table_placements.owner text` on the `assigneeSlug` convention, with the dropdown from
`deriveAssigneeOptions` — consistent with both ops and opportunities, and no new pattern. The Ring-1 move
to real user references will carry it along with everything else.

## 10. Q9 — How `audit()` is called with before/after, and whether per-record history exists

**`lib/audit.ts`** — `audit(req, { action, entityType, entityId, before, after, actorUserId? })`.
Action naming is dotted `domain.entity.verb`. Writes via the **service-role** client to the partitioned
`audit_log`. `org_id` and actor come from `getOrgContext()` unless overridden. **Every error is swallowed**
— auditing never breaks the audited request. `entityId` must be a real uuid (column type); non-uuid
identifiers go in `after`.

Best `before`/`after` exemplar: `app/api/admin/constituents/merge/route.ts:85-90` —
`before: { duplicate_id, duplicate }`, `after: update`.

**Per-record history UI already exists and should just be reused.**
`lib/admin/history.ts:getEntityHistory(orgId, entityType, entityId, limit)` reads `audit_log` filtered by
`(org_id, entity_type, entity_id)`, joins `profiles` for actor display names, and returns
`{ id, ts, action, actorName, after }`. Rendered by `app/admin/_components/EntityHistory.tsx`, already
live on `board/[id]`, `compliance/[id]` and `students/[id]`.

**One gap for the spec's DoD line** ("changing a capacity score from 5 to 2 writes an audit row with
before and after, **visible in the placement's history**"): `getEntityHistory` selects `after` only — it
drops `before`. So either add `before` to the select and the `HistoryEvent` type (a small, safe change to
a shared helper, which also improves the three existing consumers), or write the placement patch as
`after: { capacity_score: { from: 5, to: 2 } }`. **Recommend the former** — it's honest, and the DoD line
is written as though `before` is already displayable.

## 11. Q10 — How the bench links `fr_prospects` to constituents when `constituent_id` is null

`fr_prospects.constituent_id uuid` is nullable with no FK in the create file
(`create_fr_prospects.sql:27`; `fr_prospect_family_fks_and_org_not_null.sql` adds FKs later). Status is
`active | promoted | disqualified`; the bench list shows only `active`.

The link is made at **promotion**: `app/api/admin/fundraising/prospects/promote/route.ts` calls
`resolveConstituent(supabase, orgId, { name })` — which matches an existing constituent
case-insensitively (person full name or org name) and **creates a person constituent on no match** —
then opens an opportunity at `firstOpenStageKey()` and flips the bench row to `promoted`, recording both
ids. `fr_prospect_promoted` keeps the record keyed by HubSpot contact id.

For the spec's "create constituent to place" affordance: **reuse `resolveConstituent`, not the promote
route.** Promote also opens an opportunity and marks the row `promoted`, which is not what placing on a
gift table means (placement ≠ ask; Start ask is a separate, deliberate second step). Placing an unlinked
bench row should create the constituent, set `fr_prospects.constituent_id`, leave `status = 'active'`,
and create the placement — three writes, one audit each.

## 12. Q11 — How Today's Moves assembles queues, and how the goal band uses `fr_plan_strategies`

**There are two "Today" surfaces, and the spec doesn't say which it means.**

- **`/admin/fundraising/today`** ("Today's Moves", the name the spec uses): six parallel reads assembled
  in the page itself — overdue next steps on open asks, asks closing ≤30 days, unowned open asks,
  gifts pending acknowledgment, gifts in the last 14 days, plus `fetchAskMoments(supabase, orgId, today, 7)`
  (opportunity closes, grant deadlines, pledge installments, from `lib/fundraising/plan.ts`). Stage
  filtering uses `OPEN_STAGE_LIST` from `stage-sets.ts` — the static unions, which the spec's rule
  "new code does not import `OPEN_STAGE_KEYS`/`WON_STAGE_KEYS`" correctly declines to extend.
  Four `StatCard`s, then `MomentQueue` / `OppQueue` / `GiftQueue` sections. **Adding a gift-table queue
  here is one more entry in the `Promise.all` and one more `<OppQueue>`-shaped section.**
- **`/admin/today`** (Home): reads `public.v_obligations` through `lib/admin/today.ts` +
  `lib/admin/todayRank.ts`. Adding placements *here* means a **new arm in the `v_obligations` view**,
  which must set `contains_participant_data` explicitly (`tests/obligations-view.test.ts` fails a new arm
  that doesn't) and must be excluded from Reed's `get_needs_you_queue` — materially more work, and it
  puts placement next steps in front of Reed, which the spec explicitly forbids.

**Recommend the spec name `/admin/fundraising/today` explicitly, and say `v_obligations` is out of scope.**

**The goal band does not read `fr_plan_strategies`. Nothing outside the plan pages does.** Full census of
`fr_plan_strategies` reads in `app/` and `lib/`:

```
app/admin/fundraising/plan/[id]/page.tsx:58
app/admin/fundraising/plan/page.tsx:70
app/api/admin/fundraising/plan/route.ts:39, 75, 103
app/api/admin/fundraising/plan/levels/route.ts:40
app/api/admin/fundraising/plan/assign/route.ts:42
```

That is all of them. Neither Today page, nor Campaigns, nor the finance snapshot touches it.

**This invalidates the spec's Recon finding 1 ("Today's goal band reads `fr_plan_strategies`") and the
stated reasoning of Open decision 8 ("Recommend no. Today's goal band reads it").** The *conclusion*
of decision 8 still holds, but on a different footing: `opportunities.plan_strategy_id`,
`grants.plan_strategy_id` and `campaigns.plan_strategy_id` are real applied columns with indexes
(`fundraising_plan.sql:70-83`), and Start ask is specified to set `plan_strategy_id` from the table. Keep
`fr_plan_strategies` for **that** reason and correct the recon line.

Minor, while in the area: `/admin/fundraising/today`'s `MomentQueue` links to `/admin/fundraising/plan`
(`today/page.tsx:291`), which permanently 308s to Campaigns. Not broken, but it will point at a page with
no ask calendar on it. Worth re-aiming when Campaigns grows the gift-tables section.

## 13. Q12 — Where `fin_config.fundraising_goal` and `fiscal_year_start_month` are read

| File | Line | What |
|---|---|---|
| `lib/admin/finance.ts` | 113–120 | `getFinanceSnapshot()` — the canonical loader; `startMonth` defaults to **1** when null, `goal` defaults to **0**. Feeds the Finance dashboard **and Reed's `get_finance_snapshot`** |
| `lib/admin/strategy/money.ts` | 25–29 | reads `current_year, fiscal_year_start_month` (same default 1) |
| `app/admin/finance/revenue/RevenueSection.tsx` | 40–47 | reads `current_year, fundraising_goal` |
| `app/admin/finance/config/page.tsx` + `_components/ConfigEditor.tsx` | 19–32 / 9–58 | the editor |
| `app/api/admin/finance/config/route.ts` | 34–45 | the write, validating 1..12 and non-negative |

So Open decision 7 is correctly scoped: a gift table stores its own target and is not blocked, but any
"remaining to FY goal" line reads `lib/admin/finance.ts`. Note the **fiscal-start default of 1** appears
in two places — if AA's fiscal year is really July–June, both the `fin_config` row and anything relying
on that default are wrong today. That is the spec's Open decision 7 restated as a live inconsistency, and
the AA workbook flags it too ("CONFIRM: is the $875,000 FY27 goal still current?").

## 14. Q13 — Board portal and Reed reads, so placements can be excluded

**Board portal** (`app/board/**`, `supabase/migrations/create_board_portal.sql`): reads `agenda_items`,
`meeting_attendance`, `minutes`, `resolutions`, `follow_ups`, `prep_items`, `coi_disclosures`,
`member_notes`, `member_questions`, and `documents` (`app/board/library/page.tsx:27`). RLS is
`board.read` / `board.write` plus a `private.board_member_id(org_id)` self-scope. **It touches no
fundraising table at all.** Placements are excluded from the portal by simply not adding them, and by the
`fundraising.read` policy — a board viewer without `fundraising.read` cannot select the rows.

**Reed** (`lib/agents/reed/tools.ts`, 19 tools). The three that touch fundraising:

- `get_fundraising_forecast` — the canonical forecast loader (gifts, committed, weighted pipeline, gap).
  Reads opportunities in aggregate. Would never see placements unless someone added them to the loader.
- `get_constituent_dossier` → `lib/meetings/dossier.ts:loadConstituentDossier` — **this is the one to
  watch.** Profile, giving summary, recurring plans, interactions, open opportunities, for one donor.
  It is gated on `hasPermission(sb, orgId, "fundraising.read")`, which placements will also carry, so
  the exclusion has to be **explicit**: do not add placements, scores or warm paths to this loader.
- `get_needs_you_queue` — reads `v_obligations`, filtered by `contains_participant_data`. Another reason
  not to add a gift-table arm to that view (§12).

**Recommended test for the DoD:** a source-level assertion that `lib/meetings/dossier.ts` and
`lib/agents/reed/tools.ts` contain no reference to `fr_gift_table_` — the same shape as
`tests/reed-documents.test.ts` and `tests/meeting-exclusions.test.ts` already use for their fences. A
runtime test can't prove a negative here; a source fence can.

## 15. Q14 — Existing XLSX export code and library

**There is none.** `package.json` has no `xlsx`, `sheetjs`, `exceljs`, or equivalent. `papaparse` is a
dependency but is used for **parsing** uploads (finance, gifts, imports), not writing.

Every export in the app today is CSV or ICS, hand-built:
`app/api/admin/gifts/export/route.ts`, `app/api/admin/donors/export/route.ts`,
`app/admin/_components/DataTable.tsx` (client-side CSV), `lib/meet/ics.ts`.

**Phase 5's "XLSX export in the workbook's shape (Start Here, Gift Table, Inventory, Pools)" needs a
decision the spec doesn't make:** four sheets in one file is not expressible as CSV. Options: add
`exceljs` (~1MB, writes real multi-sheet xlsx, actively maintained), add `sheetjs`, or downgrade Phase 5
to four separate CSVs and lose the workbook shape. I'd add `exceljs` and say so in the spec — the whole
point of the export is that a consultant can hand it to a client who expects the workbook they already
know. But it is a new dependency on a repo that has kept them few, so it should be Remi's call, not a
Phase 5 surprise.

## 16. Q15 — What conflicts with the repo. Plainly.

Ordered by how much they'd cost if found late.

1. **The migration-ledger workflow will fail the Phase 1 PR.** `.github/workflows/migration-ledger.yml`
   runs `scripts/check-migration-ledger.ts` on **every PR** and fails on a committed migration that
   production hasn't applied (`fileOnly`). Committing `fundraising_gift_tables.sql` and handing it to
   Remi afterwards means **red CI from the moment the PR opens until he applies it.** The `BASELINE`
   escape hatch is documented as "a ratchet, not an exception list… it can only shrink", so adding to it
   is the wrong move. **The spec's Phase 1 handoff model needs an explicit sequencing rule:** Remi applies
   the migration from the PR branch *before* the PR merges (or before CI is expected green), and the
   commit point in §Staged build order should say so. Same for `seed_aa_pledged_stage_flag.MANUAL.sql`
   — though `*.MANUAL.sql` is excluded from the ledger check by convention, so that one is free.
2. **`/admin/fundraising/gift-tables/[id]` renders with no tab row and no sidebar highlight**, and the
   proposed remedy (`v2routes` + nav mapping) would 308 the page away. Nest it under Campaigns. Full
   reasoning in §3.
3. **The constituent merge route will break on placements** — hardcoded `CHILD_TABLES`, plus a unique-index
   collision when both constituents are placed on one table. §8.
4. **"Today's goal band reads `fr_plan_strategies`" is false** — nothing outside the plan pages reads it.
   Recon finding 1 and Open decision 8's reasoning both need rewriting (the conclusion survives). §12.
5. **`v_fr_rollups` has no `household_id`**, and its `next_step` sub-select still uses V1 five-stage math
   (`stage not in ('steward','lost')`), so it admits closed asks. Don't build Renew/Move on it. §8.
6. **`stage_type` has four values including `on_hold`**, not the three the spec's recon lists. §4.
7. **`pipelines.is_default` is read by nothing**; both ask-creating routes hardcode `pipeline: "default"`.
   Start ask reading the flag is new behavior, correctly specified but wrongly described as existing. §4.
8. **`POST /api/admin/opportunities` doesn't accept `plan_strategy_id` and does push to HubSpot.** §5.
9. **No XLSX library.** §15.
10. **`tests/tenant-isolation.test.ts:TENANT_TABLES` is a hardcoded set** (snapshot dated 2026-07-19). The
    four new tables must be added or their service-role reads go unguarded. Note `fr_plan_strategies` and
    `fr_plan_gift_levels` are **missing from it today** — a small pre-existing gap worth closing in the
    same commit.
11. **`lib/database.types.ts` is `/meet`-only** (98 lines, hand-maintained, explicitly scoped to the
    scheduler), despite CLAUDE.md saying admin types live there. Nothing to regenerate; don't add
    gift-table types there.
12. **Fixture correction:** SafeSpace's warm path is on 10 of 20 named rows, not "most". §1c.
13. **`v_revenue_schedule` identifies pledged money by HubSpot dealstage id** — a tenant-neutrality bug
    outside this spec, which `counts_as_pledged` would fix. Worth a "later" line, not scope creep. §4.
14. **`drop_households_org_id_default.sql` sits in the ledger's never-applied baseline.** If households
    still carries a resident AA default in production, the household trigger's org-match assumptions
    deserve a second look. Confirm when the DB is reachable.

Everything else in the spec that I could check against the repo is **accurate**: the redirect
(`next.config.mjs:84`, exact, permanent), the five fundraising tabs, `plan/[id]` staying live,
`firstOpenStageKey` / `stageKeysOfType` / `stagesForPipeline` and `pipelines.is_default` all existing in
`lib/fundraising/stages.ts`, `relationships` carrying a `knows` kind, `v_fr_rollups` exposing the rollups
it lists (minus household), the `set_updated_at` + `search_path` re-pin convention in
`fundraising_plan.sql`, the per-domain `fundraising.read` / `fundraising.write` RLS loop, the
`create table if not exists` / `create index if not exists` idempotency rule enforced by
`tests/migrations.test.ts`, and the no-org_id-default ratchet.

---

## 17. Proposed Phase 1 file list

**Migrations (handed to Remi, not applied by me):**

- `supabase/migrations/fundraising_gift_tables.sql` — four tables, RLS, triggers, indexes (§18)
- `supabase/migrations/seed_aa_pledged_stage_flag.MANUAL.sql` — sets `counts_as_pledged = true` on AA's
  `pledged` stage, resolved by `orgs.slug`, no-op on other databases

**Domain logic:**

- `lib/fundraising/gift-table.ts` — pure, no Supabase import. `tableGoal`, `tableShape`, `creditedValue`,
  `stageRoles`, `slotNames`, `gaps`, `workGroups`, `verdict`, `pools`, `possibleMatches`,
  `suggestCapacity`, `suggestAffinity`, `closeSnapshot`

**Tests:**

- `tests/gift-table.test.ts` — the three fixtures (§1) plus the rule tests the spec names
- `tests/fixtures/gift-tables/*.xlsx` — the three workbooks (see below)
- `tests/tenant-isolation.test.ts` — add the four tables to `TENANT_TABLES`

**Deliberately not in Phase 1:** no pages, no API routes, no nav edits, no `lib/database.types.ts`.

**A question the spec should answer before Phase 1:** should the fixture tests **parse the workbooks at
test time**, or should the numbers be transcribed into the test file with the workbook committed as
provenance? Parsing means a new xlsx dependency in `devDependencies` (§15) and a slower test. **I'd
transcribe the numbers and commit the workbooks alongside** — the assertions stay readable and fast, the
files are the audit trail, and the xlsx-library decision stays where it belongs, in Phase 5. That reading
satisfies Open decision 9's intent ("so assertions come from the file, not from memory"): they came from
the files, this session, formula by formula, and §1 is the transcript.

### Fixture file status — and one thing I could not do

All three workbooks are attached to this session and fully parsed (§1). **I could not copy them into
`tests/fixtures/gift-tables/`, and I could not copy the spec into `specs/fundraising-gift-tables.md`** —
the sandbox blocked writing uploaded files into the repo ("Sensitive-Source Provenance"). Both copies are
things the kickoff prompt asks for, and both need either a permission grant or for Remi to drop the four
files in directly. Nothing else in Phase 0 depended on it: this document is complete either way.

## 18. Migration outline, in prose

One file, `fundraising_gift_tables.sql`, idempotent throughout, following `fundraising_plan.sql`'s
conventions exactly.

**Preamble.** Re-declare `set_updated_at()` and re-pin its `search_path` to
`public, extensions, pg_temp`, as `fundraising_plan.sql` does — `create or replace` wipes the SET clause
and would silently un-harden every trigger in the database otherwise.

**`fr_gift_tables`.** `org_id uuid not null references orgs(id)` with **no default**. Name, `starts_on`,
`ends_on` with `check (ends_on >= starts_on)`, `status` checked to `draft|active|closed|archived`,
`target`, `multiplier`, `coverage_basis` checked to `window|annual|full_term`, `default_term_years`,
`monthly_modeled_years`, the three ratios and `major_threshold`, the three text fields, nullable
`strategy_id references fr_plan_strategies(id) on delete set null` and
`campaign_id references campaigns(id) on delete set null`, `closed_at`, `closed_snapshot jsonb`,
timestamps. Index on `(org_id, status, starts_on)`.

**`fr_gift_table_levels`.** Owned only by `fr_gift_tables` — `gift_table_id ... on delete cascade`, plus
its own `org_id`. Label, `amount numeric(12,2) check (amount > 0)`, `cadence` checked to
`one_time|annual|monthly`, nullable `term_years`, `gifts_needed int check (>= 1)`,
`prospects_per_gift int check (>= 1)`, purpose, sort. Index `(gift_table_id, sort)`.

**`fr_gift_table_placements`.** `gift_table_id` cascade, `level_id references fr_gift_table_levels(id)`,
`constituent_id references constituents(id)`, nullable `household_id references households(id)`,
nullable `opportunity_id references opportunities(id) on delete set null`, `target_amount`, cadence/term
overrides, the four scores as `smallint check (between 1 and 5)`, `warm_path text`, `why_note text`,
`status` checked to `prospect|cultivating|ready|declined|removed`, `next_step`, `next_step_due`, `owner`,
timestamps.

**`fr_gift_table_credits`.** `gift_table_id` cascade, `source_type` checked to
`gift|pledge|recurring_plan|grant`, `source_id uuid`, nullable `placement_id`, `attributed_by`, `note`.
Unique `(gift_table_id, source_type, source_id)`.

**Household trigger.** `before insert or update of constituent_id` on placements: set `household_id`
from the constituent's current value, **always from the row, never from the request body**. Paired with
two partial unique indexes: `(gift_table_id, household_id) where household_id is not null and status <>
'removed'`, and `(gift_table_id, constituent_id) where household_id is null and status <> 'removed'`.

**Org-match triggers.** On each child table: the row's `org_id` must equal its parent table's `org_id`,
and any referenced constituent, opportunity, level or credit source must belong to the same org. RLS
alone does not catch a cross-tenant id supplied by a compromised or buggy caller. Raise a clear
exception naming the mismatch.

**Updated-at triggers** on `fr_gift_tables` and `fr_gift_table_placements` (levels are replaced wholesale,
credits are insert/delete only — same reasoning as `fr_plan_gift_levels`).

**RLS**, in the same migration, via the `do $$ … foreach t in array … loop` pattern from
`fundraising_plan.sql`: `select` on `private.has_permission(org_id, 'fundraising.read')`, `for all` on
`'fundraising.write'`, both `using` and `with check`.

**`pipeline_stages.counts_as_pledged`** — `boolean not null default false`, added here; the AA seed is
the separate `.MANUAL.sql` file.

**`fr_plan_gift_levels` is not touched.** It stays in place through Phase 3 and is dropped in Phase 4,
with the 0-row check run at drop time.

**Verification comments** at the foot, in the house style (`fundraising_pipeline_config.sql` ends with a
`select … group by` and an "Expect:" line) so Remi can confirm the apply landed.

## 19. Spec changes I recommend

Not scope changes — corrections and two decisions the spec currently leaves implicit.

1. **Route.** Change `/admin/fundraising/gift-tables/[id]` to
   `/admin/fundraising/campaigns/gift-tables/[id]` and delete the "v2routes + nav active-tab mapping"
   line from the architecture sketch. It is not a mechanism that exists, and nesting makes the DoD line
   true structurally. (§3)
2. **Recon finding 1 / Open decision 8.** Strike "Today's goal band reads `fr_plan_strategies`" — nothing
   outside the plan pages does. Keep the recommendation, rebased on the `plan_strategy_id` links, which
   are real and which Start ask writes to. (§12)
3. **Recon finding 3.** `stage_type` has four values; `on_hold` is one of them. Say so, and have
   `stageRoles()` return it explicitly. (§4)
4. **Phase 1 handoff.** Add a sentence to §Staged build order: the migration is applied by Remi from the
   PR branch **before** the PR is expected to pass CI, because `migration-ledger.yml` fails a committed
   migration that production hasn't applied, and `BASELINE` is a ratchet that must not grow. (§16.1)
5. **Merge behavior.** Add a rule under §Rules: on a constituent merge, placements follow the primary;
   if both constituents are placed on the same table, the survivor's placement is kept, the duplicate's is
   removed, and the removal is audited. Name `app/api/admin/constituents/merge/route.ts` as the file that
   changes. (§8)
6. **Don't read `v_fr_rollups.next_step`.** Note that the view's open-ask filter is stale V1 math, and
   that pools read `opportunities` with `stageKeysOfType` instead. File the view fix as a separate
   follow-up. (§8)
7. **Name the Today surface.** `/admin/fundraising/today`, and say `v_obligations` is explicitly out of
   scope — an arm there would put placement next steps in front of Reed, which the spec forbids
   elsewhere. (§12)
8. **Start ask side effect.** Say out loud that creating the opportunity mirrors a deal to HubSpot for a
   connected tenant, and decide whether that's wanted. (§5)
9. **SafeSpace fixture line.** "a warm-path value on **most** placements" → "on placements that have
   one (10 of 20 in the fixture)", and add the tie-break assertion — SafeSpace is the fixture that
   exercises it. (§1c)
10. **Phase 5 dependency.** State that multi-sheet XLSX needs a new dependency (recommend `exceljs`) or
    that the export degrades to CSVs. Don't leave it to be discovered. (§15)
11. **Reed/board exclusion test.** Make the DoD line concrete: a source fence asserting
    `lib/meetings/dossier.ts` and `lib/agents/reed/tools.ts` never reference `fr_gift_table_`. (§14)
12. **Later, optional.** Add to the closing "Later:" list — migrate `v_revenue_schedule`'s commitment
    branch off HubSpot dealstage ids onto `counts_as_pledged`, once the flag exists. (§4)

---

**Stopping here, per the kickoff prompt. No code, no migrations, no schema. Awaiting approval.**
