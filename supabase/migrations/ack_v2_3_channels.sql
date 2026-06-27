-- Acknowledgments v2 (Stewardship) — Phase 3: real channels.
--
-- A thank-you can happen on any channel, and "marked outside the system" must
-- become a real, channel-labeled log on the donor timeline rather than a silent
-- status flip. The acknowledgments channel check only allowed email/letter/
-- other; widen it to the full channel vocabulary so a call, text, or in-person
-- thank-you is recorded as what it actually was.
--
-- 'other' is kept so the two pre-v2 rows (and any legacy mark) stay valid.

alter table public.acknowledgments
  drop constraint if exists acknowledgments_channel_check;

alter table public.acknowledgments
  add constraint acknowledgments_channel_check
  check (channel in ('email','letter','call','text','in_person','other'));
