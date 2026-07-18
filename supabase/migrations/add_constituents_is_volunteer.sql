-- Volunteers become queryable (YL EPA onboarding spec, v1.5 item 2).
--
-- The entity registry has routed 'volunteer' to the constituent detail page
-- since spine_entity_registry.sql ("volunteers are constituents wearing a
-- different hat"), and org_terminology can relabel the type ("Leader") — but
-- nothing marked WHICH constituents are volunteers, so no list surface could
-- exist. A first-class flag (not a free-text tags convention) makes the
-- Volunteers/Leaders list honest: indexed, enforced, and safe to build on
-- (the kid→leader link picker filters on it next).
--
-- RLS: constituents policies (fundraising.read / fundraising.write) already
-- cover the column — no policy change.

alter table public.constituents
  add column if not exists is_volunteer boolean not null default false;

-- Partial index: the list surface reads "volunteers of this org"; most
-- constituents are donors, so index only the flagged rows.
create index if not exists constituents_is_volunteer_idx
  on public.constituents (org_id)
  where is_volunteer;
