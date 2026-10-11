-- Capture, stage C3 (specs/bloomos-capture.md, "C2 as built"): close the anon
-- grant on the match RPC.
--
-- capture_match_rpc.sql revoked EXECUTE from PUBLIC, but Supabase's default
-- privileges also grant EXECUTE on new public functions to anon directly, so
-- production kept an anon grant after C2. The function is SECURITY INVOKER and
-- pinned to the caller's org, so anon could read nothing through it, but a
-- signed-out caller has no business reaching it at all. Members keep it.
--
-- Guarded form: one do-block, a no-op when the function is absent, no drops.
-- Apply via the Supabase connector's apply_migration with name
-- capture_rpc_grants, after review. Project: Ambition-Angels (kzzdtibbwsucloaoqpqa).

do $$ begin
  if to_regprocedure('public.capture_match_candidates(text, uuid, int)') is not null then
    revoke execute on function public.capture_match_candidates(text, uuid, int) from public;
    if exists (select 1 from pg_roles where rolname = 'anon') then
      revoke execute on function public.capture_match_candidates(text, uuid, int) from anon;
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      grant execute on function public.capture_match_candidates(text, uuid, int) to authenticated;
    end if;
  end if;
end $$;
