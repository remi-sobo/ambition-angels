-- Comms v2 Phase 1 (specs/comms-v2-mail-merge.md): org_id default drops.
--
-- email_campaigns and segments carried a hardcoded Ambition Angels org_id
-- column default (the org_id trap — see tenant-two-hardening.md). The Phase 1
-- code deploy makes every write path set org_id explicitly (campaign create,
-- segment create, email_sends ledger writes, journeys-cron enrollments), so
-- the defaults can go.
--
-- Apply ONLY AFTER the Phase 1 code deploy is live and verified — an old
-- deploy writing to these tables without the defaults would fail on insert.
-- The ratchet baseline (supabase/tests/tenant-default-ratchet.sql) is shrunk
-- in the same PR, so re-adding a default fails CI.

alter table email_campaigns alter column org_id drop default;
alter table segments alter column org_id drop default;
