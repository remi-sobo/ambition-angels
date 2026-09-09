-- BloomOS V2 / Spec Fundraising, stage F5 — the fr_next_step obligation arm.
-- (specs/bloomos-v2-spec-fundraising.md, decision 2 — RESOLVED: fundraising
-- follow-ups join v_obligations, signed 2026-09-08.)
--
-- Decision 2 named two arms; ONE already exists — A2 shipped the
-- `acknowledgment` arm (gifts awaiting a thank-you), so unacknowledged
-- gifts have flowed to Home → Today since Spec Home H1. This migration adds
-- the genuinely missing arm: a DATED next move on an open ask. The flood
-- guard is the date, playing the role owner_id plays on metric_stale: only
-- deliberate, dated moves become obligations — an undated next_step stays
-- on the pipeline board, and an ask with no step at all is the board's
-- business, not Today's. Fundraising → Today's Moves remains the DETAIL
-- surface (its overdue list shows all of them); Home stays the decision
-- surface (ranked, capped at 7).
--
-- Three pieces, all additive:
--   1. opportunities.snoozed_until — the A1 column pattern, so the new arm
--      snoozes like the three primary sources instead of erroring.
--   2. v_obligations re-created with the tenth arm (A2's text otherwise
--      verbatim; security_invoker stays on; connection_candidates stays
--      excluded on purpose).
--   3. resolve_obligation / snooze_obligation re-created with the
--      fr_next_step branch. Resolving means THE MOVE WAS MADE: next_step
--      and next_step_due clear, the ask stays open on the board — setting
--      the next move is deliberate human work there, never a side effect
--      here. upsert_obligation is untouched (nothing writes opportunities
--      through the contract).

-- ── 1. snooze column (A1 pattern) ───────────────────────────────────────────
alter table public.opportunities add column if not exists snoozed_until date;

-- ── 2. the view, now ten arms ───────────────────────────────────────────────
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
    and s.session_date < current_date

  union all
  -- opportunities — a DATED next move on an open ask (Spec Fundraising F5,
  -- decision 2). The date is the flood guard: undated steps and stepless
  -- asks stay on the pipeline board. Donor names are not participant data
  -- (the Reed fence covers program participants); the title carries the
  -- move's own text, not the donor's name, all the same.
  select 'fr_next_step:' || o.id,
         o.org_id, 'fr_next_step',
         'Next move: ' || o.next_step,
         null::text, null::uuid,
         o.next_step_due,
         'open',
         'constituent', o.constituent_id,
         null::text, null::text, null::timestamptz,
         o.snoozed_until,
         'fundraising',
         false
  from public.opportunities o
  where o.stage not in ('steward', 'lost')
    and o.next_step is not null and btrim(o.next_step) <> ''
    and o.next_step_due is not null
    and (o.snoozed_until is null or o.snoozed_until <= current_date);

comment on view public.v_obligations is
  'Contract 3 (Spec A, A2; tenth arm added at Spec Fundraising F5): the '
  'unified read over the obligation sources. connection_candidates is '
  'EXCLUDED on purpose despite carrying ops_task_id: its rows are '
  'Gmail-derived suggestions awaiting triage. An obligation is something '
  'you owe; a suggestion is something you might. Piping unreviewed '
  'candidates into Today would bury the things that actually need a human — '
  'a candidate becomes an obligation only when promoted into ops_tasks. Do '
  'not add it as an arm by reading the column list. '
  'contains_participant_data is the Reed fence (participant amendment): rows '
  'from participant tables are flagged true and must never reach a model; '
  'every arm sets the literal explicitly.';

grant select on public.v_obligations to authenticated;

-- ── 3. the RPCs, re-created with the fr_next_step branch ────────────────────
-- Full text otherwise verbatim from spec_a_obligation_rpcs.sql (A3);
-- upsert_obligation is deliberately not re-stated.

