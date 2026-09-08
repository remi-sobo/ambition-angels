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
-- org-explicit: donations no longer carries an org_id default
-- (drop_donations_org_id_default.sql), matching the app's write paths.
insert into donations (org_id, amount, stripe_payment_id)
  select id, 10, 'leak-test-pi' from public.orgs where slug = 'ambition-angels';
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

-- ════ Grant contacts: org isolation + single-primary/no-dup constraints ══
-- grant_contacts (create_grant_contacts.sql) joins people constituents onto
-- grants. Same fundraising.* policies as grants — so the same access matrix
-- must hold — plus the two unique indexes (one primary per grant, one link
-- per person) that the data layer leans on.
reset role;
reset request.jwt.claim.sub;

-- Seed as service role: one grant (funder is required) + one attached person
-- per org.
do $$
declare aa uuid; t2 uuid; aac uuid; t2c uuid; aag uuid; t2g uuid; aac2 uuid;
        aaf uuid; t2f uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  select id into t2 from orgs where slug = 'tenant-two';

  insert into constituents (org_id, type, org_name, source)
  values (aa, 'organization', 'leak-test-aa-funder', 'manual')
  returning id into aaf;
  insert into constituents (org_id, type, org_name, source)
  values (t2, 'organization', 'leak-test-t2-funder', 'manual')
  returning id into t2f;

  insert into constituents (org_id, type, first_name, last_name, emails, source)
  values (aa, 'person', 'Grant', 'Contact', array['gc-aa@example.org'], 'manual')
  returning id into aac;
  insert into constituents (org_id, type, first_name, last_name, emails, source)
  values (aa, 'person', 'Second', 'Contact', array['gc-aa-2@example.org'], 'manual')
  returning id into aac2;
  insert into constituents (org_id, type, first_name, last_name, emails, source)
  values (t2, 'person', 'Tenant', 'Contact', array['gc-t2@example.org'], 'manual')
  returning id into t2c;

  insert into grants (org_id, funder_id, name) values (aa, aaf, 'leak-test-aa-grant')
  returning id into aag;
  insert into grants (org_id, funder_id, name) values (t2, t2f, 'leak-test-t2-grant')
  returning id into t2g;

  insert into grant_contacts (org_id, grant_id, constituent_id, role, is_primary)
  values (aa, aag, aac, 'program_officer', true);
  insert into grant_contacts (org_id, grant_id, constituent_id, role, is_primary)
  values (t2, t2g, t2c, 'intro_source', true);

  -- Duplicate link (same grant, same person): rejected even for service role.
  begin
    insert into grant_contacts (org_id, grant_id, constituent_id, role)
    values (aa, aag, aac, 'other');
    raise exception 'grant_contacts accepted a duplicate (grant, constituent) link';
  exception when unique_violation then null; -- expected
  end;

  -- Second primary on the same grant: rejected (partial unique index).
  begin
    insert into grant_contacts (org_id, grant_id, constituent_id, role, is_primary)
    values (aa, aag, aac2, 'finance_reporting', true);
    raise exception 'grant_contacts accepted a second primary contact on one grant';
  exception when unique_violation then null; -- expected
  end;

  -- A second non-primary contact is fine.
  insert into grant_contacts (org_id, grant_id, constituent_id, role)
  values (aa, aag, aac2, 'finance_reporting');
end $$;

set role authenticated;

-- AA owner: reads its own grant contacts, none of tenant-two's.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$
declare t2 uuid;
begin
  select id into t2 from public.orgs where slug = 'tenant-two';
  if (select count(*) from grant_contacts
      where grant_id = (select id from grants where name = 'leak-test-aa-grant')) <> 2 then
    raise exception 'AA owner cannot read its own grant contacts';
  end if;
  if (select count(*) from grant_contacts where org_id = t2) <> 0 then
    raise exception 'LEAK: AA owner reads tenant-two grant contacts';
  end if;
end $$;

