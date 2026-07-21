# Amendment 1: donor-lifecycle-journeys

Applies to: `specs/donor-lifecycle-journeys.md`
Trigger: Phase 0 recon findings (all five items answered, five flags raised)
Status: supersedes the base spec where they conflict

## A. Corrections to the base spec

1. **Universality note, org_id defaults.** The live database has no `org_id`
   defaults on `journeys`, `journey_steps`, or `journey_enrollments`
   (verified via `pg_attrdef` on production). However, the repo's
   `create_journeys.sql` still sets the AA default and the ratchet
   baseline still lists all three tables: the repo has drifted from the
   live schema. Behavior today is safe (all writers set `org_id`
   explicitly). Regenerating the ratchet baseline from live schema is a
   separate task outside this build. Phase 3 sets `org_id` from
   `getOrgContext()` regardless, copying the journeys POST route pattern,
   not the `isAuthed()`-only pattern in the [id] route.

2. **"Shared horizontal funnel component."** The base spec pointed at
   `Pipeline.tsx`; recon shows the student funnel is actually an inline
   count-cell grid (`app/admin/students/page.tsx:118-142`). Phase 1
   extracts that grid pattern into a small shared component (e.g.
   `app/admin/_components/StageStrip.tsx`), uses it for the donor stage
   strip, and migrates the students page to it in the same PR only if the
   diff stays small; otherwise students migrate in a follow-up.

## B. Phase 3 changes (enrollment write path)

1. **Guard list is now four items:** `do_not_contact`, no email on file
   (`emails[0]` falsy), duplicate handling per B.2, and org scoping from
   session context. The email guard mirrors the cron's `tryEnroll`
   precondition; without it a manual enrollment dies silently at the next
   cron run.

2. **Duplicate handling: mutate, don't insert-around.** The DB enforces
   `unique (journey_id, constituent_id)` with no status qualifier, and the
   cron's upsert depends on that constraint. Therefore:
   - Existing enrollment with `status: 'active'` → refuse with a visible
     "already enrolled" message.
   - Existing enrollment with `status: 'cancelled'` or `'completed'` →
     reset that row: `status: 'active'`, `current_step: 0`,
     `next_run_at = now() + steps[0].delay_days`, `last_step_at: null`.
     This is how re-enrollment works in v1.
   - No existing row → insert, matching the cron's exact row shape
     (`current_step: 0`, `next_run_at` per step-0 delay, `org_id` from
     session).

3. **No pause on individual enrollments in v1.** The check constraint
   allows only `active`, `completed`, `cancelled`. Phase 3 ships enroll +
   cancel. The profile panel copy should not promise pause. Pausing a whole
   journey (existing feature) covers the hold-everything case. The proper
   fix (add `paused` to the check constraint plus a partial unique index on
   active enrollments, with the cron upsert reworked to match) is assigned
   to the Epic I Phase 6 journey engine retrofit, where the cron is being
   rewritten anyway. Add it to that spec's scope when it's drafted.

4. **Definition of done, amended items:**
   - Enrolling an email-less constituent is refused with a visible message;
     no row written or mutated.
   - Enrolling a donor with a cancelled or completed enrollment resets that
     row and the cron advances it on the next run (verify in a test
     journey).
   - "Paused" appears nowhere in the enrollment UI.

## C. Phase 1 clarification (lifecycle inputs)

The profile's full-history query fetches `gift_date` only; the page's
lifetime total sums the 500-row timeline query, so stage derived from it
would be wrong past 500 gifts. Phase 1 extends the full-history query to
`select("gift_date, amount")` (still `.limit(5000)`) and derives both
`giftCount` and `lifetimeAmount` from it. The donors table already
paginates the full gifts spine, so table and profile reconcile.

`MAJOR_DONOR_THRESHOLD` moves from `donors/page.tsx` (module-private,
single consumer) into `lib/fundraising/lifecycle.ts`; the page imports it.
Don't touch the unrelated 10,000-valued constants in `segments.ts`,
export routes, or `lib/admin/thresholds.ts`.

## D. Appendix B update

Candidate index when Phase 2 lands, if the profile join needs it
(reviewable SQL, Remi applies via dashboard; do not pre-apply at zero
enrollments):

```sql
create index journey_enrollments_constituent_idx
  on public.journey_enrollments (constituent_id);
```

## E. Out-of-build follow-ups (tracked, not built here)

1. Regenerate `supabase/tests/tenant-default-ratchet.sql` baseline from the
   live schema; reconcile the migration plan's hardcoded-defaults count.
2. Epic I Phase 6 scope addition: enrollment `paused` status + partial
   unique index + cron upsert rework.
3. Constituent merge route deletes the duplicate's enrollments rather than
   reassigning. Acceptable today; revisit when enrollments carry history
   worth preserving.
