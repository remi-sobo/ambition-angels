-- Meetings tab — Shannon's connection backlog, Phase 4 (email detection).
--
-- The Gmail sync reconciles a thread to the single external constituent and
-- (by design) drops every @ambitionangels.org address as "staff" before
-- matching — so Shannon, who is staff, is invisible in what gets stored. But
-- the whole point of a connection candidate is "an intro Remi sent with SHANNON
-- on it." We therefore record, per interaction, whether Shannon was a raw
-- participant (From/To/Cc) — computed in the sync BEFORE the staff filter.
--
-- This makes the candidate predicate queryable and auditable
-- (direction='outbound' AND shannon_present AND constituent reconciled) and
-- lets the flag be backfilled later if needed. Additive + idempotent.

alter table interactions
  add column if not exists shannon_present boolean not null default false;

-- Partial index: candidate detection only ever scans the present=true rows.
create index if not exists interactions_shannon_present_idx
  on interactions (shannon_present) where shannon_present;
