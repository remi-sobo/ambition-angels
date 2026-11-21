-- Comms Phase 2 — the two views (specs/comms-module.md §6.2).
--
-- v_publishable_stories is the enforceable half of the module's compliance
-- claim. The composer (Phase 3) and the edition slot pickers (Phase 4) read
-- ONLY from it, so a story whose consent lapsed cannot be selected — not
-- because the UI hides it, but because the row is not there.
--
-- Both views are `security_invoker = on`. A plain Postgres view runs as its
-- OWNER, which would bypass the RLS on stories/story_subjects/story_consents
-- entirely and hand every caller every tenant's rows. This is a house rule for
-- exactly that reason.
--
-- ── DRIFT GUARD ──────────────────────────────────────────────────────────────
-- The publishable rule is implemented TWICE: here in SQL (the boundary) and in
-- lib/comms/consent.ts (the chips, the verdict line, and the early 403s).
-- tests/comms-consent.test.ts pins the TypeScript side. They must agree.
--
-- Note where this diverges from the spec's draft appendix, deliberately: the
-- draft asked only "does some valid consent row exist for this subject?", which
-- would let a story stay publishable when a guardian had revoked permission but
-- an older blanket intake release was still on file. lib/comms/consent.ts makes
-- revocation DOMINANT — the only honest reading of "revoke takes effect
-- instantly everywhere" — so the SQL does too: a subject with ANY revoked row
-- is not covered, full stop.

create or replace view public.v_publishable_stories
  with (security_invoker = on) as
select s.*
from public.stories s
where s.status in ('approved', 'used')
  and not exists (
    -- Any identifiable subject that is NOT currently covered blocks the story.
    -- A story about the org itself (no subjects, or subject_type 'none') has
    -- nobody to protect and publishes on human approval alone.
    select 1
    from public.story_subjects sub
    where sub.story_id = s.id
      and sub.subject_type <> 'none'
      and (
        -- Revocation dominates every other row on this subject.
        exists (
          select 1 from public.story_consents c
          where c.story_subject_id = sub.id
            and c.revoked_at is not null
        )
        -- Otherwise there must be a live grant. A merely REQUESTED consent
        -- ("emailed Mom the draft, waiting") is pending, and pending is not
        -- permission.
        or not exists (
          select 1 from public.story_consents c
          where c.story_subject_id = sub.id
            and c.granted_at is not null
            and c.revoked_at is null
            and (c.expires_at is null or c.expires_at >= current_date)
        )
      )
  );

-- The computed rank behind the drag rank. Every component is deterministic —
-- no AI anywhere near story selection. Weights are constants in one place, and
-- the bank sorts by the human's rank_order FIRST, this score second: a drag
-- always beats the machine (spec §10, "suggestion score becomes the editor").
create or replace view public.v_story_suggestions
  with (security_invoker = on) as
select
  s.id,
  s.org_id,
  round(
    -- freshness, 40 pts, decaying linearly over 90 days. A story with no
    -- happened_on scores 0 here rather than pretending to be fresh.
    (greatest(0, 90 - least(90, coalesce(current_date - s.happened_on, 90))) / 90.0) * 40
    -- never used yet, 25 pts
    + case when s.status <> 'used' then 25 else 0 end
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
where s.status <> 'retired';
