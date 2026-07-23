-- SafeSpace tenant hardening (Phase 3): drop the donations org_id trap.
--
-- donations carried a hardcoded Ambition Angels org_id column default, so any
-- insert path that omitted org_id silently attributed the gift to AA — and the
-- donations->gifts ingest trigger (create_fundraising_core.sql) propagates
-- d.org_id into constituents, gifts, and recurring_plans, spreading the wrong
-- tenant through the whole Stripe pipeline. The code deploy in this PR makes
-- every donations write path org-explicit (save-donation x2, stripe-webhook
-- renewal), so the default can go.
--
-- Apply ONLY AFTER that code deploy is live and verified — an old deploy
-- writing to donations without org_id would fail on insert. The ratchet
-- baseline (supabase/tests/tenant-default-ratchet.sql) is shrunk in the same
-- PR, so re-adding a default fails CI.

alter table donations alter column org_id drop default;
