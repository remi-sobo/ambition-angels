-- Make the gmail→interactions upsert (and the Phase 5 "mark booked" meeting
-- log) actually work.
--
-- Both dedupe via ON CONFLICT (external_source, external_id, constituent_id).
-- That target was a PARTIAL unique index (… WHERE external_id IS NOT NULL).
-- Postgres can only use a partial index as an ON CONFLICT arbiter if the
-- statement restates the index predicate — and PostgREST's `onConflict` option
-- can't express a WHERE, so every upsert against it raised "no unique or
-- exclusion constraint matching the ON CONFLICT specification". The existing
-- gmail-sync upsert hit this too; it was simply masked because the Gmail
-- readonly scope isn't granted, so that code path hasn't run.
--
-- Converting to a FULL unique index fixes it with no behavior change for
-- dedupe: NULL external_ids remain DISTINCT (the default), so manually-logged
-- interactions with no external_id never collide, and uniqueness on the
-- non-null (source, id, constituent) triples is exactly as before.

drop index if exists interactions_external_idx;
create unique index if not exists interactions_external_idx
  on interactions (external_source, external_id, constituent_id);