create or replace function public.resolve_obligation(p_source text, p_source_id uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_due date;
  v_recur text;
  v_status text;
  v_new_due date;
  v_actor text;
begin
  select lower(split_part(btrim(p.display_name), ' ', 1))
    into v_actor
  from public.profiles p where p.user_id = auth.uid();

  if p_source = 'ops_task' then
    select org_id, status into v_org, v_status from public.ops_tasks where id = p_source_id;
    if v_org is null then raise exception 'ops_task % not found', p_source_id using errcode = 'no_data_found'; end if;
    if auth.uid() is not null and not private.has_permission(v_org, 'ops.write') then
      raise insufficient_privilege using message = 'ops.write required';
    end if;
    if v_status = 'done' then
      return jsonb_build_object('source', p_source, 'source_id', p_source_id, 'org_id', v_org, 'already_resolved', true);
    end if;
    update public.ops_tasks set status = 'done', completed_at = now() where id = p_source_id;
    return jsonb_build_object('source', p_source, 'source_id', p_source_id, 'org_id', v_org, 'resolved_at', now());

  elsif p_source = 'grant_requirement' then
    select org_id, status into v_org, v_status from public.grant_requirements where id = p_source_id;
    if v_org is null then raise exception 'grant_requirement % not found', p_source_id using errcode = 'no_data_found'; end if;
    if auth.uid() is not null and not private.has_permission(v_org, 'fundraising.write') then
      raise insufficient_privilege using message = 'fundraising.write required';
    end if;
    if v_status in ('submitted', 'waived') then
      return jsonb_build_object('source', p_source, 'source_id', p_source_id, 'org_id', v_org, 'already_resolved', true);
    end if;
    update public.grant_requirements set status = 'submitted', submitted_at = now() where id = p_source_id;
    return jsonb_build_object('source', p_source, 'source_id', p_source_id, 'org_id', v_org, 'resolved_at', now());

  elsif p_source = 'compliance_item' then
    select org_id, status, due_date, recur into v_org, v_status, v_due, v_recur
    from public.compliance_items where id = p_source_id;
    if v_org is null then raise exception 'compliance_item % not found', p_source_id using errcode = 'no_data_found'; end if;
    if auth.uid() is not null and not private.has_permission(v_org, 'compliance.write') then
      raise insufficient_privilege using message = 'compliance.write required';
    end if;
    if v_status not in ('upcoming', 'in_progress') then
      return jsonb_build_object('source', p_source, 'source_id', p_source_id, 'org_id', v_org, 'already_resolved', true);
    end if;
    -- Permanent history row first: the item's due_date rolls forward, so
    -- this is the only durable record of the satisfied period.
    insert into public.compliance_filings (org_id, item_id, filed_date, period_due_date, filed_by)
    values (v_org, p_source_id, current_date, v_due, coalesce(v_actor, 'automation'));
    if v_recur <> 'none' then
      v_new_due := v_due + (case v_recur when 'quarterly' then interval '3 months'
                                         when 'biennial'  then interval '2 years'
                                         else interval '1 year' end);
      update public.compliance_items
        set last_filed_at = now(), due_date = v_new_due, status = 'upcoming'
        where id = p_source_id;
      return jsonb_build_object('source', p_source, 'source_id', p_source_id, 'org_id', v_org,
                                'resolved_at', now(), 'rolled_to', v_new_due);
    end if;
    update public.compliance_items set last_filed_at = now(), status = 'filed' where id = p_source_id;
    return jsonb_build_object('source', p_source, 'source_id', p_source_id, 'org_id', v_org, 'resolved_at', now());

  elsif p_source = 'acknowledgment' then
    select org_id, acknowledgment_status into v_org, v_status from public.gifts where id = p_source_id;
    if v_org is null then raise exception 'gift % not found', p_source_id using errcode = 'no_data_found'; end if;
    if auth.uid() is not null and not private.has_permission(v_org, 'fundraising.write') then
      raise insufficient_privilege using message = 'fundraising.write required';
    end if;
    if v_status <> 'pending' then
      return jsonb_build_object('source', p_source, 'source_id', p_source_id, 'org_id', v_org, 'already_resolved', true);
    end if;
    update public.gifts set acknowledgment_status = 'sent' where id = p_source_id;
    return jsonb_build_object('source', p_source, 'source_id', p_source_id, 'org_id', v_org, 'resolved_at', now());

  elsif p_source = 'fr_next_step' then
    -- The move was MADE: the step clears, the ask stays open. Setting the
    -- next move is deliberate human work on the board, never a side effect
    -- here (Spec Fundraising F5).
    select org_id, next_step into v_org, v_status from public.opportunities where id = p_source_id;
    if v_org is null then raise exception 'opportunity % not found', p_source_id using errcode = 'no_data_found'; end if;
    if auth.uid() is not null and not private.has_permission(v_org, 'fundraising.write') then
      raise insufficient_privilege using message = 'fundraising.write required';
    end if;
    if v_status is null or btrim(v_status) = '' then
      return jsonb_build_object('source', p_source, 'source_id', p_source_id, 'org_id', v_org, 'already_resolved', true);
    end if;
    update public.opportunities
      set next_step = null, next_step_due = null, snoozed_until = null
      where id = p_source_id;
    return jsonb_build_object('source', p_source, 'source_id', p_source_id, 'org_id', v_org, 'resolved_at', now());

  else
    raise exception 'source % is not resolvable through resolve_obligation — it resolves through its own surface', p_source;
  end if;
end $$;

create or replace function public.snooze_obligation(p_source text, p_source_id uuid, p_until date)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if p_until is null or p_until <= current_date then
    raise exception 'snooze date must be in the future (got %)', p_until;
  end if;

  if p_source = 'ops_task' then
    select org_id into v_org from public.ops_tasks where id = p_source_id;
    if v_org is null then raise exception 'ops_task % not found', p_source_id using errcode = 'no_data_found'; end if;
    if auth.uid() is not null and not private.has_permission(v_org, 'ops.write') then
      raise insufficient_privilege using message = 'ops.write required';
    end if;
    update public.ops_tasks set snoozed_until = p_until where id = p_source_id;

  elsif p_source = 'grant_requirement' then
    select org_id into v_org from public.grant_requirements where id = p_source_id;
    if v_org is null then raise exception 'grant_requirement % not found', p_source_id using errcode = 'no_data_found'; end if;
    if auth.uid() is not null and not private.has_permission(v_org, 'fundraising.write') then
      raise insufficient_privilege using message = 'fundraising.write required';
    end if;
    update public.grant_requirements set snoozed_until = p_until where id = p_source_id;

  elsif p_source = 'compliance_item' then
    select org_id into v_org from public.compliance_items where id = p_source_id;
    if v_org is null then raise exception 'compliance_item % not found', p_source_id using errcode = 'no_data_found'; end if;
    if auth.uid() is not null and not private.has_permission(v_org, 'compliance.write') then
      raise insufficient_privilege using message = 'compliance.write required';
    end if;
    update public.compliance_items set snoozed_until = p_until where id = p_source_id;

  elsif p_source = 'fr_next_step' then
    select org_id into v_org from public.opportunities where id = p_source_id;
    if v_org is null then raise exception 'opportunity % not found', p_source_id using errcode = 'no_data_found'; end if;
    if auth.uid() is not null and not private.has_permission(v_org, 'fundraising.write') then
      raise insufficient_privilege using message = 'fundraising.write required';
    end if;
    update public.opportunities set snoozed_until = p_until where id = p_source_id;

  else
    raise exception 'source % cannot be snoozed — only ops_task, grant_requirement, compliance_item, fr_next_step carry snoozed_until', p_source;
  end if;

  return jsonb_build_object('source', p_source, 'source_id', p_source_id, 'org_id', v_org, 'snoozed_until', p_until);
end $$;

-- Grants unchanged from A3 (revoke/grant already applied and function
-- identity is stable across create-or-replace); re-stated for the scratch
-- harness's fresh database, tolerant of the missing service_role there.
revoke all on function public.resolve_obligation(text, uuid) from public;
revoke all on function public.snooze_obligation(text, uuid, date) from public;
grant execute on function public.resolve_obligation(text, uuid) to authenticated;
grant execute on function public.snooze_obligation(text, uuid, date) to authenticated;
do $$ begin
  grant execute on function public.resolve_obligation(text, uuid) to service_role;
  grant execute on function public.snooze_obligation(text, uuid, date) to service_role;
exception when undefined_object then null; -- scratch stub has no service_role
end $$;