-- Tenant-two owner: only its own; a write into the AA org is denied.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$
declare aa uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  if (select count(*) from grant_contacts where org_id = aa) <> 0 then
    raise exception 'LEAK: tenant-two reads AA grant contacts';
  end if;
  if (select count(*) from grant_contacts) = 0 then
    raise exception 'tenant-two owner cannot read its OWN grant contacts';
  end if;
end $$;
do $$
declare aa uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  -- The AA grant/constituent ids are invisible to this session, so the probe
  -- uses freshly minted uuids: WITH CHECK on org_id must reject it first.
  insert into grant_contacts (org_id, grant_id, constituent_id, role)
  values (aa, gen_random_uuid(), gen_random_uuid(), 'other');
  raise exception 'LEAK: tenant-two inserted a grant contact into the AA org';
exception
  when insufficient_privilege then null; -- expected: RLS WITH CHECK denial
end $$;

-- Stranger (session, no membership): nothing.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  if (select count(*) from grant_contacts) <> 0 then
    raise exception 'LEAK: non-member reads grant_contacts';
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

  -- Participant custom-field registry (spec #4 D1): one def per org.
  insert into custom_field_defs (org_id, entity_type, key, label, field_type)
  values (aa, 'student', 'leak_cf', 'Leak CF', 'text')
  on conflict (org_id, entity_type, key) do nothing;
  insert into custom_field_defs (org_id, entity_type, key, label, field_type)
  values (t2, 'student', 'leak_cf', 'Leak CF', 'text')
  on conflict (org_id, entity_type, key) do nothing;

  -- Import layer (spec #5 E1): one run + one staged row + one ledger entry
  -- per org. Participant imports ride program.* permissions.
  insert into imports (org_id, entity_type, source, filename)
  values (aa, 'student', 'csv', 'leak-aa.csv');
  insert into imports (org_id, entity_type, source, filename)
  values (t2, 'student', 'csv', 'leak-t2.csv');
  insert into import_rows (org_id, import_id, row_num, raw)
  select org_id, id, 1, '{"first_name":"Leak"}'::jsonb
  from imports where filename in ('leak-aa.csv', 'leak-t2.csv');
  insert into external_refs (org_id, entity_type, entity_id, source, external_id)
  values (aa, 'student', gen_random_uuid(), 'csv', 'leak-ref')
  on conflict (org_id, entity_type, source, external_id) do nothing;
  insert into external_refs (org_id, entity_type, entity_id, source, external_id)
  values (t2, 'student', gen_random_uuid(), 'csv', 'leak-ref')
  on conflict (org_id, entity_type, source, external_id) do nothing;
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
  if (select count(*) from custom_field_defs) <> 1 then
    raise exception 'AA owner cannot read its own custom field defs (or sees another org''s)';
  end if;
  if (select count(*) from custom_field_defs where org_id = t2) <> 0 then
    raise exception 'LEAK: AA owner reads tenant-two custom field defs';
  end if;
  if (select count(*) from imports where filename = 'leak-aa.csv') <> 1 then
    raise exception 'AA owner cannot read its own import runs';
  end if;
  if (select count(*) from imports where org_id = t2) <> 0 then
    raise exception 'LEAK: AA owner reads tenant-two import runs';
  end if;
  if (select count(*) from import_rows) <> 1 then
    raise exception 'AA owner cannot read its own import rows (or sees another org''s)';
  end if;
  if (select count(*) from import_rows where org_id = t2) <> 0 then
    raise exception 'LEAK: AA owner reads tenant-two import rows';
  end if;
  if (select count(*) from external_refs where external_id = 'leak-ref') <> 1 then
    raise exception 'AA owner cannot read its own external refs (or sees another org''s)';
  end if;
  if (select count(*) from external_refs where org_id = t2) <> 0 then
    raise exception 'LEAK: AA owner reads tenant-two external refs';
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
  if (select count(*) from custom_field_defs where org_id = aa) <> 0 then
    raise exception 'LEAK: tenant-two reads AA custom field defs';
  end if;
  if (select count(*) from imports where org_id = aa) <> 0 then
    raise exception 'LEAK: tenant-two reads AA import runs';
  end if;
  if (select count(*) from import_rows where org_id = aa) <> 0 then
    raise exception 'LEAK: tenant-two reads AA import rows';
  end if;
  if (select count(*) from external_refs where org_id = aa) <> 0 then
    raise exception 'LEAK: tenant-two reads AA external refs';
  end if;
  if (select count(*) from imports where filename = 'leak-t2.csv') <> 1 then
    raise exception 'tenant-two owner cannot read its OWN import runs';
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
  if (select count(*) from custom_field_defs) <> 0 then
    raise exception 'LEAK: non-member reads custom field defs';
  end if;
  if (select count(*) from imports) <> 0 then
    raise exception 'LEAK: non-member reads import runs';
  end if;
  if (select count(*) from import_rows) <> 0 then
    raise exception 'LEAK: non-member reads import rows';
  end if;
  if (select count(*) from external_refs) <> 0 then
    raise exception 'LEAK: non-member reads external refs';
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

-- Explored rows (create_ms_explored.sql) and deliveries
-- (create_ms_deliveries.sql — adult emails live here) get the same treatment.
insert into ms_explored (session_id, soc_code, clues_used)
select s.id, '29-2055', 4 from ms_sessions s where s.claim_code = 'LEAKT1'
on conflict do nothing;
insert into ms_deliveries (session_id, adult_email)
select s.id, 'leak-test-adult@example.com' from ms_sessions s where s.claim_code = 'LEAKT1';

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
do $$ begin
  perform count(*) from ms_deliveries;
  raise exception 'LEAK: anon reads ms_deliveries (adult emails) directly';
exception when insufficient_privilege then null; -- expected
end $$;
do $$ begin
  perform count(*) from ms_rooms;
  raise exception 'LEAK: anon reads ms_rooms (host emails + tokens) directly';
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
do $$ begin
  perform count(*) from ms_deliveries;
  raise exception 'LEAK: owner session reads ms_deliveries directly (service-path only)';
exception when insufficient_privilege then null; -- expected
end $$;
do $$ begin
  perform count(*) from ms_rooms;
  raise exception 'LEAK: owner session reads ms_rooms directly (service-path only)';
exception when insufficient_privilege then null; -- expected
end $$;

reset role;
reset request.jwt.claim.sub;

-- ════ Teen games play pool (create_game_pool.sql) ═════════════════════════
-- Service-path only, same as the ms_ base tables: the games read the pool
-- through /api/games/* route handlers, never from the client. Also prove
-- the eligible-requires-approval constraint holds: no row goes eligible
-- without a reveal line and a human stamp.
insert into game_pool (soc_code) values ('29-2055')
on conflict (soc_code) do nothing;

do $$ begin
  update game_pool set eligible = true where soc_code = '29-2055';
  raise exception 'game_pool accepted eligible without approval (constraint missing)';
exception when check_violation then null; -- expected
end $$;

set role anon;
do $$ begin
  perform count(*) from game_pool;
  raise exception 'LEAK: anon reads game_pool directly';
exception when insufficient_privilege then null; -- expected
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  perform count(*) from game_pool;
  raise exception 'LEAK: owner session reads game_pool directly (service-path only)';
exception when insufficient_privilege then null; -- expected
end $$;

-- ════ The Cut rooms (create_cut_rooms.sql) ════════════════════════════════
-- Room state holds the answer key (the un-cut careers' stats) and the host
-- token; votes are per-phone rows. Service-path only, both roles.
reset role;
reset request.jwt.claim.sub;
insert into cut_rooms (room_code, state) values ('LKT1', '{"careers":[]}'::jsonb)
on conflict (room_code) do nothing;
insert into cut_players (room_id, voter_id)
select id, 'leak-test-voter' from cut_rooms where room_code = 'LKT1'
on conflict do nothing;
insert into cut_votes (room_id, round, voter_id, soc_code)
select id, 0, 'leak-test-voter', '29-2055' from cut_rooms where room_code = 'LKT1'
on conflict do nothing;

set role anon;
do $$ begin
  perform count(*) from cut_rooms;
  raise exception 'LEAK: anon reads cut_rooms (host tokens + answer key) directly';
exception when insufficient_privilege then null; -- expected
end $$;
do $$ begin
  perform count(*) from cut_players;
  raise exception 'LEAK: anon reads cut_players directly';
exception when insufficient_privilege then null; -- expected
end $$;
do $$ begin
  perform count(*) from cut_votes;
  raise exception 'LEAK: anon reads cut_votes directly';
exception when insufficient_privilege then null; -- expected
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  perform count(*) from cut_rooms;
  raise exception 'LEAK: owner session reads cut_rooms directly (service-path only)';
exception when insufficient_privilege then null; -- expected
end $$;
do $$ begin
  perform count(*) from cut_votes;
  raise exception 'LEAK: owner session reads cut_votes directly (service-path only)';
exception when insufficient_privilege then null; -- expected
end $$;

-- ════ Daily calendar (create_game_daily.sql) ══════════════════════════════
-- Tomorrow's scheduled job is a spoiler; service-path only, both roles.
reset role;
reset request.jwt.claim.sub;
insert into game_daily (game, day, soc_code) values ('nhoi', '2099-01-01', '29-2055')
on conflict (game, day) do nothing;

set role anon;
do $$ begin
  perform count(*) from game_daily;
  raise exception 'LEAK: anon reads game_daily (future dailies) directly';
exception when insufficient_privilege then null; -- expected
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  perform count(*) from game_daily;
  raise exception 'LEAK: owner session reads game_daily directly (service-path only)';
exception when insufficient_privilege then null; -- expected
end $$;

reset role;
reset request.jwt.claim.sub;

-- ════ Work blocks: owner / delegate / manager visibility ══════════════════
-- create_work_blocks_and_calendar_prefs.sql. Read = own OR delegated OR you
-- directly manage the owner (staff.reports_to); write = own, always. The
-- staff migrations are excluded from this scratch run (see test-rls.sh), so
-- seed the minimal staff shape private.manages_user() joins against.

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  user_id uuid not null references auth.users(id),
  full_name text not null,
  reports_to uuid references public.staff(id),
  status text not null default 'active',
  unique (org_id, user_id)
);

do $$
declare aa uuid; t2 uuid; remi_staff uuid; remi_blk uuid; shannon_blk uuid;
        t2_blk uuid; task1 uuid; task2 uuid; shannon_ev uuid;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  select id into t2 from orgs where slug = 'tenant-two';

  -- Org chart: shannon reports to remi in AA; t2 owner stands alone.
  insert into public.staff (org_id, user_id, full_name)
  values (aa, '00000000-0000-0000-0000-000000000001', 'Remi')
  on conflict (org_id, user_id) do nothing;
  select id into remi_staff from public.staff
    where org_id = aa and user_id = '00000000-0000-0000-0000-000000000001';
  insert into public.staff (org_id, user_id, full_name, reports_to)
  values (aa, '00000000-0000-0000-0000-000000000002', 'Shannon', remi_staff)
  on conflict (org_id, user_id) do nothing;
  insert into public.staff (org_id, user_id, full_name)
  values (t2, '00000000-0000-0000-0000-000000000004', 'T2 Owner')
  on conflict (org_id, user_id) do nothing;

  -- Delegation between the TEST principals (the migration seed uses the live
  -- uuids): remi grants shannon his calendar, EA-style.
  insert into agenda_delegations (org_id, grantor_user_id, grantee_user_id)
  values (aa, '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')
  on conflict (org_id, grantor_user_id, grantee_user_id) do nothing;

  -- Blocks: one each for remi, shannon, and the t2 owner.
  insert into work_blocks (org_id, owner_user_id, day, start_minute, duration_minute, title)
  values (aa, '00000000-0000-0000-0000-000000000001', '2026-09-07', 540, 90, 'leak-test-remi-block')
  returning id into remi_blk;
  insert into work_blocks (org_id, owner_user_id, day, start_minute, duration_minute, title)
  values (aa, '00000000-0000-0000-0000-000000000002', '2026-09-07', 600, 60, 'leak-test-shannon-block')
  returning id into shannon_blk;
  insert into work_blocks (org_id, owner_user_id, day, start_minute, duration_minute, title)
  values (t2, '00000000-0000-0000-0000-000000000004', '2026-09-07', 540, 60, 'leak-test-t2-block')
  returning id into t2_blk;

  -- Checklist links ride block visibility.
  insert into ops_tasks (org_id, title, category, created_by)
  values (aa, 'leak-test-blocked-task-remi', 'operations', 'remi')
  returning id into task1;
  insert into ops_tasks (org_id, title, category, created_by)
  values (aa, 'leak-test-blocked-task-shannon', 'operations', 'shannon')
  returning id into task2;
  insert into work_block_tasks (org_id, block_id, task_id, position)
  values (aa, remi_blk, task1, 0);
  insert into work_block_tasks (org_id, block_id, task_id, position)
  values (aa, shannon_blk, task2, 0);

  -- A calendar event on shannon's calendar: the manager arm should open it
  -- to remi (previously only a delegation could).
  insert into calendar_events (org_id, owner_user_id, title, start_time, end_time)
  values (aa, '00000000-0000-0000-0000-000000000002', 'leak-test-shannon-event',
          '2026-09-07T17:00:00Z', '2026-09-07T18:00:00Z')
  returning id into shannon_ev;

  -- Prefs rows for remi and the t2 owner.
  insert into calendar_prefs (user_id, org_id) values
    ('00000000-0000-0000-0000-000000000001', aa)
  on conflict (user_id) do nothing;
  insert into calendar_prefs (user_id, org_id) values
    ('00000000-0000-0000-0000-000000000004', t2)
  on conflict (user_id) do nothing;
end $$;

set role authenticated;

-- Remi (owner; manages shannon): own block + shannon's via the manager arm,
-- both checklists, shannon's calendar event — and zero tenant-two rows.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from work_blocks where title = 'leak-test-remi-block') <> 1 then
    raise exception 'owner cannot read his own work block';
  end if;
  if (select count(*) from work_blocks where title = 'leak-test-shannon-block') <> 1 then
    raise exception 'manager cannot read a direct report''s work block';
  end if;
  if (select count(*) from work_blocks where title = 'leak-test-t2-block') <> 0 then
    raise exception 'LEAK: AA owner reads a tenant-two work block';
  end if;
  if (select count(*) from work_block_tasks) <> 2 then
    raise exception 'manager cannot read block checklists (expected 2 links, saw %)',
      (select count(*) from work_block_tasks);
  end if;
  if (select count(*) from calendar_events where title = 'leak-test-shannon-event') <> 1 then
    raise exception 'manager cannot read a direct report''s calendar event';
  end if;
  if (select count(*) from calendar_prefs) <> 1 then
    raise exception 'calendar_prefs is not self-only for the owner (saw %)',
      (select count(*) from calendar_prefs);
  end if;
end $$;

-- Managers look, never touch: an update to the report's block moves 0 rows,
-- and inserting a block AS the report is denied by WITH CHECK.
do $$
declare n int;
begin
  with upd as (
    update work_blocks set title = 'hijack' where title = 'leak-test-shannon-block' returning 1
  )
  select count(*) into n from upd;
  if n <> 0 then raise exception 'LEAK: manager updated a report''s work block'; end if;
end $$;
do $$
declare aa uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  insert into work_blocks (org_id, owner_user_id, day, start_minute, duration_minute)
  values (aa, '00000000-0000-0000-0000-000000000002', '2026-09-08', 540, 30);
  raise exception 'LEAK: manager inserted a work block onto a report''s calendar';
exception when insufficient_privilege then null; -- expected
end $$;

-- Shannon (staff; delegate of remi, NOT his manager): own block + remi's via
-- the delegation arm; writes to remi's block are denied; own writes work.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$
declare aa uuid; own_blk uuid; own_task uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  if (select count(*) from work_blocks where title = 'leak-test-shannon-block') <> 1 then
    raise exception 'staff cannot read her own work block';
  end if;
  if (select count(*) from work_blocks where title = 'leak-test-remi-block') <> 1 then
    raise exception 'delegate cannot read the grantor''s work block';
  end if;
  -- Her own writes work end to end: block + checklist link.
  insert into work_blocks (org_id, owner_user_id, day, start_minute, duration_minute, title)
  values (aa, '00000000-0000-0000-0000-000000000002', '2026-09-08', 780, 60, 'leak-test-shannon-write')
  returning id into own_blk;
  select id into own_task from ops_tasks where title = 'leak-test-blocked-task-shannon';
  update work_block_tasks set block_id = own_blk, position = 0 where task_id = own_task;
end $$;
do $$
declare n int;
begin
  with upd as (
    update work_blocks set title = 'hijack' where title = 'leak-test-remi-block' returning 1
  )
  select count(*) into n from upd;
  if n <> 0 then raise exception 'LEAK: delegate updated the grantor''s work block'; end if;
end $$;
-- Prefs stay self-only even for a delegate/report.
do $$
declare aa uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  if (select count(*) from calendar_prefs
      where user_id = '00000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'LEAK: staff reads another user''s calendar_prefs';
  end if;
  insert into calendar_prefs (user_id, org_id)
  values ('00000000-0000-0000-0000-000000000002', aa)
  on conflict (user_id) do update set updated_at = now();
end $$;

-- Tenant-two owner: its own block only; the AA org chart grants it nothing.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$ begin
  if (select count(*) from work_blocks where title like 'leak-test-%block') <> 1
     or (select count(*) from work_blocks where title = 'leak-test-t2-block') <> 1 then
    raise exception 'LEAK: tenant-two work block visibility is wrong';
  end if;
  if (select count(*) from work_block_tasks) <> 0 then
    raise exception 'LEAK: tenant-two reads AA block checklists';
  end if;
end $$;

-- Stranger: nothing, and no write anywhere.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  if (select count(*) from work_blocks) <> 0 then
    raise exception 'LEAK: non-member reads work_blocks';
  end if;
  if (select count(*) from work_block_tasks) <> 0 then
    raise exception 'LEAK: non-member reads work_block_tasks';
  end if;
  if (select count(*) from calendar_prefs) <> 0 then
    raise exception 'LEAK: non-member reads calendar_prefs';
  end if;
end $$;
do $$
declare aa uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  insert into work_blocks (org_id, owner_user_id, day, start_minute, duration_minute)
  values (aa, '00000000-0000-0000-0000-000000000003', '2026-09-08', 540, 30);
  raise exception 'LEAK: non-member inserted a work block';
exception when insufficient_privilege then null; -- expected
end $$;

-- ════ Spec A A2: v_obligations (Contract 3 read) ═════════════════════════
-- Same construction as v_action_items: security_invoker over the nine
-- RLS-gated sources. If the invoker option were dropped, tenants would
-- merge; if an arm forgot the participant flag, the Reed fence would leak.
reset role;
reset request.jwt.claim.sub;

do $$ begin
  if (select coalesce(array_position(reloptions, 'security_invoker=on'), 0)
      from pg_class where relname = 'v_obligations' and relnamespace = 'public'::regnamespace) = 0 then
    raise exception 'v_obligations is not security_invoker — tenants would merge';
  end if;
end $$;

set role authenticated;

-- AA owner: sees AA's open obligations, nothing of tenant-two's, and the
-- participant flag is never NULL (every arm sets an explicit literal).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$
declare t2 uuid;
begin
  select id into t2 from public.orgs where slug = 'tenant-two';
  if (select count(*) from v_obligations where type = 'ops_task') = 0 then
    raise exception 'AA owner cannot read AA ops tasks through v_obligations';
  end if;
  if (select count(*) from v_obligations where org_id = t2) <> 0 then
    raise exception 'LEAK: AA owner reads tenant-two obligations';
  end if;
  if (select count(*) from v_obligations where contains_participant_data is null) <> 0 then
    raise exception 'v_obligations: contains_participant_data is NULL on some arm — the Reed fence has a hole';
  end if;
end $$;

-- Tenant-two owner: only its own obligations, zero AA rows.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$
declare aa uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  if (select count(*) from v_obligations where org_id = aa) <> 0 then
    raise exception 'LEAK: tenant-two reads AA obligations through v_obligations';
  end if;
  if (select count(*) from v_obligations) = 0 then
    raise exception 'tenant-two owner cannot read its OWN obligations';
  end if;
end $$;

-- Stranger (session, no membership): empty, not an error.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$ begin
  if (select count(*) from v_obligations) <> 0 then
    raise exception 'LEAK: non-member reads obligations';
  end if;
end $$;

-- ════ Spec A A3: obligation RPCs (dispatch + permission fences) ═══════════
-- SECURITY DEFINER functions bypass RLS, so the permission checks INSIDE
-- them are the only fence: a member without the domain's .write must be
-- refused, cross-org calls must be refused, and the service path
-- (auth.uid() IS NULL — no EXECUTE for anon) must work.
reset role;
reset request.jwt.claim.sub;

-- Service path (uid null): upsert an AA obligation. Also the fixture the
-- cross-org refusal below targets.
create temp table if not exists a3_fixture (task_id uuid, aa_org uuid);
do $$
declare aa uuid; r jsonb;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  r := public.upsert_obligation(aa, 'ops_task', 'a3-svc obligation', 'importer', current_date + 14);
  if (r->>'deduped')::boolean then raise exception 'a3: service upsert reported deduped on first insert'; end if;
  -- Stash the id where the tenant-two block can read it: RLS (correctly)
  -- hides the AA row itself from that session.
  insert into a3_fixture values ((r->>'id')::uuid, aa);
end $$;
grant select on a3_fixture to authenticated;

-- AA owner: create → dedup → snooze (hides from the view) → resolve (done).
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$
declare aa uuid; r jsonb; v_task uuid;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  r := public.upsert_obligation(aa, 'ops_task', 'a3-owner obligation', 'reed', current_date + 7);
  v_task := (r->>'id')::uuid;
  r := public.upsert_obligation(aa, 'ops_task', 'a3-owner obligation', 'reed', current_date + 7);
  if not (r->>'deduped')::boolean or (r->>'id')::uuid <> v_task then
    raise exception 'a3: ops_task upsert did not dedup on (org, title, due)';
  end if;
  r := public.snooze_obligation('ops_task', v_task, current_date + 3);
  if exists (select 1 from v_obligations where id = 'ops_task:' || v_task) then
    raise exception 'a3: snoozed obligation still visible in v_obligations';
  end if;
  r := public.resolve_obligation('ops_task', v_task);
  if (select status from public.ops_tasks where id = v_task) <> 'done'
     or (select completed_at from public.ops_tasks where id = v_task) is null then
    raise exception 'a3: resolve_obligation did not complete the ops task';
  end if;
  r := public.resolve_obligation('ops_task', v_task);
  if not (r->>'already_resolved')::boolean then
    raise exception 'a3: double-resolve was not a saying-so no-op';
  end if;
end $$;

-- AA owner: compliance filing rolls the calendar and leaves a history row.
do $$
declare aa uuid; r jsonb; v_ci uuid; v_due date := current_date + 30;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  r := public.upsert_obligation(aa, 'compliance_item', 'a3 filing', 'importer',
                                v_due, null, null, null, null, null, 'custom', 'CA', 'annual');
  v_ci := (r->>'id')::uuid;
  r := public.upsert_obligation(aa, 'compliance_item', 'a3 filing', 'importer',
                                v_due, null, null, null, null, null, 'custom', 'CA', 'annual');
  if not (r->>'deduped')::boolean then
    raise exception 'a3: custom compliance upsert did not dedup on title-inclusive key';
  end if;
  r := public.resolve_obligation('compliance_item', v_ci);
  if (select count(*) from public.compliance_filings
      where item_id = v_ci and period_due_date = v_due) <> 1 then
    raise exception 'a3: filing left no history row';
  end if;
  if (select due_date from public.compliance_items where id = v_ci) <> v_due + interval '1 year'
     or (select status from public.compliance_items where id = v_ci) <> 'upcoming' then
    raise exception 'a3: annual recur did not roll due_date forward and reset status';
  end if;
end $$;

-- Tenant-two owner: refused on AA rows and refused writing into AA.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$
declare aa uuid; v_task uuid;
begin
  -- Both ids come from the fixture: RLS (correctly) hides AA's org row and
  -- task row from this session entirely.
  select task_id, aa_org into v_task, aa from a3_fixture;
  begin
    perform public.resolve_obligation('ops_task', v_task);
    raise exception 'LEAK: tenant-two resolved an AA obligation';
  exception when insufficient_privilege then null; -- expected
  end;
  begin
    perform public.snooze_obligation('ops_task', v_task, current_date + 5);
    raise exception 'LEAK: tenant-two snoozed an AA obligation';
  exception when insufficient_privilege then null; -- expected
  end;
  begin
    perform public.upsert_obligation(aa, 'ops_task', 'a3 intruder', 'reed', current_date + 1);
    raise exception 'LEAK: tenant-two wrote an obligation into AA';
  exception when insufficient_privilege then null; -- expected
  end;
end $$;

-- Unresolvable / unsnoozable arms fail loudly, not silently.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ begin
  begin
    perform public.resolve_obligation('metric_stale', gen_random_uuid());
    raise exception 'a3: metric_stale was resolvable through resolve_obligation';
  exception when raise_exception then null; -- expected: its own surface resolves it
  end;
  begin
    perform public.snooze_obligation('acknowledgment', gen_random_uuid(), current_date + 5);
    raise exception 'a3: acknowledgment was snoozable';
  exception when raise_exception then null; -- expected
  end;
end $$;

-- ── Spec A / A6: the Contract 2 seed landed as specified ────────────────────
-- spec_a_seed_contract2_metrics.sql runs against this scratch DB too (slug
-- resolution finds the fixture's ambition-angels org), so assert the shape:
-- exactly the eight keys, the two deliberate conflicts, and no computed row
-- without a source_key (the A4 "silent no-op" it must never introduce).
reset role;
reset request.jwt.claim.sub;
do $$
declare aa uuid; n int;
begin
  select id into aa from public.orgs where slug = 'ambition-angels';
  select count(*) into n from public.metric_definitions
    where org_id = aa and metric_key in
      ('reached_all_time','active_on_platform','enrolled_in_cohort','finish_30_days',
       'second_track_rate','attendance_rate','cost_per_teen','active_guides');
  if n <> 8 then
    raise exception 'a6: expected 8 seeded Contract 2 metrics, found %', n;
  end if;
  select count(*) into n from public.metric_definitions
    where org_id = aa and confirmed_state = 'conflict'
      and metric_key in ('finish_30_days','second_track_rate');
  if n <> 2 then
    raise exception 'a6: finish_30_days + second_track_rate must seed as conflict, found %', n;
  end if;
  if exists (select 1 from public.metric_definitions
             where org_id = aa and source_kind = 'computed' and source_key is null) then
    raise exception 'a6: a computed definition was seeded without a source_key';
  end if;
end $$;

reset role;
reset request.jwt.claim.sub;

select 'RLS leak test: ALL CHECKS PASSED' as result;
