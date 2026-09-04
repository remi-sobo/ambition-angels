# BloomOS V2 — draft rulings for the 45 NEEDS RULING tables

Received from Remi 2026-09-03; **signed by Remi later the same day** and applied to `docs/v2-preservation-ledger.md` as `SIGNED (Remi, 2026-09-03)` lines. The signing accepted all four review corrections (with one correction back — see the R3 note below), decided the three open choices (**R1 → drawer**, **R5 → history list in the Reed panel**, **R8 → pinned Group view, no front door, revisit in October**), ruled the three uncovered tables (`quiz_submissions` → public-site; `bv_*` → public-site, revisit post-launch, no drop during V2), signed the remaining dormant rows (journeys reserved as a **journey surface, explicitly not a saved view**; `reed_next_moves`/`reed_plan_proposals` seated in the Reed panel), reclassified `relationships` to **bound** (it waits on data, not a spec), and introduced the fifth disposition **`public-site`** so the org_id-trap tables stay visible. The codebase review of the draft is appended at the bottom.

---

## 1. Prospect research (11 tables, `fr_prospects` at 550 rows)

**Recommend: a tab, not a saved view.** Fundraising → Donors & Funders gets a `Prospects` saved view for the promoted ones, but the research pipeline itself (scoring, briefs, disqualification, the agent activity log, funding opportunities, `funder_angles`, `strategy_angles`) keeps a route behind `ai.prospect_research`. It is a distinct workflow with an agent, a cost cap, and a promote/disqualify decision, not a filter over donors.

Where it sits: Fundraising's tab row is five wide (Today, Donors & Funders, Pipeline, Grants, Campaigns). Adding a sixth breaks the "one secondary row" contract at narrow widths. Cleaner option is a full-height drawer off Donors & Funders, entitlement-gated, which keeps the tab row at five.

*Ruling needed: sixth tab, or drawer.*

## 2. Meet and booking (6 tables: `meeting_types` 9, `connections` 16, `bookings` 4, `blackouts` 1, `agenda_delegations` 1, `meeting_exclusions`)

**Recommend: split.** Configuration (`meeting_types`, `blackouts`, `connections`, the public booking page) goes to Settings → Calendar. Live bookings and delegations surface in Work → Meetings, because Shannon runs scheduling daily and Settings is the wrong altitude for daily work. `/admin/meet` keeps its route as the public-facing scheduler, unlinked from the sidebar.

## 3. Comms (4 tables + stories, 0 rows)

**Recommend: `dormant`, with a reserved seat.** The spec is build-ready and `story_consents` is a contractual requirement under the SafeSpace agreement, so this is not optional later. Reserve Fundraising → Campaigns as the parent and note in the ledger that Comms lands as a section of Campaigns when it builds, gated on `modules.comms`. Do not build it in V2.

## 4. Reviews (5 tables, `review_competencies` 5 rows)

**Recommend: `dormant`, seat at Organization → Team.** Same treatment as Comms. Reviews is a section within Team, not a tab, gated on `modules.reviews`. The 5 competency rows are seed config, not user data, so nothing is at risk today.

## 5. Reed archive (`reed_threads` 8, `reed_messages` 24)

**Recommend: preserve, surface in the panel.** "Reed is not a destination" removes `/admin/reed`, which is correct, but thread history should be reachable from inside the Reed panel as a history list. Zero migration, zero data loss, and it keeps the contract. If you would rather not build the history list in V2, the fallback is `dormant` with the tables untouched and no UI, which is honest but means 8 threads become unreachable.

## 6. Strategy room (`strategy_room_meta`, `strategy_angles` 8, `funder_angles` 8)

**Recommend: fold into Fundraising, not Organization.** Funder angles are fundraising artifacts despite the name. They belong in the Donors & Funders drawer alongside prospect research (ruling 1), not under Organization → Strategy, which is OGSM. `strategy_room_meta` follows whichever host you pick.

## 7. Teen games (`game_daily`, `game_pool`, `cut_*`, `ms_*` gates)

