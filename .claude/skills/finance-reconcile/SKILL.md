---
name: finance-reconcile
description: Weekly finance reconciliation sweep — scan Gmail (and HubSpot) for commitments/grants/received gifts not yet in the ledger and post them as PROPOSALS to the Finance → Reconcile inbox for a human to accept. Never books money directly. Run by a scheduled Cowork task on Fridays, or invoke by name.
---

# Finance — weekly reconciliation sweep

Keep the finance ledger coherent by surfacing money that isn't recorded yet, as
**proposals** in the reconciliation inbox (`fin_reconciliation_items`). **Never write
to the real ledger** — a human accepts in Finance → Reconcile. Requires **Gmail** +
**Supabase** MCP connected (HubSpot optional).

Supabase project id: `kzzdtibbwsucloaoqpqa`.

## Steps

1. **Load context** (Supabase `execute_sql`) — this is how a fresh run "remembers"
   what was already handled (the agent has no memory between runs; the database does):
   - Already-handled: `select source_ref from fin_reconciliation_items` — **ANY status**
     (pending, accepted, OR dismissed). Do **not** re-propose any of these `source_ref`s.
     This is the key: once Shannon has accepted or **dismissed** an email, it must never
     come back. Checking only `pending` would resurface dismissed items.
   - Existing ledger (avoid duplicates):
     `select source_name, amount, status, expected_date from fin_revenue_commitments`.

2. **Gmail sweep** (Gmail `search_threads`, pageSize 30):
   ```
   {"grant" "pledge" "we'll fund" "happy to support" "donation" "wire transfer" "EFT"
    "sent your grant" "contribution" "committed"} newer_than:10d -in:sent
    -category:promotions -category:social
   ```
   For each promising thread **not** already proposed / in the ledger, `get_thread`
   (FULL_CONTENT) and judge: is this a **real, specific** commitment or received gift —
   a named funder **and** a dollar amount?
   - Money landed/accepted → status `received`. Committed but not yet received →
     `secured`. Soft/likely with a number → `projected`. No firm number or just a
     negotiation → **skip** (or, if notable, a `flag` kind with no amount).
   - Skip newsletters, our own outgoing asks, vendor receipts/expenses, and anything ambiguous.

3. **Insert each real find as a proposal** (Supabase `execute_sql` into
   `fin_reconciliation_items`):
   - `kind` `'commitment'`, `source` `'gmail'`, `source_ref` = the Gmail `threadId`
   - `title` (e.g. `"Acme Foundation — $25,000 received"`)
   - `detail` (quote the evidence + date)
   - `amount` (number)
   - `payload` jsonb: `{year:2026, source_type: foundation|individual|corporate|government|accelerator|earned|other, source_name, amount, status, expected_date:'YYYY-MM-DD', notes}`
   - `evidence_url` `'https://mail.google.com/mail/u/0/#all/<threadId>'`
   - `confidence` `high|medium|low`, `created_by` `'agent'`
   - Only insert if no **pending** row already has that `(source, source_ref)`.

4. **Be conservative** — propose only real money; fewer, high-confidence is better.

5. **Post a short summary:** how many proposals added (names + amounts), and anything
   ambiguous you skipped. These land in Finance → Reconcile for Shannon to accept/dismiss
   before the week starts.

## Guardrails

- **Propose, never book.** This skill only writes to `fin_reconciliation_items`
  (the inbox). Money enters `fin_revenue_commitments` only when a human clicks
  **Add to ledger**.
- **Idempotent.** The `source_ref` (Gmail thread id) dedup means re-runs never pile up
  duplicates of the same email.
