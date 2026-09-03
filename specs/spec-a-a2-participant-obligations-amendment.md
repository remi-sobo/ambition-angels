# Spec A amendment — A2 requirement and Contract 3: participant-sourced obligations must not reach Reed

Status: requirement for A2, not a follow-up. Recorded 2026-09-03 from the
extended tenant audit (session notes on PR #455).

## The finding

`v_action_items` titles its `application_pending` rows
`'Application: ' || a.first_name || coalesce(' ' || a.last_name, '')`
from `applications` (`supabase/migrations/program_spine_schema.sql`), and
`session_unrecorded` rows carry the cohort name. Reed's `get_needs_you_queue`
(`lib/agents/reed/tools.ts`) returns `getActionQueue()` items to the model
verbatim. A2's `v_obligations` inherits the same source. The moment SafeSpace
uses Programs → Intake, an applicant's name reaches the model with nobody
doing anything wrong at any step. The SafeSpace consulting agreement restricts
individually identifiable youth data reaching models.

Today: `applications` is empty in every org, no `students` row is linked to a
`constituents` row (so `get_constituent_dossier` cannot reach youth either),
and no Reed tool reads `students`, `cohort_members` or `attendance`. The path
is latent, not live. Spec A makes it permanent unless A2 carries this.

## A2 requirement

1. `v_obligations` carries `contains_participant_data boolean not null`.
   It is `true` for every row whose source is a participant table
   (`applications`, `students`, `cohort_members`, `attendance`,
   `cohort_sessions` when the title embeds a participant) and `false`
   otherwise. New sources must set it explicitly; the view must not default
   it.
2. Reed's queue tool filters `contains_participant_data = false` before the
   rows reach the model. The in-app Home → Today feed keeps all rows; the
   flag is a Reed fence, not a UI one.
3. The flag is preferred over a redacted projection because it survives new
   sources being added later: a source added without the flag fails the
   `not null`, a source added without a redacted twin silently leaks.
4. A test asserts that no row returned by the Reed queue tool has
   `contains_participant_data = true`, and a second test asserts that every
   participant-sourced branch of the view sets it.

## Contract 3 amendment

Add to Contract 3 (AI processing of participant data): "No obligation,
action item, or queue row sourced from a participant table is passed to a
model. `v_obligations.contains_participant_data` is the fence and Reed's
tools honor it."

## Fold-in for the A2 kickoff (from the earlier note)

Report the row count per source returned by `v_obligations`, per org, before
opening the PR. 67 active metric definitions with 47 snapshots across 10
capture days means nearly every metric is stale by its own cadence, so the
`metric_stale` branch may return ~67 rows and bury everything else. Home →
Today caps at 7 items. If one source dominates the feed, that is a design
input for the Home spec.