**Recommend: `public-site`.** These are the teen app, not the admin. `/admin/careers/daily` and `/admin/careers/pool` are content operations over them, so those two routes become sections of Programs → Content, gated on an `aa.*` key. The game tables themselves are out of V2 scope.

## 8. Demo Day (`demoday_signups`, `demoday_notes`)

**Recommend: pinned Group view, per the Handoff Spec, plus a ruling on the November push.** Stage 0 flagged this and asked directly: if Demo Day needs its own front door for November, say so. My read is the pinned view is enough for the redesign and a temporary pinned position in the sidebar is a two-line change if November demands it. Both tables carry the org_id trap and go into that cleanup.

## 9. YGB (`ygb_registrations`, `ygb_attendance`)

**Recommend: pinned Group view, same as Demo Day.** No separate ruling needed unless YGB's own tenant (`484c31b7…`, 18 keys) needs it as a first-class destination in their own instance, which is a different question from AA's sidebar.

## 10. Participant spine (`custom_field_defs` 16, `participant_stages` 22)

**Recommend: bound, and this one is load-bearing.** Programs → People and Programs → Intake must render per-org custom fields and per-org stages, not a fixed column set. Without it, Young Life EPA and SafeSpace lose the fields the participant-spine work built for them, and the redesign becomes AA-shaped. This is not a ruling so much as a scope requirement: mark it `bound` and write it into the Programs phase definition of done.

## 11. Singletons

- **`stewardship_rules` (11 rows).** Recommend Settings → Fundraising, as an automation rules editor. The rules are running today and appear in no design file. Losing the editor means losing the ability to turn them off.
- **`segments` (0 rows).** Recommend `bound` to Donors & Funders, with the saved-view builder in Phase 1 scope. Nine V1 sub-pages collapse into saved views and the backing table is empty with no builder. Either the builder ships with the destination or the nine pages stay. This is the largest single risk in the route map.
- **`plan_archives` (1 row).** Recommend Settings, read-only.
- **`compliance_filings` (7 rows).** Recommend `bound` to Organization → Compliance, and note that Contract 3's `resolve_obligation()` must write a filing row when a compliance item resolves. That is a behavior requirement on the RPC, not a placement question.
- **`entity_comments` (0), `message_reactions` (0).** Recommend `dormant`, seat in Inbox alongside Messages.

---

## Separate from the ledger: three items that are not V2's job

1. **Ghost tables.** `fr_plan_strategies`, `fr_plan_gift_levels`, `ai_calls`, `program_partners` do not exist in production while live code writes to them. Own PR, own migration, applied and verified before the redesign builds on top. `fundraising_plan.sql` is written and RLS-registered; `program_partners` needs a migration authored.
2. **HubSpot boundary.** Four surfaces read `hs_*` directly: finance close, donor 360, prospect detail, V1 cockpit. Route all four through the spine. Also correct `external_ids` to `external_refs` in the architecture project-knowledge file.
3. **The org_id default trap.** Twelve tables, all public-site ingestion or HubSpot mirror. Four live orgs. One migration replacing twelve column defaults, reviewable in a single pass.

---

# Review against the codebase trace (Phase 0.5, appended)

Checked each draft ruling against the ledger's writer/reader trace and live row counts. Verdicts:

