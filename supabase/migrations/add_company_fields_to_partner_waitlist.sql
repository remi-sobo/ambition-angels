-- /companies intake: keep what the company form already sends.
--
-- The form posts company, the person's role and the "Interested in" choice,
-- but partner_waitlist had no columns for them, so they survived only in the
-- notification email. All three are nullable: Guide waitlist and MESA student
-- rows never carry them.
--
-- RLS: the existing partner_waitlist policies (program domain) already cover
-- the new columns. No policy change.

alter table public.partner_waitlist add column if not exists company text;
alter table public.partner_waitlist add column if not exists role_category text;
alter table public.partner_waitlist add column if not exists interest text;
