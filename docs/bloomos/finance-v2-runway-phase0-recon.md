# Finance v2 — Forward Runway: Phase 0 Recon Findings

Status: **Phase 0 complete (read-and-report).** No code or migration written.
Date: 2026-06-25. Scope: confirm the spec's assumptions against the real repo
(`lib/admin/finance.ts`, pledges/config/reconcile/revenue code paths) and the
live Supabase schema (project `kzzdtibbwsucloaoqpqa`).

Bottom line: the model and code paths match the spec, but **three spec
assumptions are stale and one is wrong** — (a) the multi-tenant spine already
exists (`org_id` + RLS on every `fin_*` table), (b) the reconcile balance and
the "starting balance" are the *same* column, which collapses D4, (c) the
`/admin/finance/reconcile` route is **already taken** by the Cowork
reconciliation inbox, so the wizard can't land there, and (d) AA's pledges are
almost entirely in HubSpot under unmapped custom-pipeline stages, so the runway
tiers will be near-empty until stages are mapped or deals are adopted.

---

## 1. `fin_config`

Full column list (live):

| column | type | null | default |
|---|---|---|---|
| id | int | NO | 1 |
| fiscal_year_start_month | int | NO | 1 |
| current_year | int | NO | 2026 |
| fundraising_goal | numeric | YES | — |
| contingency_unlock_threshold | numeric | YES | 1.0 |
| cash_starting_balance | numeric | YES | 0 |
| cash_starting_date | date | YES | — |
| updated_at | timestamptz | NO | now() |
| **org_id** | **uuid** | **NO** | AA org `17c75da8-…eb22` |
| cash_reconciled_at | timestamptz | YES | — |

Current row (`id=1`): year 2026, goal `1,247,982`, threshold `1.09`,
`cash_starting_balance = 82,442`, `cash_starting_date = 2026-06-18`,
`cash_reconciled_at = 2026-06-18T20:33Z`.

- ✅ Confirmed: **no `monthly_burn_baseline`, no `forward_horizon_months`** yet.
- **Where the reconciled balance + date actually live:** *in `fin_config`
  itself.* "Set current balance" (`POST /api/admin/finance/reconcile`) writes
  `cash_starting_balance` + `cash_starting_date` + stamps `cash_reconciled_at`.
  There is **no separate reconciled-vs-computed pair** — the reconcile *is* the
  anchor. `cashOnHand = cash_starting_balance + Σ(amount where txn_date >
  cash_starting_date)` (`lib/admin/finance.ts:98–105`). `cash_reconciled_at` is
  the freshness stamp surfaces already read (see `ReconcileCard`,
  `FinanceConfig.reconciledAt`).
- **Surprise:** `fin_config` is **not** the bare singleton the spec assumes — it
  carries `org_id` and is under RLS (see item 5). It's still *addressed* as a
  singleton (`.eq("id", 1)`) in every read/write.

## 2. `fin_transactions`

Columns: `id, txn_date, description, amount, category_id (text FK), restricted
(bool default false), restricted_to, source_file, dedup_hash, notes,
uploaded_at, uploaded_by, updated_at, org_id`.

- ✅ Confirmed: **no `exclude_from_runway`** flag.
- **Operating account:** there is **no account column.** Today the ledger is
  **single-account** (Business Checking 9926 implicitly). Step 1's
  account-specificity is *not representable* in the schema, so v2 treats all
  transactions as the one operating account. Note as an assumption, not a TODO —
  no migration needed for it now.
- Useful: a per-transaction **`restricted`** boolean already exists (mirrors the
  pledge field). So D5's "exclude restricted program spend" could lean on an
  existing column if we ever want it; the spec's `exclude_from_runway` flag is
  still the cleaner general lever.

## 3. `fin_revenue_commitments`

Columns: `id, year, source_type, source_name, amount, status, expected_date
(date null), probability (numeric null), restricted (bool default false),
restricted_to, notes, created_at, updated_at, created_by, org_id`.

