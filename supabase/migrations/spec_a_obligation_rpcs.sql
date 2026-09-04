-- BloomOS V2 / Spec A, stage A3 — the obligation dispatch RPCs (Contract 3).
-- (specs/bloomos-v2-spec-a-platform-contracts.md §Architecture · Contract 3
--  Option B: "Three RPCs, all security definer with an explicit
--  has_permission(org_id, …) check inside".)
--
-- resolve_obligation / snooze_obligation / upsert_obligation. The view
-- (spec_a_v_obligations.sql) is the read; these are the writes. "Resolving it
-- anywhere resolves it everywhere" because every surface dispatches through
-- the same branch into the same owning table.
--
-- SECURITY DEFINER + set search_path = '' (the sync_assigned_to_id /
-- staff_validate_reports_to precedent). Definer bypasses RLS, so every branch
-- does BOTH checks explicitly: the row's org is read first, then
-- private.has_permission(v_org, '<domain>.write') gates the caller — the
-- same keys the tables' own RLS uses (ops.write / fundraising.write /
-- compliance.write). A caller with no session (auth.uid() IS NULL) is the
-- service role — anon and public get no EXECUTE grant at all — and passes
-- the permission gate the same way it bypasses RLS on direct table writes;
-- org scoping still comes from the row / p_org, never from a default.
--
-- Dispatch vocabulary: p_source here is the ARM KEY ('ops_task',
-- 'grant_requirement', 'compliance_item', 'acknowledgment'), i.e.
-- v_obligations.type — split v_obligations.id on the first ':' to get
-- (p_source, p_source_id). The other five arms (reconciliation_item,
-- document_renewal, metric_stale, application_pending, session_unrecorded)
-- are DELIBERATELY not resolvable here: each resolves through its own
-- surface (accepting a proposal, uploading a document, capturing a
-- snapshot, deciding an application, recording attendance) — marking them
-- "done" without that work would destroy the signal. The RPC says so
-- loudly instead of guessing.

