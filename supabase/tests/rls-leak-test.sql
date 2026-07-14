-- Cross-tenant / cross-role RLS leak test (BloomOS Ring 1).
--
-- Run by scripts/test-rls.sh after all migrations have been applied to a
-- stubbed Postgres (supabase/tests/setup-supabase-stub.sql). Any leak
-- raises an exception, which fails CI via ON_ERROR_STOP.
--
-- Simulated principals:
--   remi@ambitionangels.org    → owner  (via the bootstrap trigger)
--   shannon@ambitionangels.org → staff  (via the @ambitionangels.org rule)
--   stranger@gmail.com         → valid session, NO membership
--   anon                       → no session at all

-- ── Setup: users provision through the real bootstrap trigger ───────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001','remi@ambitionangels.org'),
  ('00000000-0000-0000-0000-000000000002','shannon@ambitionangels.org'),
  ('00000000-0000-0000-0000-000000000003','stranger@gmail.com')
on conflict do nothing;

do $$ begin
  if (select role from memberships m join auth.users u on u.id = m.user_id
      where u.email = 'remi@ambitionangels.org') is distinct from 'owner'::org_role then
    raise exception 'bootstrap trigger did not provision remi as owner';
  end if;
  if (select role from memberships m join auth.users u on u.id = m.user_id
      where u.email = 'shannon@ambitionangels.org') is distinct from 'staff'::org_role then
    raise exception 'bootstrap trigger did not provision shannon as staff';
  end if;
  if exists (select 1 from memberships m join auth.users u on u.id = m.user_id
      where u.email = 'stranger@gmail.com') then
    raise exception 'bootstrap trigger provisioned a membership for a stranger';
  end if;
end $$;

-- ── Seed rows as service role (bypasses RLS, like the app today) ────────
insert into ops_tasks (title, category, created_by) values ('leak-test','operations','remi');
insert into fin_transactions (txn_date, description, amount, dedup_hash)
  values ('2026-01-01','leak-test',100,'leak-test-h1');
insert into page_views (page) values ('/leak-test');
insert into donations (amount, stripe_payment_id) values (10,'leak-test-pi');
insert into meeting_types (slug, name, duration_minutes, is_active) values
  ('leak-test-active','Leak Active',30,true),
  ('leak-test-inactive','Leak Inactive',30,false)
on conflict (slug) do nothing;
insert into connections (provider, external_id) values ('hubspot','leak-test')
on conflict do nothing;
insert into webhook_events (provider, external_event_id, raw_payload)
  values ('givebutter','leak-test-evt','{}')
on conflict do nothing;

-- ════ Owner: full read + write ═══════════════════════════════════════════
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

do $$ begin
  if (select count(*) from ops_tasks) = 0 then raise exception 'owner cannot read ops_tasks'; end if;
  if (select count(*) from fin_transactions) = 0 then raise exception 'owner cannot read fin_transactions'; end if;
  if (select count(*) from page_views) = 0 then raise exception 'owner cannot read page_views'; end if;
  if (select count(*) from donations) = 0 then raise exception 'owner cannot read donations'; end if;
  -- The donations->gifts ingest trigger must have created a gift for the
  -- seeded donation (fundraising.read grants access).
  if (select count(*) from gifts where external_source = 'stripe' and external_id = 'leak-test-pi') = 0 then
    raise exception 'donations->gifts ingest trigger did not fire';
  end if;
  -- Service-path-only tables: even the owner must see nothing.
  if (select count(*) from connections) <> 0 then raise exception 'LEAK: owner reads connections (token store is service-only)'; end if;
  if (select count(*) from webhook_events) <> 0 then raise exception 'LEAK: owner reads webhook_events (service-only)'; end if;
  insert into ops_tasks (title, category, created_by) values ('owner-write','operations','remi');
end $$;

-- ════ Staff: finance read-only; ops read + write ═════════════════════════
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';

do $$ begin
  if (select count(*) from fin_transactions) = 0 then raise exception 'staff cannot read fin_transactions'; end if;
  insert into ops_tasks (title, category, created_by) values ('staff-write','operations','shannon');
end $$;

do $$ begin
  insert into fin_transactions (txn_date, description, amount, dedup_hash)
    values ('2026-01-02','staff-write',50,'leak-test-h2');
  raise exception 'LEAK: staff wrote to fin_transactions (finance is read-only for staff)';
exception when insufficient_privilege then null; -- expected: RLS denial
end $$;

-- ════ Stranger (session, no membership): sees and writes nothing ═════════
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';

