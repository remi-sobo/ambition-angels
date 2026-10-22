-- resolve_obligation: an acknowledgment resolved through the RPC is stamped
-- and closes its task, the same as /api/admin/acknowledgments/mark.
--
-- Before this, the acknowledgment branch set acknowledgment_status = 'sent'
-- and nothing else:
--   - acknowledged_at stayed null, and the stewardship-milestones and journeys
--     crons key on it (app/api/cron/stewardship-milestones/route.ts,
--     app/api/cron/journeys/route.ts), so the gift silently dropped out of both;
--   - the gift's ack-bridge task (label sys:gift:<id>, lib/fundraising/
--     ack-tasks.ts) stayed open on every queue.
-- Found in specs/needs-you-popout-thank-yous-phase0-findings.md (TL;DR 5).
-- Today stopped calling this branch in #553; this fixes it for every other
-- caller. Production had 0 gifts in the bad state (sent, acknowledged_at
-- null) when this was written, so there is no backfill.
--
-- Full text otherwise verbatim from capture_obligations.sql (live function
-- matched it when this was written). Only the acknowledgment branch changes.
-- snooze_obligation is untouched.

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
    update public.gifts set acknowledgment_status = 'sent', acknowledged_at = now() where id = p_source_id;
    -- Close the gift's ack-bridge task, as /mark does (closeAckTaskForGift).
    -- Escalation tasks (sys:escalate:) are the owner's to close, as there.
    update public.ops_tasks set status = 'done', completed_at = now()
      where org_id = v_org and labels @> array['sys:gift:' || p_source_id::text] and status <> 'done';
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

  elsif p_source = 'capture' then
    -- Capture C5: "I'm done with this recording." Whatever is still
    -- proposed or held is discarded and the capture closes; filed cards are
    -- untouched. Captures are personal, so only their creator may resolve
    -- one (this function is SECURITY DEFINER and bypasses RLS, so the
    -- created_by check is the fence), and ops.write is the capture floor.
    select org_id, status into v_org, v_status from public.captures
      where id = p_source_id and created_by = auth.uid();
    if v_org is null then raise exception 'capture % not found', p_source_id using errcode = 'no_data_found'; end if;
    if not private.has_permission(v_org, 'ops.write') then
      raise insufficient_privilege using message = 'ops.write required';
    end if;
    if v_status <> 'ready' then
      return jsonb_build_object('source', p_source, 'source_id', p_source_id, 'org_id', v_org, 'already_resolved', true);
    end if;
    update public.capture_cards
      set status = 'discarded', decided_by = auth.uid(), decided_at = now()
      where capture_id = p_source_id and status in ('proposed', 'held');
    update public.captures set status = 'done', snoozed_until = null where id = p_source_id;
    return jsonb_build_object('source', p_source, 'source_id', p_source_id, 'org_id', v_org, 'resolved_at', now());

  else
    raise exception 'source % is not resolvable through resolve_obligation — it resolves through its own surface', p_source;
  end if;
end $$;

-- Grants unchanged (create-or-replace keeps the function identity); re-stated
-- for the scratch harness's fresh database, tolerant of a missing service_role.
revoke all on function public.resolve_obligation(text, uuid) from public;
grant execute on function public.resolve_obligation(text, uuid) to authenticated;
do $$ begin
  grant execute on function public.resolve_obligation(text, uuid) to service_role;
exception when undefined_object then null;
end $$;
