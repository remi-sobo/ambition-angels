-- Every grant must be tied to a funder (an organization constituent).
-- `grants.funder_id` has been nullable since create_grants.sql; this makes the
-- invariant real in Postgres, not just in the create/edit forms.
--
-- Any grant that still has no funder is pointed at a placeholder "Unknown
-- funder" constituent (tagged so it's easy to find and reassign) before the
-- column goes NOT NULL — a NOT NULL alter on a column with a null row would
-- otherwise fail. The foreign key is also tightened from ON DELETE SET NULL to
-- ON DELETE RESTRICT: with the column NOT NULL, "set null" on funder delete
-- could only ever produce a not-null violation, so restrict states the real
-- intent (you can't delete a funder that still has grants).
--
-- Idempotent: once every grant has a funder and the constraint is in place,
-- re-running is a no-op.

do $$
declare
  aa uuid;
  placeholder uuid;
  orphans int;
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;

  select count(*) into orphans from grants where funder_id is null;
  if orphans > 0 then
    -- Reuse the placeholder if a prior run already created it.
    select id into placeholder
    from constituents
    where org_id = aa and type = 'organization' and org_name = 'Unknown funder'
    limit 1;
    if placeholder is null then
      insert into constituents (org_id, type, org_name, source, tags, notes)
      values (
        aa, 'organization', 'Unknown funder', 'manual', array['placeholder'],
        'Auto-created when a funder became required on grants. Reassign these grants to their real funder.'
      )
      returning id into placeholder;
    end if;
    update grants set funder_id = placeholder where funder_id is null;
  end if;
end $$;

alter table grants alter column funder_id set not null;

alter table grants drop constraint if exists grants_funder_id_fkey;
alter table grants
  add constraint grants_funder_id_fkey
  foreign key (funder_id) references constituents(id) on delete restrict;
