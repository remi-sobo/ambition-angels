-- Acknowledgments v2 — Phase 7: nothing auto-sends, for now.
--
-- The seeded matrix (ack_v2_4) had one auto_email rule for smaller recent
-- gifts. Policy for now: every gift is a human task (Shannon by default; major
-- gifts already route to Remi), and no receipt is ever emailed without a
-- person. Flip the auto_email rule into a personal-email task.
--
-- Reversible: re-introduce an auto_email rule (or set this one back to
-- auto_email) when you're ready to automate small-gift receipts.
-- Idempotent: once no auto_email rules remain, re-running is a no-op.

update public.stewardship_rules
set action     = 'create_task',
    assignee   = 'shannon',
    sla_hours  = 48,
    name       = 'Smaller recent gift, personal email',
    updated_at = now()
where action = 'auto_email';
