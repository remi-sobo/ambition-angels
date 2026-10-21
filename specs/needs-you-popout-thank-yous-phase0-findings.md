# Phase 0 findings: Needs-You Popout + Named, AI-Drafted Thank-Yous

**Spec:** `specs/needs-you-popout-thank-yous.md` (Oct 13, 2026)
**Read:** 2026-10-13, repo at `claude/modest-tesla-jk1pqs`, live DB `Ambition-Angels` (kzzdtibbwsucloaoqpqa)
**Status:** read and report only. No code, no migrations. Stop and wait for Remi.

---

## TL;DR: five things that change the plan

1. **BloomOS already has an acknowledgments system, and the spec doesn't account for it.** `/admin/fundraising/acknowledgments` (embedded in Fundraising → Today) already has:
   - an AI draft route (`app/api/admin/acknowledgments/draft/route.ts`)
   - a Resend send route that appends the IRS receipt block (`…/send/route.ts`)
   - mark-thanked by channel: letter, call, text, in person (`…/mark/route.ts`)
   - an `acknowledgments` log table, `ack_templates`, a letters page and a thank-a-thon
   - an ack-to-task bridge (`lib/fundraising/ack-tasks.ts`)
   - a stewardship rules engine (`stewardship_rules`, `lib/fundraising/stewardship.ts`)

   So PR 3 and PR 4 should reuse these routes, not create `/api/fundraising/gifts/[id]/*`. The "write from scratch outside BloomOS" premise in the Current-vs-desired table is wrong, and so is "Sending is out of scope": sending already ships.
2. **The acknowledgment window and the major-gift threshold already have a home: `stewardship_rules`.** AA's rules include:
   - `Major gift $1,000+, personal call`: 24h SLA, `min_amount 1000`, plus an escalate rule that creates a task for Remi
   - `$250 and up, personal email`: 48h
   - `In-kind, letter`: 72h
   - `First gift, welcome call`: 48h

   Decisions 1 and 2 answer themselves. The due date is gift date plus the matched rule's `sla_hours`. "Major" means a matching `escalate` rule exists. Do not use `fr_gift_tables.major_threshold`: it is a gift-table *level* boundary, not a gift threshold, and AA's only table is a draft with it null.
3. **The dedupe affects six gifts, not one.** Six open tasks link to donors who have a pending gift: five `sys:escalate:<gift>` "Personally thank…" tasks and one `sys:gift:<gift>` task. They link to the gift **by label**, which is stronger than the constituent link the spec planned to use. Two of them are titled "Unnamed person" (Aston Motes, Scott Kleper) because the names were captured before the constituents were named.
4. **The top three are very likely already thanked.** The escalation tasks for Lynne O'Hara ($50K, done Jul 14), Amy Badiani ($25K, done Jul 27) and Fast Forward ($20K, done Jul 27) were marked done by their owner. The gifts are still `pending`, because closing an escalation task does not flip the gift (by design, `ack-tasks.ts:25-28`). Decision 4 is real: $95K of the list probably needs Mark sent, not a draft. The DoD line "first row reads Lynne O'Hara" should be dropped.
5. **Today's Done button corrupts acknowledgment state.** `resolve_obligation('acknowledgment')` (`supabase/migrations/spec_fr_next_step_obligations.sql:318-328`) sets `acknowledgment_status = 'sent'` but has three gaps:
   - it does **not** set `acknowledged_at`;
   - it does not close the `sys:gift` / `sys:escalate` task;
   - it writes no `acknowledgments` row.

   The milestone and journey crons key on `acknowledged_at` (`app/api/cron/stewardship-milestones/route.ts:172-174`, `app/api/cron/journeys/route.ts:182-183`), so any gift "Done" from Today silently drops out of them. PR 3's acknowledgment panel should call `/api/admin/acknowledgments/mark`, and the RPC branch should be fixed or retired. The fix is a migration, so it ships alone as a PR.

---

## 1. Today page and the "Needs you" query

- `app/admin/today/page.tsx:91` calls `getTodayData()` (`lib/admin/today.ts`) and renders `app/admin/today/_components/NeedsYou.tsx` (`page.tsx:120`).
- **It does read `v_obligations`**, on the session (RLS) client with `.eq("org_id", ctx.orgId).limit(500)` (`lib/admin/today.ts:67-71`). It selects only `id, type, title, why_it_matters, due_date, state, module`. `related_entity_*` and `owner_id` are not fetched; PR 1 needs `related_entity_id` to reach the gift.
- No post-read filter (snooze, owner, entitlement, dedupe, type). Ranking is in `lib/admin/todayRank.ts:39-52`:
  1. bucket: overdue, then today, then future, then undated
  2. `due_date` ascending
  3. `SOURCE_WEIGHT` (acknowledgment = 3)
  4. title
