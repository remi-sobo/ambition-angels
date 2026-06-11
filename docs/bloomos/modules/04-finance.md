# Module 04 — Finance

**Sidebar:** Revenue · Expenses · Cash Flow · Budget vs Actual
**Job:** the decision layer on top of QuickBooks Online — "Fathom for small nonprofits," nonprofit-aware (restricted funds, functional expenses, 990 mapping, board package). Accounting stays in QBO; BloomOS reads, computes, and explains.

Builds on the existing `/admin/finance` module (transactions, rules, budget) — see 02-current-state.

## QuickBooks integration (the spine)

**Verified API constraints that shape the design:**
- Entities (accounts, transactions, classes, customers/vendors, budgets) readable; **budgets are READ-ONLY via API**; **no Budget-vs-Actuals report endpoint exists** — we compute BvA ourselves by joining the Budget entity against P&L report output (this is the product opportunity, not a limitation).
- Reports API: P&L, Balance Sheet, CashFlow, GL, AR/AP aging, with `summarize_column_by` Class/Department/Month — **Class is the nonprofit program/fund dimension** (standard QBO nonprofit practice). Recursive row parser required (everyone building on this API writes one); build defensively (Intuit is re-platforming Reports).
- Sync: webhooks are thin 5–25min-latency pokes → **CDC (`changedSince`, 30-day lookback) on a nightly schedule + on-demand refresh button**, cached report payloads in `fin_report_cache`. Reads are metered (500K free CorePlus credits/mo — ample for one org; matters at SaaS scale). OAuth: 1h access tokens, rotating refresh tokens, single-flight refresh + daily keep-alive (03 §5). Production keys require Intuit's security questionnaire (no app-store listing needed) — start early in Ring 2.
- Target customers have QBO Plus via TechSoup ($80/yr) → Class tracking + budgets present. CSV import (existing) remains the no-QBO fallback.

## Revenue

- Revenue by source/month with YoY: contributions (individual/foundation/corporate/government), program/earned, events (net of direct costs — the 990 framing), in-kind.
- **Revenue concentration** flag (>30% single source → board-discussion prompt) + top-10-donor share.
- **Restricted vs unrestricted**: restriction roll-forward per fund/grant (beginning + new restricted gifts − releases = ending). Releases recorded when grant spending posts against the fund. This is the #1 small-org finance failure mode; we make it visible.
- Reconciliation panel: Givebutter payouts ↔ QBO deposits ↔ BloomOS gifts (the three-way tie-out small orgs never do).

## Expenses

- Expenses by category/vendor/month; **functional view (Program / Management & General / Fundraising)** from QBO Class mapping → program-expense ratio with watchdog context (BBB ≥65%, Charity Navigator ≥70% for full credit — shown as annual gauges, not monthly noise, with the "overhead myth" caveat in the help text).
- Categorization rules (existing engine) survive for CSV-mode orgs; QBO-mode orgs categorize in QBO and we mirror.
- **AI spend review (flags, never auto-actions)**: duplicates, amount outliers vs vendor history, new vendors, subscription creep, category drift — monthly "anomalies to review" list (Ramp/Puzzle pattern).

## Cash Flow

- **13-week rolling forecast** (the standard small-org tool): seeded from recurring actuals (payroll/rent from QBO history), pledge schedules + grant payment schedules (Fundraising), seasonality from 2–3yrs of giving history (Q4-heavy), manual lines. Confidence-weighted; weekly snapshot for accuracy tracking.
- Headline: **months of cash / months of runway** (mockup's "14 months — Healthy"); thresholds green ≥6 / amber 3–6 / red <3 (NORI floor = 3 months / 25% reserve).
- Grant-receivable float visibility (reimbursement grants pay 30–90 days late; show working capital tied up per grant).

## Budget vs Actual

- Budget from QBO (read) or BloomOS editor (existing) for orgs budgeting outside QBO; period × account × class.
- BvA grid: month/quarter/YTD, $ and % variance, **dual-threshold flagging** (>10% AND >$ floor), variance narrative field per flagged line (AI-drafted from transaction detail, human-approved) — this narrative is exactly what the board package needs.
- Scenario lite (Ring 3+): reforecast columns.

## Board Finance Package (the output that sells the module)

One click → current month: BvA statement of activities + narrative, statement of financial position (restricted/unrestricted split), cash forecast chart, KPI dashboard (months of cash/LUNA, reserve ratio vs 25% NORI floor, program ratio, revenue concentration, donor retention) — branded PDF into Governance's board packet. Metrics trace to 990 lines (Part VIII/IX/X mapping in the registry) so year-end filing prep is a by-product.

## KPI definitions (registry entries, sourced)
- Months of cash = unrestricted cash ÷ (annual expenses/12); Days cash on hand; **Months of LUNA** = (unrestricted net assets − equity in fixed assets) ÷ avg monthly expenses (target ≥3) — requires accrual-quality data, shown alongside simple months-of-cash; Operating reserve ratio (≥25% NORI); Program expense ratio; Fundraising efficiency (≤$0.20 healthy); Current ratio; Budget variance %.

## Open questions
- AA's QBO subscription tier + whether Classes are currently used for programs (determines mapping work).
- Whether bookkeeping is in-house or outsourced (affects who approves categorization mirroring).
- Gusto payroll-totals read (Ops module) feeding expense forecast — sequence after Gusto connection lands (Ring 3).