- ✅ Confirmed: **no `external_ref`.**
- **Status values actually in the table:** only `received` — **1 row total**
  ($2,000, 2026, unrestricted, dated). The code's allowed set is
  `secured | projected | received` (`revenue/route.ts:15`). In other words the
  Bloom-native pledge table is **effectively empty**; AA's real pipeline lives
  in HubSpot. **Consequence:** the due/projected runway tiers will be driven
  almost entirely by HubSpot deals (or by whatever Shannon adopts), so Phase 4b
  (adopt) is closer to the critical path than its late position suggests.

## 4. `hs_deals`

571 deals. `close_date`: **88 null, 100 in CY2026, 5 future (>2026, max
2027-11-01), 378 past.** No probability column; `raw_json` carries no
`hs_deal_stage_probability` in the sample — **all probabilities come from our
own `MATCHERS` stage→prob map** in `lib/finance/hubspot-pledges.ts`, not from
HubSpot.

Stages on the 2026-or-undated slice, by count:

| stage | count | Σ amount | `mapStage` result |
|---|---|---|---|
| `117779885` | 85 | $10k | **ignore** (unmapped numeric) |
| `closedlost` | 33 | $3.07M | ignore |
| `closedwon` | 17 | $189k | received |
| `59213864` | 16 | $457k | **ignore** |
| `3448542950` | 9 | $300k | **ignore** |
| `59189578` | 5 | $277k | **ignore** |
| `appointmentscheduled` | 2 | $100k | projected @ 0.1 |
| (other numeric stages) | … | … | **ignore** |

- **The spec's worry (a stale 50% deal counting at full value) barely exists in
  current data** — because AA runs custom pipelines whose stages are opaque
  numeric IDs the matcher doesn't recognize, so they're silently **ignored**,
  not mis-weighted. The realer near-term risk is the **opposite**: large
  committed/in-flight deals ($457k, $300k, $277k…) are **invisible** to pledge
  totals and would be invisible to the runway tiers too. Flag for Shannon: the
  stage map needs AA's real pipeline IDs, *or* those deals must be adopted into
  Bloom, before the due/projected tiers mean anything.
- Year filter (`loadHubSpotPledges`) keeps `close_date` in-year **or null**;
  undated (88) are included by default. The runway "dated-only" rule must drop
  the 88 undated regardless — matches the spec's "N pledges missing dates"
  nudge.

## 5. Multi-tenant baseline — **spec is out of date here**

Every `fin_*` table already has `org_id (uuid, NOT NULL, default AA org)` **and
RLS enabled**: `fin_budget, fin_categories, fin_category_rules, fin_config,
fin_imports, fin_reconciliation_items, fin_revenue_commitments,
fin_transactions`. Helper functions exist: `has_permission`, `is_org_member`,
`shares_org`. Migrations are checked into `supabase/migrations/`
(`add_org_id_to_tenant_tables.sql`, `enable_rls_per_domain.sql`,
`create_fin_schema.sql`).

So the multi-tenant *spine* is laid. What's left of D2 is narrow: **code still
keys `fin_config` by `id=1`** instead of by `org_id`, so a second org's config
row wouldn't be reached by today's reads. New columns inherit `org_id` from the
table default automatically, so they "move with the tenant" for free; any new
`fin_reconciliations` history table must add `org_id` + an RLS policy using
`has_permission`/`shares_org` to match the pattern.

---

## Extra findings the checklist didn't ask for (but matter)

- **Route collision (blocking for Phase 5).** `/admin/finance/reconcile`
  **already exists** and renders the **Cowork reconciliation inbox**
  (`ReconcileInbox`, table `fin_reconciliation_items`: proposed ledger entries,
  `kind/source/status/payload/applied_id`). It is *not* a reconcile-stamp log.
  The Friday wizard **cannot** take that path as written. Options: nest the
  wizard at `/admin/finance/reconcile/close` (or `/admin/finance/close`), or
  fold the existing inbox in as the wizard's "clear proposals" step. Decision
  needed — the spec assumes the route is free; it isn't.
