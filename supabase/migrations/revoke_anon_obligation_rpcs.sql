-- Close an unauthenticated write path (V4 Phase 0 audit, finding 1).
--
-- upsert_obligation, resolve_obligation and snooze_obligation are SECURITY
-- DEFINER and skip their permission check when auth.uid() is null, so the
-- service role can call them from server code. spec_a_obligation_rpcs.sql
-- revoked EXECUTE from PUBLIC only. On Supabase, default privileges also
-- grant EXECUTE on new public functions to anon directly, and that grant
-- survived. Anyone holding the public anon key could therefore create,
-- resolve or snooze tasks, grant requirements and compliance items in any
-- org without signing in.
--
-- Signed-in users (authenticated) and server code (service_role) keep their
-- grants. Idempotent: revoking a grant that is already gone is a no-op.

revoke execute on function public.resolve_obligation(text, uuid) from anon;
revoke execute on function public.snooze_obligation(text, uuid, date) from anon;
revoke execute on function public.upsert_obligation(uuid, text, text, text, date, text, uuid, text, uuid, uuid, text, text, text) from anon;
