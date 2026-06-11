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
insert into ops_tasks (title, category, created_by) values ('leak-test','admin','remi');
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
  insert into ops_tasks (title, category, created_by) values ('owner-write','admin','remi');
end $$;

-- ════ Staff: finance read-only; ops read + write ═════════════════════════
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';

do $$ begin
  if (select count(*) from fin_transactions) = 0 then raise exception 'staff cannot read fin_transactions'; end if;
  insert into ops_tasks (title, category, created_by) values ('staff-write','admin','shannon');
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
  insert into ops_tasks (title, category, created_by) values ('stranger-write','admin','remi');
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

reset role;

select 'RLS leak test: ALL CHECKS PASSED' as result;