do $$ begin
  if (select count(*) from ops_tasks) <> 0 then raise exception 'LEAK: non-member reads ops_tasks'; end if;
  if (select count(*) from donations) <> 0 then raise exception 'LEAK: non-member reads donations'; end if;
  if (select count(*) from fin_transactions) <> 0 then raise exception 'LEAK: non-member reads fin_transactions'; end if;
  if (select count(*) from hs_contacts) <> 0 then raise exception 'LEAK: non-member reads hs_contacts'; end if;
  if (select count(*) from constituents) <> 0 then raise exception 'LEAK: non-member reads constituents'; end if;
  if (select count(*) from gifts) <> 0 then raise exception 'LEAK: non-member reads gifts'; end if;
  if (select count(*) from page_views) <> 0 then raise exception 'LEAK: non-member reads page_views'; end if;
end $$;

do $$ begin
  insert into ops_tasks (title, category, created_by) values ('stranger-write','operations','remi');
  raise exception 'LEAK: non-member wrote to ops_tasks';
exception when insufficient_privilege then null; -- expected: RLS denial
end $$;

-- ════ Anon: only active meeting types ════════════════════════════════════
reset role;
reset request.jwt.claim.sub;
set role anon;

do $$ begin
  if (select count(*) from meeting_types where is_active) = 0 then
    raise exception 'anon cannot read active meeting_types (/meet pages would break)';
  end if;
  if (select count(*) from meeting_types where not is_active) <> 0 then
    raise exception 'LEAK: anon reads inactive meeting_types';
  end if;
  if (select count(*) from donations) <> 0 then raise exception 'LEAK: anon reads donations'; end if;
  if (select count(*) from quiz_submissions) <> 0 then raise exception 'LEAK: anon reads quiz_submissions'; end if;
  if (select count(*) from constituents) <> 0 then raise exception 'LEAK: anon reads constituents'; end if;
  if (select count(*) from gifts) <> 0 then raise exception 'LEAK: anon reads gifts'; end if;
  if (select count(*) from page_views) <> 0 then raise exception 'LEAK: anon reads page_views'; end if;
end $$;

-- ════ Cross-org isolation (Fundraising v2 Phase 0A) ══════════════════════
-- A second throwaway org with its own member must never read or write any
-- Ambition Angels fundraising row, and the AA owner must stay fully able to.
-- This is the Phase 0A definition of done.
reset role;
reset request.jwt.claim.sub;

-- Second org + its owner (not allowlisted / no domain rule → membership is
-- granted explicitly here, the same way a real second tenant would be set up).
insert into orgs (name, slug) values ('Tenant Two', 'tenant-two')
on conflict (slug) do nothing;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000004','owner@tenant-two.test')
on conflict do nothing;
insert into memberships (user_id, org_id, role)
select '00000000-0000-0000-0000-000000000004', id, 'owner'
from orgs where slug = 'tenant-two'
on conflict do nothing;

-- Seed one AA fundraising row to probe against, plus one tenant-two row so we
-- can prove the t2 user sees its OWN data (isolation, not a blanket denial).
-- Service role, like ingestion/system paths.
do $$
declare aa uuid; t2 uuid; aac uuid; t2c uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  select id into t2 from orgs where slug = 'tenant-two';

  insert into constituents (org_id, type, first_name, last_name, emails, source)
  values (aa, 'person', 'Cross', 'Org', array['xorg-aa@example.org'], 'manual')
  returning id into aac;
  insert into gifts (org_id, constituent_id, amount, gift_date, method, external_source, external_id)
  values (aa, aac, 500, '2026-02-02', 'card', 'leak-test', 'leak-test-xorg-gift');

  insert into constituents (org_id, type, first_name, last_name, emails, source)
  values (t2, 'person', 'Tenant', 'Two', array['xorg-t2@example.org'], 'manual')
  returning id into t2c;
  insert into gifts (org_id, constituent_id, amount, gift_date, method, external_source, external_id)
  values (t2, t2c, 25, '2026-02-03', 'card', 'leak-test', 'leak-test-t2-gift');

  -- One AI-call ledger row per org, to prove ai_calls is tenant-isolated.
  insert into ai_calls (org_id, surface, model_used, tokens_input, tokens_output, cost_usd)
  values (aa, 'reed', 'claude-sonnet-4-6', 100, 50, 0.01);
  insert into ai_calls (org_id, surface, model_used, tokens_input, tokens_output, cost_usd)
  values (t2, 'reed', 'claude-sonnet-4-6', 100, 50, 0.01);
end $$;

-- ── Tenant-two owner: zero AA rows, full access to its own ───────────────
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';