- The card shows 7 rows (`SHOW_CAP`); "Show all N" uses `obligations.length` (`NeedsYou.tsx:33,140`).
- `/admin/queue` (`NeedsYouQueueClient.tsx`, `lib/admin/actionQueue.ts`) is a **different** surface on `v_action_items`. It already dedupes an ack row against its `sys:gift` task (`actionQueue.ts:136-146`); Today does not.

**147 vs 141.** I could not reproduce a structural gap.
- Snoozes are already excluded **inside** the view (`snoozed_until <= current_date` on the ops, grant, compliance and opportunity arms), so snoozes are not the cause.
- Run as Remi under RLS (`set role authenticated` with his JWT claims), the view returns **149** rows for AA right now: 72 overdue, 19 due today. That is identical to the service-role count, so RLS hides nothing for an owner.
- There is no cached briefing headline for today (the last is Sep 8), so the subtitle is the composed `ranked.length` line.
- Conclusion: the screen count is the view count at the moment of render. 147 and 141 were taken at different times; `ops_task` alone went from 91 to 93 since the spec was written.
- One real drift: `todayISO` is UTC (`today.ts:62`), so after 5pm Pacific "due today" and "overdue" roll a day early. Worth fixing in PR 1 alongside the due-date change.

**The view has 10 arms, not 7** (`spec_fr_next_step_obligations.sql:33-229`): `reconciliation_item`, `application_pending` and `fr_next_step` exist too. AA has none of those open today. YGB has `reconciliation_item` (1) and `fr_next_step` (6); SafeSpace has `fr_next_step` (38). The popout registry needs entries or the fallback for all ten.

## 2. How the acknowledgment arm computes `due_date`

From live `pg_get_viewdef`:

```sql
select 'acknowledgment:' || g.id, g.org_id, 'acknowledgment', 'Thank-you due' as title,
       null as why_it_matters, null::uuid as owner_id, g.gift_date as due_date, …
       'gift' as related_entity_type, g.id as related_entity_id, … null::date as snoozed_until
from gifts g where g.acknowledgment_status = 'pending'
```

- Confirmed: `due_date = gift_date`, the title is a literal, and there is no owner and no snooze.
- The view is `security_invoker=on`. It has no org join; tenancy comes from RLS plus the caller's `.eq(org_id)`.
- The spec's query sketch is fine as a model. The cheapest PR 1, though, is a TS join in `getTodayData`:
  1. fetch the pending gifts, their constituents and lifetime counts for the `acknowledgment` ids;
  2. compute `ack_due` in TS from stewardship rules;
  3. leave the view alone.

  Changing the view is a migration. If PR 1 is meant to be migration-free, do the join in TS.

## 3. Writers of `acknowledgment_status` / `acknowledged_at`

| Writer | Value | Can it reset `sent` → `pending`? |
|---|---|---|
| HubSpot projection `fr_sync_hubspot_to_spine()` (latest `fr_sync_resolve_companies_via_external_refs.sql:149-175`, via `lib/hubspot/sync-engine.ts:327`) | Insert-only with `not exists`: `pending` if `close_date >= current_date - 30 days`, else `not_required` | **No.** Existing gifts are skipped; there is no update or `ON CONFLICT`. |
| Stripe `fr_ingest_donation` trigger (`dedupe_payment_gifts_against_deal_gifts.sql:13-110`) | `pending` if amount ≥ $250, else `not_required`; `on conflict do nothing` | No |
| Manual gift `app/api/admin/gifts/route.ts:100-142` | default `pending`, then `processGiftStewardship` | No |
| `lib/fundraising/stewardship.ts:167-221` (`setGiftStatus`, `autoSendReceipt`) | `pending` / `not_required` / `sent`; all guarded by `.neq('sent')`; send failure reverts to `pending` | Only a failed send in the same request |
| CSV import `app/api/admin/import/constituents/route.ts:131-150` | `decideImportStatus` | No (insert) |
| Pledge payment `app/api/admin/pledges/payments/[id]/route.ts:63-75` | default `pending` | No (insert) |
| `/api/admin/acknowledgments/send` (`:85-90`, `:133-136`) | claims `sent` + `acknowledged_at` with `.eq('pending')`; a definitive Resend error reverts to `pending` | Only its own failed send |
| `/api/admin/acknowledgments/mark` (`:34-39`) | `sent` + `acknowledged_at`, `.neq('sent')`, closes the ack task, logs to `acknowledgments`, audits | No |
| `resolve_obligation` RPC (`spec_fr_next_step_obligations.sql:318-328`) | `sent` **without `acknowledged_at`** | No, but see TL;DR 5 |

