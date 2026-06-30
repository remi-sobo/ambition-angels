-- Strategy Room, Phase 4b — the deck's presentation copy as data.
--
-- create_strategy_angles.sql + extend_strategy_angles_framing.sql moved the
-- angles into a table. This moves the rest of app/strategy/StrategyRoom.tsx out
-- of hardcoded module consts: the hero eyebrow/headline/subtitle, the stat
-- chips, and the "What we're doing this year" block. One row per org.
--
-- Conventions match create_strategy_angles.sql: resident-org default on org_id,
-- set_updated_at trigger, fundraising-domain RLS (read/write). Idempotent:
-- IF NOT EXISTS + ON CONFLICT DO NOTHING, so a re-run never clobbers edits.

create table if not exists strategy_room_meta (
  org_id             uuid not null references orgs(id),
  eyebrow            text,                       -- "Funding Angles · Internal Playbook"
  headline           text,                       -- "Eight ways to tell the"
  headline_accent    text,                       -- "same true story" (rendered in orange)
  subtitle           text,
  stats              jsonb not null default '[]', -- [{ value, label }]
  this_year_heading  text,
  year_intro         text,
  this_year          jsonb not null default '[]', -- [{ label, body }]
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (org_id)
);

do $$
declare
  aa uuid;
  t text := 'strategy_room_meta';
begin
  select id into aa from orgs where slug = 'ambition-angels';
  if aa is null then
    raise exception 'ambition-angels org not found — run create_bloomos_core first';
  end if;

  execute format('drop trigger if exists %I on %I', t || '_set_updated_at', t);
  execute format(
    'create trigger %I before update on %I for each row execute function set_updated_at()',
    t || '_set_updated_at', t);

  execute format('alter table %I alter column org_id set default %L', t, aa);

  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists %I on public.%I', 'members read ' || t, t);
  execute format($p$
    create policy %I on public.%I
      for select to authenticated
      using ( (select private.has_permission(org_id, 'fundraising.read')) )
    $p$, 'members read ' || t, t);
  execute format('drop policy if exists %I on public.%I', 'members write ' || t, t);
  execute format($p$
    create policy %I on public.%I
      for all to authenticated
      using ( (select private.has_permission(org_id, 'fundraising.write')) )
      with check ( (select private.has_permission(org_id, 'fundraising.write')) )
    $p$, 'members write ' || t, t);
end $$;

-- Seed the resident org's current deck copy, verbatim from StrategyRoom.tsx.
insert into strategy_room_meta
  (eyebrow, headline, headline_accent, subtitle, stats, this_year_heading, year_intro, this_year)
values (
  'Funding Angles · Internal Playbook',
  'Eight ways to tell the',
  'same true story',
  'One mission, framed for whoever is across the table. Open the angle that fits the room. Each card holds the hook you say out loud, the frame in our voice, who funds it, the metrics they want, and the ask.',
  $j$[
    { "value": "3,500+", "label": "teens reached" },
    { "value": "87%", "label": "Title I" },
    { "value": "74%", "label": "second-internship completion" },
    { "value": "36", "label": "partners" }
  ]$j$::jsonb,
  'What we''re doing this year',
  'The grounding truth behind every angle above, so the story never gets ahead of the work.',
  $j$[
    { "label": "Exposure", "body": "The app and 30-day simulated internships, live and proven across 36 partners and 3,500+ teens." },
    { "label": "Conversations", "body": "The adult dashboard, using AI to turn any adult into a youth educator. In active buildout (Hub v8 with Demetric)." },
    { "label": "Connections", "body": "Ambition Coach, piloting now with Ricky and Charles. Formalizing volunteer agreements and session frameworks." }
  ]$j$::jsonb
)
on conflict (org_id) do nothing;
