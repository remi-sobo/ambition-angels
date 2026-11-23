-- Comms Phase 2 — the comms-media storage bucket and its RLS.
--
-- Split out of the Phase 1 schema migration on purpose: storage.buckets and
-- storage.objects do not exist on the scratch Postgres the RLS harness runs
-- against, so this file cannot be part of the ordered migration chain. It is
-- listed in the exclusion block of scripts/test-rls.sh with that reason, the
-- same way bloomos_staff_phase1.sql is.
--
-- Path convention: {org_id}/{story_id}/{filename} — org id FIRST, because the
-- policies below key off (storage.foldername(name))[1]. This is why the spec's
-- original `comms/{org_id}/…` shape had to change (Phase 0 findings §11-C).
--
-- Like staff-photos (and unlike bloomos-asks / bloomos-documents, which are
-- service-role only), this bucket ships with storage RLS so the SESSION client
-- can read and write it directly. That keeps the comms module's rule intact:
-- RLS is the authority, and the story bank never needs the service-role client
-- to move a photo. Reads are still served as short-lived signed URLs, never
-- public URLs — the bucket is private.
--
-- The gate is comms.manage on the org in the path's first segment, matching the
-- story_media table policies. Note the consequence, already recorded in
-- comms_phase1_story_schema.sql: a staff user without comms.subjects.read
-- cannot learn a participant's NAME, but can see their FACE. Photos are what
-- the people who capture stories need back; the split permission covers
-- identity, not imagery.
--
-- APPLIED 2026-08-19 to Ambition-Angels (kzzdtibbwsucloaoqpqa).

-- 10 MB, the same ceiling lib/comms/media.ts enforces in the upload route. The
-- route checks first and gives the human error; this is the backstop that fires
-- only if something ever writes to the bucket without going through it.
insert into storage.buckets (id, name, public, file_size_limit)
values ('comms-media', 'comms-media', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

-- read
drop policy if exists "comms media read" on storage.objects;
create policy "comms media read" on storage.objects for select to authenticated
using (
  bucket_id = 'comms-media'
  and (select private.has_permission(((storage.foldername(name))[1])::uuid, 'comms.manage'))
);

-- insert
drop policy if exists "comms media write" on storage.objects;
create policy "comms media write" on storage.objects for insert to authenticated
with check (
  bucket_id = 'comms-media'
  and (select private.has_permission(((storage.foldername(name))[1])::uuid, 'comms.manage'))
);

-- update
drop policy if exists "comms media modify" on storage.objects;
create policy "comms media modify" on storage.objects for update to authenticated
using (
  bucket_id = 'comms-media'
  and (select private.has_permission(((storage.foldername(name))[1])::uuid, 'comms.manage'))
)
with check (
  bucket_id = 'comms-media'
  and (select private.has_permission(((storage.foldername(name))[1])::uuid, 'comms.manage'))
);

-- delete
drop policy if exists "comms media delete" on storage.objects;
create policy "comms media delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'comms-media'
  and (select private.has_permission(((storage.foldername(name))[1])::uuid, 'comms.manage'))
);