-- ── resolve_obligation ──────────────────────────────────────────────────────
-- Per-source resolution semantics (mirrors each surface's existing engine):
--   ops_task           → status 'done', completed_at stamped.
--   grant_requirement  → status 'submitted', submitted_at stamped.
--   compliance_item    → last_filed_at stamped, a compliance_filings history
--                        row inserted (period_due_date = the due date this
--                        filing satisfied), and recur rolls due_date forward
--                        (quarterly +3mo / biennial +2y / annual +1y) with
--                        status reset to 'upcoming'; recur='none' → 'filed'.
--                        Identical to /api/admin/compliance/[id]'s engine.
--   acknowledgment     → gifts.acknowledgment_status 'sent'.
-- Resolving an already-resolved row is a no-op that says so
-- (already_resolved: true), never an error and never a double filing row.

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

  else
    raise exception 'source % is not resolvable through resolve_obligation — it resolves through its own surface', p_source;
  end if;
end $$;

-- ── snooze_obligation ───────────────────────────────────────────────────────
-- Writes snoozed_until on the owning table (the A1 columns). Snooze is not
-- resolution: the row leaves v_obligations until the date passes, nothing
-- else changes. Only the three primary tables carry the column; the derived
-- arms cannot be snoozed (their pressure IS the product).

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

  else
    raise exception 'source % cannot be snoozed — only ops_task, grant_requirement, compliance_item carry snoozed_until', p_source;
  end if;

  return jsonb_build_object('source', p_source, 'source_id', p_source_id, 'org_id', v_org, 'snoozed_until', p_until);
end $$;

-- ── upsert_obligation ───────────────────────────────────────────────────────
-- THE write path for importers, automations, and Reed. This is where dedup
-- lives (the spec says so out loud: discipline enforced here, not a single
-- database constraint). Lookup before insert, per target:
--
--   grant_requirement — the real unique index (org_id, grant_id, kind,
--     due_date); insert .. on conflict do nothing, then read back.
--   compliance_item   — kind <> 'custom': the partial unique index
--     (org_id, kind, jurisdiction, due_date). kind = 'custom': the key
--     INCLUDES TITLE (the A1 data decision: two genuinely different custom
--     CA items share a due date). KNOWN WEAKNESS, recorded in Spec A's
--     failure modes: title is a weak key because titles get edited — an
--     edited title re-imported creates a sibling, and that is accepted
--     over a constraint that would merge different obligations.
--   ops_task — no constraint possible (94% of rows carry NULL linkage and
--     plain tasks legitimately repeat): dedup on (org_id, linked_entity_id,
--     due_date) among OPEN tasks when linkage is present, else
--     (org_id, title, due_date) among OPEN tasks. Same weakness, same note.
--
-- Returns the existing row's id with deduped=true, or the new row's id.

create or replace function public.upsert_obligation(
  p_org uuid,
  p_type text,                      -- 'ops_task' | 'grant_requirement' | 'compliance_item'
  p_title text,
  p_source text default 'automation',  -- provenance: human|importer|automation|reed
  p_due_date date default null,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null,
  p_why_it_matters text default null,
  p_owner_id uuid default null,
  p_grant_id uuid default null,     -- grant_requirement only (required there)
  p_kind text default null,         -- grant_requirement / compliance_item kind
  p_jurisdiction text default null, -- compliance_item only
  p_recur text default 'none'       -- compliance_item only
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_actor text;
begin
  if p_org is null then raise exception 'p_org is required'; end if;
  if p_title is null or btrim(p_title) = '' then raise exception 'p_title is required'; end if;

  select lower(split_part(btrim(p.display_name), ' ', 1))
    into v_actor
  from public.profiles p where p.user_id = auth.uid();

  if p_type = 'ops_task' then
    if auth.uid() is not null and not private.has_permission(p_org, 'ops.write') then
      raise insufficient_privilege using message = 'ops.write required';
    end if;
    if p_related_entity_id is not null then
      select id into v_id from public.ops_tasks
      where org_id = p_org and linked_entity_id = p_related_entity_id
        and due_date is not distinct from p_due_date
        and status <> 'done' and archived_at is null
      limit 1;
    else
      select id into v_id from public.ops_tasks
      where org_id = p_org and title = p_title
        and due_date is not distinct from p_due_date
        and status <> 'done' and archived_at is null
      limit 1;
    end if;
    if v_id is not null then
      return jsonb_build_object('type', p_type, 'id', v_id, 'org_id', p_org, 'deduped', true);
    end if;
    -- category is an ops_tasks-ism the contract doesn't carry; 'other' is the
    -- neutral value (editable on the task afterwards).
    insert into public.ops_tasks
      (org_id, title, status, category, due_date, linked_entity_type, linked_entity_id,
       why_it_matters, obligation_source, assigned_to_id, created_by)
    values
      (p_org, p_title, 'todo', 'other', p_due_date, p_related_entity_type, p_related_entity_id,
       p_why_it_matters, p_source, p_owner_id, coalesce(v_actor, p_source))
    returning id into v_id;
    return jsonb_build_object('type', p_type, 'id', v_id, 'org_id', p_org, 'deduped', false);

  elsif p_type = 'grant_requirement' then
    if auth.uid() is not null and not private.has_permission(p_org, 'fundraising.write') then
      raise insufficient_privilege using message = 'fundraising.write required';
    end if;
    if p_grant_id is null then raise exception 'p_grant_id is required for grant_requirement'; end if;
    if p_due_date is null then raise exception 'p_due_date is required for grant_requirement'; end if;
    insert into public.grant_requirements
      (org_id, grant_id, kind, label, due_date, status, owner_id, why_it_matters)
    values
      (p_org, p_grant_id, coalesce(p_kind, 'other'), p_title, p_due_date, 'upcoming', p_owner_id, p_why_it_matters)
    on conflict (org_id, grant_id, kind, due_date) do nothing
    returning id into v_id;
    if v_id is not null then
      return jsonb_build_object('type', p_type, 'id', v_id, 'org_id', p_org, 'deduped', false);
    end if;
    select id into v_id from public.grant_requirements
    where org_id = p_org and grant_id = p_grant_id
      and kind = coalesce(p_kind, 'other') and due_date = p_due_date;
    return jsonb_build_object('type', p_type, 'id', v_id, 'org_id', p_org, 'deduped', true);

  elsif p_type = 'compliance_item' then
    if auth.uid() is not null and not private.has_permission(p_org, 'compliance.write') then
      raise insufficient_privilege using message = 'compliance.write required';
    end if;
    if p_due_date is null then raise exception 'p_due_date is required for compliance_item'; end if;
    if coalesce(p_kind, 'custom') = 'custom' then
      -- Custom items: the dedup key includes title (weak on purpose — see header).
      select id into v_id from public.compliance_items
      where org_id = p_org and kind = 'custom' and title = p_title
        and jurisdiction is not distinct from p_jurisdiction and due_date = p_due_date
      limit 1;
    else
      select id into v_id from public.compliance_items
      where org_id = p_org and kind = p_kind
        and jurisdiction is not distinct from p_jurisdiction and due_date = p_due_date
      limit 1;
    end if;
    if v_id is not null then
      return jsonb_build_object('type', p_type, 'id', v_id, 'org_id', p_org, 'deduped', true);
    end if;
    insert into public.compliance_items
      (org_id, kind, title, jurisdiction, due_date, recur, status, why_it_matters)
    values
      (p_org, coalesce(p_kind, 'custom'), p_title, p_jurisdiction, p_due_date,
       coalesce(p_recur, 'none'), 'upcoming', p_why_it_matters)
    returning id into v_id;
    return jsonb_build_object('type', p_type, 'id', v_id, 'org_id', p_org, 'deduped', false);

  else
    raise exception 'type % is not writable through upsert_obligation — only ops_task, grant_requirement, compliance_item', p_type;
  end if;
end $$;

-- ── grants ──────────────────────────────────────────────────────────────────
-- No EXECUTE for public/anon; sessions and the service role only. (The
-- service_role grant is tolerant: the RLS scratch stub doesn't create that
-- role, and the superuser running the harness doesn't need the grant.)
revoke all on function public.resolve_obligation(text, uuid) from public;
revoke all on function public.snooze_obligation(text, uuid, date) from public;
revoke all on function public.upsert_obligation(uuid, text, text, text, date, text, uuid, text, uuid, uuid, text, text, text) from public;
grant execute on function public.resolve_obligation(text, uuid) to authenticated;
grant execute on function public.snooze_obligation(text, uuid, date) to authenticated;
grant execute on function public.upsert_obligation(uuid, text, text, text, date, text, uuid, text, uuid, uuid, text, text, text) to authenticated;
do $$ begin
  grant execute on function public.resolve_obligation(text, uuid) to service_role;
  grant execute on function public.snooze_obligation(text, uuid, date) to service_role;
  grant execute on function public.upsert_obligation(uuid, text, text, text, date, text, uuid, text, uuid, uuid, text, text, text) to service_role;
exception when undefined_object then null; -- scratch stub has no service_role
end $$;

-- ── rollback (reference only; never applied automatically) ──────────────────
-- drop function if exists public.resolve_obligation(text, uuid);
-- drop function if exists public.snooze_obligation(text, uuid, date);
-- drop function if exists public.upsert_obligation(uuid, text, text, text, date, text, uuid, text, uuid, uuid, text, text, text);
