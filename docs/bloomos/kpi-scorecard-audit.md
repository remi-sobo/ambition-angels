# KPI Scorecard — widget audit before the data-linking work

*Follow-up to Shannon's in-app report (July 3, 2026): the scorecard has "a whole
lot of widgets that need to be linked," it's unclear which are worth keeping,
and the page needed a back link to the Strategic Plan (fixed — the header now
carries "· back to the full plan," matching the People and Review tabs).*

Every "widget" on `/admin/strategic-plan/scorecard` is a row in `plan_kpis`
rendered live — there are no hardcoded cards. So trimming the widget set means
deleting (or re-wiring) database rows, not code. This audit is the full
inventory as of July 15, 2026, from the production database: what's already
linked, what's empty, what looks like a duplicate. **Nothing has been deleted —
the ✂ items below are the list to walk through with Remi; each is a one-click
delete on the plan page (or one SQL line) once confirmed.**

## Already linked to live data — keep, nothing to do (6)

These are `auto` measures: BloomOS computes them on "↻ Refresh metrics" and on
the nightly cron. All have values and a July 3 snapshot.

| Card | Owner | Current / target | Feeds from |
| --- | --- | --- | --- |
| Raised toward the committed floor | Remi | $302.5k / $1.12M | All gifts this FY (Finance) |
| Approved ceiling, stretch | Remi | $302.5k / $1.37M | Same sum vs. ceiling target |
| Corporate raised | Remi | $20k / $100k | Org-type donor gifts (Finance/CRM) |
| Weighted pipeline closing in FY26 | Remi | $410.5k / $650k | Open asks × probability (CRM) |
| Cash runway, months | Shannon | 1.26 / 6 | Cash ÷ burn (Finance snapshot) |
| Grant applications submitted (YTD) | — unassigned | 6 | Grant apps this year |

## ✂ Removal candidates — confirm with Remi, then delete (6)

**Duplicate corporate cards (pick one of three).** The scorecard currently
shows *three* cards tracking corporate dollars:

1. **"Corporate raised"** (auto, $20k / $100k) — the good one; keep it.
2. **"Corporate"** (manual `floor_source_corporate`, empty, same $100k target)
   — ✂ duplicates #1 exactly; delete.
3. **"Corporate dollars secured (YTD)"** (auto, unassigned, no target, $0) — ✂
   counts a narrower thing (steward-stage major gifts) than #1; delete unless
   that distinction matters.

**Unassigned, target-less leftovers.** Four cards sit in the "Unassigned"
section with no owner and no target — they were seeded from the old generic
KPI catalog, not the 2026 OGSM, and mostly restate numbers the owned cards or
the Strategy Narrative already show:

- ✂ "Corporate dollars secured (YTD)" — counted above.
- ✂ "Grant dollars raised (YTD)" ($8.8k) — a slice of "Raised toward the
  committed floor"; the Foundations source card (below) is the OGSM-shaped
  version of this.
- ✂ "Donor updates sent (YTD)" (0) — activity metric, not a 2026 plan measure.
- ? "Grant applications submitted (YTD)" (6) — the only one with real signal;
  keep only if someone owns it and it gets a target, otherwise ✂.

**Redundant boolean.** ✂ "Web-based school platform shipped" (0/1, Remi) —
the same milestone exists as an initiative on the plan; a yes/no shipping
milestone arguably doesn't need a scorecard card. Judgment call.

Deleting all ✂ rows takes the scorecard from 24 cards to 18–19.

## Keep, needs linking — the to-do list for the data work (7)

Empty manual cards where a live BloomOS number exists or is close:

| Card | Owner | To-do |
| --- | --- | --- |
| Foundations ($507.8k target, empty) | Remi | Link to grant dollars received this FY (the `dollars_raised_grants_ytd` computation already exists — point this card at it, or add a source-split of the FY gifts sum) |
| Individual giving ($510k target, empty) | Remi | Same pattern: FY gifts from individual-type donors (Finance/CRM split) |
| Teens active twice a week (0/1,000) | Remi | An `active_teens` auto metric exists ("engaged journey stage"); wire it up if the definition is close enough, else define 2×/week from app data |
| Deeply engaged teens with a connected adult (0/400) | Remi | Needs app engagement data; define the query, until then manual cadence |
| Parents with an active dashboard (0/100) | Remi | Product analytics; manual until instrumented |
| Compliance items on time (0/100%) | Shannon | BloomOS has a compliance module — compute % of items closed by due date |
| Careers exposed per active teen (0/4) | Remi | App data; manual until instrumented |

## Keep as manual — working as designed, just needs a value cadence (5)

These are judgment/count measures with no system of record to link; the card's
"✎ Update" button is the workflow. Each shows its source of truth in the
card's small print.

- Multi-year individual commitments, 3-year (0/10, Remi) — CRM pledges
- Partners with a signed MOU or data agreement (0/8, Remi)
- Partners running twice a week (0/20, Remi)
- Teens through Ambition Coach (0/50, Remi)
- Key hires made: program lead and curriculum (0/2, Remi)
- Future Orientation Score lift (14/14, Remi) — survey; verify 14 is the
  measured lift and not the seeded baseline
- Two-school pilot completed (0/1, Remi)

## Suggested walk-through with Remi

1. Confirm the six ✂ deletions (each is delete-measure on the plan page).
2. Decide owners + targets for anything kept from the Unassigned section.
3. Then start the linking to-dos above, top table first — the two fundraising
   source cards (Foundations, Individual giving) are the highest-leverage and
   the computations mostly exist.
