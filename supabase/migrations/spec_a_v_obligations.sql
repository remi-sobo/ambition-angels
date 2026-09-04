-- BloomOS V2 / Spec A, stage A2 — public.v_obligations, the Contract 3 read.
-- (specs/bloomos-v2-spec-a-platform-contracts.md §Architecture · Contract 3
--  Option B; specs/spec-a-a2-participant-obligations-amendment.md)
--
-- The contract-shaped union over the NINE obligation sources v_action_items
-- already proved out. v_action_items is left UNTOUCHED so V1 keeps working;
-- this view is the V2 contract surface (Home → Today, Reed's queue tool, and
-- the A3 RPCs' read side). No RPCs in this stage.
--
-- security_invoker = on IS MANDATORY: every base table carries org-scoped RLS
-- via private.has_permission(org_id, '<module>.read'); running as invoker
-- applies those gates per caller. A plain (definer) view would merge tenants.
-- Verified by supabase/tests/rls-leak-test.sql.
--
-- Field notes (the contract's vocabulary, per docs/v2-recon.md §A.0):
--   type    — the obligation kind: the arm key ('ops_task', 'grant_requirement',
--             …), same vocabulary as v_action_items.source for continuity.
--             id = type || ':' || <row uuid> round-trips to A3's
--             resolve_obligation(p_source, p_source_id) dispatch.
--   source  — provenance in the contract's sense (human|importer|automation|
--             reed): ops_tasks.obligation_source where it exists; NULL on
--             every other arm and on pre-contract ops rows — honest, not
--             guessed. Backfilling provenance is a write-path job (A3+).
--   state   — the unified enum: 'open' | 'in_progress' | 'blocked'. Only
--             values a source actually produces (blocked exists only on
--             ops_tasks). Mapping per arm is in each branch.
--   resolved_at — always NULL here: the view surfaces OPEN obligations only
--             (each arm keeps its v_action_items open-filter). A resolved row
--             leaves the view; the column keeps the contract shape so A3's
--             RPC returns and any future history read stay compatible.
--   snoozed_until — rows with a FUTURE snoozed_until are excluded (snooze,
--             not resolution). Only ops_tasks / grant_requirements /
--             compliance_items carry the column (A1).
--
-- contains_participant_data (amendment, REQUIRED — Reed fence):
--   TRUE on every row sourced from a participant table. application_pending
--   titles rows with the applicant's name. session_unrecorded is marked TRUE
--   conservatively: its title embeds cohort_sessions.title, facilitator free
--   text that CAN embed a participant's name, and the fence errs closed.
--   Every arm sets the literal EXPLICITLY — a new arm added without it is a
--   test failure (tests/obligations-view.test.ts), never a silent default.
--   Reed's queue tool filters on it; the in-app feed keeps all rows.
--
-- connection_candidates is EXCLUDED ON PURPOSE (see view comment below).

create or replace view public.v_obligations
with (security_invoker = on) as

  -- ops_tasks — open tasks. States: todo→open, in_progress, blocked.
  select 'ops_task:' || t.id            as id,
         t.org_id                       as org_id,
         'ops_task'::text               as type,
         t.title                        as title,
         t.why_it_matters               as why_it_matters,
         t.assigned_to_id               as owner_id,
         t.due_date                     as due_date,
         case t.status when 'in_progress' then 'in_progress'
                       when 'blocked'     then 'blocked'
                       else 'open' end  as state,
         t.linked_entity_type           as related_entity_type,
         t.linked_entity_id             as related_entity_id,
         t.obligation_source            as source,
         t.created_by                   as created_by,
         null::timestamptz              as resolved_at,
         t.snoozed_until                as snoozed_until,
         'ops'::text                    as module,
         false                          as contains_participant_data
  from public.ops_tasks t
  where t.status <> 'done'
    and t.archived_at is null
    and (t.snoozed_until is null or t.snoozed_until <= current_date)

  union all
  -- grant_requirements — not yet submitted/waived. upcoming→open, in_progress.
  select 'grant_requirement:' || r.id,
         r.org_id, 'grant_requirement',
         initcap(replace(coalesce(nullif(r.label, ''), r.kind), '_', ' ')),
         r.why_it_matters,
         r.owner_id,
         r.due_date,
         case r.status when 'in_progress' then 'in_progress' else 'open' end,
         'grant', r.grant_id,
         null::text, null::text, null::timestamptz,
         r.snoozed_until,
         'fundraising',
         false
  from public.grant_requirements r
  where r.status not in ('submitted', 'waived')
    and (r.snoozed_until is null or r.snoozed_until <= current_date)

  union all
  -- compliance_items — still open. upcoming→open, in_progress.
  select 'compliance_item:' || c.id,
         c.org_id, 'compliance_item',
         c.title,
         c.why_it_matters,
         c.assigned_to_id,
         c.due_date,
         case c.status when 'in_progress' then 'in_progress' else 'open' end,
         'compliance_item', c.id,
         null::text, null::text, null::timestamptz,
         c.snoozed_until,
         'compliance',
         false
  from public.compliance_items c
  where c.status in ('upcoming', 'in_progress')
    and (c.snoozed_until is null or c.snoozed_until <= current_date)

  union all
  -- gifts — thank-you due. pending→open. No snooze column (derived signal).
  select 'acknowledgment:' || g.id,
         g.org_id, 'acknowledgment',
         'Thank-you due',
         null::text, null::uuid,
         g.gift_date,
         'open',
         'gift', g.id,
         null::text, null::text, null::timestamptz, null::date,
         'fundraising',
         false
  from public.gifts g
  where g.acknowledgment_status = 'pending'

  union all
  -- fin_reconciliation_items — unresolved proposals. pending→open.
  select 'reconciliation_item:' || f.id,
         f.org_id, 'reconciliation_item',
         f.title,
         null::text, null::uuid,
         null::date,
         'open',
         null::text, null::uuid,
         null::text, null::text, null::timestamptz, null::date,
         'finance',
         false
  from public.fin_reconciliation_items f
  where f.status = 'pending'

  union all
  -- documents — renewal outstanding. active-with-expiry→open.
  select 'document_renewal:' || d.id,
         d.org_id, 'document_renewal',
         'Renew: ' || coalesce(nullif(d.title, ''), d.filename),
         null::text, null::uuid,
         d.expires_at,
         'open',
         'document', d.id,
         null::text, null::text, null::timestamptz, null::date,
         'documents',
         false
  from public.documents d
  where d.status = 'active'
    and d.expires_at is not null

  union all
  -- metric_definitions past cadence — stale→open.
  select 'metric_stale:' || m.id,
         m.org_id, 'metric_stale',
         'Update metric: ' || m.name,
         null::text,
         m.owner_id,
         (coalesce(ls.last_on, current_date)
           + (case m.cadence when 'daily' then 2 when 'weekly' then 10 when 'monthly' then 40 when 'quarterly' then 100 else 40 end))::date,
         'open',
         'metric', m.id,
         null::text, null::text, null::timestamptz, null::date,
         'metrics',
         false
  from public.metric_definitions m
  left join lateral (
    select max(s.captured_on) as last_on
    from public.metric_snapshots s
    where s.metric_id = m.id
  ) ls on true
  where m.active
    and m.owner_id is not null
    and (
      ls.last_on is null
      or ls.last_on < current_date
         - (case m.cadence when 'daily' then 2 when 'weekly' then 10 when 'monthly' then 40 when 'quarterly' then 100 else 40 end)
    )

  union all
  -- applications — awaiting a human decision. offered→in_progress (the org
  -- acted; awaiting outcome), new/eligible/waitlisted→open.
  -- PARTICIPANT DATA: the title embeds the applicant's name (amendment).
  select 'application_pending:' || a.id,
         a.org_id, 'application_pending',
         'Application: ' || a.first_name || coalesce(' ' || a.last_name, ''),
         null::text, null::uuid,
         null::date,
         case when a.status = 'offered' then 'in_progress' else 'open' end,
         'application', a.id,
         null::text, null::text, null::timestamptz, null::date,
         'program',
         true
  from public.applications a
  where a.status in ('new', 'eligible', 'waitlisted', 'offered')

  union all
  -- cohort_sessions past their date, never closed out. scheduled→open.
  -- PARTICIPANT DATA (conservative): the title embeds cohort_sessions.title,
  -- facilitator free text that can name a participant; the fence errs closed
  -- rather than trusting free text row-by-row (amendment: "cohort_sessions
  -- when the title embeds a participant" is undecidable in SQL).
  select 'session_unrecorded:' || s.id,
         s.org_id, 'session_unrecorded',
         'Record attendance: ' || coalesce(nullif(s.title, ''), c.name || ' — ' || s.session_date),
         null::text, null::uuid,
         s.session_date,
         'open',
         'cohort', s.cohort_id,
         null::text, null::text, null::timestamptz, null::date,
         'program',
         true
  from public.cohort_sessions s
  join public.cohorts c on c.id = s.cohort_id
  where s.status = 'scheduled'
    and s.session_date < current_date;

comment on view public.v_obligations is
  'Contract 3 (Spec A, A2): the unified read over the nine obligation sources. '
  'connection_candidates is EXCLUDED on purpose despite carrying ops_task_id: '
  'its rows are Gmail-derived suggestions awaiting triage. An obligation is '
  'something you owe; a suggestion is something you might. Piping unreviewed '
  'candidates into Today would bury the things that actually need a human — '
  'a candidate becomes an obligation only when promoted into ops_tasks. Do '
  'not add it as a tenth arm by reading the column list. '
  'contains_participant_data is the Reed fence (participant amendment): rows '
  'from participant tables are flagged true and must never reach a model; '
  'every arm sets the literal explicitly.';

grant select on public.v_obligations to authenticated;

-- ── rollback (reference only; never applied automatically) ──────────────────
-- drop view if exists public.v_obligations;