**Why 198 are `not_required` and 19 `pending`.** There is no fixed cutoff. It is a rolling 30-day window at insert time:
- All 198 were inserted in one backfill on Jun 17, so anything that closed before about May 18 became `not_required`.
- The 19 arrived through incremental sync between Jun 29 and Jul 3.

**Side finding: HubSpot sync looks stalled.**
- `hs_deals.synced_at` maxes out at **Jul 30**.
- The last closed-won deal in the mirror closed **Jul 3**.

So either nothing has closed in HubSpot since July, or the sync cron hasn't run for about 10 weeks. That is outside this spec, but worth a look (see `docs/cron-restoration-plan.md`).

## 4. Current Done and Snooze per type

Today posts `POST /api/admin/obligations` (`app/api/admin/obligations/route.ts:43-59`), which calls the `resolve_obligation` / `snooze_obligation` RPCs on the session client. Buttons come from `lib/admin/today.ts:43-44`.

| Type | Done | Snooze |
|---|---|---|
| `ops_task` | `status='done', completed_at=now()` | `snoozed_until` |
| `grant_requirement` | `status='submitted', submitted_at=now()` | `snoozed_until` |
| `compliance_item` | inserts `compliance_filings`; then either rolls `due_date` forward and sets `upcoming`, or sets `filed` | `snoozed_until` |
| `acknowledgment` | `acknowledgment_status='sent'` only (see TL;DR 5) | not offered; the RPC raises (no column) |
| `fr_next_step` | the RPC supports it (clears the next step), **but Today shows no buttons** | RPC supports it; not shown |
| `metric_stale`, `session_unrecorded`, `document_renewal`, `reconciliation_item`, `application_pending` | RPC raises "resolves through its own surface"; Today shows no buttons | same |

- Snooze is "tomorrow" when the row is overdue or due today, otherwise +7 days (`NeedsYou.tsx:55-56,108`).
- No undo exists anywhere today.
- Acknowledgments have no snooze column, so the spec's shared-shell Snooze needs either a hide-for-the-session behavior or a column (a migration) for that type.

## 5. Reusable overlay and keyboard pieces

- **`app/admin/_components/ui/Modal.tsx`** is the base to build on. It already has focus-in with return to the opener, capture-phase Escape (`:57-82`), a Tab trap, scroll lock, a bottom sheet on mobile, `size sm|md|lg`, and `title/description/footer` props.
- **Side-drawer precedents:**
  - `app/admin/fundraising/campaigns/gift-tables/[id]/_components/LevelDrawer.tsx`: a client drawer on `Modal`.
  - `app/admin/fundraising/donors-funders/_components/ResearchDrawer.tsx:52-102`: a URL-driven right drawer.
- **Focus trap:** `app/admin/capture/_lib/useFocusTrap.ts`. `EditSheet.tsx:52-64` shows nested Escape handling with `stopPropagation`.
- **Preview-then-open pattern:** `app/admin/_components/search/EntityProfile.tsx` (the 360 preview with "Open full page →", `:37`).
- **Keyboard:** `GlobalSearch.tsx` owns ⌘K, `/`, the arrow keys and Enter (`:110-141`, `:265-284`). **There is no J/K and no shared hotkey hook.** PR 2 adds one and must skip keys while focus is in an input, as GlobalSearch already does for `/`.
- **Ready-made panel bodies:**
  - `app/admin/_components/TaskEditModal.tsx` for the ops_task panel; it already PATCHes `/api/admin/ops/tasks/{id}`, which covers reschedule and reassign.
  - `AckComposer.tsx` and `LogAckButton.tsx` for the acknowledgment panel.
  - `feedback/ToastProvider.tsx` for undo toasts.

## 6. "Open full record" targets

There is no `href` column in the view. Today links every row to its module list via `SOURCE_FALLBACK_HREF` (`actionQueue.ts:91-105`). A record-level resolver already exists: `resolveEntities()` in `lib/admin/entities.ts:184-232`, which uses the `entity_types.route_pattern` registry. `/admin/queue` uses it (`actionQueue.ts:172-197`) and Today should too.

