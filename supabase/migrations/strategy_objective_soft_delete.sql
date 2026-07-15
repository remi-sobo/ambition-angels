-- Soft delete for OGSM objectives (the "charts" on the strategy surfaces).
--
-- Deleting an objective now stamps deleted_at instead of removing the row, so
-- the delete is recoverable: an inline Undo right after, or the "Deleted
-- charts" panel on the OGSM review page any time later. NULL = active.
-- Goals/KPIs stay linked to the soft-deleted objective and are hidden with the
-- chart, so a restore brings the whole chart back intact (same sort_order →
-- same position).
--
-- Idempotent: safe to re-run.

alter table public.plan_objectives add column if not exists deleted_at timestamptz;

-- Every active surface filters to deleted_at is null; partial index keeps that cheap.
create index if not exists plan_objectives_active_idx on public.plan_objectives (org_id) where deleted_at is null;