do $$
declare aa uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';

  -- Reads of AA fundraising rows across the spine + mirror: all zero.
  if (select count(*) from constituents where org_id = aa) <> 0 then raise exception 'LEAK: tenant-two reads AA constituents'; end if;
  if (select count(*) from gifts        where org_id = aa) <> 0 then raise exception 'LEAK: tenant-two reads AA gifts'; end if;
  if (select count(*) from opportunities where org_id = aa) <> 0 then raise exception 'LEAK: tenant-two reads AA opportunities'; end if;
  if (select count(*) from grants       where org_id = aa) <> 0 then raise exception 'LEAK: tenant-two reads AA grants'; end if;
  if (select count(*) from interactions where org_id = aa) <> 0 then raise exception 'LEAK: tenant-two reads AA interactions'; end if;
  if (select count(*) from segments     where org_id = aa) <> 0 then raise exception 'LEAK: tenant-two reads AA segments'; end if;
  if (select count(*) from hs_contacts  where org_id = aa) <> 0 then raise exception 'LEAK: tenant-two reads AA hs_contacts (staging)'; end if;
  if (select count(*) from ai_calls     where org_id = aa) <> 0 then raise exception 'LEAK: tenant-two reads AA ai_calls (spend ledger)'; end if;

  -- But it DOES see its own org's rows (proves isolation, not lockout).
  if (select count(*) from constituents) = 0 then raise exception 'tenant-two owner cannot read its OWN constituents'; end if;
  if (select count(*) from gifts) = 0 then raise exception 'tenant-two owner cannot read its OWN gifts'; end if;
  if (select count(*) from ai_calls) = 0 then raise exception 'tenant-two owner cannot read its OWN ai_calls'; end if;
  if (select count(*) from gifts where external_id = 'leak-test-t2-gift') = 0 then
    raise exception 'tenant-two owner cannot read its own seeded gift';
  end if;
end $$;

-- Writes into its OWN org succeed.
do $$
declare t2 uuid;
begin
  select id into t2 from public.orgs where slug = 'tenant-two';
  insert into constituents (org_id, type, first_name, source)
    values (t2, 'person', 'T2Write', 'manual');
end $$;

-- Insert that would land in the AA org is denied by the WITH CHECK policy.
do $$
declare aa uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  insert into constituents (org_id, type, first_name, source)
    values (aa, 'person', 'Hacker', 'manual');
  raise exception 'LEAK: tenant-two inserted a constituent into the AA org';
exception when insufficient_privilege then null; -- expected: RLS WITH CHECK denial
end $$;

-- Insert relying on the org_id DEFAULT (the AA resident org) is likewise
-- denied — the default cannot be used to smuggle a row into another tenant.
do $$ begin
  insert into gifts (constituent_id, amount, gift_date, method, external_source, external_id)
    values (null, 10, '2026-02-04', 'card', 'leak-test', 'leak-test-default-smuggle');
  raise exception 'LEAK: tenant-two inserted a gift into AA via the org_id default';
exception when insufficient_privilege then null; -- expected: RLS WITH CHECK denial
end $$;

-- Update of an AA gift affects zero rows (the row is invisible under RLS).
do $$
declare n int;
begin
  with upd as (
    update gifts set amount = 1 where external_id = 'leak-test-xorg-gift' returning 1
  )
  select count(*) into n from upd;
  if n <> 0 then raise exception 'LEAK: tenant-two updated an AA gift (% row(s))', n; end if;
end $$;

-- ── AA owner: still fully able to read and write its own rows ─────────────
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

do $$
declare aa uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';

  -- Sees the seeded AA constituent + gift; never tenant-two's.
  if (select count(*) from constituents where emails @> array['xorg-aa@example.org']) = 0 then
    raise exception 'AA owner cannot read its own seeded constituent';
  end if;
  if (select count(*) from gifts where external_id = 'leak-test-xorg-gift') = 0 then
    raise exception 'AA owner cannot read its own seeded gift';
  end if;
  if (select count(*) from constituents where emails @> array['xorg-t2@example.org']) <> 0 then
    raise exception 'LEAK: AA owner reads tenant-two constituent';
  end if;
  if (select count(*) from gifts where external_id = 'leak-test-t2-gift') <> 0 then
    raise exception 'LEAK: AA owner reads tenant-two gift';
  end if;

  -- And can still write its own row (the operator is not locked out).
  update gifts set notes = 'aa-owner-write' where external_id = 'leak-test-xorg-gift';
  if (select notes from gifts where external_id = 'leak-test-xorg-gift') is distinct from 'aa-owner-write' then
    raise exception 'AA owner write to its own gift did not take';
  end if;
end $$;