| Type | Full record |
|---|---|
| `ops_task` | **No task detail page.** Open `TaskEditModal`, or `/admin/work/tasks` |
| `acknowledgment` | **No gift detail page.** Use the donor 360 `/admin/fundraising/donors-funders/{constituent_id}` |
| `compliance_item` | `/admin/organization/compliance/{id}` |
| `grant_requirement` | `/admin/fundraising/grants/{grant_id}` (`related_entity_id`) |
| `session_unrecorded` | `/admin/programs/cohorts/{cohort_id}/sessions/{session_id}` (`related_entity_id` is the cohort; the session id is in `id`) |
| `fr_next_step` | donor 360 via `related_entity_id` |
| `metric_stale` | no per-metric page; `/admin/impact/kpis` |
| `document_renewal` | no per-document page; `/admin/work/documents` |

The spec's DoD "`O` opens the full record" cannot be literal for tasks, metrics or documents. Either define "record" per type as above, or add the pages as separate scope.

## 7. Anthropic usage

- **Gateway:** `lib/ai/gateway.ts`.
  - `generateText` / `generateStructured`.
  - Tiers: `fast` = `claude-sonnet-4-6`, `deep` = `claude-opus-4-8` (`:33-36`).
  - Caches the system prompt and runs `cleanVoiceText`, which strips em dashes.
  - The key is read in `requireKey()`. **There is no timeout or retry config anywhere**, so the spec's 20-second timeout is new work.
- **Ledger and cap:** `lib/ai/ledger.ts` `logAICall` writes to `ai_calls` (ids, tokens and cost only; its `surface` comment already lists `'acknowledgment'`). `lib/ai/cap.ts` has `orgOverAICap`.
- **Logging:** no prompts or drafts are logged anywhere; only `console.error` on failure. The DoD log check should already pass.
- **Best precedent for a donor email:** `lib/agents/next-move/{prompt,agent}.ts` (a per-org prompt builder, structured `email_subject` / `email_body`), with the full guard chain in `app/api/admin/fundraising/next-move/route.ts:359-445`:
  1. key check
  2. `requireEntitlement`
  3. rate limit
  4. AI cap
  5. `logAICall`
- **The existing ack draft route is the thing to upgrade.** It has these gaps against the spec:
  - It is gated by `isAuthed()` only: no `getOrgContext`, no entitlement, no AI cap, no `logAICall`.
  - It loads the gift by id with **no `org_id` filter**, relying on RLS. Remi owns AA, SafeSpace and Young Life EPA, so RLS alone lets him draft for any of the three while another org is active.
  - Its prompt is inline. AA's identity is hardcoded behind `isResident`, and non-resident orgs get a neutral never-invent rule.
  - It outputs a 2-4 sentence note body with no subject, no signer, no gift `notes`, no campaign/fund/appeal, and no talking-points branch.
- **Send-path tenant bug (outside this spec, but blocks YGB use):** `send/route.ts` and `stewardship.ts:216` send from a hardcoded `"Ambition Angels <careers@mail.ambitionangels.org>"` for every org. `org_comms_settings` (from name, from email, reply-to) exists but is not used here.

## 8. Permissions and RLS

- `private.has_permission(org, perm)` (`create_bloomos_core.sql:71-84`). Owner, admin and staff all hold `fundraising.read/write` and `ops.read/write`. There are no fundraising sub-permissions.
- Live policies:
  - `gifts` and `constituents`: read requires `fundraising.read`; all other operations require `fundraising.write`.
  - `ops_tasks`: `ops.read` / `ops.write`.
  - `org_entitlements`: member read; `org.manage` write.
- Fundraising routes **do not check permissions in code**; they rely on RLS through `createServerSupabase()`. Decision 6 (drafting uses the same permission as mark-sent) means `fundraising.write`, which RLS already enforces on the mark/send update. The draft route only reads, so it needs an explicit `hasPermission(…, 'fundraising.write')` (`lib/admin/permissions.ts:17-32`) if drafting should require write access.

## 9. Homes for config

| Need | Existing home | Migration? |
|---|---|---|
| AI drafting gate | `org_entitlements` key, e.g. `ai.ack_draft`; add it to `FEATURE_KEYS` in `lib/admin/entitlements.ts:27-67`; check with `requireEntitlement` | No DDL, but the seed rows go through a migration file (the ledger CI convention; existing keys are `seed:*`) |
| Ack window | `stewardship_rules.sla_hours` (per rule: 24/48/72) | No |
| Major-gift threshold | `stewardship_rules` `escalate` rule `conditions.min_amount` (AA: $1,000, matching decision 2) | No |
| Preferred channel per gift | `stewardship_rules.channel` (call / email / letter) + `constituents.preferred_ack_channel` (null for all 23) | No |
| Signer name and title, tone notes, style rules, mission line | **None.** Options: `orgs.settings` jsonb (exists; only `email_domain` used); `org_comms_settings` (has `from_name`, not title or tone) | jsonb: no DDL, but needs a write path. New columns: PR 4a. |

