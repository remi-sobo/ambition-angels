---
name: finance-balance
description: Update BloomOS finance "Cash on hand" from the latest Wells Fargo daily balance alert email. Use daily (or on demand) — reads the WF balance alert in Gmail and updates the cash anchor (fin_config) in Supabase. Run by a scheduled Cowork task each morning, or invoke by name.
---

# Finance — daily bank-balance update

Update BloomOS finance **Cash on hand** from the latest Wells Fargo daily balance
alert email. Requires **Gmail** + **Supabase** MCP connected.

Supabase project id: `kzzdtibbwsucloaoqpqa`.

## Steps

1. **Find the latest WF balance alert** (Gmail `search_threads`):
   query `from:wellsfargo.com (balance OR "account balance" OR alert) newer_than:2d`.
   Open the most recent automated balance-alert thread with `get_thread`
   (FULL_CONTENT). **Ignore** marketing/newsletters that merely mention Wells Fargo
   (e.g. Axios "presented by Wells Fargo").

2. **Parse** the account balance (a dollar amount like `$12,345.67` — prefer the
   **posted / current / ledger** balance; fall back to "available balance"), and the
   as-of date (use the email date if the body doesn't state one).

3. **Safety checks before writing:**
   - You must have a clearly-labeled WF balance **and** a date. If not confident,
     **do not update** — just report what you saw.
   - `select cash_starting_balance, cash_starting_date from fin_config
      where org_id = (select id from orgs where slug = 'ambition-angels')`.
     Only update if the alert date is **newer** than `cash_starting_date` (never move
     the anchor backwards).
   - Sanity: balance is non-negative and below `$10,000,000`. If wildly off, skip + report.

4. **If valid, update the cash anchor** (Supabase `execute_sql`):
   ```sql
   update fin_config
     set cash_starting_balance = <balance>,
         cash_starting_date = '<YYYY-MM-DD>',
         cash_reconciled_at = now(),
         updated_at = now()
   where org_id = (select id from orgs where slug = 'ambition-angels');
   ```
   (fin_config is one row per org — core fence C2; never address it by `id`.)
   This is the cash anchor — the dashboard computes
   **Cash on hand = anchor + transactions logged after the anchor date**, so it is the
   correct single source of truth.

5. **Report one line:** `Cash anchor updated to $X as of <date> from WF alert` — or, if
   skipped, exactly why.

## Guardrails

- **Only** touch `fin_config`. Never write `fin_transactions` or `fin_revenue_commitments`.
- The anchor only moves **forward** in time. When unsure, do nothing and report.
