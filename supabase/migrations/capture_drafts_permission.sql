-- Capture close-out (specs/bloomos-capture.md, "C3 as built", security backlog):
-- writing a Capture message draft requires ops.write in the database, not
-- only in the app.
--
-- reed_drafts has one policy, "members use reed_drafts": any member may read
-- and write any draft in their org (create_reed_drafts.sql; checked against
-- production 2026-10-18). Capture's draft applier already asks for ops.write
-- before it files a capture_message draft, but the database itself let a
-- board_viewer insert one, and the C3 leak test pinned that as a known gap.
--
-- This closes the gap for capture_message rows ONLY, with RESTRICTIVE
-- policies, which AND with the existing permissive one:
--   insert / update / delete of a capture_message row needs
--   private.has_permission(org_id, 'ops.write').
-- Every other kind (grant_narrative, board_update, acknowledgment,
-- strategy_review, report_narrative, ...) passes these policies untouched, so
-- Reed's drafts and the finance and impact report narratives behave exactly
-- as before. Reads are unchanged. Tightening the other kinds needs a per-kind
-- permission map and stays on the backlog.
--
-- Guarded form (no DROP POLICY): each policy is created only if absent.
-- Apply via the Supabase connector's apply_migration with name
-- capture_drafts_permission, after review. Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reed_drafts'
                 and policyname = 'capture drafts need ops.write (insert)') then
    create policy "capture drafts need ops.write (insert)" on public.reed_drafts
      as restrictive for insert to authenticated
      with check ( kind <> 'capture_message' or (select private.has_permission(org_id, 'ops.write')) );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reed_drafts'
                 and policyname = 'capture drafts need ops.write (update)') then
    create policy "capture drafts need ops.write (update)" on public.reed_drafts
      as restrictive for update to authenticated
      using ( kind <> 'capture_message' or (select private.has_permission(org_id, 'ops.write')) )
      with check ( kind <> 'capture_message' or (select private.has_permission(org_id, 'ops.write')) );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reed_drafts'
                 and policyname = 'capture drafts need ops.write (delete)') then
    create policy "capture drafts need ops.write (delete)" on public.reed_drafts
      as restrictive for delete to authenticated
      using ( kind <> 'capture_message' or (select private.has_permission(org_id, 'ops.write')) );
  end if;
end $$;
