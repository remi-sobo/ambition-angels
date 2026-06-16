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

  -- But it DOES see its own org's rows (proves isolation, not lockout).
  if (select count(*) from constituents) = 0 then raise exception 'tenant-two owner cannot read its OWN constituents'; end if;
  if (select count(*) from gifts) = 0 then raise exception 'tenant-two owner cannot read its OWN gifts'; end if;
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

reset role;
reset request.jwt.claim.sub;

select 'RLS leak test: ALL CHECKS PASSED' as result;
