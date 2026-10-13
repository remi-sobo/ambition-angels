# Spec: Needs-You Popout + Named, AI-Drafted Thank-Yous

Oct 13, 2026 · @Remi

Today's "Needs you" card lists 20 overdue thank-yous worth $114,737.50 for Ambition Angels and never says who they're for. The donor is on every row in the database. This spec names the rows, gives every Needs-you item a popout you can act from (with one click to the full record), and adds an AI thank-you draft scaled to the gift. Version one needs no migration.

## Problem

Every gift-acknowledgment row on Today reads "Thank-you due" with a date. The card queries `gifts` where `acknowledgment_status = 'pending'` but never joins `constituents`, so a $50,000 gift from a six-time donor looks identical to a $10 first gift.

Three more problems ride along:

- **Due date equals gift date.** Lynne O'Hara's gift is dated Jun 26 and her thank-you is "due Jun 26." Every gift is overdue the day it lands, which trains people to ignore the red chip.
- **Duplicate obligations.** Linda Williams appears twice: once as her $1,000 gift row, once as an ops task ("Personally thank Linda Williams for their $1,000 major gift").
- **Stale statuses.** 19 of the 20 pending gifts came from HubSpot between Jun 26 and Jul 3. The 198 older HubSpot gifts were imported as `not_required`. This looks like a sync cutoff, so some of these may already be thanked outside BloomOS.

## Who's affected

- **Remi (AA, owner):** opens Today and can't act on 20 of 141 items without leaving the page.
- **Shannon Fair (AA, operations):** if she works acknowledgments, the same blind list applies. The due-date fix changes the overdue count she sees on Today.
- **Young, Gifted & Black (tenant):** has 3 pending acknowledgments in the same table today. Gets the same fix and must never see AA donors.
- **Every future tenant:** donor stewardship is the most common thing a small nonprofit falls behind on. A named list plus a fast first draft is a core selling point, not an AA nicety.

## Current vs desired behavior

| Moment | Today | After this ships |
| --- | --- | --- |
| Scanning the card | "Thank-you due · Overdue 2026-06-26" | "Thank Lynne O'Hara · $50,000 · Jun 26 · 6th gift" |
| Ordering | By due date, so $10 gifts sit above $25K gifts | Overdue first, then by amount descending |
| Due date | Equals gift date | Gift date plus the org's acknowledgment window (default 2 days) |
| Clicking a row | Nothing; only Done | Opens a drawer with the gift, the donor's history, and notes |
| Writing the thank-you | Leave BloomOS, write from scratch | **Draft thank-you** button returns an editable draft in the org's voice |
| Sending | Outside BloomOS | Copy, or open in mail with To and Subject filled |
| Closing it out | Done button, unclear what it writes | **Mark sent** sets `acknowledgment_status = 'sent'` and `acknowledged_at = now()` |
| Major gifts | Same row as a $10 gift | Drawer recommends a call or handwritten note first and drafts talking points |
| Linda Williams | Two items | One item; the task links to the gift instead of competing with it |

The drawer reads like this for the top row:

> **Lynne O'Hara** · $50,000 · gift Jun 26, 2026 · HubSpot 6 gifts lifetime · last before this: \[date\] · email on file Above major-gift threshold: call or handwritten note recommended before email. \[Draft talking points\] \[Draft email\] \[Mark sent\]

## Scope

**In**

- Donor name, amount, gift date, and lifetime gift count on every gift-ack row on Today
- Overdue-first, amount-descending sort for gift-ack rows
- Acknowledgment window read from org config, defaulting to 2 days, so "due" stops equaling gift date
- A popout on every Needs-you row: shared shell, per-type panels, keyboard navigation, one-click open full record. The gift-ack panel shows gift facts, donor history, notes, preferred channel, and the do-not-contact flag
- Mark sent (writes existing columns) and an undo within the session
- AI draft: email for standard gifts; talking points plus email for gifts at or above the major threshold
- Copy and open-in-mail actions
- Org-level voice settings (signer name, signer title, tone notes) stored as data
- Entitlement gate for AI drafting
- Dedupe: an ops task that references a gift renders as one row with the gift

