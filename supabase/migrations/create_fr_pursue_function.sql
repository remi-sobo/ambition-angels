-- Strategy "pursue" as one transaction.
--
-- The pursue route created an opportunity and then, in a second statement,
-- linked it on funder_angles.opportunity_id — if the link failed you got an
-- orphan opportunity. This wraps both writes (plus the stage/decision move) in
-- a single plpgsql function so it's all-or-nothing. Idempotent: if the funder
-- is already pursued, the existing opportunity id is returned and nothing new
-- is created.
--
-- SECURITY INVOKER (default): runs as the calling user, so the existing
-- fundraising RLS on opportunities + funder_angles still applies. org_id falls
-- to the resident-org default on opportunities.

create or replace function fr_pursue_funder_angle(p_fa_id uuid, p_owner text)
returns uuid
language plpgsql
as $$
declare
  v_constituent uuid;
  v_existing    uuid;
  v_angle_name  text;
  v_opp         uuid;
  v_found       boolean := false;
begin
  select fa.constituent_id, fa.opportunity_id, sa.name, true
    into v_constituent, v_existing, v_angle_name, v_found
  from funder_angles fa
  left join strategy_angles sa on sa.id = fa.angle_id
  where fa.id = p_fa_id;

  if not v_found then
    raise exception 'funder_angle % not found', p_fa_id using errcode = 'no_data_found';
  end if;

  if v_existing is not null then
    return v_existing;  -- already pursued
  end if;

  insert into opportunities (constituent_id, name, stage, owner)
  values (v_constituent, v_angle_name, 'cultivate', p_owner)
  returning id into v_opp;

  update funder_angles
     set opportunity_id = v_opp, stage = 'pursuing', decision = 'pursue'
   where id = p_fa_id;

  return v_opp;
end;
$$;
