-- Pre-SafeSpace hardening (approved by Remi 2026-11-21): an org's plan
-- features are set by the operator, never by the org itself. Drop the RLS
-- write policy that let any org.manage member (owner or admin) change
-- org_entitlements through the database API. Reads stay as they are; the
-- operator writes through the service role, which bypasses RLS.
drop policy if exists "managers write org_entitlements" on public.org_entitlements;
