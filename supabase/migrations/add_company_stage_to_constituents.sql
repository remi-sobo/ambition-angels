-- BloomOS company profiles, Stage 1 (specs/bloomos-companies.md).
--
-- A company is an organization constituent. Staff mark one as a company by
-- setting its stage; null means "not tracked as a company", so the 1,000+
-- foundation and HubSpot-imported organizations stay untouched. The stage is
-- set by a person and never derived or advanced by code (spec D6).
--
-- `domains` holds lowercase bare email domains ("example.com"). Stage 3 matches
-- intake emails against it; Stage 1 only lets staff edit it.
--
-- RLS: the constituents policies (fundraising.read / fundraising.write) cover
-- both columns. No policy change.

alter table public.constituents add column if not exists company_stage text;
alter table public.constituents add column if not exists domains text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'constituents_company_stage_check') then
    alter table public.constituents add constraint constituents_company_stage_check
      check (company_stage is null or company_stage in
        ('identified','engaged','qualified','opportunity','committed','active_partner','renewal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'constituents_company_stage_org_check') then
    alter table public.constituents add constraint constituents_company_stage_org_check
      check (company_stage is null or type = 'organization');
  end if;
end $$;

create index if not exists constituents_company_stage_idx
  on public.constituents (org_id, company_stage) where company_stage is not null;
create index if not exists constituents_domains_idx
  on public.constituents using gin (domains);