**Out (v1)**

- Sending email from BloomOS. Remi copies or opens his own mail client. Sending is its own spec (deliverability, Gmail connection, audit).
- Saving drafts or a draft history table
- Bulk drafting ("draft all 12 small gifts")
- Year-end tax receipts and receipt numbering
- Writing acknowledgment status back to HubSpot
- Handwritten-note or call logging beyond mark-sent
- Backfilling `why_matters` on constituents (none of the 20 have it today; the feature works without it)

## Where "Needs you" comes from

The card reads `v_obligations`, a `security_invoker` view that unions seven source types into one list. Its AA numbers match the screen exactly: 68 overdue and 4 due today. The view returns 147 open rows against 141 on screen; the 6-row gap is most likely snoozed items, which Phase 0 confirms.

| Type | Source | Open | Overdue | What "handle it" means |
| --- | --- | --- | --- | --- |
| `ops_task` | `ops_tasks` | 91 | 34 | Done, snooze, reschedule, reassign |
| `acknowledgment` | `gifts` pending | 20 | 20 | Draft thank-you, mark sent |
| `compliance_item` | `compliance_items` | 12 | 2 | Mark complete, attach proof |
| `metric_stale` | metrics | 11 | 3 | Enter the new value |
| `session_unrecorded` | cohort sessions | 5 | 5 | Record attendance or mark not held |
| `grant_requirement` | `grant_requirements` | 4 | 4 | Mark submitted |
| `document_renewal` | documents | 4 | 0 (1 due today) | Mark renewed with new expiry |

Two findings from the task rows: 31 open tasks have no due date, and 10 tasks link to a constituent or grant through `linked_entity_type` / `linked_entity_id`. That link is enough to dedupe the Linda Williams case without a migration (see Dedupe).

## Popout for every item

Every row on "Needs you" opens a popout, not just thank-yous. You handle the item there; one click takes you to the full record when you need more.

_(diagram: Needs-you data flow and popout; not carried into the repo copy)_

The view and card already exist; the popout is the only new piece in this flow.

- **Shell (shared):** title, type chip, due state, owner, why-it-matters, related entity link, and a footer with Snooze, Done, and **Open full record** (keyboard: `Enter` opens the popout, `O` opens the record, `J`/`K` next and previous, `Esc` closes). Next and previous let you clear the list without going back to the card.
- **Body (per type):** a small panel registered by obligation `type`. The acknowledgment panel is the gift drawer and AI draft in this spec. Other types get their own quick actions from the table above.
- **Registry, not branches:** a map of `type → { panel, actions, recordHref }`. A tenant with the compliance module off never sees that type, because the view and entitlements already filter it. New obligation types plug in without touching the shell.
- **Unknown type fallback:** shell only, with Open full record. Nothing on the card is ever unclickable.
- **Optimistic and reversible:** Done and Snooze update the row immediately, with a 5-second undo toast, and the count at the top refreshes.

"Done" means something different per type, so each panel defines its own primary action and the shell's Done calls it: mark sent for an acknowledgment, complete for a task, submit for a grant requirement. A stale metric has no Done; its primary action is "Enter value."

## Architecture

Everything v1 needs already exists in the live schema. The work is a join, a drawer, two server routes, and a prompt.

### Live tables this touches

| Table | Columns used | Notes |
| --- | --- | --- |
| `gifts` | `id, org_id, constituent_id, amount, gift_date, external_source, acknowledgment_status, acknowledged_at, notes, campaign_id, fund_id, appeal_id` | Status values seen: `pending`, `sent`, `not_required`. All 23 pending rows have a `constituent_id`. |
| `constituents` | `type, first_name, last_name, org_name, emails[], preferred_ack_channel, do_not_contact, why_matters, household_id` | `type` is `person` or `organization`. Fast Forward has no email. |
| `ops_tasks` | title, due\_date, snoozed\_until, linked\_entity\_type, linked\_entity\_id, linked\_label | 91 open for AA. Links to constituents and grants via linked\_entity\_type / linked\_entity\_id; none link to a gift. |
| `org_entitlements` | TBD in Phase 0 | Gate key for AI drafting. |
| `org_terminology` or org settings | TBD in Phase 0 | Home for voice, signer, ack window, major threshold. |
| `fr_gift_tables` | `major_threshold, status` | Fallback source for the major-gift line. |

