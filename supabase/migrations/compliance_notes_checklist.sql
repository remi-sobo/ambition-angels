-- Compliance item details panel (/admin/compliance): operators attach
-- free-text notes (the existing `notes` column) and a lightweight checklist
-- to any compliance item — e.g. the documents that must go out with the CA
-- RRF-1 filing. The checklist is a jsonb array of {id, text, done} objects,
-- edited via PATCH /api/admin/compliance/[id]. Internal to BloomOS admins
-- only; the table's existing RLS policies cover the new column.

alter table public.compliance_items
  add column if not exists checklist jsonb not null default '[]'::jsonb;
