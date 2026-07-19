-- Tenant-scope the demo-day note uniqueness.
--
-- demoday_notes.attendee_key was globally UNIQUE, but attendee_key is the
-- lookbook export's originalRowIndex — a per-tenant sequence a second org can
-- reuse. A global unique would (a) let one tenant's upsert collide with/clobber
-- another's row, and (b) block a legitimate same-index note in a second org.
-- Swap it for a unique on (org_id, attendee_key) so the upsert target is
-- per-org. org_id is already NOT NULL on this table.
--
-- Idempotent: safe to re-run. RLS unchanged (service-role only).

alter table public.demoday_notes
  drop constraint if exists demoday_notes_attendee_key_key;

create unique index if not exists demoday_notes_org_attendee_key_idx
  on public.demoday_notes (org_id, attendee_key);