### Read path: the Today row

The Today query joins `constituents` and adds a lifetime count. Display name is `org_name` for organizations, `first_name last_name` for people, and "Unnamed donor" if both are empty (never a blank row).

```sql
select g.id, g.amount, g.gift_date, g.external_source,
       g.gift_date + make_interval(days => :ack_window_days) as ack_due,
       c.id as constituent_id, c.type, c.first_name, c.last_name, c.org_name,
       (select count(*) from gifts g2
         where g2.constituent_id = g.constituent_id
           and g2.org_id = g.org_id) as lifetime_gifts
from gifts g
join constituents c on c.id = g.constituent_id and c.org_id = g.org_id
where g.org_id = :session_org_id
  and g.acknowledgment_status = 'pending'
order by (g.gift_date + make_interval(days => :ack_window_days)) < now() desc,
         g.amount desc;
```

The join keeps `c.org_id = g.org_id` as a belt-and-suspenders check on top of RLS. `:session_org_id` comes from the session, never a constant.

### Server routes

1. **`GET /api/fundraising/gifts/[id]/ack-context`** returns the drawer payload: gift facts, donor display name, first email, preferred channel, do-not-contact, lifetime count, previous gift date and amount, campaign/fund/appeal names, and whether the gift clears the major threshold.
2. **`POST /api/fundraising/gifts/[id]/ack-draft`** with `{ kind: 'email' | 'talking_points', nudge?: string }` returns `{ subject, body }` or `{ points[] }`. Not persisted.
3. **`POST /api/fundraising/gifts/[id]/acknowledge`** with `{ channel }` sets `acknowledgment_status = 'sent'` and `acknowledged_at = now()`. An undo route resets both while the drawer is open.

Every route resolves `org_id` from the session, loads the gift with `org_id` in the where clause, and checks `private.has_permission(org_id, <fundraising perm>)`. The draft route also checks the entitlement and refuses when `do_not_contact` is true.

### AI draft

The server builds the prompt from facts it loaded itself. The client never sends donor data to the draft route, only the gift id and an optional nudge ("warmer," "mention the gala"). The model gets:

- Donor: display name, first name, person or organization, lifetime gift count, previous gift date
- Gift: amount, date, campaign, fund, appeal, and the gift's `notes` (Erica Fitzgerald's "Follow-on after the gala" is exactly what makes a draft specific)
- Org: name, mission line, signer name and title, tone notes, style rules
- Hard rules: use only these facts, no invented program outcomes or numbers, no tax language unless the org's config supplies it, under 150 words for email

The major-gift branch drafts talking points for a call first, then the email. The prompt template lives in code as a platform default; each org's voice settings are data. AA's style rules (no em dashes, contractions, specific over vague) are AA's config row, not hardcoded.

Model and client wrapper follow whatever the repo already uses (Phase 0 item 5). Draft bodies and donor details stay out of logs; log only gift id, org id, latency, and token counts.

### Dedupe

The "Personally thank Linda Williams" task links to her constituent record (`linked_entity_type = 'constituent'`), not to the gift. Rule: when an open `ops_task` links to a constituent who also has a pending acknowledgment, Today shows one row, the acknowledgment, with the task attached in the popout ("Also on your list: personally thank, due Jul 1"). Marking the thank-you sent offers to close the task too. No migration needed.

A second task, "Send thank you gift to Linda Williams" (due Jul 2), has no link at all. It may be a physical gift rather than a note, so it stays its own row.

## Staged build

Each gate is its own PR, merged by Remi before the next starts. PR 1 fixes the naming complaint. PR 2 gives every row a popout. PR 3 and 4 make thank-yous fast.