-- ════ Operating Spine: v_action_items + entity_types ═════════════════════
-- The unified action queue is a security_invoker view over five RLS-gated
-- sources; if the invoker option were ever dropped it would run as owner and
-- merge tenants. These checks fail loudly in that world.
reset role;
reset request.jwt.claim.sub;

-- Seed one open tenant-two action item (a pending-ack gift) as service role.
do $$
declare t2 uuid; t2c uuid;
begin
  select id into t2 from orgs where slug = 'tenant-two';
  select id into t2c from constituents where org_id = t2 limit 1;
  insert into gifts (org_id, constituent_id, amount, gift_date, method, external_source, external_id, acknowledgment_status)
  values (t2, t2c, 75, '2026-02-05', 'card', 'leak-test', 'leak-test-t2-action', 'pending')
  on conflict do nothing;
end $$;

-- The view itself must run as invoker; a definer view here merges tenants.
do $$ begin
  if (select coalesce(array_position(reloptions, 'security_invoker=on'), 0)
      from pg_class where relname = 'v_action_items' and relnamespace = 'public'::regnamespace) = 0 then
    raise exception 'v_action_items is not security_invoker — tenants would merge';
  end if;
end $$;

set role authenticated;

-- AA owner: sees AA's open items (the seeded ops task), nothing of tenant-two's.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$
declare t2 uuid;
begin
  select id into t2 from public.orgs where slug = 'tenant-two';
  if (select count(*) from v_action_items where source = 'ops_task') = 0 then
    raise exception 'AA owner cannot read AA ops tasks through v_action_items';
  end if;
  if (select count(*) from v_action_items where org_id = t2) <> 0 then
    raise exception 'LEAK: AA owner reads tenant-two action items';
  end if;
  -- Registry is global config: readable by any authenticated member.
  if (select count(*) from entity_types) < 10 then
    raise exception 'authenticated member cannot read the entity_types registry';
  end if;
end $$;

-- Tenant-two owner: sees only its own action items, zero AA rows.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$
declare aa uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  if (select count(*) from v_action_items where org_id = aa) <> 0 then
    raise exception 'LEAK: tenant-two reads AA action items through v_action_items';
  end if;
  if (select count(*) from v_action_items) = 0 then
    raise exception 'tenant-two owner cannot read its OWN action items';
  end if;
end $$;

-- Registry writes are denied for every authenticated user (service-role only).
do $$ begin
  insert into entity_types (entity_type, display_name, module, route_pattern)
  values ('leak-test-type', 'Leak', 'ops', '/admin/ops');
  raise exception 'LEAK: authenticated user wrote to the entity_types registry';
exception when insufficient_privilege then null; -- expected: RLS denial
end $$;

-- user_org_state is self-only and membership-bound: no org_id default, so a
-- row can never silently land in the resident org (the ops_tasks default trap).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$
declare aa uuid; t2 uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  select id into t2 from public.orgs where slug = 'tenant-two';

  -- Own row in own org: fine.
  insert into user_org_state (user_id, org_id, last_seen_at)
  values ('00000000-0000-0000-0000-000000000001', aa, now())
  on conflict (user_id, org_id) do update set last_seen_at = now();

  -- Parking state in an org you don't belong to: denied.
  begin
    insert into user_org_state (user_id, org_id, last_seen_at)
    values ('00000000-0000-0000-0000-000000000001', t2, now());
    raise exception 'LEAK: AA owner wrote user_org_state into tenant-two';
  exception when insufficient_privilege then null; -- expected
  end;

  -- Writing another user's state: denied.
  begin
    insert into user_org_state (user_id, org_id, last_seen_at)
    values ('00000000-0000-0000-0000-000000000002', aa, now());
    raise exception 'LEAK: AA owner wrote another user''s user_org_state';
  exception when insufficient_privilege then null; -- expected
  end;
end $$;

-- Stranger (session, no membership): the queue is empty, not an error, and
-- user_org_state rejects the write (no membership anywhere).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  if (select count(*) from v_action_items) <> 0 then
    raise exception 'LEAK: non-member reads action items';
  end if;
end $$;
do $$
declare aa uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  insert into user_org_state (user_id, org_id, last_seen_at)
  values ('00000000-0000-0000-0000-000000000003', aa, now());
  raise exception 'LEAK: non-member wrote user_org_state';
exception when insufficient_privilege then null; -- expected
end $$;

-- ════ Documents: org isolation, role gates, board link-scoping ═══════════
reset role;
reset request.jwt.claim.sub;

