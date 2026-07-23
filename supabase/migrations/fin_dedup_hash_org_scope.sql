-- SafeSpace tenant hardening (Phase 3): scope bank-line dedup per org.
--
-- fin_transactions.dedup_hash was globally unique, so a second tenant's bank
-- line whose (date, amount, description, occurrence) hash happened to match
-- any existing line in ANOTHER tenant would be silently dropped at import.
-- Dedup is a per-tenant concern: uniqueness moves to (org_id, dedup_hash).
--
-- No code change required: the import path
-- (app/api/admin/finance/import/route.ts) already org-scopes its duplicate
-- lookup and plain-inserts — it never uses ON CONFLICT (dedup_hash). The
-- composite index is created before the global constraint drops so dedup
-- protection never lapses.

create unique index if not exists fin_transactions_org_dedup_hash_key
  on fin_transactions (org_id, dedup_hash);

alter table fin_transactions drop constraint if exists fin_transactions_dedup_hash_key;
