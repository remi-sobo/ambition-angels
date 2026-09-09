# Spec Finance — the third destination: Snapshot + Transactions + Budget + Forecast + Reports

The third destination cutover, and the first where every tab's path already has a live screen — the work is absorption, one genuinely new build, and the exit gate.
Date: 2026-09-09 · Depends on: `docs/v2-recon.md` (§F.1, §G), `docs/v2-preservation-ledger.md`, Spec A (Contracts 1, 2 and **7** — `export_waivers` and the gating rule shipped there), Spec B (all merged), Spec Home (all merged), Spec Fundraising (all merged; `pledges → Forecast` was explicitly left to this spec).

---

## Problem statement

Finance is V1's most fragmented money story: eleven routes tell it — snapshot, transactions, reconcile, close, budget, forecast, model, revenue, report(s), rules/config/upload. The V2 model (B1) says five tabs: Snapshot · Transactions · Budget · Forecast · Reports. Unusually, all five paths already render live screens (Snapshot and Reports have been ACTIVE hosts since B2; Transactions and Forecast are same-path at-cutover rows; Budget is kept-in-place) — so this spec builds almost no new URLs. What it builds is the *merges* those same-path rows promise (Transactions absorbs Reconcile and the gated Close; Forecast absorbs Model, Revenue's commitments tier, and Fundraising's pledges tier) and the one genuinely new screen the recon names: the **Reports builder**, the first surface where Contract 7's exit gate is a user experience rather than a schema.

## Who's affected

All four orgs hold `modules.finance`, so every tenant renders all five tabs. Remi most (finance is his desk); the 9-key orgs get the same screens over thinner data. The Snapshot keeps launching in its Stage-5 "stale, shown but flagged" state — the honest default until a fresher anchor lands, unchanged by this spec.

## Current behavior

`/admin/finance` 308s to Snapshot (B2). Transactions lists `fin_transactions`; Reconcile is the proposals inbox (`fin_reconciliation_items`, fed by the weekly sweep); Close is the gated month-close; Forecast, Model, and Revenue are three screens over one forward-looking question; `/admin/fundraising/pledges` lists pledges + installments; Reports is a placeholder host that `/admin/finance/report` 308s to. Rules/config/upload are settings-shaped pages awaiting a Settings seat.

## Desired behavior

Transactions is the one bookkeeping surface: the ledger, the reconcile inbox, and the month-close on one screen, close still gated by Contract 7's rule. Forecast is the one forward surface: received → committed → pledges due → weighted open, in tiers. Reports drafts always, flags unresolved figures inline, and **blocks only the exit**: any export or send referencing a metric in `conflict` or `stale` stops unless a `reports.approve` holder waives — writing `export_waivers` + `audit_log`, the waiver traveling with the artifact. At cutover, `finance` joins `V2_CUTOVER_DESTINATIONS` and the remaining rows activate.

## Scope

**In.**
- Transactions absorbing Reconcile + Close (recomposition — the F2–F6 extraction pattern; V1 routes byte-identical until their 308s).
- Forecast absorbing Model + Revenue + the pledges tier (same pattern; `/admin/fundraising/pledges` finally activates its parked row).
- The Reports builder at `/admin/finance/reports`: compose a report from canonical loaders + `<Metric>` reads, Reed narrative via `reed_drafts` (draft-for-approval, never auto-sent), Contract 7 gating on the exit.
- The Finance cutover: seven rows AT_CUTOVER → ACTIVE, tab slot flip, config↔map agreement.

**Out.**
- QuickBooks integration — Snapshot stays "stale, flagged" by ruling.
- A `finance.close` permission — Spec A's follow-up note stands: close gating keeps `reports.approve`, and splitting it is its own decision for its own day.
- Rules/config/upload/budget-import — settings rows; they stay live and unlisted until a Settings destination exists.
- The Impact report builder (Impact's spec; it shares Contract 7's machinery, not this screen).
- Any change to `getFinanceSnapshot` / `getForecast` semantics — H2's Organization Health reads them; they stay canonical.

## Architecture

### The screens and their sources (recon §G)

| Screen | Source | Status |
|---|---|---|
| Snapshot | `getFinanceSnapshot` (A4): `fin_config` cash anchor + `fin_transactions` burn; freshness from `fin_config.updated_at` | exists, "stale-flagged" by ruling |
| Transactions | `fin_transactions`, `fin_categories`, `fin_category_rules`, `fin_reconciliation_items`; close gating = the existing `/admin/finance/close` logic | exists across three screens |
| Close waiver audit | Contract 7's `export_waivers` + `audit_log` (shipped in Spec A) | exists — recon marked it UNBOUND before Spec A landed |
| Budget | `fin_budget` (+ QB budget CSV import, a settings row) | exists, kept |
| Forecast | received `gifts`/`fin_transactions` · committed `fin_revenue_commitments` · pledges due `pledges`+`pledge_payments` · weighted open `opportunities` | exists across three screens + pledges |
| Forecast scenarios | — | **UNBOUND** — decision 1 |
| Reports builder | canonical loaders + the Metric catalog; Reed narrative `reed_drafts`; gate `export_waivers` | new build |
| Recent reports store | — | **UNBOUND** — decision 2 |