-- A board_viewer principal (no documents.* permission by design).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000005','boardie@example.org')
on conflict do nothing;
insert into memberships (user_id, org_id, role)
select '00000000-0000-0000-0000-000000000005', id, 'board_viewer'
from orgs where slug = 'ambition-angels'
on conflict do nothing;

-- Seed (service role): one plain AA document, one AA document linked to a
-- board meeting, one restricted AA document, one tenant-two document.
do $$
declare aa uuid; t2 uuid; mtg uuid; boarddoc uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  select id into t2 from orgs where slug = 'tenant-two';

  insert into documents (org_id, storage_path, filename, title)
  values (aa, aa || '/d1/plain.pdf', 'plain.pdf', 'leak-test-plain');

  insert into documents (org_id, storage_path, filename, title, expires_at)
  values (aa, aa || '/d2/policy.pdf', 'policy.pdf', 'leak-test-expiring', current_date + 10);

  insert into documents (org_id, storage_path, filename, title, visibility)
  values (aa, aa || '/d3/hr.pdf', 'hr.pdf', 'leak-test-restricted', 'restricted');

  insert into board_meetings (org_id, meeting_date, title)
  values (aa, current_date, 'leak-test-meeting')
  returning id into mtg;
  insert into documents (org_id, storage_path, filename, title)
  values (aa, aa || '/d4/packet.pdf', 'packet.pdf', 'leak-test-packet')
  returning id into boarddoc;
  insert into document_links (org_id, document_id, entity_type, entity_id)
  values (aa, boarddoc, 'board_meeting', mtg);

  insert into documents (org_id, storage_path, filename, title)
  values (t2, t2 || '/d5/t2.pdf', 't2.pdf', 'leak-test-t2-doc');
end $$;

set role authenticated;

-- AA owner: all four AA documents (documents.admin covers restricted), no
-- tenant-two rows, and expiring docs surface in the unified queue.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from documents where title like 'leak-test%') <> 4 then
    raise exception 'AA owner should see 4 AA documents, saw %',
      (select count(*) from documents where title like 'leak-test%');
  end if;
  if (select count(*) from documents where title = 'leak-test-t2-doc') <> 0 then
    raise exception 'LEAK: AA owner reads tenant-two document';
  end if;
  if (select count(*) from v_action_items where source = 'document_renewal') = 0 then
    raise exception 'expiring document did not surface as a renewal in v_action_items';
  end if;
end $$;

-- AA owner cannot park a link row in tenant-two (WITH CHECK on org_id).
do $$
declare t2 uuid; d uuid;
begin
  select id into t2 from public.orgs where slug = 'tenant-two';
  select id into d from public.documents where title = 'leak-test-plain';
  insert into document_links (org_id, document_id, entity_type, entity_id)
  values (t2, d, 'constituent', gen_random_uuid());
  raise exception 'LEAK: AA owner wrote a document_link into tenant-two';
exception when insufficient_privilege then null; -- expected
end $$;

-- Staff: reads org docs but NOT restricted ones; delete denied (no
-- documents.delete for staff).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ begin
  if (select count(*) from documents where title = 'leak-test-plain') = 0 then
    raise exception 'staff cannot read org documents';
  end if;
  if (select count(*) from documents where title = 'leak-test-restricted') <> 0 then
    raise exception 'LEAK: staff reads a restricted document';
  end if;
end $$;
do $$
declare n int;
begin
  with del as (
    delete from documents where title = 'leak-test-plain' returning 1
  )
  select count(*) into n from del;
  if n <> 0 then raise exception 'LEAK: staff deleted a document (documents.delete is owner/admin)'; end if;
end $$;

-- board_viewer: exactly the board-linked packet, nothing else — link-scoped
-- access by construction, no blanket documents.read.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
do $$ begin
  if (select count(*) from documents where title like 'leak-test%') <> 1 then
    raise exception 'board_viewer should see exactly the board packet, saw %',
      (select count(*) from documents where title like 'leak-test%');
  end if;
  if (select count(*) from documents where title = 'leak-test-packet') <> 1 then
    raise exception 'board_viewer cannot read the board packet through the link carve-out';
  end if;
end $$;

-- Tenant-two owner: only its own document, none of AA's (incl. the packet).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$ begin
  if (select count(*) from documents where title like 'leak-test%') <> 1
     or (select count(*) from documents where title = 'leak-test-t2-doc') <> 1 then
    raise exception 'LEAK: tenant-two document visibility is wrong';
  end if;
end $$;

-- Stranger: nothing.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  if (select count(*) from documents) <> 0 then
    raise exception 'LEAK: non-member reads documents';
  end if;
end $$;

