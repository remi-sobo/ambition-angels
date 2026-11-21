-- Comms Phase 6 — the loop (specs/comms-module.md §8 "comms-6-loop").
--
-- The suggestion score learns from USE. Until now "never used" was a binary
-- 25 points: a story used once was down 25 forever, as if telling it in the
-- spring newsletter poisoned it for the annual appeal. That is wrong in both
-- directions — a story sent last week genuinely shouldn't lead the next
-- edition, and a story sent in February is fine material again by fall.
--
-- So the signal becomes recency of use, recovering linearly over 180 days:
--   never used ............ 25 pts   (unchanged)
--   sent yesterday ........ ~0 pts   (unchanged in spirit)
--   sent 90 days ago ...... 12.5 pts (the new part: it earns its way back)
--
-- "Used" means it rode in an edition that actually went out — the sent_at on
-- the edition, not the status flag on the story, because the flag says only
-- THAT it was used, never when. A story flagged `used` with no sent edition
-- on record (marked by hand, or used before this view existed) is treated as
-- 90 days ago: penalized, recovering, honest about not knowing.
--
-- Still zero AI anywhere near story selection, still security_invoker, still
-- rank_order beats all of this wherever a human has dragged.
--
-- APPLIED 2026-08-24 to Ambition-Angels (kzzdtibbwsucloaoqpqa).

create or replace view public.v_story_suggestions
  with (security_invoker = on) as
select
  s.id,
  s.org_id,
  round(
    -- freshness, 40 pts, decaying linearly over 90 days. A story with no
    -- happened_on scores 0 here rather than pretending to be fresh.
    (greatest(0, 90 - least(90, coalesce(current_date - s.happened_on, 90))) / 90.0) * 40
    -- usage recency, 25 pts, recovering linearly over 180 days (see header)
    + (least(180, coalesce(
        current_date - u.last_used_on,
        case when s.status = 'used' then 90 else 180 end
      )) / 180.0) * 25
    -- linked to a strategic goal, 15 pts
    + case when s.strategic_goal_id is not null then 15 else 0 end
    -- usable right now, 10 pts
    + case when exists (
        select 1 from public.v_publishable_stories p where p.id = s.id
      ) then 10 else 0 end
    -- has a photo, 10 pts
    + case when exists (
        select 1 from public.story_media m where m.story_id = s.id
      ) then 10 else 0 end
  , 1) as suggestion_score
from public.stories s
left join lateral (
  select max(e.sent_at)::date as last_used_on
  from public.comms_edition_slots sl
  join public.comms_editions e
    on e.id = sl.edition_id and e.status = 'sent' and e.sent_at is not null
  where sl.story_id = s.id
) u on true
where s.status <> 'retired';
