-- site_daily_stats: the website's numbers, one row per Pacific day.
--
-- The single definition behind the website admin home AND the numbers BloomOS
-- pulls into Ambition Angels' metrics (specs/bloomos-repo-split.md §6e item 5),
-- so the two always agree. Daily totals only: no rows, handles, or IPs.
--
--   page_views              page_views rows
--   unique_visitors         distinct page_views.session_id
--   higher_wage_players     distinct visitors to /teens/higher-wage*
--   nhoi_players            distinct visitors to /teens/never-heard-of-it*
--   the_cut_players         distinct visitors to /teens/the-cut*
--   builtfor_completions    ms_sessions created (a finished assessment)
--   decks_claimed           those sessions with at least one card played
--   rooms_run               Built For rooms + The Cut rooms opened
--
-- Higher Wage and Never Heard of It keep no play log (by design: no student
-- data), so their counts are unique visitors to the game, labelled as such.

create or replace function public.site_daily_stats(p_from date, p_to date)
returns table (
  day date,
  page_views bigint,
  unique_visitors bigint,
  higher_wage_players bigint,
  nhoi_players bigint,
  the_cut_players bigint,
  builtfor_completions bigint,
  decks_claimed bigint,
  rooms_run bigint
)
language sql
stable
set search_path = ''
as $$
  with days as (
    select d::date as day from generate_series(p_from, p_to, interval '1 day') d
  ),
  pv as (
    select (created_at at time zone 'America/Los_Angeles')::date as day, page, session_id
    from public.page_views
    where created_at >= (p_from::timestamp at time zone 'America/Los_Angeles')
      and created_at < ((p_to + 1)::timestamp at time zone 'America/Los_Angeles')
  ),
  pv_day as (
    select day,
      count(*) as page_views,
      count(distinct session_id) as unique_visitors,
      count(distinct session_id) filter (where page like '/teens/higher-wage%') as higher_wage_players,
      count(distinct session_id) filter (where page like '/teens/never-heard-of-it%') as nhoi_players,
      count(distinct session_id) filter (where page like '/teens/the-cut%') as the_cut_players
    from pv group by day
  ),
  bf as (
    select (s.created_at at time zone 'America/Los_Angeles')::date as day,
      count(*) as builtfor_completions,
      count(*) filter (where exists (select 1 from public.ms_explored e where e.session_id = s.id)) as decks_claimed
    from public.ms_sessions s
    where s.created_at >= (p_from::timestamp at time zone 'America/Los_Angeles')
      and s.created_at < ((p_to + 1)::timestamp at time zone 'America/Los_Angeles')
    group by 1
  ),
  rooms as (
    select (created_at at time zone 'America/Los_Angeles')::date as day, count(*) as rooms_run
    from (
      select created_at from public.ms_rooms
      union all
      select created_at from public.cut_rooms
    ) r
    where created_at >= (p_from::timestamp at time zone 'America/Los_Angeles')
      and created_at < ((p_to + 1)::timestamp at time zone 'America/Los_Angeles')
    group by 1
  )
  select d.day,
    coalesce(pv_day.page_views, 0),
    coalesce(pv_day.unique_visitors, 0),
    coalesce(pv_day.higher_wage_players, 0),
    coalesce(pv_day.nhoi_players, 0),
    coalesce(pv_day.the_cut_players, 0),
    coalesce(bf.builtfor_completions, 0),
    coalesce(bf.decks_claimed, 0),
    coalesce(rooms.rooms_run, 0)
  from days d
  left join pv_day using (day)
  left join bf using (day)
  left join rooms using (day)
  order by d.day;
$$;

revoke all on function public.site_daily_stats(date, date) from public, anon, authenticated;
grant execute on function public.site_daily_stats(date, date) to service_role;
