-- Comms Phase 3 — comms_outputs (specs/comms-module.md §6.1, §12 migration 3).
--
-- Everything the composer produces: one story turned into a LinkedIn post, a
-- thank-you paragraph, a grant anecdote, a newsletter section. Drafts only —
-- nothing here auto-publishes and nothing auto-sends.
--
-- `model_grounding` is the audit record, and it is the reason this table is
-- worth having rather than just copying text to a clipboard. It stores exactly
-- what was sent to the model: which story fields, which metric snapshot ids,
-- and every redaction that was applied. The claim "no participant name reached
-- the model" is checkable against a row, not a promise.
--
-- edition_id is deliberately unconstrained here; the FK to comms_editions is
-- added in Phase 4 when that table exists.
--
-- RLS is the stories pattern: comms.manage for everything. An output derived
-- from a participant story carries redacted text by construction, so it needs
-- no tighter gate than the story it came from.
--
-- APPLIED 2026-08-19 to Ambition-Angels (kzzdtibbwsucloaoqpqa). Verified live:
-- RLS on, both policies stored, no org_id default, and the channel constraint
-- matching CHANNELS in lib/comms/channels.ts (a test pins the two together —
-- a channel the database rejects would fail only at insert, after the model
-- call was already paid for).

create table if not exists public.comms_outputs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  story_id        uuid not null references public.stories(id) on delete cascade,
  edition_id      uuid,                       -- FK added in Phase 4
  channel         text not null check (channel in (
    'linkedin', 'newsletter_section', 'thank_you', 'grant_anecdote',
    'board_update', 'news_flash', 'personal_forward'
  )),
  body            text not null,
  status          text not null default 'draft'
    check (status in ('draft', 'approved', 'used', 'discarded')),
  used_at         timestamptz,
  -- What actually went to the model, for audit: story fields used, metric
  -- snapshot ids, the redactions applied, the model id, and token counts.
  model_grounding jsonb,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists comms_outputs_org_story_idx
  on public.comms_outputs (org_id, story_id, created_at desc);
create index if not exists comms_outputs_org_status_idx
  on public.comms_outputs (org_id, status);

drop trigger if exists comms_outputs_set_updated_at on public.comms_outputs;
create trigger comms_outputs_set_updated_at
  before update on public.comms_outputs
  for each row execute function public.set_updated_at();

alter table public.comms_outputs enable row level security;

drop policy if exists "read comms_outputs" on public.comms_outputs;
create policy "read comms_outputs" on public.comms_outputs
  for select to authenticated
  using ( (select private.has_permission(org_id, 'comms.manage')) );

drop policy if exists "write comms_outputs" on public.comms_outputs;
create policy "write comms_outputs" on public.comms_outputs
  for all to authenticated
  using ( (select private.has_permission(org_id, 'comms.manage')) )
  with check ( (select private.has_permission(org_id, 'comms.manage')) );