0. **Phase 0: recon, read and report only.** Prompt in the appendix. No branch, no code. Gate: Remi reads the report and confirms or adjusts open decisions.
1. **PR 1: `today: name thank-you rows`**
   - Join `constituents`, render name, amount, date, lifetime count
   - Overdue-first, amount-descending sort for acknowledgments
   - Ack window from org config if Phase 0 finds a home for it; otherwise a platform constant of 2 days with a TODO pointing at decision 1
   - Commit points: `query: join donor onto acknowledgment rows`, `ui: donor-named acknowledgment row`, `sort: overdue then amount`
2. **PR 2: `today: needs-you popout shell`**
   - Popout component, type registry, keyboard navigation, open full record, optimistic Done and Snooze with undo
   - Registers two panels to start: `ops_task` (done, snooze, reschedule, reassign) and the fallback (shell only)
   - Commit points: `ui: popout shell + registry`, `ui: ops_task panel`, `ui: keyboard nav + undo`
3. **PR 3: `today: acknowledgment panel + mark sent`**
   - `ack-context` and `acknowledge` routes, acknowledgment panel in the popout
   - Do-not-contact and missing-email states; linked-task attachment (the Linda Williams dedupe)
   - Commit points: `api: ack-context route`, `api: acknowledge + undo`, `ui: acknowledgment panel`, `today: fold linked tasks into acknowledgments`
4. **PR 4: `fundraising: AI thank-you draft`**
   - `ack-draft` route, prompt template, entitlement check, org voice config read
   - Email draft for standard gifts, talking points plus email at or above the major threshold
   - Copy, open-in-mail, regenerate with a nudge
   - Commit points: `ai: thank-you prompt template`, `api: ack-draft route`, `ui: draft panel in popout`
5. **PR 5 and on: one panel per remaining type,** in order of volume: `compliance_item`, `metric_stale`, `session_unrecorded`, `grant_requirement`, `document_renewal`. Each is a small PR that registers a panel; until it ships, that type uses the fallback shell.

If PR 4's config needs a new column or table (no existing home for signer and tone), that migration ships alone as **PR 4a** with reviewable SQL for Remi to apply, before PR 4.

## Definition of done

**Popout (PR 2)**

- [ ] Every row on Needs you opens a popout, including types with no panel yet (fallback shell)
- [ ] From the popout, `O` or one click opens the full record
- [ ] `J`/`K` moves through the list without closing; Done on the last item closes the popout
- [ ] Done and Snooze update the row and the header count immediately, with a working undo
- [ ] Rescheduling a task from the popout changes its due date and its overdue state

**Thank-yous (PR 1, 3, 4)**

- [ ] Logged in as Remi on AA, Today's first gift-ack row reads "Lynne O'Hara · $50,000 · Jun 26 · 6th gift" (or whatever is first after status cleanup)
- [ ] No gift-ack row on Today shows "Thank-you due" without a name; Fast Forward shows as "Fast Forward"
- [ ] A gift dated today is not overdue today
- [ ] Logged in to Young, Gifted & Black, Today shows its 3 pending thank-yous and zero AA donors; the draft route returns 404 for an AA gift id
- [ ] Clicking a row opens the drawer with donor history; Fast Forward's drawer says no email on file and hides open-in-mail
- [ ] Draft for Erica Fitzgerald (YGB demo data) mentions the gala because her gift note does; no draft contains a number or program claim not in its input
- [ ] Draft for a gift at or above threshold leads with talking points
- [ ] AA drafts contain no em dashes
- [ ] Mark sent removes the row from Today and sets both columns; undo restores it
- [ ] With the AI entitlement off, the drawer works and the Draft button is hidden, not broken
- [ ] A constituent with `do_not_contact = true` gets no draft button and a visible reason
- [ ] App logs for the draft route contain no donor names or draft text

## Failure modes