Every number renders through `<Metric>` or a canonical loader — and on Reports that is not just Contract 2's teeth but Contract 7's *precondition*: the gate can only check metrics the artifact actually declares.

### The cutover (fourth use of Spec B's machinery)

Rows activating: `/admin/finance/transactions` (same-path, exact — becomes real by absorbing), `/reconcile` → transactions, `/close` → transactions, `/forecast` (same-path), `/model` → forecast, `/revenue` → forecast, and `/admin/fundraising/pledges` → forecast. Following F6's precedent, **pledges narrows from prefix to exact + uuid-child stays open as a question of seats**: `pledges/[id]` (the installment detail) has no V2 host — it goes exact, and the detail stays live until Donor 360 absorbs pledge history (the ledger already maps pledges to "Forecast (pledges tier) + Donors & Funders"). Settings rows keep their null-target at-cutover shape. `finance` joins `V2_CUTOVER_DESTINATIONS`; the same-path rows make the fixed-point tests interesting (a source that is its own destination must not loop — the map's exact-match logic already guarantees it, and the crawl proves it).

## Staged build order

**N1 — Transactions.** Reconcile inbox + gated Close absorbed onto `/admin/finance/transactions` (extraction pattern; V1 routes byte-identical). The close path's waiver writes `export_waivers` + `audit_log` if the existing logic doesn't already. Commit: `spec-fin: transactions`.

**N2 — Forecast.** Model + Revenue + pledges tier absorbed onto `/admin/finance/forecast`, rendered as the four tiers; scenarios per decision 1. Commit: `spec-fin: forecast`.

**N3 — Reports.** The builder: pick sources, draft always, flag inline, gate the exit per Contract 7; Reed narrative drafts to `reed_drafts` for approval; store per decision 2. Commit: `spec-fin: reports`.

**N4 — cutover.** Seven rows activate in map + config (matching order), `finance` joins the cutover set, verification: four-org printout, live crawl (308s, query survival, same-path fixed points), `/admin/fundraising/pledges` landing on the pledges tier. Commit: `spec-fin: cutover`.

Each stage is one PR. Remi merges every PR and starts every stage.

## Definition of done

1. As each of the four orgs, Finance renders exactly five tabs; Transactions shows ledger + reconcile inbox + close state on one screen; Forecast shows the four tiers.
2. Closing a month with an unresolved reconciliation item blocks; a `reports.approve` holder can waive, and the waiver lands in `export_waivers` + `audit_log` — visible on the artifact, not just in the database.
3. A report referencing a `conflict` or `stale` metric drafts and renders with the flag inline, and cannot export/send without a waiver (Contract 7 rules 1 and 2, on screen).
4. `/admin/fundraising/pledges` 308s to Forecast and the pledges tier shows the same rows the V1 page showed; `pledges/[id]` stays live.
5. The same-path rows are fixed points: Transactions and Forecast never redirect anywhere.
6. With the V2 flag off, everything except the seven 308s is byte-for-byte V1.
7. Snapshot still says "stale, flagged" honestly — this spec ships no pretend-live number.

## Failure modes

**The close gate weakens in translation.** Moving Close onto Transactions must move its gating logic verbatim, not reimplement it. The extraction pattern exists precisely so the logic travels as-is.

**The gate blocks drafting.** Contract 7 rule 1: drafting is never blocked. If a conflicted metric stops a report from *rendering*, that's a bug — the flag belongs inline, the block belongs on the exit alone.

**Waiver sprawl.** If waiving is one click with no trace, the gate is theater. Every waive writes both rows and the artifact carries them; DoD 2 and 3 test the trace, not the click.

**Same-path loops.** `/admin/finance/transactions` 308ing to itself would loop forever. The map's exact rows resolve source==destination as a fixed point; the crawl proves it before the config ships.

**Tier double-counting.** A committed pledge with a recorded gift must not appear in two tiers. The existing dedup migrations (`dedup_commitments_against_gifts`, `surface_committed_deals_in_revenue_schedule`) own this rule — Forecast composes them, never re-derives.

## Open decisions (need Remi's ruling before their stage)

1. **Forecast scenarios ("Sobrato slips") — UNBOUND.** Recommend: **defer**, exactly like Home's recent-movement feed — Forecast ships as tiers without a scenario store, and scenarios become their own stage when a real decision needs one. Needed by N2.
2. **Where do generated reports live? — UNBOUND.** Recommend: **the file cabinet** — a generated report is a `documents` row (entity_type `fin_report` registered in the spine), so exports live where every other file lives, RLS included, and `export_waivers.artifact_id` points at the document. No new table. Needed by N3.

---

*Drafted 2026-09-09, pending Remi's approval. N1 begins only on his kickoff.*