-- ════ Metric Catalog: org isolation, board read, stale-arm scoping ═══════
reset role;
reset request.jwt.claim.sub;

-- Seed (service role): one owned AA metric and one owned tenant-two metric,
-- both with no snapshot — so both are stale and BOTH orgs' queue arms fire,
-- proving the arm separates tenants rather than merely being empty.
do $$
declare aa uuid; t2 uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  select id into t2 from orgs where slug = 'tenant-two';

  insert into profiles (user_id, display_name) values
    ('00000000-0000-0000-0000-000000000001', 'Remi'),
    ('00000000-0000-0000-0000-000000000004', 'T2 Owner')
  on conflict (user_id) do nothing;

  insert into metric_definitions (org_id, metric_key, name, cadence, owner_id)
  values (aa, 'leak_test_metric', 'leak-test-aa-metric', 'monthly',
          '00000000-0000-0000-0000-000000000001')
  on conflict (org_id, metric_key) do nothing;

  insert into metric_definitions (org_id, metric_key, name, cadence, owner_id)
  values (t2, 'leak_test_metric', 'leak-test-t2-metric', 'monthly',
          '00000000-0000-0000-0000-000000000004')
  on conflict (org_id, metric_key) do nothing;
end $$;

set role authenticated;

-- AA owner: own metric + its stale queue item, nothing of tenant-two's.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$
declare t2 uuid;
begin
  select id into t2 from public.orgs where slug = 'tenant-two';
  if (select count(*) from metric_definitions where name = 'leak-test-aa-metric') <> 1 then
    raise exception 'AA owner cannot read its own metric definition';
  end if;
  if (select count(*) from metric_definitions where org_id = t2) <> 0 then
    raise exception 'LEAK: AA owner reads tenant-two metric definitions';
  end if;
  if (select count(*) from v_action_items where source = 'metric_stale' and title like '%leak-test-aa-metric%') = 0 then
    raise exception 'owned metric with no snapshot did not surface as metric_stale';
  end if;
  if (select count(*) from v_action_items where source = 'metric_stale' and org_id = t2) <> 0 then
    raise exception 'LEAK: AA owner sees tenant-two stale metrics in the queue';
  end if;
  -- Writing a snapshot clears the stale item on next read (freshness is derived).
  insert into metric_snapshots (org_id, metric_id, captured_on, value)
  select org_id, id, current_date, 42 from metric_definitions where name = 'leak-test-aa-metric';
  if (select count(*) from v_action_items where source = 'metric_stale' and title like '%leak-test-aa-metric%') <> 0 then
    raise exception 'metric_stale item did not clear after a fresh snapshot';
  end if;
end $$;

-- board_viewer: reads the catalog (open decision D) but cannot write it.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
do $$ begin
  if (select count(*) from metric_definitions where name = 'leak-test-aa-metric') <> 1 then
    raise exception 'board_viewer cannot read the metric catalog (metrics.read seed missing)';
  end if;
end $$;
do $$
declare aa uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  insert into metric_definitions (org_id, metric_key, name)
  values (aa, 'leak_test_board_write', 'board-write');
  raise exception 'LEAK: board_viewer wrote a metric definition';
exception when insufficient_privilege then null; -- expected
end $$;

-- Tenant-two owner: only its own metric and its own stale item.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$
declare aa uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  if (select count(*) from metric_definitions where org_id = aa) <> 0 then
    raise exception 'LEAK: tenant-two reads AA metric definitions';
  end if;
  if (select count(*) from v_action_items where source = 'metric_stale' and title like '%leak-test-t2-metric%') = 0 then
    raise exception 'tenant-two owner cannot see its OWN stale metric';
  end if;
end $$;

-- Stranger: nothing.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  if (select count(*) from metric_definitions) <> 0 then
    raise exception 'LEAK: non-member reads metric definitions';
  end if;
end $$;

-- ════ Program spine: programs / stages / queue-arm isolation ══════════════
reset role;
reset request.jwt.claim.sub;

-- Seed (service role): a program, a stage row, and a pending application per
-- org. org_id is EXPLICIT everywhere — the eight program tables have no
-- column default anymore (the migration would fail these inserts otherwise).
do $$
declare aa uuid; t2 uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  select id into t2 from orgs where slug = 'tenant-two';

  insert into programs (org_id, name) values (aa, 'leak-test-aa-program')
  on conflict (org_id, name) do nothing;
  insert into programs (org_id, name) values (t2, 'leak-test-t2-program')
  on conflict (org_id, name) do nothing;

  insert into participant_stages (org_id, stage_key, label, sort_order, engaged)
  values (aa, 'leak_test_stage', 'Leak Test', 99, true)
  on conflict (org_id, stage_key) do nothing;

  insert into applications (org_id, first_name, last_name, status)
  values (aa, 'Leaky', 'Applicant', 'new');
  insert into applications (org_id, first_name, last_name, status)
  values (t2, 'Tenant', 'Applicant', 'offered');