| Failure | Likelihood | Impact | Guard |
| --- | --- | --- | --- |
| Thanking a donor twice because the gift was already thanked outside BloomOS | High for the 19 HubSpot gifts | Embarrassing with a major donor | Remi reconciles the 20 before PR 3 ships (decision 4); drawer shows "Source: HubSpot" so it's visible |
| Draft invents impact ("your gift sent 12 students to camp") | Medium without rules | Trust damage, possible misrepresentation | Facts-only prompt, no outcome data passed in, DoD spot-check |
| Cross-tenant leak through the draft route | Low with session org\_id | Severe | org\_id from session, gift loaded with org filter, RLS, YGB test in DoD |
| Changing the due-date rule shifts Today's overdue count | Certain | Shannon and Remi see a different number | Call it out in the PR description; the 68 overdue will drop |
| Organization donors with no email (Fast Forward) | Certain | Dead button | Missing-email state, copy still works, prompt addresses the org |
| Do-not-contact donor gets a draft | Low | Policy breach | Route refuses, UI hides the button |
| Anthropic API slow or down | Occasional | Draft button spins | 20-second timeout, plain error, drawer still usable |
| Donor data in logs | Medium by default | Privacy | Log ids and counts only |
| Tenant without voice config | Every new tenant | Generic drafts | Platform defaults: org name as signer, neutral tone; prompt never says "Ambition Angels" unless that's the org |
| HubSpot sync re-imports and resets status to pending | Unknown | Thanked gifts reappear | Phase 0 item 3 finds every writer of `acknowledgment_status` |

## Open decisions

Each has a recommendation. Silence means go with it.

