-- ════════════════════════════════════════════════════════════════════════════
-- Northbridge demo tenant — TEARDOWN
-- Removes every row of the demo org and its ten banned teammate users, so the
-- seed can be re-applied fresh (re-anchoring every relative date to today).
--
-- Safety: refuses to run unless the org row with the demo id is exactly the
-- demo org (slug 'northbridge-demo'); touches only rows with that org_id, and
-- only auth users whose ids are the seeded teammate ids AND whose emails are
-- on the reserved northbridge.example domain. Remi's own user, profile, and
-- every other org are never touched.
-- ════════════════════════════════════════════════════════════════════════════
do $$
declare
  demo_org constant uuid := md5('nb:org')::uuid;
  t record;
  n bigint;
  pass_deleted bigint;
  pending int;
  passes int := 0;
begin
  if not exists (select 1 from public.orgs where id = demo_org and slug = 'northbridge-demo') then
    raise notice 'Demo org not present (or slug mismatch) — nothing to tear down.';
    return;
  end if;

  -- Delete by org_id across every public base table that has the column,
  -- retrying in passes until FK ordering works itself out.
  loop
    passes := passes + 1;
    pass_deleted := 0;
    pending := 0;
    for t in
      select c.relname
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
      where ns.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
      order by c.relname
    loop
      begin
        execute format('delete from public.%I where org_id = $1', t.relname) using demo_org;
        get diagnostics n = row_count;
        pass_deleted := pass_deleted + n;
      exception when foreign_key_violation then
        pending := pending + 1;
      end;
    end loop;
    exit when pass_deleted = 0 and pending = 0;
    if passes > 25 then
      raise exception 'Teardown did not converge after % passes (% tables still blocked)', passes, pending;
    end if;
  end loop;

  -- The ten banned teammates and Remi's demo login (never his everyday
  -- account, which has a different id and email).
  delete from auth.users
  where id in (select md5('nb:user:' || h)::uuid
               from unnest(array['tasha','miguel','priya','kwame','ben','rosa','andre','simone','lena','jordan']) h)
    and email like '%@northbridge.example';
  delete from auth.users
  where id = md5('nb:user:remi')::uuid and email = 'remisobo+northbridge@gmail.com';

  delete from public.orgs where id = demo_org and slug = 'northbridge-demo';
  raise notice 'Northbridge demo torn down in % passes.', passes;
end $$;
