-- BloomOS / Reed — Phase 5: drafts.
--
-- reed_drafts holds content Reed COMPOSES for a human to review and send/use:
-- grant narratives, board updates, donor acknowledgments. A draft is INERT —
-- creating one never sends an email, submits a grant, or changes live data. The
-- drafted -> approved/discarded lifecycle mirrors fr_email_drafts' drafted ->
-- sent pattern (the spec's "reuse the draft/confirm pattern"); a new table is
-- used rather than fr_email_drafts because these aren't all emails and don't fit
-- that table's hubspot_contact_id / template shape. Actually sending or
-- submitting a draft is Phase 7 (gated, human-confirmed writes).
--
-- RLS membership-scoped, consistent with the other reed_* tables — the per-kind
-- WRITE permission (fundraising.write / board.write) is enforced in the save_draft
-- tool before the row is written.
--
-- Idempotent. Reuses set_updated_at(). Apply via the dashboard (kzzdtibbwsucloaoqpqa).

create table if not exists public.reed_drafts (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.orgs(id),
  kind               text not null check (kind in ('grant_narrative', 'board_update', 'acknowledgment')),
  title              text,
  body               text not null,
  context_ref        jsonb,
  status             text not null default 'drafted' check (status in ('drafted', 'approved', 'discarded')),
  created_by         text,
  model_used         text,
  source_activity_id uuid references public.reed_activity_log(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists reed_drafts_org_created_idx on public.reed_drafts (org_id, created_at desc);
create index if not exists reed_drafts_status_idx on public.reed_drafts (status);

alter table public.reed_drafts enable row level security;
drop policy if exists "members use reed_drafts" on public.reed_drafts;
create policy "members use reed_drafts" on public.reed_drafts
  for all to authenticated
  using ( exists (select 1 from public.memberships m
                  where m.user_id = auth.uid() and m.org_id = reed_drafts.org_id) )
  with check ( exists (select 1 from public.memberships m
                       where m.user_id = auth.uid() and m.org_id = reed_drafts.org_id) );

drop trigger if exists reed_drafts_set_updated_at on public.reed_drafts;
create trigger reed_drafts_set_updated_at
  before update on public.reed_drafts
  for each row execute function set_updated_at();