end $$;

set role authenticated;

-- AA owner: own program rows + the pending-application queue item; nothing
-- of tenant-two's through any surface.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$
declare t2 uuid;
begin
  select id into t2 from public.orgs where slug = 'tenant-two';
  if (select count(*) from programs where name = 'leak-test-aa-program') <> 1 then
    raise exception 'AA owner cannot read its own program';
  end if;
  if (select count(*) from programs where org_id = t2) <> 0 then
    raise exception 'LEAK: AA owner reads tenant-two programs';
  end if;
  if (select count(*) from participant_stages where stage_key = 'leak_test_stage') <> 1 then
    raise exception 'AA owner cannot read its own participant stages';
  end if;
  if (select count(*) from v_action_items where source = 'application_pending' and title like '%Leaky%') = 0 then
    raise exception 'pending application did not surface in the queue';
  end if;
  if (select count(*) from v_action_items where source = 'application_pending' and org_id = t2) <> 0 then
    raise exception 'LEAK: AA owner sees tenant-two applications in the queue';
  end if;
end $$;

-- Tenant-two owner: its own pending application only.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$
declare aa uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  if (select count(*) from programs where org_id = aa) <> 0 then
    raise exception 'LEAK: tenant-two reads AA programs';
  end if;
  if (select count(*) from v_action_items where source = 'application_pending' and title like '%Tenant Applicant%') = 0 then
    raise exception 'tenant-two owner cannot see its OWN pending application';
  end if;
  if (select count(*) from v_action_items where source = 'application_pending' and org_id = aa) <> 0 then
    raise exception 'LEAK: tenant-two sees AA applications in the queue';
  end if;
end $$;

-- Stranger: nothing.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  if (select count(*) from programs) <> 0 then
    raise exception 'LEAK: non-member reads programs';
  end if;
  if (select count(*) from participant_stages) <> 0 then
    raise exception 'LEAK: non-member reads participant stages';
  end if;
end $$;

-- ════ Owner promotion: text → uuid sync + queue owner_id ═════════════════
-- The sync trigger must map a free-text assignee to a same-org profile, an
-- explicit uuid write must win, and v_action_items must expose the uuid so
-- the queue's "Mine" filter is an exact match.
reset role;
reset request.jwt.claim.sub;

do $$
declare aa uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  insert into profiles (user_id, display_name)
  values ('00000000-0000-0000-0000-000000000002', 'Shannon')
  on conflict (user_id) do nothing;
  -- assigned_to is CHECK-constrained to lowercase names; the trigger's
  -- case-insensitive match against display_name 'Remi' is what's under test.
  insert into ops_tasks (org_id, title, category, created_by, assigned_to)
  values (aa, 'owner-promo-test', 'operations', 'remi', 'remi');
  -- Explicit uuid write wins over the text heuristic (future UI path).
  insert into ops_tasks (org_id, title, category, created_by, assigned_to, assigned_to_id)
  values (aa, 'owner-promo-explicit', 'operations', 'remi', 'remi',
          '00000000-0000-0000-0000-000000000002');
end $$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  if (select assigned_to_id from ops_tasks where title = 'owner-promo-test')
     is distinct from '00000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'sync trigger did not map text assignee ''Remi'' to the profile uuid';
  end if;
  if (select assigned_to_id from ops_tasks where title = 'owner-promo-explicit')
     is distinct from '00000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'explicit assigned_to_id write was overridden by the sync trigger';
  end if;
  if (select owner_id from v_action_items where source = 'ops_task' and title = 'owner-promo-test')
     is distinct from '00000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'v_action_items does not expose the promoted owner uuid';
  end if;
end $$;

reset role;
reset request.jwt.claim.sub;

-- ════ /ms career library (create_ms_career_library.sql) ══════════════════
-- Access model under test (specs/ms-decisions-after-recon.md D8):
--   - base tables are service-path only for EVERY non-service role — even
--     the owner reads them through admin routes, not the session client;
--   - anon reads ms_catalog and sees approved cards only, with no title,
--     no title_variants, and no clue_8 (the answer never reaches the
--     client before the reveal route).

-- Seed as service role: one approved card, one draft.
insert into ms_occupations (soc_code, title, title_variants, riasec, job_zone,
                            pay_median, pay_p90, pay_source_url, pay_as_of)
