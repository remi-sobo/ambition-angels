-- Metric Catalog — Phase 4 (view part): the metric_stale arm of the unified
-- queue (specs: BloomOS V3 #3).
--
-- A metric is stale when its latest snapshot is older than its cadence
-- allows. NOISE GUARD (spec failure mode #3): only ACTIVE metrics WITH AN
-- OWNER surface — computed metrics are seeded ownerless and never nag, and
-- deactivated metrics stay silent. One item per metric; updating the metric
-- clears it on next load because freshness is derived, never stored.
--
-- DRIFT GUARD: the cadence→days allowance below mirrors STALE_AFTER_DAYS in
-- lib/admin/metrics/staleness.ts; tests/metrics.test.ts asserts the literals
-- match — change one, change both.
--
-- security_invoker stays on; the new arm scopes through metric_definitions'
-- metrics.read RLS and the profiles co-member policy, like every other arm.
-- Recreates the view with the six existing arms unchanged.

create or replace view public.v_action_items
with (security_invoker = on) as

  select t.org_id,
         'ops_task'::text                as source,
         t.id                            as source_id,
         t.title                         as title,
         t.linked_entity_type            as entity_type,
         t.linked_entity_id              as entity_id,
         t.linked_label                  as entity_label,
         t.assigned_to                   as owner_ref,
         t.due_date                      as due_date,
         coalesce(t.priority, 'medium')  as priority,
         t.status                        as status,
         'ops'::text                     as module
  from public.ops_tasks t
  where t.status <> 'done'
    and t.archived_at is null

  union all
  select r.org_id, 'grant_requirement', r.id,
         initcap(replace(coalesce(nullif(r.label, ''), r.kind), '_', ' ')),
         'grant', r.grant_id, null, null,
         r.due_date, 'high', r.status, 'fundraising'
  from public.grant_requirements r
  where r.status not in ('submitted', 'waived')

  union all
  select c.org_id, 'compliance_item', c.id, c.title,
         'compliance_item', c.id, c.title, c.assigned_to,
         c.due_date, 'high', c.status, 'compliance'
  from public.compliance_items c
  where c.status in ('upcoming', 'in_progress')

  union all
  select g.org_id, 'acknowledgment', g.id, 'Thank-you due',
         'gift', g.id, null, null,
         g.gift_date, 'high', 'pending', 'fundraising'
  from public.gifts g
  where g.acknowledgment_status = 'pending'

  union all
  select f.org_id, 'reconciliation_item', f.id, f.title,
         null, null, null, null,
         null::date, 'medium', f.status, 'finance'
  from public.fin_reconciliation_items f
  where f.status = 'pending'

  union all
  select d.org_id, 'document_renewal', d.id,
         'Renew: ' || coalesce(nullif(d.title, ''), d.filename),
         'document', d.id,
         coalesce(nullif(d.title, ''), d.filename), null,
         d.expires_at, 'medium', d.status, 'documents'
  from public.documents d
  where d.status = 'active'
    and d.expires_at is not null

  union all
  -- Metrics whose latest snapshot has lapsed past their cadence allowance.
  -- due_date = the day the metric became due for an update, so the queue's
  -- overdue ranking ages it naturally.
  select m.org_id, 'metric_stale', m.id,
         'Update metric: ' || m.name,
         'metric', m.id, m.name,
         p.display_name,
         (coalesce(ls.last_on, current_date)
           + (case m.cadence when 'daily' then 2 when 'weekly' then 10 when 'monthly' then 40 when 'quarterly' then 100 else 40 end))::date,
         'medium', 'stale', 'metrics'
  from public.metric_definitions m
  left join lateral (
    select max(s.captured_on) as last_on
    from public.metric_snapshots s
    where s.metric_id = m.id
  ) ls on true
  left join public.profiles p on p.user_id = m.owner_id
  where m.active
    and m.owner_id is not null
    and (
      ls.last_on is null
      or ls.last_on < current_date
         - (case m.cadence when 'daily' then 2 when 'weekly' then 10 when 'monthly' then 40 when 'quarterly' then 100 else 40 end)
    );

grant select on public.v_action_items to authenticated;
