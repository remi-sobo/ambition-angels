-- Consolidate the shadow "Partnership Pipeline" into the partners table.
--
-- Context: 169 partnership relationships are stranded in the donor
-- `opportunities` table under pipeline='59855776', wearing fundraising stages
-- (identify…steward/lost) and meaningless ask/probability. A partnership is a
-- relationship, not a dollar ask, so it belongs in `partners`. This migration
-- folds those 169 rows into `partners` so /admin/partners' moves-management
-- board fills with the real Pilot/Active history that today hides in
-- fundraising.
--
-- ADDITIVE ONLY. This never deletes or mutates an opportunity row — archiving
-- the migrated opps is a separate, later, reversible step (spec Phase 4).
-- Idempotent: safe to re-run (advance-only updates are stable; inserts guard
-- on (external_source, external_id)).
--
-- Decisions applied (signed off 2026-06-26):
--   • Stage map:  identify→prospect · cultivate→pilot · solicit→active ·
--                 steward→active · lost→lapsed   (qualify→outreach; none today)
--   • steward defaults to Active; genuine anchors are hand-promoted on the
--     board (Anchor stays 0 after this migration, by design).
--   • lost imported as Lapsed (history preserved; Lapsed sits off-board).
--   • Advance-only: a matched partner is never regressed. The new status is the
--     more advanced of its current status and the mapped status, so a 'lost'
--     opp (rank 0) never lapses a live partner.
--   • last_touch_at is carried from real interactions (interactions.occurred_at
--     max), NOT the opportunity timestamps — those are bulk-import dates. It
--     only ever moves forward ("most recent wins").
--   • New partner rows take org_id from their SOURCE opportunity, never the
--     partners.org_id column default (which hardcodes the AA tenant — the
--     "households trap"). Dropping that default is a separate follow-up.
--
-- Status ranks (higher = more advanced; lapsed is the exit state at 0):
--   prospect 1 · outreach 2 · pilot 3 · active 4 · anchor 5 · lapsed 0
--
-- Five hand-verified same-org aliases collapse near-miss opportunity names onto
-- the canonical existing partner so the board shows no duplicates. Every alias
-- below was eyeballed against the live partner list; remove any you disagree
-- with before applying. All other matching is exact on a cleaned name
-- (lowercased, whitespace-collapsed); genuinely ambiguous near-names that are
-- DIFFERENT orgs (e.g. "Aspire Public Schools" vs "uAspire", "Hayward High
-- School" vs "Hayward Unified") are left to match their own rows and are not
-- merged here.

begin;

-- 1. Cleaned, alias-resolved source rows from the partnership pipeline.
create temporary table _pp_src on commit drop as
select
  o.id,
  o.org_id,
  o.constituent_id,
  o.stage,
  case lower(btrim(regexp_replace(o.name, '\s+', ' ', 'g')))
    when 'east oakland youth dev center'         then 'east oakland youth development center'
    when 'college track - new deal'              then 'collegetrack'
    when 'lemo foundation - new deal'            then 'lemo'
    when 'woodside high school (summer program)' then 'woodside high school'
    when 'silicon valley education fund'         then 'silicon valley education foundation'
    else lower(btrim(regexp_replace(o.name, '\s+', ' ', 'g')))
  end as key,
  o.name as raw_name,
  case o.stage
    when 'cultivate' then 3
    when 'solicit'   then 4
    when 'steward'   then 4
    when 'lost'      then 0
    when 'qualify'   then 2
    else 1  -- identify (and any unexpected stage) → prospect
  end as mapped_rank
from public.opportunities o
where o.pipeline = '59855776'
  and o.name is not null
  and btrim(o.name) <> '';

-- 2. Real touch date per org, from interactions (the opp timestamps are bulk
--    import dates and useless as "last touch").
create temporary table _pp_touch on commit drop as
select s.key, max(i.occurred_at)::date as last_touch
from _pp_src s
join public.interactions i on i.constituent_id = s.constituent_id
where s.constituent_id is not null
group by s.key;

-- 3. One row per org: most-advanced stage across internal dupes, carried touch,
--    and the source org_id.
create temporary table _pp_orgs on commit drop as
select
  s.key,
  min(s.raw_name)           as display_name,
  (array_agg(s.org_id))[1]  as org_id,
  max(s.mapped_rank)        as best_rank,
  max(t.last_touch)         as last_touch
from _pp_src s
left join _pp_touch t on t.key = s.key
group by s.key;

-- 4. Advance matched partners (advance-only) and carry touch forward-only.
update public.partners p
set
  status = case greatest(
      case p.status
        when 'prospect' then 1 when 'outreach' then 2 when 'pilot' then 3
        when 'active'   then 4 when 'anchor'   then 5 when 'lapsed' then 0
        else 1 end,
      g.best_rank)
    when 1 then 'prospect' when 2 then 'outreach' when 3 then 'pilot'
    when 4 then 'active'   when 5 then 'anchor'   when 0 then 'lapsed'
    end,
  last_touch_at = case
    when g.last_touch is null then p.last_touch_at
    when p.last_touch_at is null or p.last_touch_at < g.last_touch then g.last_touch
    else p.last_touch_at
    end
from _pp_orgs g
where lower(btrim(regexp_replace(p.name, '\s+', ' ', 'g'))) = g.key;

-- 5. Insert the orgs that don't yet exist as partners. org_id comes from the
--    source opportunity (explicit — never the column default). kind is inferred
--    from the name; Remi can correct it on the board.
insert into public.partners (name, kind, status, org_id, last_touch_at, external_source, external_id, notes)
select
  g.display_name,
  case
    when g.display_name ~* '(unified|school district|\mdistrict\M)'                          then 'district'
    when g.display_name ~* '(high school|middle school|elementary|k-?8|academy|\mprep\M|charter)' then 'school'
    else 'nonprofit'
  end,
  case g.best_rank
    when 1 then 'prospect' when 2 then 'outreach' when 3 then 'pilot'
    when 4 then 'active'   when 5 then 'anchor'   when 0 then 'lapsed'
  end,
  g.org_id,
  g.last_touch,
  'partnership_pipeline_2026',
  'pp-' || regexp_replace(g.key, '[^a-z0-9]+', '-', 'g'),
  'Imported from the partnership pipeline (HubSpot pipeline 59855776) during consolidation.'
from _pp_orgs g
where not exists (
  select 1 from public.partners p
  where lower(btrim(regexp_replace(p.name, '\s+', ' ', 'g'))) = g.key
)
on conflict (external_source, external_id) where external_id is not null do nothing;

commit;

-- ── Verification (run separately after applying; not part of the migration) ──
-- Expect ~64 new rows and ~54 advanced/touched existing rows; Pilot and Active
-- non-zero; no name appears twice.
--
--   select status, count(*) from public.partners group by status order by status;
--
--   -- newly imported rows
--   select status, count(*) from public.partners
--   where external_source = 'partnership_pipeline_2026' group by status order by status;
--
--   -- no duplicate org names on the board
--   select lower(btrim(regexp_replace(name,'\s+',' ','g'))) k, count(*)
--   from public.partners group by 1 having count(*) > 1 order by 2 desc;