values
  ('29-2055', 'Surgical Technologists', array['Surgical Tech'],
   '{"R":5.0,"I":3.0,"A":1.0,"S":4.0,"E":1.5,"C":4.5}'::jsonb, 3,
   62830, 90700, 'https://www.bls.gov/oes/current/oes292055.htm', 'May 2024'),
  ('15-1255', 'Web and Digital Interface Designers', array['UX Researcher'],
   '{"R":1.0,"I":4.5,"A":4.0,"S":2.0,"E":2.5,"C":3.0}'::jsonb, 4,
   98090, 176490, 'https://www.bls.gov/oes/current/oes151255.htm', 'May 2024')
on conflict (soc_code) do nothing;

insert into ms_cards (soc_code, field, day_vignette,
                      clue_1, clue_2, clue_3, clue_4, clue_5, clue_6, clue_7, clue_8,
                      status, reviewed_by, reviewed_at)
values
  ('29-2055', 'health', 'leak-test day', 'c1','c2','c3','c4','c5','c6','c7',
   'leak-test clue 8: the count is the last word',
   'approved', 'remi@ambitionangels.org', now()),
  ('15-1255', 'tech', 'leak-test draft day', 'c1','c2','c3','c4','c5','c6','c7','c8',
   'draft', null, null)
on conflict (soc_code) do nothing;

-- The approved-requires-review constraint holds even for the service role.
do $$ begin
  update ms_cards set status = 'approved' where soc_code = '15-1255';
  raise exception 'ms_cards accepted approved without reviewed_by (constraint missing)';
exception when check_violation then null; -- expected
end $$;

-- Anon: catalog only, approved only, no answer columns.
set role anon;
do $$
declare
  cols text;
begin
  if (select count(*) from ms_catalog) <> 1 then
    raise exception 'anon does not see exactly the approved card in ms_catalog';
  end if;
  if (select count(*) from ms_catalog where soc_code = '15-1255') <> 0 then
    raise exception 'LEAK: anon sees a draft card in ms_catalog';
  end if;
  select string_agg(column_name, ',') into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'ms_catalog'
    and column_name in ('title', 'title_variants', 'clue_8');
  if cols is not null then
    raise exception 'LEAK: ms_catalog exposes answer column(s): %', cols;
  end if;
end $$;

do $$ begin
  perform count(*) from ms_cards;
  raise exception 'LEAK: anon reads ms_cards directly';
exception when insufficient_privilege then null; -- expected: grants revoked
end $$;
do $$ begin
  perform count(*) from ms_occupations;
  raise exception 'LEAK: anon reads ms_occupations directly';
exception when insufficient_privilege then null; -- expected: grants revoked
end $$;

-- Owner session: same story — base tables are service-path only.
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  perform count(*) from ms_cards;
  raise exception 'LEAK: owner session reads ms_cards directly (service-path only)';
exception when insufficient_privilege then null; -- expected
end $$;
do $$ begin
  perform count(*) from ms_occupations;
  raise exception 'LEAK: owner session reads ms_occupations directly (service-path only)';
exception when insufficient_privilege then null; -- expected
end $$;

-- Sessions (create_ms_sessions.sql): a kid's trait profile and results are
-- reachable only through the service-role route handlers — no client role
-- reads them, ever.
reset role;
reset request.jwt.claim.sub;
insert into ms_sessions (claim_code, trait_scores, ranked_careers)
values ('LEAKT1', '{"build":1}'::jsonb, '[]'::jsonb)
on conflict (claim_code) do nothing;

-- Explored rows (create_ms_explored.sql) get the same treatment.
insert into ms_explored (session_id, soc_code, clues_used)
select s.id, '29-2055', 4 from ms_sessions s where s.claim_code = 'LEAKT1'
on conflict do nothing;

set role anon;
do $$ begin
  perform count(*) from ms_sessions;
  raise exception 'LEAK: anon reads ms_sessions directly';
exception when insufficient_privilege then null; -- expected
end $$;
do $$ begin
  perform count(*) from ms_explored;
  raise exception 'LEAK: anon reads ms_explored directly';
exception when insufficient_privilege then null; -- expected
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  perform count(*) from ms_sessions;
  raise exception 'LEAK: owner session reads ms_sessions directly (service-path only)';
exception when insufficient_privilege then null; -- expected
end $$;
do $$ begin
  perform count(*) from ms_explored;
  raise exception 'LEAK: owner session reads ms_explored directly (service-path only)';
exception when insufficient_privilege then null; -- expected
end $$;

reset role;
reset request.jwt.claim.sub;

select 'RLS leak test: ALL CHECKS PASSED' as result;