1. **Acknowledgment window.** Recommend 2 days for email, stored per org. The common stewardship standard is 48 hours, and a configurable number costs nothing.
2. **Major-gift threshold for the call-first branch.** Recommend an org config value, falling back to the active gift table's `major_threshold`. For AA I'd set $1,000, since the Linda Williams task already calls her $1,000 gift "major." That puts 8 of the 20 in the call-first branch.
3. **AI drafting entitlement.** Recommend gating it behind an `org_entitlements` key, on for AA and YGB now. It's a natural line between the base subscription and a higher tier, and the gate is cheap to add before tenant three, painful after.
4. **Reconcile the 20 before building PR 3.** Recommend Remi spends 10 minutes confirming which of the 20 were already thanked and marking them sent (PR 2's button, or a one-off SQL update he reviews). Lynne's $50K comes first either way.
5. **Persist drafts?** Recommend no for v1. A draft history table is useful for coaching tenants later, but it's a migration, and the copy-only version shows whether anyone uses drafts at all.
6. **Who can draft.** Recommend the same permission that can mark a gift acknowledged. No separate AI permission until a tenant asks.

## Appendix

### A. Pending acknowledgments, Ambition Angels (as of Oct 13, 2026)

| Donor | Amount | Gift date | Lifetime gifts | Source |
| --- | --- | --- | --- | --- |
| Lynne O'Hara | $50,000 | Jun 26 | 6 | HubSpot |
| Amy Badiani | $25,000 | Jul 2 | 4 | HubSpot |
| Fast Forward (org, no email) | $20,000 | Jul 3 | 1 | HubSpot |
| Colleen Tate | $10,000 | Jul 3 | 3 | HubSpot |
| Aston Motes | $5,000 | Jul 2 | 1 | HubSpot |
| Linda Williams | $1,000 | Jun 30 | 3 | HubSpot |
| Scott Kleper | $1,000 | Jul 2 | 1 | HubSpot |
| Kevin Barenblat | $1,000 | Jul 2 | 1 | HubSpot |
| Stephanie Mead | $500 | Sep 16 | 1 | Stripe |
| Oliver Hurst-Hiller | $500 | Jul 2 | 1 | HubSpot |
| Heidi Hill | $300 | Jul 2 | 1 | HubSpot |
| Shannon Farley | $100 | Jul 2 | 1 | HubSpot |
| Margo Gordon | $100 | Jul 2 | 1 | HubSpot |
| Kyle Barenblat | $62.50 | Jul 2 | 1 | HubSpot |
| Lily Gu | $50 | Jul 2 | 1 | HubSpot |
| Asher Barenblat | $50 | Jul 2 | 1 | HubSpot |
| Jacob Talbot | $30 | Jul 2 | 1 | HubSpot |
| Gabriella Wong | $25 | Jul 2 | 1 | HubSpot |
| Catherine Gruenstein | $10 | Jul 2 | 1 | HubSpot |
| Nancy Spector | $10 | Jul 2 | 1 | HubSpot |

Three Barenblats gave on Jul 2. One thank-you to the household may land better than three; worth a look before drafting.

### B. SQL

No migration in v1. For decision 4, here's a reviewable one-off for Remi to run after confirming which gifts were already thanked. Fill in the ids; it touches nothing else.

```sql
-- Reviewed by Remi before running. Marks confirmed-thanked gifts as sent.
update gifts
set acknowledgment_status = 'sent',
    acknowledged_at = now()
where org_id = (select id from orgs where name = 'Ambition Angels')
  and acknowledgment_status = 'pending'
  and id in (
    -- 'gift-uuid-1',
    -- 'gift-uuid-2'
  )
returning id, amount, gift_date;
```

### C. Draft prompt template (platform default)

```markdown
You are drafting a thank-you from {{org.name}} to a donor. Write as {{org.signer_name}}, {{org.signer_title}}.

Facts (use only these; do not invent outcomes, numbers, or programs):
- Donor: {{donor.display_name}} ({{donor.type}}), first name {{donor.first_name}}
- Gift: ${{gift.amount}} on {{gift.date}}{{#if gift.campaign}}, toward {{gift.campaign}}{{/if}}
- Giving history: gift #{{donor.lifetime_gifts}}{{#if donor.previous_gift_date}}, previous gift {{donor.previous_gift_date}}{{/if}}
- Note on this gift: {{gift.notes}}
- Mission line: {{org.mission_line}}

Voice: {{org.tone_notes}}
Style rules: {{org.style_rules}}

Task: {{#if kind == "talking_points"}}Write 3 to 5 short talking points for a phone call, then a 2-sentence follow-up email.{{else}}Write a subject line and an email under 150 words.{{/if}}
Adjustment from the user: {{nudge}}
```

AA's `style_rules` value: "No em dashes. Use contractions. Specific over vague. No 'transformative,' 'pivotal,' 'holistic,' 'seamless.' Warm, direct, one clear sentence of what the gift makes possible, without numbers that aren't in the facts."

### D. Phase 0 prompt for Claude Code

```
Phase 0: READ AND REPORT ONLY. No code changes, no branches, no migrations, no PRs.

Feature: (1) name thank-you rows on Today, (2) a popout on every "Needs you" row with
per-type quick actions and one-click open full record, (3) an acknowledgment panel with
mark-sent, (4) an AI thank-you draft.

Known from schema recon: "Needs you" appears to read public.v_obligations
(security_invoker=on). For AA it returns 147 open rows (68 overdue, 4 due today) across
types ops_task, acknowledgment, compliance_item, metric_stale, session_unrecorded,
grant_requirement, document_renewal. The screen shows 141. Pending gifts all have a
constituent_id; the card does not join constituents. ops_tasks has linked_entity_type /
linked_entity_id; one task links Linda Williams as a constituent.

Report back on:
1. The Today page component and the exact query or route feeding "Needs you." Confirm
   it reads v_obligations. Explain the 147 vs 141 gap (snoozes? owner filter? limit?).
2. The v_obligations definition (pg_get_viewdef). How acknowledgment due_date is
   computed; it currently equals gift_date.
3. Every place that reads or writes gifts.acknowledgment_status or acknowledged_at,
   including the HubSpot sync. Could a re-sync reset a sent gift to pending?
4. What the current Done and Snooze buttons call for each obligation type.
5. Existing modal, drawer, or side-panel components and any keyboard shortcut handling
   in the admin app that a popout should reuse.
6. The full-record route for each obligation type (the "open full record" target).
7. Existing Anthropic API usage: client wrapper, model string, where the key lives, any
   prompt-template pattern, and what gets logged.
8. Permission names used in private.has_permission for fundraising and ops, and RLS
   policies on gifts, constituents, ops_tasks.
9. Whether org_entitlements, org_terminology, or an org settings table has a home for:
   AI drafting gate, signer name and title, tone notes, style rules, mission line,
   acknowledgment window, major-gift threshold.
10. Any path where Today could return another tenant's rows. Confirm org_id comes from
    session context everywhere on this page.

Output a written report with file paths and line numbers. Flag anything that conflicts
with the plan above. Stop after the report.
```
