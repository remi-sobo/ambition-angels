-- Capture C6, fix after confirm (specs/bloomos-capture.md, "C6 spec").
--
-- A note filed from a voice capture can be edited, moved to the right record,
-- or removed by the person who recorded it, any time after the 10-minute
-- undo. Everyone who can read the row should see that it was edited, so the
-- stamp lives on the row itself, not on the creator-only capture card.
--
-- Neither table has an updated_at or edited stamp today (checked against
-- production 2026-10-22). This adds two nullable columns to each:
--   edited_at  timestamptz  when the row was last changed after filing
--   edited_by  text         the editor's handle, same form as logged_by
-- Nothing backfills them: a null means the row is as it was filed.
--
-- No policy changes. "members write interactions" (fundraising.write) and
-- "members write partner_interactions" (program.write) are permissive ALL
-- policies, so they already cover update and delete.
--
-- Guarded form (add column if not exists). Apply via the Supabase connector's
-- apply_migration with name capture_fix_stamps, after review.
-- Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

alter table public.interactions add column if not exists edited_at timestamptz;
alter table public.interactions add column if not exists edited_by text;

alter table public.partner_interactions add column if not exists edited_at timestamptz;
alter table public.partner_interactions add column if not exists edited_by text;
