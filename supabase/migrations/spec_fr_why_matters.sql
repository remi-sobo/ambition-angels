-- BloomOS V2 / Spec Fundraising, stage F2 — constituents.why_matters, the
-- Donor 360 narrative. (specs/bloomos-v2-spec-fundraising.md, decision 1 —
-- RESOLVED: additive column, signed 2026-09-08.)
--
-- The one field on the 360 a number can't carry: why this relationship
-- matters, in a human's words. Written ONLY by a human through the
-- constituent PATCH route (app/api/admin/constituents/[id]/route.ts); Reed
-- may draft a candidate into reed_drafts for approval but never writes this
-- column. Nullable and additive — no backfill, no default: an empty
-- narrative renders as honestly empty, never invented.

alter table public.constituents add column if not exists why_matters text;
