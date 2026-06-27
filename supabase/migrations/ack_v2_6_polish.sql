-- Acknowledgments v2 (Stewardship) — Phase 6: polish.
--
-- Donor channel preference. Some donors want a call, some a letter, some an
-- email. Record it on the constituent so the composer and the matrix can honor
-- it instead of guessing. Nullable: no preference means "use the rule/default".

alter table public.constituents
  add column if not exists preferred_ack_channel text
  check (
    preferred_ack_channel is null
    or preferred_ack_channel in ('email', 'letter', 'call', 'text', 'in_person')
  );
