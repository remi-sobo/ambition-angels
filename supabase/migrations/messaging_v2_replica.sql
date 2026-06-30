-- Realtime needs the full old row to deliver (and RLS-authorize) DELETE events
-- for reactions — otherwise un-reacting wouldn't propagate live. The default
-- replica identity only exposes the primary key on DELETE; FULL exposes org_id
-- (for the filter + SELECT policy) too. The table is tiny, so the WAL cost is
-- negligible.
alter table public.message_reactions replica identity full;

-- ── rollback ──────────────────────────────────────────────
-- alter table public.message_reactions replica identity default;
