-- BloomOS Fundraising v2 / Phase 0A: demote the HubSpot mirror to read-only
-- import staging.
--
-- The hs_* tables are a one-time/periodic IMPORT MIRROR of HubSpot, not the
-- system of record. After cutover the spine (constituents, gifts,
-- opportunities, interactions) owns the data; hs_* exists only as staging to
-- reconcile against via external_ids (see import_hubspot_to_constituents.sql).
--
-- enable_rls_per_domain.sql granted members both read AND write on hs_* under
-- the fundraising domain. This migration removes the member WRITE policies so
-- no application path (which now runs under the user session — see the
-- Phase 0A data-access swap) can mutate staging. The only writer left is the
-- HubSpot sync job, which runs through the service-role client and bypasses
-- RLS by design; isolate any HubSpot writes to that job.
--
-- Members keep READ (the prospect-research surfaces read hs_* today). Behavior
-- for Ambition Angels is unchanged: nothing in the app writes hs_* directly.
--
-- Idempotent: drop-if-exists; re-running is a no-op. Reversible: re-create the
-- "members write <tbl>" policies from enable_rls_per_domain.sql to restore.

do $$
declare
  t text;
  hs_tables text[] := array[
    'hs_contacts','hs_companies','hs_deals','hs_engagements','hs_sync_jobs'
  ];
begin
  foreach t in array hs_tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipping missing table %', t;
      continue;
    end if;
    -- Drop the member write policy; the member read policy stays in place.
    execute format('drop policy if exists %I on public.%I', 'members write ' || t, t);
    execute format(
      $c$comment on table public.%I is
        'HubSpot import STAGING (read-only). Not the system of record — the spine (constituents/gifts/opportunities/interactions) is. No app writes; written only by the service-role HubSpot sync job. Reconciled to constituents via external_ids.'$c$,
      t);
  end loop;
end $$;
