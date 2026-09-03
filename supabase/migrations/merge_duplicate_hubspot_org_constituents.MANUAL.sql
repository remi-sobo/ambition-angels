-- Merge the four duplicate HubSpot-imported organization constituents
-- (docs/constituent-dedupe-report.md). MANUAL data migration: reviewed and
-- run by hand in the Supabase SQL editor against production — it assumes
-- these six specific rows exist and fails loudly if they don't. Not part of
-- the ordered migration chain (see scripts/test-rls.sh *.MANUAL.sql note).
--
-- Each pair is two constituents created by the 2026-06-12 HubSpot company
-- import from two distinct HubSpot company records with the same name. The
-- merge repoints every reference from the loser to the survivor and archives
-- the loser via archived_at. NO HARD DELETES: the loser row, the audit_log
-- trail, and import_rows history are all left in place.
--
-- Survivors (rationale in the report):
--   Enterprise for Youth    keep 8629367d (older HubSpot company 30727001508,
--                           correctly classified)      archive 5d005bf6
--   Friends of the Children keep 997d0505 (carries the live opportunity;
--                           HubSpot deal 288120924876's primary company)
--                                                      archive 9a891ff1
--   Street Code             keep 5d3c57c4 (HubSpot company 17150747757 has
--                           domain + industry)         archive e8a4297d
--   Sobrato                 keep 61279495 (HubSpot company 15855299727,
--                           sobrato.org — the philanthropy, i.e. the live
--                           funder; the other record is sobrato.com, the
--                           real-estate arm)           archive 47f87b3c
--
-- HubSpot identity handling: external_refs rows for BOTH company ids are
-- repointed to the survivor (the unique index is on (org_id, entity_type,
-- source, external_id), so two refs per survivor is legal — future syncs of
-- either company id resolve to the survivor). In constituents.external_ids,
-- the loser's hubspot_company key is renamed to hubspot_company_premerge so
-- lib/hubspot/sync-in.ts (which matches external_ids->>hubspot_company with
-- .maybeSingle()) stops resolving the archived row and never sees two rows;
-- the survivor records the absorbed id under hubspot_company_merged.
--
-- ORDERING REQUIREMENT: run this only on a database that already carries
-- fr_sync_resolve_companies_via_external_refs.sql. Before that migration,
-- fr_sync_hubspot_to_spine resolved companies solely through
-- external_ids->>'hubspot_company', so the rename would let the next sync
-- cron re-insert each archived loser as a fresh duplicate (caught in review
-- on PR #454). With it, the sync honors the repointed external_refs rows:
-- no recreation, and the merged company's future deals attach to the
-- survivor. Migrations deploy with the PR; this file is run by hand after.
--
-- Idempotent: a pair whose loser is already archived is skipped, so the
-- script can be re-run safely.

do $$
declare
  pair record;
  loser_hs text;
begin
  for pair in
    select * from (values
      ('Enterprise for Youth',
       '8629367d-8ab7-47fe-ab13-9720f17f993f'::uuid,   -- survivor
       '5d005bf6-10fb-46a5-bc3a-aa32a2fe6d13'::uuid),  -- loser
      ('Friends of the Children',
       '997d0505-98c0-46e5-8fc5-0d6fb98952d1'::uuid,
       '9a891ff1-eba4-40a9-bd5a-9469ec8c1ec5'::uuid),
      ('Street Code',
       '5d3c57c4-1c30-4470-a0c7-6cb24e396bdc'::uuid,
       'e8a4297d-b683-4d11-82c8-b1407860bc3f'::uuid),
      ('Sobrato',
       '61279495-60d2-45fc-a37b-f9ebbd742ad5'::uuid,
       '47f87b3c-22de-4ca9-ba24-3b29d3a63774'::uuid)
    ) as t(label, survivor, loser)
  loop
    -- Re-run guard: once the loser is archived this pair is done.
    if exists (select 1 from constituents
               where id = pair.loser and archived_at is not null) then
      raise notice 'merge "%": loser already archived — skipping', pair.label;
      continue;
    end if;

    -- Safety: both rows must exist, in the same org, same type, and their
    -- org_name must match the expected label. Anything else means the ids
    -- in this file no longer describe reality — stop, do not guess.
    if not exists (
      select 1
      from constituents s
      join constituents l on l.org_id = s.org_id and l.type = s.type
      where s.id = pair.survivor and l.id = pair.loser
        and s.type = 'organization'
        and s.org_name = pair.label and l.org_name = pair.label
    ) then
      raise exception
        'merge "%": survivor/loser rows do not match expectations (missing, cross-org, or renamed) — aborting',
        pair.label;
    end if;

    -- ── Repoint every FK child ─────────────────────────────────────────
    -- All 19 FK columns onto constituents(id), even where today's count is
    -- zero: rows may appear between review and apply.
    update asks                  set funder_id      = pair.survivor where funder_id      = pair.loser;
    update board_members         set constituent_id = pair.survivor where constituent_id = pair.loser;
    update connection_candidates set constituent_id = pair.survivor where constituent_id = pair.loser;
    update email_sends           set constituent_id = pair.survivor where constituent_id = pair.loser;
    update fr_nba_suggestions    set constituent_id = pair.survivor where constituent_id = pair.loser;
    update funder_angles         set constituent_id = pair.survivor where constituent_id = pair.loser;
    update gifts                 set constituent_id = pair.survivor where constituent_id = pair.loser;
    update grant_contacts        set constituent_id = pair.survivor where constituent_id = pair.loser;
    update grants                set funder_id      = pair.survivor where funder_id      = pair.loser;
    update interactions          set constituent_id = pair.survivor where constituent_id = pair.loser;
    update journey_enrollments   set constituent_id = pair.survivor where constituent_id = pair.loser;
    update opportunities         set constituent_id = pair.survivor where constituent_id = pair.loser;
    update partners              set constituent_id = pair.survivor where constituent_id = pair.loser;
    update pledges               set constituent_id = pair.survivor where constituent_id = pair.loser;
    update recurring_plans       set constituent_id = pair.survivor where constituent_id = pair.loser;
    update soft_credits          set constituent_id = pair.survivor where constituent_id = pair.loser;
    update students              set constituent_id = pair.survivor where constituent_id = pair.loser;
    -- A relationship between loser and survivor would become a self-loop;
    -- skip those legs (none exist today).
    update relationships set a_id = pair.survivor where a_id = pair.loser and b_id <> pair.survivor;
    update relationships set b_id = pair.survivor where b_id = pair.loser and a_id <> pair.survivor;

    -- ── Repoint columns without an FK ──────────────────────────────────
    update fr_prospects          set constituent_id = pair.survivor where constituent_id = pair.loser;
    update fr_prospect_promoted  set constituent_id = pair.survivor where constituent_id = pair.loser;

    -- ── Repoint polymorphic references (entity_type = 'constituent') ───
    update external_refs           set entity_id = pair.survivor where entity_type = 'constituent' and entity_id = pair.loser;
    update document_links          set entity_id = pair.survivor where entity_type = 'constituent' and entity_id = pair.loser;
    update entity_comments         set entity_id = pair.survivor where entity_type = 'constituent' and entity_id = pair.loser;
    update reed_next_moves         set entity_id = pair.survivor where entity_type = 'constituent' and entity_id = pair.loser;
    update notifications           set linked_entity_id = pair.survivor where linked_entity_type = 'constituent' and linked_entity_id = pair.loser;
    update ops_tasks               set linked_entity_id = pair.survivor where linked_entity_type = 'constituent' and linked_entity_id = pair.loser;
    update meeting_suggested_tasks set suggested_entity_id = pair.survivor where suggested_entity_type = 'constituent' and suggested_entity_id = pair.loser;
    update fr_agent_activity_log   set target_id = pair.survivor where target_type = 'constituent' and target_id = pair.loser;
    update reed_activity_log       set target_id = pair.survivor where target_type = 'constituent' and target_id = pair.loser;
    update reed_suggestions        set target_id = pair.survivor::text where target_type = 'constituent' and target_id = pair.loser::text;
    update acknowledgments         set subject_id = pair.survivor where subject_type = 'constituent' and subject_id = pair.loser;
    update story_subjects          set subject_id = pair.survivor where subject_type = 'constituent' and subject_id = pair.loser;
    -- Deliberately NOT rewritten: audit_log (+ partitions) and
    -- import_rows.created/matched_entity_id — they are history, and
    -- rewriting them would falsify what actually happened.

    -- ── Fold the HubSpot identity into the survivor, then archive ──────
    select external_ids->>'hubspot_company' into loser_hs
    from constituents where id = pair.loser;

    if loser_hs is not null then
      update constituents
      set external_ids = external_ids
            || jsonb_build_object('hubspot_company_merged',
                 coalesce(external_ids->'hubspot_company_merged', '[]'::jsonb)
                   || to_jsonb(loser_hs))
      where id = pair.survivor;
    end if;

    update constituents
    set external_ids = (external_ids - 'hubspot_company')
          || case when loser_hs is not null
               then jsonb_build_object('hubspot_company_premerge', loser_hs)
               else '{}'::jsonb end,
        archived_at = now(),
        notes = coalesce(notes || E'\n', '')
          || format('Merged into constituent %s on %s — duplicate HubSpot company import (hubspot_company %s).',
                    pair.survivor, current_date, coalesce(loser_hs, 'unknown'))
    where id = pair.loser;

    raise notice 'merge "%": % archived into %', pair.label, pair.loser, pair.survivor;
  end loop;
end $$;

-- Post-merge verification (read-only; expect four rows, all zeros).
select l.id as archived_loser, l.org_name,
       (select count(*) from opportunities  where constituent_id = l.id) as opportunities,
       (select count(*) from external_refs  where entity_type = 'constituent' and entity_id = l.id) as external_refs,
       (select count(*) from gifts          where constituent_id = l.id) as gifts,
       (select count(*) from interactions   where constituent_id = l.id) as interactions,
       (select count(*) from partners       where constituent_id = l.id) as partners
from constituents l
where l.id in ('5d005bf6-10fb-46a5-bc3a-aa32a2fe6d13',
               '9a891ff1-eba4-40a9-bd5a-9469ec8c1ec5',
               'e8a4297d-b683-4d11-82c8-b1407860bc3f',
               '47f87b3c-22de-4ca9-ba24-3b29d3a63774');
