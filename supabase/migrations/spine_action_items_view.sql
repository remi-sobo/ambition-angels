-- Operating Spine — Phase 2: unified action-items read (specs: BloomOS V3 #1).
--
-- v_action_items is THE cross-department read of "everything that still needs
-- a human": one normalized shape over the five action sources, org-scoped and
-- permission-filtered by construction. It normalizes, it does not own — no
-- new writes, no mirror table that can drift (the gmail_sync_jobs failure).
-- Completion still goes through each source's existing endpoint.
--
-- security_invoker = on IS MANDATORY. Every base table already carries
-- org-scoped RLS via private.has_permission(org_id, '<module>.read'); running
-- the view as invoker applies those gates per caller, so tenant two can never
-- see AA's deadlines and a board_viewer sees only board-visible modules.
-- A plain (definer) view would bypass all of it. Verified by
-- supabase/tests/rls-leak-test.sql.
--
-- Predicates confirmed by Phase 0 recon against the live schema:
--   ops_tasks           open = status <> 'done' AND archived_at IS NULL
--   grant_requirements  open = status NOT IN ('submitted','waived')   (vocab: upcoming/in_progress/submitted/waived)
--   compliance_items    open = status IN ('upcoming','in_progress')   (done-states: filed/waived)
--   gifts (thank-yous)  open = acknowledgment_status = 'pending'      (the acknowledgments table records SENT acks,
--                                                                      so the due signal lives on the gift — same
--                                                                      source AcksDueWidget already reads)
--   fin_reconciliation_items open = status = 'pending'                (org_id exists now; the spec's deferral is moot)
--
-- owner_ref is best-effort TEXT (spec open decision B): assigned_to /
-- sent-by columns are free text today ('remi', 'shannon'). The queue ships
-- org-wide with a best-effort "mine" toggle; promoting owners to uuid FKs is
-- its own follow-on migration.

create or replace view public.v_action_items
with (security_invoker = on) as

  -- Open ops tasks
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
  -- Grant requirements not yet submitted (or waived)
  select r.org_id,
         'grant_requirement',
         r.id,
         initcap(replace(coalesce(nullif(r.label, ''), r.kind), '_', ' ')),
         'grant',
         r.grant_id,
         null,
         null,
         r.due_date,
         'high',
         r.status,
         'fundraising'
  from public.grant_requirements r
  where r.status not in ('submitted', 'waived')

  union all
  -- Compliance items still open
  select c.org_id,
         'compliance_item',
         c.id,
         c.title,
         'compliance_item',
         c.id,
         c.title,
         c.assigned_to,
         c.due_date,
         'high',
         c.status,
         'compliance'
  from public.compliance_items c
  where c.status in ('upcoming', 'in_progress')

  union all
  -- Gifts awaiting a thank-you (due since the gift date)
  select g.org_id,
         'acknowledgment',
         g.id,
         'Thank-you due',
         'gift',
         g.id,
         null,
         null,
         g.gift_date,
         'high',
         'pending',
         'fundraising'
  from public.gifts g
  where g.acknowledgment_status = 'pending'

  union all
  -- Unresolved reconciliation proposals
  select f.org_id,
         'reconciliation_item',
         f.id,
         f.title,
         null,
         null,
         null,
         null,
         null::date,
         'medium',
         f.status,
         'finance'
  from public.fin_reconciliation_items f
  where f.status = 'pending';

grant select on public.v_action_items to authenticated;

-- The open-item scans the view unions, indexed so the Command Center read
-- stays flat as history grows (guard from the spec's read-cost failure mode).
create index if not exists idx_ops_tasks_open_due
  on public.ops_tasks (org_id, due_date)
  where status <> 'done' and archived_at is null;

create index if not exists idx_grant_requirements_open_due
  on public.grant_requirements (org_id, due_date)
  where status not in ('submitted', 'waived');

create index if not exists idx_compliance_items_open_due
  on public.compliance_items (org_id, due_date)
  where status in ('upcoming', 'in_progress');

create index if not exists idx_gifts_ack_pending
  on public.gifts (org_id, gift_date)
  where acknowledgment_status = 'pending';

create index if not exists idx_fin_reconciliation_items_pending
  on public.fin_reconciliation_items (org_id)
  where status = 'pending';
