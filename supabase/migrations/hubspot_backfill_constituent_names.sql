-- Backfill donor names from the HubSpot mirror onto the fundraising spine.
--
-- Problem (reported by Shannon): several donors on /admin/fundraising/donors
-- show with no name even though the contact has a full name in HubSpot. Cause:
-- fr_sync_hubspot_to_spine() projects hs_contacts → constituents INSERT-ONLY
-- (step 2b). A contact that had only an email at first-sync lands as a
-- constituent with null first/last name, and every later sync skips it — the
-- "not exists (… external_ids->>'hubspot' = …)" guard is satisfied — so the
-- name a human added in HubSpot afterwards never reaches BloomOS. The webhook
-- path (lib/hubspot/sync-in.ts) does apply contact edits, but only for portals
-- with live webhooks and only for events that fire after the edit.
--
-- Fix: fr_backfill_constituent_names_from_hubspot(), called by the sync right
-- after the spine projection (lib/hubspot/sync-engine.ts). It fills ONLY blanks:
-- a constituent whose spine name is entirely empty takes the mirror's name.
-- A name already stored in BloomOS is never overwritten — BloomOS stays the
-- system of record, so this can't conflict with a human edit here. Matching is
-- by the HubSpot id already stamped on the row, so it creates no rows and can
-- never duplicate a donor.
--
-- Idempotent and re-runnable: once a name lands, the "spine name is blank"
-- guard excludes the row, so re-running is a no-op.
--
-- Apply this BEFORE the code deploy: the sync calls the function on every run,
-- so a deploy that lands first would record a "function does not exist" error
-- on each sync job (and mark the run partial) until the migration is applied.

create or replace function public.fr_backfill_constituent_names_from_hubspot()
 returns integer
 language plpgsql
 set search_path = public, extensions, pg_temp
as $function$
declare
  people integer;
  orgs integer;
begin
  -- People: hs_contacts.first_name/last_name → constituents, blanks only.
  update constituents x
  set first_name = nullif(trim(coalesce(h.first_name, '')), ''),
      last_name  = nullif(trim(coalesce(h.last_name, '')), ''),
      updated_at = now()
  from hs_contacts h
  where x.type = 'person'
    and x.external_ids->>'hubspot' = h.hubspot_id
    and trim(coalesce(x.first_name, '') || ' ' || coalesce(x.last_name, '')) = ''
    and trim(coalesce(h.first_name, '') || ' ' || coalesce(h.last_name, '')) <> '';
  get diagnostics people = row_count;

  -- Organizations: same rule against the companies mirror.
  update constituents x
  set org_name = trim(h.name),
      updated_at = now()
  from hs_companies h
  where x.type = 'organization'
    and x.external_ids->>'hubspot_company' = h.hubspot_id
    and trim(coalesce(x.org_name, '')) = ''
    and trim(coalesce(h.name, '')) <> '';
  get diagnostics orgs = row_count;

  return people + orgs;
end;
$function$;

-- Apply once on migration, so the fix lands without waiting for the next sync.
select public.fr_backfill_constituent_names_from_hubspot();
