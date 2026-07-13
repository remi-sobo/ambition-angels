-- /ms Phase 1: the career library (specs/ms-career-library-v2.md).
--
-- Two tables, on purpose. ms_occupations is IMPORTED data (O*NET RIASEC
-- profiles + Job Zones, BLS OEWS pay) keyed by the 6-digit BLS SOC code and
-- never hand-edited; scripts/import-onet.ts fills it. ms_cards is WRITTEN
-- content (the day vignette and the clue ladder), drafted by Claude through
-- /admin/careers, gated by machines, approved only by a human click.
-- Re-importing O*NET next year touches ms_occupations and leaves every
-- reviewed card intact.
--
-- No org_id on any ms_ table: these are public-product tables, not tenant
-- data (specs/ms-decisions-after-recon.md D7).
--
-- Access model (D8):
--   - anon/authenticated get NOTHING on the base tables (RLS on, no
--     policies, grants revoked).
--   - the public surface reads ms_catalog, a deliberately NON-invoker view
--     that exposes only approved cards and excludes title, title_variants,
--     and clue_8. Column-level hiding is the point: the job title is the
--     answer to the game and must not reach the client until the student
--     taps for it (that reveal goes through a route handler, Phase 3).
--     This differs from the house security_invoker views on purpose.
--   - all writes are service-role via /admin/careers routes behind
--     BloomOS auth.

create table if not exists ms_occupations (
  soc_code          text primary key,          -- '29-2055'. BLS SOC, the canonical key.
  onet_soc_code     text,                      -- '29-2055.00'. provenance of the imported row.
  title             text not null,
  title_variants    text[] not null default '{}',
  description       text,                      -- O*NET occupation description (generator grounding)
  tasks             text[] not null default '{}', -- top O*NET task statements (generator grounding)
  riasec            jsonb not null,            -- {"R":..,"I":..,"A":..,"S":..,"E":..,"C":..} from O*NET (OI scale)
  job_zone          int not null check (job_zone between 1 and 5),
  pay_median        int,                       -- BLS OEWS annual median, USD
  pay_p90           int,                       -- BLS OEWS annual 90th percentile, USD
  education_typical text,                      -- BLS typical entry education when provided
  pay_source_url    text not null,             -- the BLS OEWS page for this SOC
  pay_as_of         text not null,             -- 'May 2024'
  imported_at       timestamptz not null default now()
);

create table if not exists ms_cards (
  soc_code       text primary key references ms_occupations(soc_code) on delete cascade,
  field          text check (field in ('business','tech','health','creative','trades','public')),
  day_vignette   text,
  clue_1         text,
  clue_2         text,
  clue_3         text,
  clue_4         text,
  clue_5         text,
  clue_6         text,                         -- RENDERED from ms_occupations by lib/ms/render.ts, never generated
  clue_7         text,                         -- RENDERED from ms_occupations by lib/ms/render.ts, never generated
  clue_8         text,
  status         text not null default 'draft' check (status in ('draft','approved','retired')),
  generated_by   text,                         -- model id, or 'human'
  generated_at   timestamptz,
  reviewed_by    text,
  reviewed_at    timestamptz,
  reading_grade  numeric,                      -- Flesch-Kincaid grade of the vignette, computed by the gates
  last_gate_result jsonb,                      -- most recent machine-gate run, for the review UI
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- A card cannot reach 'approved' except through a human: the review stamp is
-- structurally required, not a convention (ms-career-library-v2.md, failure
-- mode "a generated card gets approved unread").
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ms_cards_approved_requires_review'
      and conrelid = 'ms_cards'::regclass
  ) then
    alter table ms_cards add constraint ms_cards_approved_requires_review
      check (status <> 'approved' or (reviewed_by is not null and reviewed_at is not null));
  end if;
end $$;

create index if not exists ms_cards_status_idx on ms_cards (status);
create index if not exists ms_occupations_job_zone_idx on ms_occupations (job_zone);

drop trigger if exists ms_cards_set_updated_at on ms_cards;
create trigger ms_cards_set_updated_at
  before update on ms_cards
  for each row execute function set_updated_at();

-- ── Access control ────────────────────────────────────────────────────────
alter table ms_occupations enable row level security;
alter table ms_cards enable row level security;

-- Service-path only on the base tables: no policies, and the default
-- PostgREST grants are revoked so a direct table read is a permission error,
-- not just an empty result.
revoke all on ms_occupations from anon, authenticated;
revoke all on ms_cards from anon, authenticated;

-- The public catalog. Approved cards only; no title, no title_variants, no
-- clue_8, no review metadata. Deliberately NOT security_invoker: the view
-- owner reads the base tables so anon does not have to (see header).
create or replace view ms_catalog as
select
  c.soc_code,
  c.field,
  c.day_vignette,
  c.clue_1, c.clue_2, c.clue_3, c.clue_4,
  c.clue_5, c.clue_6, c.clue_7,
  o.riasec,
  o.job_zone,
  o.pay_median,
  o.pay_p90,
  o.pay_as_of,
  o.pay_source_url
from ms_cards c
join ms_occupations o using (soc_code)
where c.status = 'approved';

grant select on ms_catalog to anon, authenticated;