`org_terminology` is a label map (student → Scholar), not a settings home. `org_settings` holds only `default_steward` and is service-role only.

**Recommendation:** put voice in `orgs.settings.ack_voice = {signer_name, signer_title, tone_notes, style_rules, mission_line}`. That needs no DDL. Seed AA's values in a reviewed migration (data only), and fall back to the platform defaults in the spec's failure-modes table.

## 10. Tenant isolation on Today

- `getOrgContext` (`lib/admin/auth.ts:83-112`) takes the active org from the `bloom_active_org` cookie, honoured only when it matches a membership; otherwise it uses the oldest membership.
- Every Today read filters `.eq("org_id", ctx.orgId)`, including the service-role reads (`today.ts:67-93`).
- Obligation RPCs re-check `has_permission` against the row's own org.

**There is no path on Today that returns another tenant's rows.** The caveat that matters for the new routes: RLS is permission-scoped, not active-org-scoped. Remi is an owner in three orgs, so **every new route must add `.eq('org_id', ctx.orgId)`** when loading the gift. The existing draft and send routes do not, and that is the exact gap behind the spec's "404 for an AA gift id" DoD.

(YGB check: the YGB demo login is a separate account, not Remi. YGB has 3 pending gifts: Gerald Hollis $1,000 "After his program tour", Yvette Carver $500, Erica Fitzgerald $250 "Follow-on after the gala". This confirms the gala-note test fixture.)

---

## Conflicts with the spec, and a proposed re-cut

| Spec says | Reality | Proposal |
|---|---|---|
| Write the thank-you outside BloomOS | Composer, AI draft, send and mark exist in Fundraising → Today | The popout's ack panel **embeds the existing composer flow** |
| New routes under `/api/fundraising/gifts/[id]/…` | Convention is `/api/admin/...`; ack routes exist | Add `GET /api/admin/acknowledgments/context?gift_id=`; reuse `/mark`; upgrade `/draft`; add `POST /api/admin/acknowledgments/unmark` for undo |
| Sending is out of v1 | `/send` ships via Resend with the IRS block (legally needed for gifts of $250 or more) | Keep Copy and open-in-mail as the spec says. Point to the existing Send only for orgs whose `org_comms_settings` sender is set, after the hardcoded-from bug is fixed |
| Due = gift date + org window (2 days) | Rules already carry per-rule SLAs | Due = gift date + matched rule's `sla_hours`, with 48h fallback |
| Major threshold: org config, then gift table | `escalate` rule at $1,000; gift-table threshold means something else | Major = a matching `escalate` rule |
| Dedupe via constituent link, Linda only | 6 tasks link by `sys:gift` / `sys:escalate` labels; `/admin/queue` already dedupes `sys:gift` | Reuse the `actionQueue.ts:136-146` logic; attach `sys:escalate` tasks to the ack row rather than hiding them |
| Today's Done "unclear what it writes" | Writes `sent` without `acknowledged_at`, leaves tasks open, no log | Route the ack Done through `/mark` now. Fix the RPC in a stand-alone migration PR (sets `acknowledged_at`). It cannot close tasks from SQL cleanly, so the app path should own it |
| Barenblat household thank-you | `household_id` is null on all three | Out of scope; set the household first if wanted |
| DoD: first row is Lynne O'Hara | Her escalation task was closed Jul 14 | Reconcile first (decision 4); drop the name from the DoD |

## Suggested reconciliation (decision 4)

The evidence says these three were personally thanked. Use the **existing Mark-thanked button** in Fundraising → Today rather than raw SQL: it also closes the tasks and writes the `acknowledgments` row.

- Lynne O'Hara, $50,000 (escalation done Jul 14)
- Amy Badiani, $25,000 (escalation done Jul 27)
- Fast Forward, $20,000 (escalation done Jul 27)

For the other 17, the open escalation tasks for Colleen Tate, Aston Motes, Scott Kleper, Kevin Barenblat and Linda Williams suggest they have not been thanked. The 12 small HubSpot gifts have no task at all, because HubSpot is not a taskable source (`ack-tasks.ts:40`), so there is no evidence either way.