| Ruling | Verdict | Notes |
|---|---|---|
| R1 prospect research | **accept** | The trace supports "distinct workflow": 11 tables, 9 dedicated API routes, an agent activity log, and `X/search` integration. On the open choice, the review leans **drawer** — the one-secondary-row contract is the redesign's spine, and Young Life EPA/SafeSpace (who lack `ai.prospect_research`) never see it either way. |
| R2 meet/booking | **accept the split, with two corrections** | (a) `connections` (16 rows) is **not booking config** — it is OAuth token storage for Google and HubSpot (`lib/google/connection.ts`, `lib/hubspot/connection.ts`, read by `A/fundraising/settings` and `X/integrations/hubspot`). It was never among the 45; the ledger already holds it at `settings — Data sources`, and moving it under Settings → Calendar would misfile live credentials. (b) The draft **omits `connection_candidates` (58 rows)** — the family's largest table, Gmail-derived meeting-suggestion candidates read by `/admin/meetings/connections`. Proposed line staged: it follows the Work → Meetings side of the split. Needs its own signed line. |
| R3 comms | **accept, with a gate-consistency caveat** | Three of the tables are **not** zero-row: `email_campaigns` 4, `email_sends` 13, `org_comms_settings` 2 (**correction back from Remi, verified against production: the two rows are Ambition Angels and Young, Gifted & Black — not SafeSpace.** SafeSpace has no comms config, which makes the dormant ruling cleaner, not riskier). The gate's own rule says non-zero rows can't be `dormant` without naming the surface that reaches them. The signed line accepts documented unreachability for these rows until Comms builds; no read-only surface in V2. `email_suppressions` stays `settings` regardless — it is the legally required unsubscribe list. |
| R4 reviews | **accept** | `review_competencies`'s 5 rows are seeded config per the trace (no user-facing writer). Zero user data at risk, as the draft says. |
| R5 Reed archive | **accept** | Preserve + panel history list is zero-migration. If the fallback (dormant, unreachable) is chosen, note that `lib/meetings/dossier.ts` also reads `reed_threads`/`reed_messages` for meeting prep — the data is quietly load-bearing beyond `/admin/reed`. |
| R6 strategy room | **accept** | Confirmed fundraising-owned by the trace (`link-prospect-angle`, prospect detail pages). One flag: the **public `/strategy` page** reads `strategy_angles` and `strategy_room_meta` — whatever hosts them must not break that route. |
| R7 teen games | **accept** | Matches the ledger's site convention exactly. |
| R8 Demo Day | **accept** | Both tables confirmed in the 12-table org_id-default list. November question stays open. |
| R9 YGB | **accept** | |
| R10 participant spine | **accept, strongly** | Matches the participant-spine spec's committed architecture. Staged as flip-to-`bound` + Programs DoD requirement. |
| R11 stewardship_rules | **accept** | Its cron (`stewardship-milestones`) writes `ops_tasks` — under Contract 3 these become obligations, so the rules editor is also the obligation-automation off switch. |
| R11 segments | **accept** | Flip to `bound`, builder in Phase 1 scope. |
| R11 plan_archives | **accept** | Settings, read-only. |
| R11 compliance_filings | **no change needed** | Already `bound` in the ledger (it was never among the 45); the RPC behavior requirement is already noted on its row. |
| R11 entity_comments | **accept** | |
| R11 message_reactions | **correct** | The draft says 0 rows — it has **7**, and the ledger already binds it to Inbox → Messages (it rides `lib/messaging/threads.ts`, the same writer as `messages`). No re-ruling needed; leaving it `bound`. |

**Not covered by the draft — still open (3 tables):** `quiz_submissions` (49 rows, `aa.quiz`, written by the live public quiz), and the two orphaned `aa.bv` tables (`bv_newsletter_subscribers`, `bv_showcase_submissions`, zero rows, zero code references — cheapest ruling available: drop or archive, but it must be said out loud).

**Ruling-count check after staging:** of the 45, 42 carry a `PROPOSED (unsigned)` line, 3 are marked not-covered. Signing requires: the 11 family sign-offs, the 3 open choices (R1 tab/drawer, R5 history/dormant, R8 November), and the 3 uncovered tables. The 14 `dormant` rows also need signed lines per the gate's definition of done — R3 covers the comms/stories eight; `journeys` ×3, `relationships`, `reed_next_moves`, `reed_plan_proposals` still need theirs.

**On the three "not V2's job" items: agreed**, with one urgency note — the ghost-tables item is not hygiene, it is a live bug: `/admin/fundraising/plan` writes to `fr_plan_strategies`, which does not exist in production. `fundraising_plan.sql` is written, RLS-registered, and waiting to be applied by hand.

*All of the above was subsequently signed by Remi on 2026-09-03 and applied to the ledger — see the header of this file for the signing record. Nothing built; Phase 1 not started.*