- **Reed duplicates the math.** `lib/agents/reed/tools.ts:95–119`
  **re-implements** `cashOnHand`/`burn3mo`/`runwayMonths` inline rather than
  calling `getFinanceSnapshot`. "One canonical function" is already violated;
  Phase 2/3 must update Reed too or it will disagree with the dashboard.
- **External consumer of the scalar.** `lib/google/finance-sheet.ts` +
  `scripts/finance-model-webhook.gs` push `runwayMonths` to a Google Sheet, and
  the briefing thresholds (`lib/admin/briefing/sources/index.ts`) compare it to
  critical/watch floors. Keeping a back-compatible `runwayMonths` (D6) is
  load-bearing for these, not just the dashboard cards.
- **Snapshot consumers to update in Phase 3:** `app/admin/finance/page.tsx`,
  `RunwayCard`, `FinanceSnapshotWidget`, `PulseStrip` + briefing
  (`pulse.ts`, `gather.ts`, `narrate.ts`, `sources/index.ts`),
  `report/page.tsx`, `forecast/page.tsx`, `model/page.tsx`, `upload/page.tsx`,
  Reed tools, and the Google-sheet push.

---

## What the schema now lets us settle (D1–D6)

| # | Decision | Status after recon |
|---|---|---|
| **D1** | `+1` current-month convention | **Still needs Shannon.** Schema is silent; it's a wording/off-by-one call on a CEO-facing number. |
| **D2** | `fin_config` singleton / `org_id` | **Largely settled.** `org_id` + RLS already exist; new columns inherit them. Remaining debt is small (code keys `id=1`, not `org_id`) — recommend *note now, fix at tenant-2 cutover*, exactly as the spec leans, but cheaper than it feared. |
| **D3** | Reconcile-stamp storage | **Informed.** `fin_config.cash_reconciled_at` already exists as a single-timestamp precedent. Cheapest path: add `fin_config.last_reconciled_at` (mirrors the existing stamp). If we want board history, a new table must **not** be named `fin_reconciliation_items` (taken) — use e.g. `fin_reconciliation_runs` with `org_id` + RLS. Still a Remi call, now scoped. |
| **D4** | Balance precedence (reconciled vs computed) | **Mostly dissolves.** There is no separate reconciled-vs-computed balance — reconcile *is* the anchor, and `cashOnHand` already folds the anchor + post-anchor txns. Recommend `bankBalance = cashOnHand`, with the anchor date + `cash_reconciled_at` freshness already on screen. |
| **D5** | Month-to-date spend definition | **Defaultable.** Lean "all expenses minus `exclude_from_runway`" stands; a per-txn `restricted` flag already exists as a finer lever if Shannon ever wants it. No blocker. |
| **D6** | Which scalar stays `runwayMonths` | **Code call, not schema.** Multiple external consumers (Google sheet, briefing floors) read it as "months at current burn." Recommend **cash tier** (most conservative), per spec lean. |

Still genuinely need Shannon/Remi: **D1** (the `+1` wording) and the **route
collision** decision for the wizard. Everything else is now defaultable.

## Recommended smallest first migration (Phase 1) — **not written here**

Add the two config inputs only, both nullable, both inheriting `org_id` from the
table default:

```
fin_config.monthly_burn_baseline numeric null
fin_config.forward_horizon_months int null default 3
```

Why this is the smallest safe step: purely additive, nullable, no backfill, no
behavior change (nothing reads them in Phase 1), reversible with a `drop column`,
and it follows the existing committed-SQL convention in `supabase/migrations/`.
Hand to Remi to apply before the Phase 1 `ConfigEditor` + `/api/.../config`
change merges.
