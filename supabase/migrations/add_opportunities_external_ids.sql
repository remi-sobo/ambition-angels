-- HubSpot two-way sync (X4): give opportunities an external_ids map so the
-- outbound sync can remember the linked HubSpot deal id and PATCH the same
-- deal on later stage moves (instead of creating duplicates).
--
-- Additive and idempotent — safe to re-run. Mirrors constituents.external_ids.

alter table opportunities
  add column if not exists external_ids jsonb not null default '{}'::jsonb;
