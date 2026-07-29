# BloomOS Capability Inventory (Verified Against Code)

Date: 2026-07-29. Repo: `remi-sobo/ambition-angels`, branch `claude/bloomos-capability-inventory-q4q7jn`.

This is a read-and-report inventory of what BloomOS actually does, produced by opening the page components, API handlers, migrations, and cron/config files — not by reading table names, route folders, or marketing copy. It is the factual basis for how BloomOS gets sold. Every capability row carries file-level evidence so any claim can be spot-checked.

**Status definitions (applied strictly):**

- **SHIPPED** — reachable in the UI from normal navigation, has a working read path and a working write path, not behind a flag
- **PARTIAL** — works but with a named limitation (stated in the row)
- **READ ONLY** — data displays but a user cannot create or edit it in the app
- **SCHEMA ONLY** — tables or types exist, no working interface
- **UNVERIFIED** — cannot be determined from the code alone; the row says what would resolve it

A note on gating: almost every module sits behind a per-org entitlement key (`modules.*`). That is the normal tenant switchboard and does not block SHIPPED. Keys prefixed `ai.*` are paid-tier fences; keys prefixed `aa.*` are Ambition-Angels-only surfaces never seeded for other tenants — rows note these.

## System overview

- One Next.js 14 repo contains both the Ambition Angels marketing site and BloomOS. A host guard in `middleware.ts` serves only `/admin`, `/auth`, `/api` on `app.bloomos.org`; everything on `ambitionangels.org`.
- Data: Supabase Postgres (~150 tables, RLS per domain), Supabase Auth, Supabase Storage (4 private buckets). Deployed on Vercel with 10 cron jobs (`vercel.json`).
- Auth: Supabase session + a `memberships` row in an org. Roles (`owner`, `admin`, `staff`, `finance`, `board_viewer`) map to module read/write permissions in `role_permissions`; RLS policies check `private.has_permission(org_id, perm)`. Middleware is a coarse signed-in gate; enforcement lives in route handlers and RLS.
- Multi-tenancy exists in the schema and gating layer (orgs, entitlements, terminology, RLS), and a second demo tenant (fictional "Young, Gifted & Black") is seeded by hand. But substantial single-tenant residue remains — hardcoded sender addresses, org slugs, timezone, operator names, singleton finance config, unfenced cron queries — itemized per module and in the honest section.
- External services: Stripe (donations), Resend (most email), Gmail API (read-sync + `/meet` emails), Google Calendar (per-user OAuth + one env account), HubSpot (mirror sync + outbound push + inbound webhook), Anthropic API (~12 AI surfaces, all draft-and-approve except journey emails and the briefing narrative).

Modules below follow the app's own organization (sidebar sections + entitlement keys). Each module section is a capability table followed by that module's honest notes. Cross-cutting findings are consolidated in "The Honest Section" near the end.

---

# Fundraising CRM records — capability inventory

| Capability | Evidence | Status | Note |
|---|---|---|---|
| Browse a donor list with lifetime/period giving rollups, KPIs (total raised, donor count, avg gift, active recurring), and year / segment / lifecycle-stage filters | `app/admin/fundraising/donors/page.tsx` → tables `gifts`, `constituents`, `recurring_plans`, `ops_tasks`; nav via Sidebar "Donors" + fundraising tab bar (`app/admin/fundraising/layout.tsx`) | SHIPPED | All rollups computed in-memory server-side; gifts paged to 50k cap. Whole section gated on `modules.fundraising` entitlement (normal). |
| View retention flags (LYBUNT, SYBUNT, cadence-lapsed, second-gift-watch) and a YoY retention rate, with clickable tiles filtering the list | `app/admin/fundraising/donors/page.tsx`, `lib/fundraising/retention.ts`, `lib/fundraising/engagement.ts`, `lib/fundraising/lifecycle.ts` | SHIPPED | Derived at read time, never stored. Major-donor threshold hardcoded at $10k (`MAJOR_DONOR_THRESHOLD`). Sector benchmark 43% hardcoded. |
| Create a donor record (person or organization) with emails/phones | `NewDonorForm` in `donors/_components/ConstituentControls.tsx` → `POST /api/admin/constituents` → table `constituents` | SHIPPED | Also pushes the record to HubSpot when write-sync is enabled (fail-soft no-op otherwise). Audited. |
| Edit a donor record (names, emails, phones, address, tags, notes, do-not-contact) | `EditDonorButton` (same file) → `PATCH /api/admin/constituents/[id]` | SHIPPED | Arrays replace wholesale. Pushes to HubSpot when connected. |
| Archive / unarchive a donor (soft hide, keeps history) | `ConstituentDangerZone.tsx` → `PATCH /api/admin/constituents/[id]` (`archived_at`) | SHIPPED | Archived donors visible only under the "Archived" segment. |
| Hard-delete a donor with no financial history | `ConstituentDangerZone.tsx` → `DELETE /api/admin/constituents/[id]` | SHIPPED | Server 409s if any gifts or grants exist (UI also disables the button); irreversible. |
| Bulk-act on selected donors: archive, unarchive, delete (no-gift only), copy emails to clipboard, create linked follow-up tasks | `donors/_components/DonorsTable.tsx` (bulk actions) → `POST /api/admin/constituents/bulk`, `TaskComposer` → ops tasks | SHIPPED | Delete silently skips donors with gifts/grants and reports skipped count. Client-side CSV of the visible table also available via the shared DataTable. |
| View a donor 360 profile: unified activity timeline (gifts + interactions + thank-yous), lifecycle stage strip, engagement score, recurring plans, household, open asks, journey enrollments | `app/admin/fundraising/donors/[id]/page.tsx` → tables `gifts`, `interactions`, `acknowledgments`, `recurring_plans`, `households`, `opportunities`, `journey_enrollments`, `soft_credits` | SHIPPED | Timeline display capped at 500 gifts / 100 interactions; stats use full history. |
| Record a manual/offline gift (check, cash, card, ACH, stock, in-kind) with campaign/fund/appeal attribution and FMV → deductible math | `GiftControls.tsx` `GiftEntryForm` → `POST /api/admin/gifts` → table `gifts` | SHIPPED | Free-text donor name find-or-creates a constituent (links first match on ambiguity, with warning). Triggers stewardship rules (receipt/task/none) and optional HubSpot deal mirror. |
| Delete a hand-entered gift | `GiftRowActions` → `DELETE /api/admin/gifts/[id]` | SHIPPED | Stripe/Givebutter/HubSpot-sourced gifts are blocked (409) — refund upstream instead. |
| Edit a gift (amount, date, method, attribution, FMV, notes) | `PATCH /api/admin/gifts/[id]` | PARTIAL | Working API, but no UI calls it — no edit button anywhere; fixing a mis-keyed gift means delete + re-enter, or an API call. |
| Log an interaction (call, email, meeting, event, note) on a donor | `LogInteractionForm` → `POST /api/admin/interactions` → table `interactions` | SHIPPED | Also mirrored to HubSpot as an engagement when connected. No UI to edit/delete a logged interaction. |
| Log a proactive non-gift thank-you touch (email/letter/call/text/in-person) | `LogThankYou.tsx` → `POST /api/admin/acknowledgments/log` | SHIPPED | Records to `acknowledgments`; shows in the donor timeline. |
| Set a donor's preferred acknowledgment channel | `AckChannelPref.tsx` → `PATCH /api/admin/constituents/[id]` (`preferred_ack_channel`) | SHIPPED | Feeds the acknowledgment composer default. |
| Add / remove soft credits on a gift (solicitor, household, DAF advisor, match originator) | `SoftCreditControls.tsx` → `POST/DELETE /api/admin/gifts/[id]/soft-credits` → table `soft_credits` | SHIPPED | Recognition only, never in revenue rollups. Free-text name find-or-creates constituents. |
| Create a household, join/leave one, add/remove members, rename + set salutation, view combined household giving | `HouseholdControls.tsx` → `POST /api/admin/households`, `PATCH /api/admin/households/[id]`, `PATCH /api/admin/constituents/[id]` → tables `households`, `constituents.household_id` | SHIPPED | Member typeahead via `GET /api/admin/constituents/search`. `DELETE /api/admin/households/[id]` exists but has no UI button; empty households linger after last-member removal. |
| Enroll a donor in an email journey and cancel an enrollment from the profile | `JourneyControls.tsx` → `POST /api/admin/journeys/[id]/enroll`, `PATCH /api/admin/journeys/enrollments/[id]` | SHIPPED | Blocked for do-not-contact donors and donors with no email (UI explains why). No per-enrollment pause. |
| Hide / unhide a synced email on the donor timeline | `EmailActions.tsx` → `PATCH /api/admin/fundraising/interactions/[id]` (`is_private`) | SHIPPED | Hidden rows stay on the spine (durable against re-sync). |
| Sync Gmail into donor timelines (backfill + incremental), on demand and hourly | `GmailSyncButton.tsx` (on `/admin/fundraising/today`) → `POST/GET /api/admin/fundraising/gmail-sync`; cron `app/api/cron/gmail-sync/route.ts` (`45 * * * *` in `vercel.json`); `lib/fundraising/gmail-sync.ts` → tables `gmail_sync_jobs`, `interactions` | SHIPPED | Requires `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` with `gmail.readonly` scope and `CRON_SECRET` for the cron. Single mailbox, single tenant (cron picks the first org row). Matches strictly by counterparty email → constituent email; no name matching. |
| Detect duplicate constituents by shared email and merge them (reassign gifts, opportunities, interactions, pledges, recurring plans, soft credits, grants, relationships; union contact fields; delete duplicate) | `app/admin/fundraising/duplicates/page.tsx`, `MergeControls.tsx` → `POST /api/admin/constituents/merge` | SHIPPED | Reachable via Fundraising → Settings and the overview Data Hygiene widget, not the tab bar. Email-only matching by design (no name matching). Irreversible; journey enrollments of the duplicate are dropped, not moved. Not a transaction — a mid-merge failure aborts before delete but can leave partial reassignments. |
| Import donors + gift history from CSV (parse, auto-map columns, preview, batched idempotent commit with per-year reconciliation report) | `app/admin/fundraising/import/page.tsx`, `ImportWizard.tsx` → `POST /api/admin/import/constituents` → tables `constituents`, `gifts` (`external_source='import'`) | SHIPPED | Reachable via Fundraising → Settings; the Donors page "Import CSV" button goes to the *separate* generic `/admin/imports` wizard instead. Dedupes donors by email and gifts by (constituent, date, amount); 5,000-row cap per request; commits in 10-row batches; re-running the same file is safe. No campaign/fund column mapping. |
| Maintain a volunteer roster (add a volunteer, remove the flag) as constituent records | `app/admin/fundraising/volunteers/page.tsx`, `VolunteerControls.tsx` → `POST /api/admin/constituents` (`is_volunteer: true`), `PATCH` to unflag; Sidebar item | SHIPPED | Just a flag on `constituents` with org-configurable label (e.g. "Leaders"); no hours, shifts, or scheduling. Row links to the standard donor profile. |
| Run a gifts report filtered by date range / campaign / fund / method, with KPIs and a by-campaign breakdown | `app/admin/fundraising/reports/page.tsx`, `GiftReportFilters.tsx` → tables `gifts`, `campaigns`, `funds`, `segments` | SHIPPED | Reached via the "Reports" button on Donors (not the tab bar). Display capped at 10k gifts / 50 recent rows; export for the full set. |
| Export gifts to CSV with the same filters | `GET /api/admin/gifts/export` | SHIPPED | 10k-row ceiling; audited. Not org-pinned in the query (relies on RLS — fine single-tenant). |
| Export donors to CSV filtered by name, type, source, tag, min lifetime total, gave-since date | `SegmentExportPanel.tsx`, reports page → `GET /api/admin/donors/export` | SHIPPED | 10k-row ceiling on both constituents and gifts fetched; audited. |
| Save, reuse, and delete named donor segments (stored filter definitions) | `SegmentExportPanel.tsx` → `GET/POST /api/admin/segments`, `DELETE /api/admin/segments/[id]` → table `segments` | SHIPPED | Segments are export filter presets only — they don't drive lists, journeys, or comms audiences. No rename/edit (delete + recreate). |
| Create a pledge with an auto-generated installment schedule (weekly/monthly/quarterly/annual) | `pledges/_components/PledgeControls.tsx` `NewPledgeForm` → `POST /api/admin/pledges` → tables `pledges`, `pledge_payments` | SHIPPED | Reached via "Pledges" button on Donors. Free-text donor find-or-create. Schedule feeds the finance revenue schedule/runway. |
| Convert a won/pledged pipeline ask into a dated pledge schedule | `ConvertOpportunityForm` (same file) → `POST /api/admin/pledges` from `opportunities` rows | SHIPPED | Pre-fills donor + amount from the opportunity; same create path as manual. |
| Track pledge installments: mark paid (creates a linked real gift), skip, reset (deletes the created gift, re-opens pledge); auto-complete when nothing scheduled | `pledges/[id]/page.tsx`, `PaymentActions` → `PATCH /api/admin/pledges/payments/[id]` → `pledge_payments`, `gifts` (`external_source='pledge'`) | SHIPPED | "Mark paid" always uses the expected amount and method "check"/today by default (API accepts overrides; UI sends none — no partial payments). |
| Change pledge status (active / completed / cancelled) | `PledgeStatusSelect` → `PATCH /api/admin/pledges/[id]` | SHIPPED | `DELETE /api/admin/pledges/[id]` exists but has no UI button. No pledge-amount/schedule editing after creation. |
| View recurring giving: active plans, normalized monthly run-rate, payment-failure follow-up list | `app/admin/fundraising/recurring/page.tsx` → table `recurring_plans` | SHIPPED | Reached via "Recurring" button on Donors. Stripe plans created automatically by the donation pipeline; failure flag set upstream. |
| Add a manual recurring plan and pause / resume / cancel any plan | `RecurringControls.tsx` → `POST /api/admin/recurring`, `PATCH /api/admin/recurring/[id]` | SHIPPED | Manual plans don't auto-generate gifts — each offline payment must still be entered as a gift. Amount/frequency edit exists in API but no UI. `DELETE` API exists, no UI. |
| Create campaigns with goal and date range; see per-campaign raised vs. goal with progress bar | `app/admin/fundraising/campaigns/page.tsx`, `NewCampaignForm` → `POST /api/admin/campaigns` → table `campaigns`; Sidebar + tab | SHIPPED | No campaign edit or delete route at all — name/goal/dates are write-once from the app. |
| Create appeals under a campaign (with optional source code) | `NewAppealForm` → `POST /api/admin/appeals` → table `appeals` | SHIPPED | UI form sends name only (source_code accepted by API, no input field). No edit/delete. |
| Bulk-attribute unattributed gifts in a date range to a campaign | `BulkAttributeForm` → `POST /api/admin/campaigns/attribute` | SHIPPED | Never reassigns already-attributed gifts; safe to re-run. |
| Auto-ingest Stripe donations as gifts (and recurring plans) | DB trigger in `supabase/migrations/create_fundraising_core.sql` (`donations_fr_ingest` on `donations` → `fr_ingest_donation`) | SHIPPED | Ingestion is database-level, not app code; requires the Stripe webhook pipeline (`STRIPE_*` env) feeding `donations`. |
| Track relationships between constituents | table `relationships` (`create_fundraising_core.sql`); read only in `app/api/admin/search/profile/route.ts` and reassigned in merge | SCHEMA ONLY | No page or API to create, view, or edit a relationship. |
| Manage funds (gift restriction axis) | table `funds`; pickers in gift entry / pledge / reports | SCHEMA ONLY (create) / READ ONLY (use) | Fund options appear in dropdowns only if rows exist; no UI or API creates a fund — rows must be inserted via SQL. |

## HONEST NOTES

- **Half-built / flag-gated in this scope**
  - Gift **edit** (`PATCH /api/admin/gifts/[id]`), household **delete**, pledge **delete**, recurring-plan **delete** and amount/frequency edit — all working API endpoints with no UI caller.
  - `funds` and `relationships` tables have no management interface at all.
  - Campaigns/appeals are create-only: no edit, no delete, no archive.
  - Donor-profile "Next move" AI panel (`NextMovePanel`) is behind the `ai.reed` entitlement (Grow tier) — hidden entirely without it. Everything else in scope sits behind the standard `modules.fundraising` module gate only.
  - Segments are only export presets — a "saved segment" cannot drive the donor list, journeys, or email sends.
  - Every list/report page has a graceful "tables not applied yet" state — pages assume migrations (`create_fundraising_core.sql`, `create_pledges.sql`, `create_segments.sql`, `add_recurring_plan_health.sql`, `add_email_logging_to_interactions.sql`) have been applied manually via the Actions workflow.

- **Manual steps outside the app**
  - DB migrations must be applied (GitHub Actions "Apply DB migration") before any of this works.
  - Funds must be seeded via SQL.
  - Refunding/voiding a synced gift (Stripe/Givebutter/HubSpot) must happen at the source — the app deliberately refuses to delete those.
  - Manual recurring plans and pledge installments do not collect money; someone must receive the check and mark paid / enter the gift.
  - Google OAuth token must be minted with the `gmail.readonly` scope out-of-band for email sync.

- **Integrations**
  - **Gmail** (live): read-only sync of one mailbox into `interactions` via `gmail_sync_jobs`; manual button on Today's Moves + hourly Vercel cron (`45 * * * *`). Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` (gmail.readonly), `CRON_SECRET`. Cron assumes single tenant (first `orgs` row).
  - **HubSpot** (live, fail-soft): outbound push of constituents (contacts/companies), interactions (engagements), and gifts (closed-won deals) via `lib/hubspot/sync-out.ts`, gated by `hubspotWriteEnabled()`; read-only `hs_engagements` / `hs_deals` / `hs_contacts` mirror surfaces Comms and Pledges panels on donor profiles for HubSpot-linked contacts. Env: `HUBSPOT_ACCESS_TOKEN`. Durable retry queue and inbound webhook apply are documented as not built.
  - **Stripe** (live): donations land as gifts/recurring plans through a Postgres trigger on the `donations` table, fed by the public Stripe webhook route.
  - **Resend/email sending**: not in this scope's write paths (acknowledgment send and journeys are separate scopes); this scope only *logs* thank-yous.

- **Data entry points**: manual forms (donors, gifts, interactions, pledges, recurring plans, volunteers, households, campaigns, appeals, soft credits), CSV import wizard (fundraising-specific at `/admin/fundraising/import` + a separate generic `/admin/imports` the Donors page links to — two different import systems), Stripe trigger, Gmail sync, HubSpot import/mirror. **Exit points**: donors CSV export, gifts CSV export, client-side table CSV, clipboard email copy, outbound HubSpot push. Exports are audit-logged.

- **Not present that a nonprofit would expect**: gift editing from the UI; receipt numbers on gifts; partial/over payments on pledge installments; pledge amount/schedule editing; campaign editing/closing; fund management; relationship tracking UI; donor-facing statements or year-end giving summaries from this area; segment-driven mailing lists; duplicate detection beyond exact shared email (no name/address fuzzy match); undo for merges; multi-mailbox or per-user Gmail sync; automatic charging of manual recurring plans.

- **Multi-tenant caveats**: list pages pin queries to the active org, but several API routes (`gifts/export`, `donors/export`, gift/pledge/recurring PATCH/DELETE, merge) rely on RLS alone, which the code's own comments note spans every org a user belongs to — safe today (single tenant, AA) but a real caveat for resale. The Gmail cron and HubSpot mailbox assumptions are explicitly single-tenant.

# Fundraising pipeline, grants, asks, prospects, funding strategy — capability inventory

| Capability | Evidence | Status | Note |
|---|---|---|---|
| View major-gift pipeline as a kanban board with per-pipeline stage columns and stat cards (open, weighted, closing-by-year, committed) | `app/admin/fundraising/page.tsx` → `opportunities`; columns from `lib/fundraising/stages.ts` (`pipelines` + `pipeline_stages`) | SHIPPED | Falls back to a built-in legacy 5-stage funnel until the pipeline-config migration is applied. Partnership-pipeline deals excluded (live in /admin/partners). |
| Create an ask (opportunity) with free-text or matched constituent, ask amount, probability, capacity, next move + due | `NewOpportunityForm` in `_components/PipelineBoard.tsx` → POST `app/api/admin/opportunities/route.ts` | SHIPPED | Free-text name silently creates a new person constituent (warns). Owner auto-set to current admin user. |
| Drag an ask between stages; edit all fields in a modal; mark lost / reopen; delete | `OpportunitiesBoard.tsx`, `OpportunityEditModal.tsx` → PATCH/DELETE `app/api/admin/opportunities/[id]/route.ts` | SHIPPED | Stage moves validated against per-org `pipeline_stages` config. Every write audited. |
| Mirror created/edited opportunities to HubSpot as deals | `pushOpportunityToHubSpot` (`lib/hubspot/sync-out.ts`) | PARTIAL | Best-effort, fail-soft; no-op unless a `connections` row is active with `sync_out` AND `HUBSPOT_ACCESS_TOKEN` is set. No retry queue. |
| Edit pipeline stages: add, rename, reorder (drag), retype (open/won/lost/on_hold), set default probability, map HubSpot stage id, deactivate, delete | `app/admin/fundraising/settings/stages/page.tsx` + `StagesEditor.tsx` → `app/api/admin/pipeline-stages/*` | SHIPPED | Guards prevent stranding cards or removing the last open stage. Pipelines themselves cannot be created/deleted in the UI — stages only, within seeded pipelines. |
| Work a deterministic daily queue: overdue next steps, asks closing ≤30d, unowned asks, thank-yous due, recent gifts | `app/admin/fundraising/today/page.tsx` → `opportunities`, `gifts` | SHIPPED | Read-only queue; acting happens on the linked donor/pipeline pages. |
| Generate AI "suggested next moves" over open asks; edit action/date, Apply (writes next_step) or Dismiss, with follow-through stats | `SuggestedMoves.tsx` → `app/api/admin/fundraising/next-best-action/*`; `fr_nba_suggestions`, `fr_agent_activity_log` | PARTIAL | Gated `ai.reed` (402 without); needs `ANTHROPIC_API_KEY` (503 without). Rate limit 10 runs/10 min; shared $20/mo fundraising-agent wallet + org-wide AI cap. |
| Sync Gmail into interactions (manual chunked button + hourly cron) | `GmailSyncButton.tsx` → `app/api/admin/fundraising/gmail-sync/route.ts`; cron `45 * * * *` | PARTIAL | Requires `GOOGLE_REFRESH_TOKEN` with gmail.readonly; without it jobs "complete" with 0 logged and a 403 in errors. First run is a full backfill. |
| Create a grant tied to a funder (find-or-create org constituent), optional first deadline; auto-creates a linked ops workspace project | POST `app/api/admin/grants/route.ts`; `grants/_components/GrantControls.tsx`; `grants`, `grant_requirements`, `ops_projects` | SHIPPED | Grant page self-heals a missing project on load. Funder is mandatory. |
| Advance grants through a fixed 9-stage pipeline (board drag + detail-page selector); "awarded" auto-plots a final-report deadline; declined/closed retires the workspace project | `GrantsBoard.tsx`, `StageSelect` → PATCH `app/api/admin/grants/[id]/route.ts` | SHIPPED | Grant stages hardcoded (prospect→closed), not configurable. Only the final report is auto-plotted; interim report cadences are manual. |
| Edit grant facts (amounts, period, program, restrictions, owner, notes, funder); delete grant | `EditableGrantDetails` → PATCH/DELETE `app/api/admin/grants/[id]/route.ts` | SHIPPED | Funder can be re-pointed but never cleared. |
| Maintain a requirements/deadline calendar per grant (LOI, application, reports): add, edit, mark submitted/waived, delete; overdue rollup | `RequirementRow`, `AddRequirementForm` → grants requirements routes; `grant_requirements` | SHIPPED | Deadlines only surface inside BloomOS — no external calendar export. |
| Attach people to a grant (intro source, program officer, etc.): pick or inline-create a person, set role/primary/notes, edit, unlink | `GrantContacts.tsx` → grant contacts routes; `grant_contacts` | SHIPPED | Inline-create dedupes by email. One primary per grant enforced. |
| Seed a per-org starter task checklist (LOI, budget, narrative, review, submit, report) onto a grant's project | `GrantSeedTasks.tsx` → POST `app/api/admin/grants/[id]/seed-tasks/route.ts` | SHIPPED | Idempotent; tasks flow into normal ops task views. |
| Run "Reed's Proposal Review" (Grant Coach): assessment/deep-dive prompts with an audience lens over a pasted draft or attached PDF/text doc; plus an interactive "defend the draft" chat | `GrantCoach.tsx` → `app/api/admin/grants/coach/route.ts`, `coach/defend/route.ts` | PARTIAL | Needs `ANTHROPIC_API_KEY` (503 without); org AI cap applies; output NOT persisted — render-only, operator copies out. Auth-only, no tier gate. |
| Search funders by typeahead when creating grants/asks | `FunderPicker.tsx` → GET `app/api/admin/funders/search/route.ts` | SHIPPED | Orgs sorted first; picking prevents duplicate funder records. |
| Log every solicitation in an Ask Log (form, title, amounts, dates, status, owner, notes), tied to a funder and optionally to a grant or opportunity | `asks/page.tsx`, `AskControls.tsx` → asks routes; `asks` | SHIPPED | Stats cards: outstanding, committed, win rate. |
| Attach documents (proposal PDF, budget, cover letter) to an ask; open via short-lived signed URL; delete | `AskDocuments` → ask documents routes; `ask_documents` + private `bloomos-asks` bucket | SHIPPED | Uploads via service-role client; bucket cleanup on delete best-effort. |
| Browse the prospect bench with HubSpot enrichment, score, and linked-task columns; filter; view disqualified list | `prospects/page.tsx`, `ProspectsTable.tsx`; `fr_prospects`, `hs_contacts`, `fr_prospect_scores` | SHIPPED | Whole section gated by `ai.prospect_research` (`prospects/layout.tsx` FeatureGate) — a base-tier org loses ALL prospect pages, not just the AI parts. |
| Add a prospect manually (name/type/email/org/why-note) | `AddProspectModal.tsx` → POST `prospects/add` | SHIPPED | Also the accept path for AI discovery. |
| Import HubSpot mirror contacts to the bench in bulk (search + lifecycle filter, paged picker, up to 500) | `prospects/import/page.tsx` → `hubspot-search` (RPC `hubspot_bench_candidates`), POST `prospects/import` | PARTIAL | Only useful once the `hs_contacts` mirror is populated (aa.hubspot_mirror sync). Count RPC not org-scoped (noted in code). |
| Promote prospect(s) into the pipeline: resolves/creates a constituent, opens an opportunity at the entry stage, flips bench status | `ProspectsTable.tsx` → POST `prospects/promote` | SHIPPED | Pushes new opportunity to HubSpot (best-effort). Idempotent. |
| Disqualify / requalify prospects (single or bulk) | POST `prospects/disqualify` | SHIPPED | Reversible; never touches HubSpot. |
| Score a prospect on 7 dimensions + notes | `ScoreEditor.tsx` → POST `app/api/admin/prospects/[id]/score`; `fr_prospect_scores` | SHIPPED | Manual scoring only — no auto-scoring. |
| Generate an AI research brief on a prospect (background run with web search; 9 structured sections; notification on completion; regenerate) | `BriefPanel.tsx` → `fundraising/research/[id]` + `run`; `research_runs`, `fr_prospect_briefs`; `lib/agents/funder-research/*` (`claude-opus-4-7` + web_search) | PARTIAL | Gated `ai.prospect_research`; needs `ANTHROPIC_API_KEY`. 5 runs/10 min, $20/mo shared wallet. Runs up to 300s serverless. Prompt contains hardcoded "Remi" framing. |
| Get Reed's single "next move" for a prospect or donor, with a ready-to-send email draft; copy, mailto handoff, or convert to a linked task | `NextMovePanel.tsx` → `fundraising/next-move`; `reed_next_moves` | PARTIAL | Gated `ai.reed` + `ANTHROPIC_API_KEY`. Email "send" is copy/mailto only — nothing is sent from the app. |
| Resolve a HubSpot contact id to a bench prospect (auto-benching on first view) | `prospects/by-hubspot/[hubspot_id]/page.tsx` | SHIPPED | Insert defaults type to "individual". |
| View HubSpot enrichment on a prospect: company card, deals table, engagement timeline, raw contact JSON, deep link | `prospects/[id]/page.tsx`; `hs_contacts/hs_companies/hs_deals/hs_engagements` | READ ONLY | Mirror data only — editing happens in HubSpot. Deep link needs `HUBSPOT_PORTAL_ID`. |
| Add tasks and threaded comments on a prospect | `EntityTasks`, `CommentThread` on prospect page | SHIPPED | Shared cross-module components. |
| Create/edit fundraising "framing angles" (click-to-edit, badge/tone, delete, active toggle) that feed the Strategy Room | `strategy/page.tsx`, `AngleEditorCard.tsx` → `strategy/angles` routes; `strategy_angles` | SHIPPED | Edits save on blur; audited. |
| Have Reed draft a complete angle from a short brief, then review/edit before creating | `ReedAngleWizard.tsx` → POST `strategy/angles/draft` | PARTIAL | Needs `ANTHROPIC_API_KEY`; auth-only. Draft never auto-persisted. Resident org gets hand-tuned AA mission framing in the prompt. |
| Edit Strategy Room presentation copy (hero, stat chips, "this year" block) | `RoomMetaEditor.tsx` → PUT `strategy/room-meta`; `strategy_room_meta` | SHIPPED | One row per org, upsert. |
| Run a per-angle funder funnel: add funders (constituent search/create, HubSpot contact, or bench prospect), move through shortlist→pursuing/parked/passed, record decision + fit notes | `strategy/[key]/page.tsx`, `StrategyBoard.tsx` → `strategy/funder-angles` routes; `funder_angles` | SHIPPED | Unique constraint blocks double-adds (409). |
| One-click "Pursue" a funder from an angle: transactionally creates an opportunity, links it back, marks bench prospect promoted, pushes to HubSpot | POST `strategy/funder-angles/[id]/pursue` (RPC `fr_pursue_funder_angle`) | SHIPPED | Idempotent. |
| AI prospect discovery for an angle: web-search for net-new funders by type, review ranked candidates, accept onto bench + angle | `DiscoverPanel.tsx` → POST `fundraising/strategy/discover`; `lib/agents/prospect-discovery` | PARTIAL | Gated `ai.prospect_research` + `ANTHROPIC_API_KEY`; 8 runs/10 min. Candidates NOT persisted until accepted. |
| Share a password-gated internal Strategy Room deck rendering live angles + room meta | `app/strategy/page.tsx`, `middleware.ts` gate, POST `app/api/strategy/login` | PARTIAL | Single-tenant: reads via service-role hardcoded to org slug `"ambition-angels"`. Shared password `STRATEGY_ROOM_PASSWORD`; cookie stores the password value itself; 30-day expiry. |
| Connect/disconnect HubSpot and toggle sync gates (outbound, inbound webhooks, gifts→deals) | `fundraising/settings/page.tsx`, `HubSpotSettings.tsx` → `integrations/hubspot`; `connections` | SHIPPED | "Connect" only flips a DB row — no OAuth; token is env-only (`HUBSPOT_ACCESS_TOKEN`, `HUBSPOT_CLIENT_SECRET`). UI warns when env vars missing. |
| Run a manual chunked HubSpot read sync (contacts/companies/deals/engagements → hs_* mirror → spine projection) with progress + data-age display | `app/admin/settings/_components/HubspotSyncPanel.tsx` → `app/api/admin/hubspot/sync`; `hs_sync_jobs` | PARTIAL | Gated `aa.hubspot_mirror` — an AA-only flag, never seeded for other tenants; effectively resident-org-only. |
| Keep HubSpot mirror fresh on a schedule (2×/day cron, resumable jobs) | `app/api/cron/hubspot-sync/route.ts` (`0 7,19 * * *`) | SHIPPED | Requires `CRON_SECRET` + `HUBSPOT_ACCESS_TOKEN`. |
| Apply inbound HubSpot contact/company changes via signed webhooks (v3 HMAC, deduped in `webhook_events`) | `app/api/webhooks/hubspot/route.ts`, `lib/hubspot/sync-in.ts` | PARTIAL | Needs `HUBSPOT_CLIENT_SECRET` + active connection with `sync_in`; deal/engagement/deletion events acknowledged but ignored by design. Webhook subscription configured in HubSpot manually. |
| Push BloomOS constituents (and gifts as closed-won deals, opt-in) to HubSpot | `lib/hubspot/sync-out.ts` | PARTIAL | Fail-soft, no durable retry queue; duplicate-contact risk noted in code (no upsert-by-email yet). |
| Track grant payment schedules (`grant_payments`) | `create_revenue_schedule.sql` only; zero references in `app/` or `lib/` TS | SCHEMA ONLY | Feeds finance revenue-schedule SQL view; no UI/API reads or writes the table directly. |
| `fr_touches`, `fr_email_drafts`, `fr_funding_opportunities` | `create_fr_agent_schema.sql`; only a comment mention in `lib/admin/rail/needs-you.ts` | SCHEMA ONLY | Legacy Reed-agent schema; superseded by `reed_next_moves` / interactions. No app code touches them. |
| `fr_prospect_promoted`, `fr_prospect_disqualified` | migrations only; zero app/lib references | SCHEMA ONLY | Superseded by `fr_prospects.status`. |

## HONEST NOTES

- **Half-built / gated:** Pipeline stage config falls back to a hardcoded legacy funnel with an "apply the migrations" banner if `pipelines`/`pipeline_stages` aren't seeded; grants and asks pages likewise render "apply migration" panels when tables are missing. Pipelines cannot be created in the UI. Grant stages hardcoded in code. The entire Prospects section — including non-AI parts like the bench list and manual scoring — is fenced behind the `ai.prospect_research` tier entitlement. The HubSpot mirror sync is fenced behind `aa.hubspot_mirror`, an AA-only flag never seeded for other tenants, so the entire HubSpot import/enrichment pathway only works for the resident org today.
- **Manual steps outside the app:** HubSpot "Connect" is a DB flag, not OAuth — someone must set env vars and register the webhook subscription inside HubSpot. Gmail sync needs a `GOOGLE_REFRESH_TOKEN` minted out-of-band. Crons need Vercel cron + `CRON_SECRET`. Reed's email drafts are copy/mailto only — no email is ever sent by the fundraising pipeline itself. Grant Coach output must be manually copied back. Grant applications/reports are still submitted on funder portals; BloomOS only tracks deadlines and stores PDFs.
- **Integrations:** HubSpot — live, substantial code (chunked read sync + spine projection; outbound push; signed inbound webhooks for contacts/companies), but fail-soft with no retry queue and known duplicate-contact risk. Anthropic — live across six surfaces (NBA, next-move, research briefs on `claude-opus-4-7` + web search, discovery, Grant Coach + defend, angle drafting), all behind `ANTHROPIC_API_KEY`, per-user rate limits, a shared $20/month fundraising-agent wallet, and an org-wide AI spend cap logged to `fr_agent_activity_log` + unified `ai_calls`. Gmail — live read-only interaction sync. Documents in private Supabase Storage with 5-minute signed URLs.
- **Data entry/exit:** In — manual forms, HubSpot mirror import, by-hubspot auto-bench, AI discovery accept, CSV donor/gift import, Gmail sync. Out — HubSpot deal/contact push, deep links, mailto handoffs. No CSV/PDF export of the pipeline, grants calendar, ask log, or prospect bench.
- **Single-tenant residue:** `/strategy` room reads hardcoded org slug `ambition-angels`; funder-research prompt hardcodes "Remi"; steward fallbacks hardcode `"shannon"`; `fr_prospect_scores` joined by `hubspot_contact_id` on the list page; `hubspot_bench_candidates_count` RPC not org-scoped; several prospect-detail reads rely on RLS without an explicit org pin.
- **Reasonable expectations NOT present:** no grant deadline reminders to external calendars from this scope alone (in-app queues + the daily reminder email cron elsewhere); no grant-writing document editor (Coach reviews, doesn't draft proposals); no OAuth HubSpot connect; no installment tracking UI on grants (grant_payments schema-only); no funder database/990 lookup integration (research is generic web search); no pipeline reports/exports; no per-seat ownership model beyond a free-text `owner` string; no email sending — all outreach happens in the operator's own mail client.

# Acknowledgments / Stewardship / Journeys / Comms — capability inventory

| Capability | Evidence | Status | Note |
|---|---|---|---|
| View a queue of gifts awaiting a thank-you, oldest first, with IRS $250+ receipt-required flags and days-waiting stats | `app/admin/fundraising/acknowledgments/page.tsx`; `lib/fundraising/ack-tasks.ts` (reconcileAckQueue); `gifts.acknowledgment_status` | SHIPPED | Linked from Donors page (with pending count badge) and Today's Moves; not a layout tab. Page load also reconciles queue into `ops_tasks` (label `sys:ack`) so items appear in cockpit/Ops queue. |
| Send a thank-you email with system-generated IRS receipt language for one gift | `app/admin/fundraising/acknowledgments/_components/AckComposer.tsx`; `app/api/admin/acknowledgments/send/route.ts`; `lib/fundraising/receipt.ts`; `acknowledgments` table | SHIPPED | Via Resend from hardcoded `Ambition Angels <careers@mail.ambitionangels.org>` — NOT org_comms_settings (single-tenant residue, noted in code as "later PR"). Compliance block rebuilt server-side, never client-editable. Atomic double-send guard. Requires RESEND_API_KEY. |
| Draft the personal thank-you note with AI, grounded in the donor's giving history | `app/api/admin/acknowledgments/draft/route.ts`; `lib/ai/gateway` | SHIPPED | Draft-then-approve: result lands in editable textarea, never auto-sends. Requires ANTHROPIC_API_KEY. Rate-limited 30/10min/IP. No ai.* entitlement check — just admin auth. |
| Mark a gift thanked via an offline channel (letter, call, text, in person) with the channel logged on the donor timeline | `app/api/admin/acknowledgments/mark/route.ts`; AckComposer channel picker; `acknowledgments` table | SHIPPED | Flips `acknowledgment_status`, closes the linked ops task, records the touch. |
| Log a non-gift thank-you (proactive donor note, grant/DAF ack, volunteer/milestone touch) with optional follow-up task | `LogAckButton.tsx`; `donors/_components/LogThankYou.tsx`; `app/api/admin/acknowledgments/log/route.ts` | SHIPPED | Donor typeahead picker; no receipt language ever attached. Optionally spawns `ops_tasks` follow-up. |
| Launch a "thankathon": one parent task fanning out into per-donor call tasks for every pending thank-you, sharing a script | `ThankathonButton.tsx`; `app/api/admin/acknowledgments/thankathon/route.ts` | SHIPPED | Tasks only, no emails. Assignee = org default steward (org_settings.default_steward → owner handle → hardcoded 'shannon' fallback). |
| Print a batch of receipt letters (one per page) for all pending $250+ gifts | `app/admin/fundraising/acknowledgments/letters/page.tsx`, `PrintButton.tsx` | PARTIAL | Browser print-to-PDF only, no PDF generation. Letterhead address + EIN 87-2513010 hardcoded (AA residue). Letter body is a fixed sentence — ack letter templates are NOT used here. Printing does not mark gifts thanked; that's a separate manual step. |
| Create/edit/delete named, channel-specific thank-you templates with `{{first_name}}` merge token and one default per channel | `templates/` + `TemplateManager.tsx`; `app/api/admin/fundraising/ack-templates/*`; `ack_templates` table | SHIPPED | Only merge field is `{{first_name}}`. Composer offers templates filtered by channel. Receipt language is never templated. |
| Set a per-donor preferred acknowledgment channel that the composer defaults to | `AckChannelPref.tsx`; `constituents.preferred_ack_channel` | SHIPPED | |
| Automatically route each new gift through a rules matrix (stewardship_rules) deciding task/auto-email/none, SLA, channel, assignee | `lib/fundraising/stewardship.ts` (processGiftStewardship); called from `app/api/admin/gifts/route.ts`; `stewardship_rules` table; seed `ack_v2_4_seed_aa_stewardship.sql` | PARTIAL | Runs only on manual gift entry; Stripe/pledge gifts get tasks via page-load reconcile instead. **No UI exists to view or edit stewardship_rules — rules are SQL-only data.** Seed hardcodes 'shannon'/'remi' assignees for the AA org. |
| Auto-email a compliant receipt with no human step (matrix action `auto_email`) | `lib/fundraising/stewardship.ts` autoSendReceipt; migration `ack_v2_7_no_auto_send.sql` | PARTIAL | Code path is live, but migration ack_v2_7 flipped the only auto_email rule to create_task: **as deployed, no acknowledgment email sends without a human click.** Re-enabling requires SQL. Auto-send from-address is also the hardcoded AA one. |
| Escalate major gifts with an additional task for the escalation owner on top of the primary task | `lib/fundraising/stewardship.ts` (escalationsFor); `ack_v2_8_major_gift_escalation.sql` | SHIPPED | Rule-driven (action `escalate`); seeded to 'remi' for AA. Runs on gift entry and on ack-queue page load. |
| Auto-create stewardship milestone tasks: giving anniversaries (1–5 yr), second gift, and 15–30-day impact follow-up after $250+ thank-yous | `app/api/cron/stewardship-milestones/route.ts`; vercel.json (daily 13:30 UTC) | SHIPPED | Tasks only, no emails; idempotent via `sys:milestone:<key>` labels. Requires CRON_SECRET. |
| Build a multi-step triggered email journey (first-gift welcome, lapsed re-engagement, manual) with per-step subject/body/delay | `app/admin/fundraising/journeys/page.tsx` + `JourneyControls.tsx`; `app/api/admin/journeys/route.ts`; `journeys`, `journey_steps` | PARTIAL | Reached via a button on the Donors page, not a layout tab. **Steps cannot be edited after creation** — no step-edit API or UI; only pause/resume/delete. Journeys are created immediately `active`. |
| Pause, resume, or delete a journey | `app/api/admin/journeys/[id]/route.ts` | SHIPPED | Delete cascades enrollments. Pause holds all sends. |
| Automatically enroll donors and send journey step emails hourly | `app/api/cron/journeys/route.ts`; vercel.json (`15 * * * *`); `journey_enrollments` | SHIPPED | **These emails DO send automatically with no per-email human click.** Honors do_not_contact, email_suppressions, and a first-gift double-thank guard. Sends via Resend using org_comms_settings identity; blocked (held, retried) if settings incomplete. |
| Manually enroll a donor in a journey and cancel a single enrollment from the donor profile | donor profile Journeys panel; `app/api/admin/journeys/[id]/enroll`, `journeys/enrollments/[id]` | SHIPPED | Guard logic in `lib/fundraising/enroll.ts` (tested). Cancel is the only enrollment action (no per-enrollment pause). |
| Compose an email campaign (plain text + `{{first_name}}`) against a saved donor segment | `app/admin/fundraising/comms/page.tsx` + `CommsControls.tsx`; `app/api/admin/comms/route.ts`; `email_campaigns`, `segments` | PARTIAL | Reached via Donors-page button, not a layout tab. Plain-text body only, no rich/HTML editor, single merge field. A draft-edit API (PATCH) exists but **no edit button in the UI** — drafts can only be tested/sent/deleted. |
| Send a [TEST] proof of a campaign to any address, personalized against a real sample recipient | `app/api/admin/comms/[id]/test/route.ts` | SHIPPED | Test copies deliberately carry no live unsubscribe token. |
| Send a campaign to all resolved segment recipients, excluding no-email, do-not-contact, and suppressed addresses, with a per-recipient send ledger | `app/api/admin/comms/[id]/send/route.ts`; `lib/fundraising/segments.ts`; `lib/fundraising/comms-email.ts`; `email_sends` | SHIPPED | Human-click only, behind a confirm. Hard cap 2000 recipients per send (constant, synchronous loop — no durable batching). Draft-only guard prevents double-send. From-identity from org_comms_settings; refuses without from + mailing address. |
| Configure the org sending identity: from name/email, reply-to, CAN-SPAM mailing address, footer, daily cap | `SettingsCard.tsx`; `app/api/admin/comms/settings/route.ts`; `org_comms_settings` | PARTIAL | Writes gated by org.manage via RLS. **`daily_send_cap` is stored and editable but enforced nowhere** — no send path reads it. |
| One-click unsubscribe (footer link + RFC 8058 List-Unsubscribe-Post) suppressing every known email for the constituent | `app/api/unsubscribe/route.ts`; `lib/fundraising/unsubscribe.ts`; `email_suppressions` | PARTIAL | HMAC-signed tokens (UNSUBSCRIBE_SECRET required, fails closed). Suppression is email-only; do_not_contact untouched. Confirmation page is hardcoded "Ambition Angels" / remi@ (tenant residue). **No admin UI to view or manage the suppression list.** |
| Save donor filter sets as named segments for campaigns and export | `app/api/admin/segments/route.ts`; Donors page `SegmentExportPanel.tsx`; `segments` | SHIPPED | Filter keys: q, type, source, tag, min_total, since. |
| See campaign results (sent/failed counts, sent date) on the Comms page | `app/admin/fundraising/comms/page.tsx` reading `email_campaigns` counters | READ ONLY | Aggregate counts only. The per-recipient `email_sends` ledger is written but displayed nowhere. |

## HONEST NOTES

- **Auto-send policy (ack_v2_7)**: verified — the migration converts the sole `auto_email` stewardship rule to `create_task`, so no acknowledgment/receipt email ever sends without a human click today. The `autoSendReceipt` code path remains live and would reactivate if anyone inserts an `auto_email` rule via SQL. Journey emails are the exception: once a journey is created (it starts `active`), the hourly cron sends its step emails fully automatically.
- **Stewardship rules have no UI.** `stewardship_rules` is edited only by SQL migration. The AA seed hardcodes assignees `'shannon'` and `'remi'`; `lib/fundraising/steward.ts` resolves org default steward from `org_settings.default_steward` → org owner → literal `'shannon'` fallback; `ACK_DEFAULT_ASSIGNEE = "shannon"` remains in `lib/fundraising/ack-tasks.ts`.
- **Single-tenant residue in senders**: acknowledgment sends and the dormant auto-receipt use hardcoded `Ambition Angels <careers@mail.ambitionangels.org>`; only campaigns/journeys use `org_comms_settings`. Letters page hardcodes AA street address + EIN; unsubscribe landing page hardcodes AA branding and remi@'s email.
- **Navigation**: none of Acknowledgments, Journeys, or Comms are tabs in `app/admin/fundraising/layout.tsx`; all three are reached via buttons on the Donors page. Everything sits behind `modules.fundraising`; `modules.comms` is defined in `lib/admin/entitlements.ts` but used nowhere — comms is not separately gated.
- **Sending stack**: Resend only (RESEND_API_KEY); Gmail is used elsewhere (sync/timeline), not for these sends. AI drafting needs ANTHROPIC_API_KEY. Crons need CRON_SECRET. Unsubscribe needs UNSUBSCRIBE_SECRET (production crashes without it, by design).
- **Not present (verified absent)**: open/click tracking (no webhook for Resend delivery/bounce events — bounces and complaints never reach `email_suppressions` automatically despite the reason vocabulary suggesting they do); campaign scheduling (send is immediate only); HTML/rich email editor; merge fields beyond `{{first_name}}`; journey step editing after creation; campaign draft editing UI (API only); PDF letter generation; suppression-list admin UI; per-recipient send history UI; `daily_send_cap` enforcement; A/B testing.
- **Manual steps outside the app**: verifying a Resend sending domain; checking the Resend dashboard when a send outcome is "unknown"; marking letter-batch gifts as thanked after printing; re-enabling auto-receipts or editing the stewardship matrix (SQL); adding a bounce/complaint to suppressions (SQL/manual).
- **Data-exit points**: real donor email leaves the system from exactly four code paths — acknowledgment send (human click), campaign send (human click + confirm), campaign test (human click), and the hourly journeys cron (automatic). All campaign/journey mail carries the CAN-SPAM footer and RFC 8058 one-click unsubscribe headers; acknowledgment receipts do not carry unsubscribe links (transactional).

# Finance — capability inventory

| Capability | Evidence | Status | Note |
|---|---|---|---|
| Gate the entire Finance section behind an org entitlement (`modules.finance`) and admin auth | `app/admin/finance/layout.tsx` → `app/admin/_components/FeatureGate.tsx`; middleware; `lib/admin/entitlements.ts` | SHIPPED | Server-side gate; direct URL on a disabled module renders a not-authorized panel. All finance APIs additionally check `getOrgContext()` per request. |
| Show a live finance dashboard (cash on hand, 3-tier runway, burn, Raised/Spent/Net YTD, 12-mo cash-flow chart, functional split donut, revenue-by-source donut, budget-vs-actual bars, pledge pipeline, recent gifts/transactions) | `app/admin/finance/page.tsx`; `lib/admin/finance.ts` (`getFinanceSnapshot`); tables `fin_config`, `fin_transactions`, `fin_budget`, `fin_revenue_commitments`, `fin_categories`, `gifts`, view `v_revenue_schedule` | SHIPPED | Everything is server-computed on request (`force-dynamic`). One shared snapshot feeds the dashboard, CEO cockpit, and briefing so numbers agree. |
| Compute cash on hand as anchor balance + transactions after the anchor date, and runway as three deterministic tiers (cash / due-pledges / projected-pipeline) | `lib/finance/runway.ts` (pure, unit-tested in `tests/finance-runway.test.ts`); `lib/admin/finance.ts` | SHIPPED | Not a bank feed — cash is only as fresh as the last manual "set balance" or the agent's email-derived update. Burn = trailing 3-active-month average, overridable by a config baseline. Restricted and undated pledges excluded from runway by rule. |
| Import bank transactions from CSV with two-phase preview→commit, per-row dedup, and rule-based auto-categorization | `app/admin/finance/upload/page.tsx` + `_components/UploadClient.tsx`; `app/api/admin/finance/import/route.ts`; `lib/finance/parsers.ts`, `dedup.ts`, `categorize.ts`; tables `fin_transactions`, `fin_imports`, `fin_category_rules` | SHIPPED | Only Wells Fargo has a dedicated parser. "Chase", "Mercury", "QuickBooks" options all route to a generic header-driven parser — untested against those banks' real exports. Re-upload of an identical file refused via file hash. |
| Browse, filter, and paginate transactions; inline-edit category, restricted flag, restricted-to, and exclude-from-runway flag | `app/admin/finance/transactions/page.tsx` + `_components/*`; `app/api/admin/finance/transactions/[id]/route.ts` (PATCH) | SHIPPED | No create/delete of individual transactions in the UI — rows enter only via CSV import. No transaction export. |
| Suggest categories for uncategorized transactions with Claude, then apply only after human confirmation (optionally minting reusable "contains" rules) | `app/admin/finance/transactions/_components/AiCategorize.tsx`; `app/api/admin/finance/categorize/suggest/route.ts` + `categorize/apply/route.ts`; `lib/finance/ai-categorize.ts` (model `claude-opus-4-8`, structured output, 60-txn batches) | SHIPPED | Requires `ANTHROPIC_API_KEY` (503 with clear message if unset). Suggest writes nothing; apply is human-confirmed and never clobbers an already-set category. |
| Manage categorization rules: create/edit/delete/toggle, seed 78 default rules, and bulk-apply rules to all uncategorized transactions | `app/admin/finance/rules/page.tsx` + `RulesEditor.tsx`; `app/api/admin/finance/rules/*` (POST, PATCH/DELETE `[id]`, `apply-all`, `seed`); `lib/finance/default-rules.ts` | SHIPPED | Default rule set is hardcoded from Ambition Angels' own Wells Fargo descriptions — near-useless for another org until reseeded/rewritten. Seed references fixed category IDs like `revenue.foundations`. |
| Edit an annual budget per category (base + Tier1/Tier2 contingency + activated contingency) inline | `app/admin/finance/budget/page.tsx` + `BudgetEditor.tsx`; `app/api/admin/finance/budget/route.ts`; table `fin_budget` | SHIPPED | Chart of accounts (`fin_categories`) itself has NO editor UI — categories are migration-seeded; adding/renaming a category requires SQL. |
| Import an annual budget from a QuickBooks Budget Overview CSV with fuzzy account-name matching and manual mapping of unmatched rows | `app/admin/finance/budget/import/page.tsx`; `app/api/admin/finance/budget/import/route.ts`; `lib/finance/qb-budget.ts` | SHIPPED | CSV file only — no QuickBooks API connection. Writes `base_amount` only. Page fetches a `/budget/import/categories` endpoint that does not exist (result deliberately ignored) — harmless dead call. |
| Record and manage pledges/grants/commitments manually (create, edit, mark-received, delete) with source type, probability, expected date, restriction | `app/admin/finance/revenue/page.tsx` + `RevenueManager.tsx`; `app/api/admin/finance/revenue/route.ts` + `[id]/route.ts`; table `fin_revenue_commitments` | SHIPPED | `external_ref` + partial unique index lets a HubSpot deal be "adopted" once per year (409 on dupes). |
| Present one canonical dated revenue schedule (pledge installments, grant payments, un-tranched awarded grants, probability-weighted pipeline, manual commitments) | `lib/finance/schedule.ts`; DB view `v_revenue_schedule` (`supabase/migrations/create_revenue_schedule.sql`) joining `pledge_payments`/`pledges`, `grant_payments`/`grants`, `opportunities`, `fin_revenue_commitments`, `funds` | SHIPPED | Finance never reads raw `hs_deals` for numbers. "Received" money is summed from the `gifts` ledger, so Finance's Raised YTD depends on fundraising gifts data being maintained. |
| Set/re-anchor the bank balance ("set current balance"), with computed-vs-actual drift warning and freshness chip | `app/admin/finance/_components/ReconcileCard.tsx`; `app/api/admin/finance/reconcile/route.ts` → `fin_config` (`cash_starting_balance/date`, `cash_reconciled_at`) | SHIPPED | This IS the reconciliation to the bank — a manual number typed from a bank statement (or written by the daily agent, below). |
| Run a guided "Friday close" checklist (import CSV → clear uncategorized → sync/confirm pledges → set balance → confirm burn baseline → review runway tiers → stamp close) | `app/admin/finance/close/page.tsx` + `CloseWizard.tsx`; `app/api/admin/finance/close/route.ts` (stamps `fin_config.last_reconciled_at`) | SHIPPED | The "close" is a freshness ritual, not an accounting close: no period locking, no journal adjustments, no closed-period immutability. |
| Triage agent-proposed ledger entries in a Reconcile inbox (accept → writes a pledge to `fin_revenue_commitments`; dismiss → closes) | `app/admin/finance/reconcile/page.tsx` + `ReconcileInbox.tsx`; `app/api/admin/finance/reconciliation/route.ts` (POST, idempotent) + `[id]/route.ts` (PATCH accept/dismiss); table `fin_reconciliation_items` | SHIPPED | Proposals are produced OUTSIDE the app by the `finance-reconcile` Cowork agent skill (`.claude/skills/finance-reconcile/SKILL.md`): a scheduled Claude session sweeps Gmail/HubSpot and inserts rows via Supabase MCP. Without that agent running, the inbox stays empty. Accept is the only path from proposal to ledger — human-only. |
| Auto-update the cash anchor daily from Wells Fargo balance-alert emails | `.claude/skills/finance-balance/SKILL.md` — scheduled Cowork agent, Gmail + Supabase MCP, updates `fin_config` directly by SQL | PARTIAL | Runs entirely outside the app (Claude agent + MCP); depends on WF email alerts, Gmail/Supabase connectors, and a scheduled task. Skill hardcodes Supabase project id and org slug `ambition-angels`. Guardrails: forward-only anchor moves, sanity bounds, config-table-only writes. |
| Model what-if cash scenarios (hires, gifts, recurring income/costs) over 24 months against the baseline burn-down | `app/admin/finance/forecast/page.tsx` + `ForecastBoard.tsx`, seeded from `v_revenue_schedule` | PARTIAL | Scenario levers persist only in browser `localStorage` (per-device, not shared, not in DB). |
| Display four headline KPIs (cash, burn, runway, funding needed) pulled live from the founder's Google Sheet finance model | `app/admin/finance/model/page.tsx`; `lib/google/finance-sheet.ts`; `scripts/finance-model-webhook.gs` | PARTIAL | Read-only, cached 1h. Needs `FINANCE_MODEL_WEBHOOK_URL`, `FINANCE_MODEL_WEBHOOK_TOKEN`, `FINANCE_SHEET_ID` AND the .gs script manually deployed in the sheet; the repo copy still has `TODO_TAB_TITLE` / `TODO_A1` placeholders — a template, not a working deployment. The real model math lives in the spreadsheet, not BloomOS. |
| Generate a print/PDF-ready one-page board financial report (headline sentence, KPIs, cash-flow chart, functional split, fundraising, budget-vs-actual) | `app/admin/finance/report/page.tsx` + `PrintButton.tsx` | SHIPPED | "Export" = browser print-to-PDF via a scoped `@media print` rule. No file generation, no email/send, no saved history. |
| Edit fiscal-year settings (year, FY start month, goal, contingency threshold, cash anchor, burn baseline, runway horizon/target) | `app/admin/finance/config/page.tsx` + `ConfigEditor.tsx`; `app/api/admin/finance/config/route.ts`; `lib/admin/finance.ts:upsertFinConfig` → `fin_config` | SHIPPED | Range-validated server-side; `revalidatePath` busts caches on save. |
| Aggregate Stripe website donations (totals, this-month, donor profiles, recent 20) for the admin | `app/api/admin/donations/route.ts` reading `donations` table | READ ONLY | Separate from `fin_*` — website-donation stats endpoint, not part of the ledger. |
| Push tasks into BloomOS from external MCP clients via a secret-URL connector | `app/api/mcp/[secret]/route.ts` (`create_task`, `list_my_tasks`; `TASK_INGEST_SECRET`) | SHIPPED | NOT a finance write surface — ops-task ingest only. The finance agents write via Supabase MCP, not this connector. Capability-URL auth: anyone with the URL can post tasks. |

## HONEST NOTES

**Half-built / stubbed / flag-gated**
- `/admin/finance/model` is scaffolding until someone edits and deploys the Apps Script: `scripts/finance-model-webhook.gs` ships with `TODO_TAB_TITLE` / `TODO_A1` placeholders. The page renders a "Not configured" panel listing missing env vars.
- Chase / Mercury / QuickBooks bank formats in the upload dropdown are aliases for the generic header parser — never validated against those banks' actual exports (code comment says "until … adapters are written").
- Dead fetch to nonexistent `/api/admin/finance/budget/import/categories` (intentionally ignored, cosmetic).
- No UI to manage the chart of accounts (`fin_categories`) — migration-seeded, SQL-only changes.
- Forecast scenarios live in `localStorage` only: lost on device change, invisible to colleagues.

**Manual steps outside the app**
- Bank data enters ONLY by a human downloading a CSV from Wells Fargo online banking and uploading it. No bank feed, no Plaid, no automatic transaction sync (grep confirms zero Plaid/bank-API code).
- The trusted cash number is typed by hand ("set current balance") or set by the `finance-balance` Cowork agent parsing a Wells Fargo balance-alert *email* — an agent-run, email-scrape dependency, not an API integration.
- Weekly reconciliation proposals come from the `finance-reconcile` Cowork agent sweeping Gmail/HubSpot on a Friday schedule and inserting rows by raw SQL through the Supabase MCP connector. If those scheduled agent sessions aren't set up, the Reconcile inbox is dead weight.
- QuickBooks budget arrives as a manually exported CSV; the founder model lives in a manually maintained Google Sheet with a manually deployed Apps Script.
- One migration (`2026_finbudget_rebase.MANUAL.sql`) is apply-by-hand in the SQL editor and hardcodes the Ambition Angels org UUID and 2026 budget decisions.

**Integrations: live vs scaffold**
- Live: Anthropic API (`ANTHROPIC_API_KEY`, model `claude-opus-4-8`) for categorize/suggest; Supabase (service-role, org-fenced in every handler); Google Apps Script webhook for the Model page (once configured); HubSpot indirectly — finance reads `hs_deals.synced_at` for freshness.
- Stripe: only the public donation pipeline writes `donations`; `"stripe"` is an allowed reconciliation source but nothing automated emits it.
- QuickBooks: CSV-file parsing only — no OAuth, no API. No Plaid/bank feed. No payroll integration (Gusto appears only as categorization rule patterns).

**Data entry / exit**
- In: bank CSV (WF + generic), QuickBooks budget CSV, manual pledge/budget/config forms, agent-inserted reconciliation proposals and cash anchors.
- Out: browser print-to-PDF board report only. NO CSV/Excel export of transactions, budget, or pledges anywhere in the module; no scheduled report emailing.

**Missing vs. what "nonprofit finance software" implies (verified absent)**
- No general ledger / double-entry accounting — single-sided cash transactions with categories.
- No journal entries, no period close/locking (the "close" is a timestamp), no trial balance, no balance sheet, no accrual accounting, no audit-ready statements (Form 990 functional split is display-only over categorized cash expenses).
- No accounts payable/receivable, no bill pay, no invoicing, no payroll.
- No bank sync/feeds; no multi-account or multi-currency support (one implicit bank account, USD).
- Restricted-fund handling is a boolean + label carve-out from runway — not true fund accounting.

**Single-tenant residue / multi-tenant risk**
- `fin_config` was created as a literal singleton (`id int primary key default 1`, `check (id = 1)`); no restructure migration exists in the repo, so a second org's config INSERT fails on the singleton PK until that lands.
- Global (not org-scoped) unique constraints: `fin_transactions.dedup_hash` UNIQUE, `fin_imports.file_hash` UNIQUE, `fin_budget` PK `(year, category_id)`; budget upserts use `onConflict: "year,category_id"` — cross-tenant collisions possible.
- `org_id` on every fin table defaults to the Ambition Angels org (`add_org_id_to_tenant_tables.sql`).
- Fixed text category IDs (`revenue.foundations`, `program.tech-app`, …) shared across orgs; the 78 default rules assume that exact chart of accounts.
- Both agent skills hardcode the Supabase project id and slug `ambition-angels`; the Model page pins a specific sheet tab; default WF rules encode this org's actual vendors. Every API handler org-fences its queries — the load-bearing tenant isolation today.

# Program (Students, Intake, Cohorts) and Partners — capability inventory

| Capability | Evidence | Status | Note |
|---|---|---|---|
| View the student roster grouped by journey stage, with funnel strip and KPI cards (engaged, active 30d, missing guardian contact) | `app/admin/students/page.tsx`, tables `students`, `participant_stages`, `constituents` | SHIPPED | Sidebar "Students", gated by `modules.program`; capped at 500 rows; stage vocabulary is per-org data |
| Add a student via an inline form (name, stage, leader, custom fields) | `app/admin/students/_components/StudentControls.tsx` → POST `app/api/admin/students/route.ts` | SHIPPED | Stage validated against org's `participant_stages`; audit-logged |
| Edit a student inline or from their profile (email, phone, leader, custom fields) | `StudentControls.tsx` `InlineEdit`, `app/admin/students/[id]/_components/StudentProfileControls.tsx` → PATCH `app/api/admin/students/[id]/route.ts` | SHIPPED | Grade/school/guardian/dob live in `custom_fields` JSONB, not columns (legacy columns dropped) |
| Move a student through the stage pipeline (dropdown, one-tap "Advance", "Log activity") | `StudentControls.tsx` → PATCH student route; stages from `lib/admin/program/stages.ts` (`participant_stages` table, hardcoded `DEFAULT_STAGES` fallback) | SHIPPED | Stage vocabulary is configurable per org as DATA, but only via SQL — no UI to edit stages |
| Delete a student | DELETE `app/api/admin/students/[id]/route.ts` | SHIPPED | Hard delete after confirm dialog; audit-logged |
| View a full student profile: identity, guardian, enrollments across cohorts, per-session attendance history, tasks, documents, comments, audit history | `app/admin/students/[id]/page.tsx`, tables `cohort_members`, `attendance` | SHIPPED | Attendance list shows last 15 of up to 200 marks |
| Assign a "leader" (volunteer-flagged constituent) to a student | students page/profile pickers → student POST/PATCH routes, `students.leader_id` → `constituents` | SHIPPED | Picker only renders if the org has `is_volunteer` constituents |
| Render per-org custom fields on student forms with type/required validation | `lib/admin/customFields.ts`, `custom_field_defs` table, `app/admin/students/_components/CustomFields.tsx` | PARTIAL | Fields work end-to-end, but there is NO UI to define them — an org adds a field with a SQL INSERT (AA's defs seeded by migration `participant_aa_custom_fields.MANUAL.sql`) |
| Import students from CSV with column mapping, preview, dedupe, commit | `app/admin/imports/page.tsx` ("Import CSV" button on roster), `lib/admin/imports/engine.ts` (`entity: "student"`), dedupes on student + guardian email | SHIPPED | Shared import surface with donor/constituent imports |
| Take public student applications on a website form (guardian-centric, optional cohort choice) | `app/apply/page.tsx` + `ApplyForm.tsx` → POST `app/api/apply/route.ts` → `applications` table | SHIPPED | Rate-limited 6/hr/IP; cohort picker only shows cohorts flagged `accepting_applications` |
| Send confirmation email to guardian and notification email to staff on application submit | `app/api/apply/route.ts` via Resend | SHIPPED | Requires `RESEND_API_KEY`; notify address from `INTAKE_NOTIFY_EMAIL` (defaults to remi@); non-blocking, failures only logged |
| Screen applications: eligible/ineligible, priority tier 1–3, cohort assignment, screening notes, decline/expire | `app/admin/intake/page.tsx` + `_components/IntakeControls.tsx` → PATCH `app/api/admin/applications/[id]/route.ts` | SHIPPED | Intake is a tab of Students (`app/admin/students/tabs.ts`); gated by `modules.program` |
| Run a waitlist ordered by priority then first-come, with per-cohort positions, open-seat math, and one-tap "Offer next" | `app/admin/intake/page.tsx` (seat math = capacity − enrolled − offers out), `OfferNextButton` | SHIPPED | Pure status change — "offering" sends NO email to the family; staff use the mailto link manually |
| Accept an application: creates a student (or links existing by student/guardian email match), enrolls them in the cohort, closes the application | POST `app/api/admin/applications/[id]/accept/route.ts` | SHIPPED | Application fields map into student `custom_fields`; created student starts at stage "learn" (hardcoded key); no acceptance email |
| Delete an application | DELETE `app/api/admin/applications/[id]/route.ts` | SHIPPED | |
| Create and manage cohorts (program, term, location, capacity, dates, planning/active/completed/archived) | `app/admin/cohorts/page.tsx` + `_components/CohortControls.tsx` → `app/api/admin/cohorts/route.ts`, `[id]/route.ts` | SHIPPED | Sidebar "Cohorts"; gated by `modules.program`; delete supported |
| Auto-create program records from cohort's program name (find-or-create) | `lib/admin/program/programs.ts`, `programs` table, `cohorts.program_id` | PARTIAL | Programs exist only as a lookup created implicitly by cohort forms — no page to list, rename, or deactivate programs |
| Enroll/unenroll students in a cohort; mark members completed/dropped with end dates | cohort detail `AddMemberForm`/`MemberRow` → `app/api/admin/cohorts/[id]/members/route.ts` (`cohort_members`) | SHIPPED | Candidate picker excludes withdrawn students |
| Schedule, edit, cancel, and delete cohort sessions (date, time, title, location) | `NewSessionForm`/`SessionRow` → `app/api/admin/cohorts/[id]/sessions/route.ts`, `app/api/admin/sessions/[id]/route.ts` (`cohort_sessions`) | SHIPPED | |
| Record attendance with a mobile roster-tap sheet (tap cycles present→late→excused→absent→clear; "mark rest present") | `app/admin/cohorts/[id]/sessions/[sessionId]/page.tsx` + `AttendanceSheet.tsx` → POST `app/api/admin/sessions/[id]/attendance/route.ts` (`attendance`) | SHIPPED | Each tap saves immediately; recording auto-marks session "held" and bumps students' `last_activity_at` |
| Record attendance via QR code or kiosk | `attendance` route accepts `method: "qr" \| "kiosk"` | SCHEMA ONLY | Methods exist in the API/table enum only; no QR or kiosk UI anywhere — every mark comes from the admin roster sheet ("roster") |
| See dosage rollups: attendance rate, sessions held, regular attendees (≥ threshold), consecutive absences per member | `app/admin/cohorts/_lib/rollups.ts`, cohorts list + detail pages | SHIPPED | Computed read-only from marks; no export |
| Toggle a cohort as "accepting applications" to publish it on the public form | `CohortHeaderControls` → cohort PATCH (`accepting_applications`) | SHIPPED | This is the only publish switch between admin and `/apply` |
| Attach tasks and documents to students and cohorts | `EntityTasks`/`EntityDocuments` on both profile pages | SHIPPED | Shared cross-module records system |
| View a "Program" overview page | `app/admin/program/page.tsx` | SCHEMA ONLY | Confirmed placeholder — renders only a header ("Partners, teens, outcomes."), no data, not in sidebar nav |
| Manage a partner CRM: list + tabbed views and a drag-and-drop kanban board across prospect→outreach→pilot→active→anchor (→lapsed) | `app/admin/partners/page.tsx`, `PartnersWorkspace.tsx`, `PartnersBoard.tsx` → PATCH `app/api/admin/partners/manage/[id]/route.ts` (`partners`) | SHIPPED | Sidebar "Schools & Partners"; gated by `modules.partners` (default OFF for new tenants) |
| Create, edit, and delete partner orgs (kind, city, champion, notes, teen_count, program_type) | `NewPartnerForm`, `EditPartnerButton` → `app/api/admin/partners/manage/route.ts` + `manage/[id]` PATCH/DELETE | SHIPPED | |
| Manage many contacts per partner (add/edit/delete, primary flag, tags, notes) | partner profile `AddContactForm`/`ContactCard` → `app/api/admin/partners/contacts/*` (`partner_contacts`) | SHIPPED | First contact auto-becomes primary |
| Log partner touches (call/email/meeting/event/note) with a timeline, auto-advancing last-touch date | `LogPartnerInteraction` → `app/api/admin/partners/interactions/route.ts` (`partner_interactions`) | SHIPPED | Feeds "Need a touch" KPI (active + 30 days quiet) |
| Track MOU status (none/drafting/sent/signed), start/end dates, and data-agreement date, with expiring/expired alerts | `MouControls` → partner manage PATCH; KPIs on `app/admin/partners/page.tsx` (90-day expiry window) | PARTIAL | Status + dates only — the MOU document itself isn't attached here (generic EntityDocuments can hold files, but there's no link between a stored file and the MOU status) |
| Score partners with a rubric that derives a 0–100 priority score | `RubricEditor`, `app/admin/partners/_lib/rubric.ts` → manage PATCH (`score_factors`, `priority_score`) | SHIPPED | Board columns sort by score |
| Merge a duplicate partner into another (moves contacts + interactions, fills blanks, keeps further stage, deletes the duplicate) | `MergeControl.tsx` → POST `app/api/admin/partners/merge/route.ts` | SHIPPED | Irreversible; confirm dialog only |
| Feed inbound partner prospects from the public signup form | `app/api/program-partner-signup/route.ts` inserts into `partners` with `status: "prospect"` | SHIPPED | Public `/program-partners` page is noindex/unlinked outreach |
| Show open/overdue task chips per partner from linked ops tasks | `app/admin/partners/page.tsx` reads `ops_tasks` where `linked_entity_type = "partner"` | SHIPPED | Read-only rollup on the list |

## HONEST NOTES

**Half-built / stubbed / flag-gated**
- `/admin/program` is a bare placeholder (header only, no content, no nav link). "Program" as a module exists as Students + Cohorts + Intake, not this page.
- `modules.partners` is documented as **default OFF for new tenants** (`lib/admin/entitlements.ts`); `modules.program` is on for standard tenants as seed data. All gating is data-seeded — the code defaults every module to off.
- Page layouts enforce module gates (`FeatureGate` in each layout.tsx), but **none of the program/partners API routes check module entitlements** — they check only session/org (`getOrgContext`), so the write APIs function even for an org whose module is switched off (grep confirms zero `requireEntitlement` usage across these routes).
- QR and kiosk attendance are enum values the API accepts but nothing sends — attendance is admin-roster-tap only.
- Participant stage vocabulary and student custom-field definitions are per-org **data** with no admin UI: changing stages or adding a custom field requires a SQL INSERT/migration (e.g. `participant_aa_custom_fields.MANUAL.sql`, `participant_aa_stage_rename.MANUAL.sql`).
- Accept flow hardcodes new students to stage key `"learn"` — an org whose custom stage set lacks that key would get an off-vocabulary stage.
- Naming trap: `GET /api/admin/partners` returns the **Guide waitlist** (`partner_waitlist`), and `GET /api/admin/programs` reads the legacy `program_partners` table (with soft-fail for missing schema) — neither serves the partners CRM or `programs` table.

**Manual steps outside the app**
- Offering a seat, accepting, or declining an applicant sends **no email to the family** — staff must email guardians themselves (UI provides mailto links only). Only the initial application submit triggers automated email.
- MOU documents are negotiated/signed outside the app; only status + dates are tracked.
- Defining/renaming stages, custom fields, and enabling modules for a tenant all happen in SQL.

**Integrations: live vs scaffold**
- Resend email on `/api/apply` is live (needs `RESEND_API_KEY`; staff notify defaults to remi@ambitionangels.org, overridable via `INTAKE_NOTIFY_EMAIL`). No LLM/Anthropic usage anywhere in this scope. No SIS, no HubSpot in the program/partners path.
- All writes are audit-logged (`lib/audit`) and surface in per-record history panels.

**Data entry/exit points**
- In: public `/apply` form → `applications`; public `/program-partners` form → `partners` prospects; CSV import at `/admin/imports` (students share the surface with donors); students also arrive tagged `external_source` ygb / career_quiz / application / import.
- Out: **nothing** — no CSV export, no report download, no API read for external consumers in this scope.
- Seeded data: `supabase/migrations/seed_partners_2026.sql` inserts ~95 real named orgs (Aim High, EOYDC, Hidden Genius, school districts, etc.) as prospect/outreach partners from a workbook. Any demo of the partners pipeline showing these rows reflects **seeded data, not product usage**. `supabase/seed/ygb_demo_tenant.sql` similarly seeds demo tenant data.

**Expected but absent (verified by search)**
- No family/guardian portal or login of any kind — guardians are plain text/JSONB fields on the student.
- No bulk communications to families (no SMS, no email blast, no offer/acceptance letters).
- No report cards, outcomes tracking, assessments, or surveys tied to students.
- No attendance export or funder-ready attendance report; dosage numbers are on-screen only.
- No student photos, consent/media-release tracking, medical/allergy fields, or emergency-contact structure beyond one guardian custom-field triple.
- No scheduling/calendar sync for sessions (sessions are date+time rows; the separate `/meet` scheduler is unrelated).
- No soft-delete/archive for students — delete is permanent (cohorts do have an "archived" status).
- No per-student billing/fees, and no capacity waitlist automation beyond the manual "Offer next" button.

# Ops/Work (tasks, projects, rhythm) and Executive Briefing — capability inventory

| Capability | Evidence | Status | Note |
|---|---|---|---|
| Create tasks with title, description, category (8 fixed departments), priority, labels, due date, assignee, project, today/this-week pins, planned week, and optional CRM entity link | `app/api/admin/ops/tasks/route.ts` POST; composers: `TaskListView.tsx` (inline), `QuickAddModal.tsx` (global +), `ProjectTaskList.tsx`, `EntityTasks.tsx` (CRM profiles), `TaskComposer.tsx`, `NextMovePanel.tsx`; table `ops_tasks` | SHIPPED | Writes via session client so RLS (org + ops.write) enforces; entity-link vocabulary is a 16-type fixed list mirroring a DB CHECK |
| Edit tasks (title, description, category, priority, labels, assignee, due date, project, delegate, "schedule today") in a modal | `TaskEditModal.tsx` → PATCH `ops/tasks/[id]` | SHIPPED | `sys:`-prefixed labels hidden and preserved |
| Create and display subtasks (parent/child, collapsible, count badge) | `TaskEditModal.tsx` (`parent_id`), `TaskListView.tsx`; `ops_tasks.parent_id` self-FK | SHIPPED | One level only; no drag re-parenting |
| Change status, pin today/this-week, block, archive/unarchive, delete tasks from a row menu; bulk "archive all done" | `TaskRow.tsx`, `TasksSurface.tsx` → PATCH/DELETE `ops/tasks/[id]` | SHIPPED | Delete is hard delete; archive is soft (`archived_at`) with an Archived scope |
| View tasks as a grouped list (by priority/status/department/project) or a drag-to-move status board, with assignee and CRM-link filters | `TasksSurface.tsx`, `TaskListView.tsx`, `TaskBoardView.tsx` on `/admin/ops` | SHIPPED | Assignee filter in URL |
| Show an ops landing with Today (due + pinned), This Week, active projects, per-category counts, and a "stuck work" rollup | `app/admin/ops/page.tsx`; health math in `_types/ops.ts` `readTaskHealth` (mirrors `v_ops_task_health` view) | SHIPPED | Thresholds duplicated in TS and SQL, kept in sync by hand |
| Track a deliberate-deferral roll count per task and surface "rolled N×" in Monday carryover | PATCH route increments `roll_count`; `app/admin/ops/monday/page.tsx` | SHIPPED | |
| Run a Monday planning wizard: orient → clear carryover (Plan/Done/Push/Drop) → area walk by category → place tasks on days against the real calendar → commit | `app/admin/ops/monday/page.tsx`, `WeekPlanner.tsx`, `AreaWalk` → POST `/api/admin/ops/rhythm`; `ops_tasks` (`planned_week/planned_day/day_order`), `rhythm_sessions` | SHIPPED | Day board shows calendar events, open blocks, conflicts |
| Schedule a task into a calendar time block (create/move/delete a Google Calendar event linked to the task) | `WeekPlanner.tsx` → `agenda/blocks` → `lib/agenda/task-blocks.ts` | PARTIAL | Requires a connected Google Calendar; 409 otherwise |
| Create a deduplicated meeting-prep task before an upcoming meeting | POST `app/api/admin/ops/prep/route.ts`; dedupe `prep:<event_id>` label | SHIPPED | |
| Run a Friday close wizard: day-by-day truth → roll/done/drop still-open work → meeting recap (accept/dismiss AI-suggested follow-ups) → nudges → close with notes | `app/admin/ops/friday/page.tsx`, `MeetingRecap.tsx`, `FridayNudges`, `FridayClose` → POST `ops/rhythm` | SHIPPED | Nudges step is a stale-KPI count + link only |
| Record weekly rhythm commits as one upserted row per (org, user, kind, week) with server-recomputed stats | `app/api/admin/ops/rhythm/route.ts`; `rhythm_sessions` | SHIPPED | Stats recomputed server-side, never trusted from client |
| Show a "My Week" hub with a computed week status line and time-appropriate Plan/Close doors | `app/admin/ops/my-week/page.tsx`, `lib/admin/ops/rhythm.ts` | SHIPPED | |
| Create, list (filter/sort/paginate/search), edit (incl. status lifecycle, initiative attach), and delete projects | `/admin/ops/projects` + `[id]`; `ops/projects` routes; `ops_projects` | SHIPPED | Project APIs run service-role with explicit org fencing; deleting a project orphans tasks (FK SET NULL) |
| Auto-create a workspace project per grant and auto-close it when the grant reaches a terminal stage | `lib/fundraising/grants.ts`; `ops_projects.grant_id` unique partial index | SHIPPED | Grant-backed projects hidden from the Projects list by default |
| Attach a project to a strategic initiative for goal → initiative → project rollup | `ProjectHeader` → PATCH `initiative_id` | SHIPPED | |
| Show a 30/60/90-day action queue drilldown over the unified action-item view (9 sources) with one-click completion | `app/admin/queue/page.tsx`, `lib/admin/actionQueue.ts` reading `v_action_items` (ops_task, grant_requirement, compliance_item, acknowledgment, reconciliation_item, document_renewal, metric_stale, application_pending, session_unrecorded) | PARTIAL | No navigation link exists — the Command Center chips that linked here were removed; reachable by direct URL only |
| Deduplicate acknowledgment work in the queue | `lib/admin/actionQueue.ts`, `sys:gift:<id>` labels | SHIPPED | Deterministic ranking; no model calls |
| Show a daily executive briefing: deterministic top-5 decision feed + pulse strip (runway, cash, pipeline, YTD vs goal) + today's agenda + fundraising priorities + email follow-ups | `/admin/briefing`; engine `lib/admin/briefing/engine.ts` (hard cap 5, 9 signal sources) | SHIPPED | Selection and every number are deterministic; gated by `modules.ops` |
| Narrate the daily briefing with AI (headline / narrative / one focus action), cached once per day per org | `lib/admin/briefing/narrate.ts`, `claude-sonnet-4-6`, forced tool call, `bloomos_briefing_narrative`, pre-warmed by daily cron | SHIPPED | Requires `ANTHROPIC_API_KEY`; deterministic fallback without it. Resident org gets a hand-tuned prompt, other orgs a neutral one |
| Act on briefing items (snooze / dismiss / mark done / undo) without touching the underlying record | POST `briefing/decision`; `bloomos_briefing_state` | SHIPPED | Fully reversible; underlying record never modified |
| Show and generate an AI-narrated weekly briefing (headline, narrative, 3 priorities, week-in-numbers, deadlines, CRM overdue) | `/admin/briefing/weekly`, POST `app/api/admin/briefing/route.ts` → `lib/briefing.ts` (raw fetch, `claude-sonnet-4-6`); `briefings` | SHIPPED | Degrades to data-only without key; page shows latest row only — no history UI despite every generation stored |
| Render one-sentence briefing-derived summary lines atop module pages | `lib/admin/briefing/summary.ts`, `SectionSummary.tsx` | SHIPPED | |
| Email daily deadline reminders (grant deliverables 14/7/1d + overdue, moves due, compliance due) to owner/admin operators | `app/api/cron/daily-reminders/route.ts`, cron 14:00 UTC, Resend | PARTIAL | None of its five queries filter by org_id — in a multi-tenant DB every tenant's deadlines would email the resident operators; recipients from `org_email_allowlist` also unfiltered |
| Email a Monday digest (gifts, new constituents, pipeline moves, deadlines, AI narrative, per-operator overdue-CRM sections) | `app/api/cron/weekly-digest/route.ts`, Mon 14:30 UTC | SHIPPED | Hardwired to the resident org (`getResidentOrgId`); always sends |
| Ingest tasks machine-to-machine over HTTP (single or batch ≤100, idempotent via `sys:ref` dedupe, audited) | POST `app/api/ingest/tasks/route.ts`, Bearer `TASK_INGEST_SECRET` | SHIPPED | Default assignee hardcoded "shannon"; writes to the resident org only; tasks tagged `cowork` |
| Expose a remote MCP server with `create_task` and `list_my_tasks` tools for external Claude agents | `app/api/mcp/[secret]/route.ts` — stateless JSON-RPC, secret in URL path (= `TASK_INGEST_SECRET`) | SHIPPED | Capability-URL security: anyone with the URL can create tasks and list any assignee's open tasks; `list_my_tasks` has no org filter; tool descriptions name Shannon |
| Serve a read-only projects/tasks snapshot (delta-since + deletion-detection id sets) to an external "life hub" | GET `app/api/hub/v1/snapshot/route.ts`, Bearer `HUB_SNAPSHOT_SECRET` | SHIPPED | Hardcoded to exactly two profile UUIDs (Remi, Kendra) and two org slugs (`ambition-angels`, `young-life-epa`); Shannon's rows explicitly excluded |
| Show a personal "needs you" shelf and a week-load pulse in the right rail | `lib/admin/rail/needs-you.ts`, `week-pulse.ts` | SHIPPED | Read-only |

## HONEST NOTES

- **Env vars:** `ANTHROPIC_API_KEY` (briefing narrators; graceful fallback), `CRON_SECRET`, `TASK_INGEST_SECRET`, `HUB_SNAPSHOT_SECRET`, `RESEND_API_KEY`. Two AI call styles coexist: daily narrative uses SDK + forced tool use + caching; weekly uses raw fetch + parse-JSON-from-text (brittler).
- **Single-tenant residue, concrete:** hub snapshot hardcodes Remi/Kendra profile UUIDs and two org slugs; ingest/MCP default assignee "shannon"; daily-reminders cron queries carry no org_id filter (weekly-digest is fenced to the resident org); `getOperatorEmails()` reads `org_email_allowlist` by role only, no org filter; email From hardcoded `BloomOS · Ambition Angels <careers@mail.ambitionangels.org>`; resident org keeps a bespoke "chief of staff" narrative prompt.
- **Identity is a free-text first-name handle:** `ops_tasks.assigned_to` is text ("remi"/"shannon") resolved from display name; "my" work = assigned to my handle OR unassigned; a display-name change silently orphans assignments.
- **Mixed data-access patterns:** task CRUD via session client (real RLS); project routes, briefing decision, and page-level reads use service-role with hand-written org fences — correctness rests on discipline on those paths.
- **/admin/queue is functionally orphaned:** works, but its inbound links were removed; not in sidebar/tab bar/search.
- **Manual steps:** briefing item decisions never update the underlying record; Friday "nudges" is a count + link, no inline fix; task→calendar scheduling requires each user to connect Google Calendar; weekly briefing shows only the latest row.
- **Data entry/exit:** tasks enter via UI (5+ composers), HTTP ingest, MCP, meeting-suggestion acceptance, prep-task creation, and the ack-task bridge; tasks exit via the hub snapshot API and operator emails. No CSV/export for ops data and no external task-system (Asana/Linear) integration.
- **Expected but missing:** no recurring tasks; no per-task comments/attachments; no notifications on task assignment; no team-level Monday/Friday rhythm (strictly per-user); queue completion supports only ops-task "done" one-click (other sources deep-link out).

# Meetings, calendar, agenda, public scheduler — capability inventory

| Capability | Evidence | Status | Note |
|---|---|---|---|
| Public scheduler landing (`/meet`) listing active meeting types | `app/meet/page.tsx` reads `meeting_types` (anon client, `is_active`, sort_order), cards link to `/meet/[slug]` | SHIPPED | In sitemap but not in public Nav/Footer — reached by shared link. Copy/photo hardcoded "Meet with Remi" / Remi Sobomehin image |
| Booking flow per type (`/meet/[slug]`) | `app/meet/[slug]/page.tsx` + `booking-flow.tsx`; calls `/api/meet/availability` and `/api/meet/book` | SHIPPED | Supports duration_options picker and video/in-person choice |
| Availability computation | `lib/availability.ts` via `app/api/meet/availability/route.ts`: weekday window, blackouts, daily_limit, min-notice, buffer, max-advance; busy = Google freebusy (env account) merged with confirmed `bookings` rows | SHIPPED | Host timezone hardcoded `America/Los_Angeles`; freebusy queries only the single env-account calendar (`GOOGLE_CALENDAR_ID` or primary) |
| Book a slot (public) | `app/api/meet/book/route.ts`: IP rate limit (3/10min, in-memory), server-side slot re-check, Google event insert (`sendUpdates: all`), compensating cancel on DB failure, insert `bookings` row with `cancel_token` | SHIPPED | Only the resident org is `configured` (`lib/meet/host.ts`) — other tenants get 503. Video location = one static `ZOOM_URL` env link (+`ZOOM_PASSCODE`); no per-meeting video provisioning, no Google Meet conference |
| Confirmation + internal notification emails | book route sends both via Gmail API as the env-account user (`lib/google/gmail.ts`, `lib/email/templates/`) | SHIPPED | Sends from the single env Google account (implicitly remi@ambitionangels.org); Resend not used for meet emails. Failures logged, never roll back the booking |
| Attendee self-manage page (`/meet/booked/[token]`) | `app/meet/booked/[token]/page.tsx` + `manage-booking.tsx`; GET `/api/meet/booking/[token]` | SHIPPED | Token = `cancel_token`; page noindex |
| Cancel by token | `app/api/meet/booking/[token]/cancel/route.ts`: Google event delete, status→cancelled, cancellation email | SHIPPED | |
| Reschedule by token | `app/api/meet/booking/[token]/reschedule/route.ts` | PARTIAL | New end time computed from `meeting_type.duration_minutes`, not the originally booked duration — a non-default `duration_options` booking silently reverts to the default length on reschedule |
| ICS download | `app/api/meet/booking/[token]/ics/route.ts` + `lib/meet/ics.ts` | SHIPPED | Always emits STATUS:CONFIRMED even for cancelled bookings (documented choice) |
| Reminder emails (24h + 1h) | `app/api/cron/meet-reminders/route.ts`, hourly (`0 * * * *`), per-type sent flags, Bearer `CRON_SECRET` | SHIPPED | Gmail send from env account |
| Meeting types API (public) | `app/api/meet/types/route.ts` GET active types, 60s revalidate | SHIPPED | |
| Admin Meetings section gating | `app/admin/meetings/layout.tsx` `FeatureGate feature="modules.meetings"`; sidebar item | SHIPPED | Direct-URL hits covered by the gate |
| Meetings Overview (`/admin/meetings`) | `app/admin/meetings/page.tsx`: past `meeting_records` grouped by follow-up status, coverage banner, upcoming list merging `calendar_events` + `/meet` bookings, booked chip + inline cancel | SHIPPED | Requires calendar sync to have populated `calendar_events` |
| "Sync from calendar" (meeting records backfill) | `SyncMeetingsButton` → POST `/api/admin/meetings/sync` → `ensureMeetingRecordsForOwner` (`lib/meetings/match.ts`): creates `meeting_records` from past external `calendar_events`, matches attendees to constituents/partners, fans out to `interactions`/`partner_interactions` | SHIPPED | Manual button, idempotent; depends on the viewer having a connected Google Calendar |
| Attendee→donor/partner auto-matching | `lib/meetings/match.ts` (constituent email overlap; partner contact email / champion_email / domain) | SHIPPED | Staff-domain classification falls back to hardcoded `ambitionangels.org` |
| Meeting record detail (`/admin/meetings/[id]`) | `page.tsx` + `MeetingDetailClient.tsx`: follow-up status buttons, transcript paste, suggestion accept/dismiss, manual connect typeahead | SHIPPED | |
| Follow-up status + recurring-series exclusion | PATCH `/api/admin/meetings/[id]` with `apply_to_series` → `meeting_exclusions` | SHIPPED | |
| Transcript → AI summary + suggested follow-ups | POST `/api/admin/meetings/[id]/transcript` → `lib/meetings/reed.ts` (Anthropic API, `claude-sonnet-4-6`, `ANTHROPIC_API_KEY`); writes summary, stages 1–3 rows in `meeting_suggested_tasks` | SHIPPED | Paste-only textarea — no file upload despite "transcript upload" phrasing. Raw transcript persisted only when `store_transcript` opt-in checked |
| Accept/dismiss suggested tasks | POST `/api/admin/meetings/[id]/suggestions`: accept inserts real `ops_tasks` row and flips record to `has_follow_up` | SHIPPED | Human gate is real — Reed never creates live tasks |
| Manually connect meeting to donor/partner | GET/POST `/api/admin/meetings/[id]/connect` | SHIPPED | |
| Upcoming meeting brief (`/admin/meetings/upcoming/[eventId]`) | `page.tsx` + `lib/meetings/read.ts`, `lib/meetings/dossier.ts`: donor/partner dossiers inline, first-meeting/prior-touch badges | SHIPPED | RLS-scoped; viewers without fundraising read get fewer dossiers |
| "Prep with Reed" agenda generation + persistence | `MeetingAgendaButton` opens Reed launcher; agenda read back from `reed_threads`/`reed_messages` | SHIPPED | Self-gates on `ai.reed`. "Persisted agenda" is just the last assistant message of the Reed thread — no dedicated store |
| Connections page (`/admin/meetings/connections`) | `page.tsx`: pending `connection_candidates` queue, manual NewConnectionForm, scheduling-task backlog | SHIPPED | |
| Email-detected intro candidates | Written by `lib/fundraising/gmail-sync.ts` (hourly cron, env-account Gmail); disposed via PATCH `/api/admin/meet/connection-candidates/[id]` | SHIPPED | Candidates only exist for the env-connected mailbox (single-tenant residue) |
| Mark connection booked | `MarkBooked.tsx` → `/api/admin/meet/connections/[id]/bookings` + `.../book` | SHIPPED | |
| Booking-page settings (`/admin/meetings/booking-page`) | `page.tsx` + `BookingPageSettings.tsx` | SHIPPED | Tab reachable; `/admin/meet` is a redirect stub to it |
| Meeting type CRUD | Only PATCH `/api/admin/meet/types/[id]` exists; UI edits name/description/prep notes/color/duration/buffer/notice/advance/active/location options/address | PARTIAL | No create or delete anywhere (UI or API) — types are seeded via SQL (`supabase/seed_meeting_types.sql`). `available_days`, `available_start_time/end_time`, `daily_limit`, `duration_options`, `slug` are not editable via any interface |
| Blackout CRUD | POST `/api/admin/meet/blackouts`, DELETE `[id]`; UI create + delete | SHIPPED | No edit (delete+recreate) |
| Booking history | `BookingHistory.tsx` (past/cancelled bookings) | READ ONLY | Display only |
| Admin cancel booking | `CancelBookingButton` → POST `/api/admin/meet/bookings/[id]/cancel` (Google delete, DB update, optional attendee email) | SHIPPED | No admin-side reschedule — only the attendee's token link can reschedule |
| Per-user Google Calendar OAuth connect | `/api/admin/agenda/connect-google/*`; picker UI in `app/admin/settings/_components/AccountControls.tsx`; encrypted refresh tokens (AES-256-GCM, `BLOOMOS_TOKEN_ENC_KEY`) in `connections` | SHIPPED | Any org member can connect their own account. No UI/API to disconnect an ACTIVE calendar connection (only the pending staged account can be discarded) |
| Calendar → `calendar_events` mirror sync | `lib/agenda/calendar-sync.ts`; cron `/api/cron/calendar-sync` every 15 min, on-demand POST `/api/admin/agenda/sync`, plus webhook; incremental via syncToken; run log in `calendar_sync_jobs` | SHIPPED | Per-user connections (not the env token). `is_external` computed against org email domain with `ambitionangels.org` fallback |
| Task time-blocks written to Google (agenda two-way) | `lib/agenda/task-blocks.ts` via `/api/admin/agenda/blocks` POST/PATCH/DELETE; sync flows Google-side moves/deletes back to `ops_tasks.planned_day` | SHIPPED | Writes to the user's own connected calendar; 409 "Connect a Google Calendar first" without one |
| Google push notifications (webhook) | `app/api/google/calendar-webhook/route.ts`; channels started/renewed by daily cron `/api/cron/calendar-watch-renew` → `lib/google/watch.ts` | PARTIAL | Inert unless `APP_ORIGIN` is configured — otherwise the 15-min poll is the only path. Whether channels are live in prod is a deployment question |
| Agenda delegation (see someone else's calendar) | `agenda_delegations` read in `lib/agenda/service.ts:getVisibleOwners` + RLS; seed row Remi→Shannon | READ ONLY | Honored on the read path, but no UI or API to create/revoke a delegation — SQL only |
| Unified agenda read (calendar + bookings) | `lib/agenda/service.ts:getAgenda`; feeds cockpit Today, rail, ops views | SHIPPED | Org TZ hardcoded LA |
| CEO cockpit Schedule widget | `lib/google/calendar.ts:listUpcomingEvents` (env account) | SHIPPED | Reads the single env-account calendar, not per-user connections |
| `webhook_events` for calendar | table exists | SCHEMA ONLY (this domain) | Only the HubSpot webhook writes to it; the Google calendar webhook does not log/dedupe there |

## HONEST NOTES

- **Two parallel Google auth models.** The public `/meet` pipeline (freebusy, event create/patch/delete, all emails) runs entirely on the single env-configured OAuth account (`GOOGLE_CLIENT_ID/SECRET` + `GOOGLE_REFRESH_TOKEN` — i.e. remi@ambitionangels.org). The Agenda/meeting-records system uses per-user encrypted OAuth connections in `connections`. `lib/meet/host.ts` is explicit: only the resident org can take public bookings; other tenants' `/meet` returns 503.
- **Single-tenant residue:** `HOST_TIMEZONE`/`ORG_TZ` hardcoded `America/Los_Angeles`; staff-domain fallback `ambitionangels.org`; `MEET_HOST_EMAIL` fallback remi@; public `/meet` copy/title/photo hardcoded to Remi; one static `ZOOM_URL`/`ZOOM_PASSCODE` shared by every video booking; delegation seed Remi→Shannon.
- **Meeting types cannot be created, deleted, or fully edited in-app.** Availability window, `duration_options`, and `slug` have no interface at all — changing office hours requires SQL.
- **Reschedule duration bug:** token reschedule recomputes end time from the type's default `duration_minutes`, ignoring a non-default `duration_options` choice.
- **No admin reschedule** of bookings (cancel only).
- **No video-conference provisioning:** no Google Meet conferenceData, no per-meeting Zoom links — one static URL. No non-Google calendar providers.
- **Push webhooks wired but conditionally inert** without `APP_ORIGIN`; the 15-minute poll is the real sync.
- **Delegation is SQL-only to administer.**
- **No active-calendar disconnect** once a per-user connection is active.
- **Transcript "upload" is paste-only** (textarea); raw transcript stored only on explicit opt-in.
- **Rate limiting on public booking is in-memory per serverless instance** — deterrent only, acknowledged in code.
- **Data entry/exit:** bookings enter via public form only; meeting records enter via calendar sync (no manual "log a meeting" form); connection candidates enter only via the env-account Gmail sync. Exit: attendee ICS, Google calendar invites, email; no CSV/export of bookings or meeting records.
- **AI boundaries enforced as documented:** Reed only stages suggestions and drafts agendas in threads; every task creation is a human click.
- **Crons verified in `vercel.json`:** meet-reminders hourly, calendar-sync every 15 min, calendar-watch-renew daily, gmail-sync hourly at :45. All Bearer `CRON_SECRET`.

# Staff + Reviews, Strategic Plan (OGSM), Metrics/KPIs — capability inventory

| Capability | Evidence | Status | Note |
|---|---|---|---|
| Staff org chart (directory view) | `app/admin/staff/page.tsx` + `_lib/read.ts` `getStaffTree()`; sidebar "Staff" (`modules.staff`) | SHIPPED | Session-client only, RLS `staff.read`; tree assembled with cycle/depth guard; orphan + pending-invite "ghost" nodes rendered |
| Add/remove a staff member | No POST route under `app/api/admin/staff/`; only SQL seeds insert (`bloomos_staff_phase1.sql`); page comment: "adding a person is a data op, no code change" | SCHEMA ONLY (create/delete) | People can only be added by direct DB insert. In-app you can set status active/inactive (soft hide) via PATCH — never truly delete |
| Edit staff HR fields (name, title, dept, manager, type, status, start date) | `app/api/admin/staff/[id]/route.ts` PATCH; `StaffEditForm.tsx` | SHIPPED | `staff.write`; DB trigger rejects cross-org/cyclic `reports_to`; audited |
| Org chart drag-to-reparent / sibling reorder | `StaffChart.tsx` (Arrange mode), `app/api/admin/staff/reorder/route.ts` | SHIPPED | `staff.write` holders only |
| Staff photo upload | `app/api/admin/staff/[id]/photo/route.ts` + `PhotoControl.tsx` | SHIPPED | Private `staff-photos` bucket; 5MB; 5-min signed URLs; self or `staff.write` |
| Module rename ("Staff" → "Team") | `StaffHeaderActions.tsx` → `app/api/admin/staff/terminology/route.ts` (upserts `org_terminology`) | SHIPPED | `staff.manage`; empty label reverts to default |
| Personal goals CRUD | `app/api/admin/staff/[id]/goals/*`; `DevelopmentSections.tsx` | SHIPPED | Self, manager-above, or `staff.manage`; optional link to a `plan_goals` row |
| Goal approval flow (draft→proposed→approved) | `goals/[goalId]/route.ts`; DB trigger blocks self-approve (403) | SHIPPED | Approval is a human click; DB-enforced no-self-approve |
| Personal KPIs — manual, with dated snapshots | `kpis/route.ts`, `kpis/[kpiId]/route.ts`, `kpis/[kpiId]/snapshot/route.ts` (`staff_kpi_snapshots`) | SHIPPED | Status derived from value vs target |
| Personal auto-KPIs from live org data | `lib/admin/staff/metrics.ts` `STAFF_METRIC_META` (7 keys: cash_runway_months, dollars_raised_fy26, weighted_pipeline_fy26, corporate_raised, grants_submitted_ytd, donor_updates_sent_ytd, active_teens); refresh at `kpis/refresh/route.ts` | PARTIAL | All 7 resolvers work; refresh is manual-button-only — staff KPIs are NOT in the daily cron, so trends only grow when someone clicks Refresh |
| 360 review cycle creation/config | `/admin/staff/reviews` + `ReviewsAdminClient.tsx` → `staff/reviews` routes (status draft/collecting/synthesizing/shared/closed; anonymity modes; min-raters; dates) | SHIPPED | `staff.manage` only |
| Rater assignment generation from org chart | `[cycleId]/generate/route.ts` (self + manager + reports + peers; idempotent) | SHIPPED | Small-team "thin group" anonymity warning |
| Rater feedback forms (fill/submit) | `RaterFormsClient.tsx` → `reviews/feedback/[feedbackId]/route.ts` | SHIPPED | RLS: rater edits own form only |
| Anonymity enforcement | View `v_review_feedback_visible` + `private.subject_may_see_feedback` enforce `min_raters_for_anonymity` in DB (`bloomos_staff_phase3.sql`) | SHIPPED | DB-level. Caveat: `staff.manage` holders (CEO) see all raw feedback incl. their own upward |
| Review synthesis (shared summary + private manager notes) | `reviews/[cycleId]/summary/[subjectId]/route.ts` PUT; `review_summaries` / `review_manager_notes`; subject reads summary only after `shared_at` | SHIPPED | Human-written by a manager. **No AI anywhere in reviews** — no Anthropic import in the staff module; "AI-generated summaries" do not exist |
| Review competencies | `review_competencies` seeded 5 defaults per migration; read in `_lib/reviews.ts` | READ ONLY | No route or UI to create/edit/deactivate competencies — data op only |
| `modules.reviews` gate | Defined in `lib/admin/entitlements.ts` ("default off"), seeded | SCHEMA ONLY (as a gate) | Never referenced by any layout, page, or route — reviews ship to anyone with `modules.staff`; the flag is dead code today |
| OGSM plan page (Org/Area/Mine lenses) | `app/admin/strategic-plan/page.tsx`; sidebar "Strategy" (`modules.strategy` gate) | SHIPPED | URL-synced lens + filters; reads need membership only, writes need org.manage |
| Foundation (mission/vision/values/behaviors/proof points) | `app/api/admin/plan/foundation/route.ts` PUT; `FoundationPanel` | SHIPPED | `org.manage` |
| Objectives / Goals / KPIs / Initiatives CRUD | `app/api/admin/plan/{objectives,goals,kpis,initiatives}` + `[id]`; `PlanControls.tsx` (incl. goal re-parent) | SHIPPED | All 15 plan route files re-assert `ctxHasPermission(ctx, "org.manage")` before service-role writes (verified — 21 call sites); parent ids cross-checked against caller's org |
| Scorecard status roll-ups + reasoned overrides | `deriveHealth` in `lib/admin/plan/health.ts`; `status_override` + reason in objective/goal PATCH | SHIPPED | Clearing override returns to computed roll-up |
| Auto KPI metric binding + refresh | `plan/kpis` accepts `metric_key`; picker via `plan/kpis/metrics`; refresh `plan/kpis/refresh` → writes current/status + `plan_kpi_snapshots` + mirrors `metric_snapshots` | SHIPPED | 10 auto metric_keys; everything else manual |
| Unassigned vital-signs tray | `UnassignedMetrics.tsx` → POST `plan/kpis` | SHIPPED | |
| KPI Scorecard page | `/admin/strategic-plan/scorecard`; in-place edits via `plan/kpis/[id]` PATCH (manual value → snapshot upsert) | SHIPPED | Owner-segmented cards, sparklines, paced status |
| Monthly OGSM review mode | `/admin/strategic-plan/review` + `ReviewComplete.tsx` → `plan/reviews` POST | SHIPPED | Cadence nudge via briefing/cockpit |
| Objective detail page + notes + tasks | `/admin/strategic-plan/objective/[id]`; `plan/objective-notes`, `plan/objective-tasks` routes | SHIPPED | Task work rollup initiative→ops_project→ops_tasks |
| Strategy Narrative (funder presentation) | `/admin/strategic-plan/narrative` + `lib/admin/strategy/narrative.ts`; presenter mode `?present=1` | SHIPPED (read-only by design) | Deterministic, no AI; actuals computed live from finance/CRM |
| Funder-readiness linter | `lib/admin/strategy/readiness.ts` + `ReadinessPanel` | SHIPPED (read-only) | Blocker/advisory checks; every check carries a `fixHref` |
| People / Performance Agreement page | `/admin/strategic-plan/people` | SHIPPED (read-only) | Owners are free-text tokens — no identity link to staff/users |
| Setup wizard + starter template | `/admin/strategic-plan/setup` + `SetupWizard.tsx`; `lib/admin/plan/template.ts` | SHIPPED | Deterministic, no AI (stated non-goal); schedules first review |
| Reed AI on strategy (review/design/start) | `ReedReviewButton/ReedDesignButton/ReedStartButton` — open Reed launcher, hidden when `ai.reed` off | PARTIAL | Reed produces INERT proposals in the Reed inbox; per in-code comment "nothing writes the plan (applying is Phase D)" — but note the Reed inbox accept route does apply plan proposals (see Reed module); the plan-page buttons themselves never write |
| Metric Catalog page | `/admin/kpis` (`modules.metrics` gate) — freshness badges, sparklines, filters | PARTIAL | **Not in the sidebar** — only reachable via a link in Ops Friday nudges or direct URL |
| Metric definition CRUD | `metric_definitions` created only by migrations/seed (`metrics_catalog_schema.sql`); no API route, no UI | SCHEMA ONLY | Name, target, owner, cadence, department, source_key all data-ops |
| Manual metric value entry | `MetricUpdateForm.tsx` → `app/api/admin/metrics/[id]/snapshot/route.ts`; session client (`metrics.write` RLS), same-day upsert, backdate-safe | SHIPPED | When metric backs a `plan_kpis` row, syncs plan current + snapshots |
| Computed metric resolvers | `lib/admin/metrics/resolvers.ts`: 12 total = 10 `PLAN_METRICS` + `monthly_burn` + `gifts_this_month` | SHIPPED | Single formula source shared with finance status line (pinned by `tests/metrics.test.ts`) |
| Daily cron snapshotting | `app/api/cron/metric-snapshots/route.ts`; `0 13 * * *`; Bearer `CRON_SECRET` | SHIPPED | Idempotent day-unique upserts |
| Metric staleness | `lib/admin/metrics/staleness.ts` (daily 2d / weekly 10d / monthly 40d / quarterly 100d), mirrored in SQL queue arm | SHIPPED | Derived at read time, never stored |

## HONEST NOTES

- **No AI in this entire scope.** Staff review summaries are human-typed by a manager; no Anthropic usage in staff, plan, or metrics code. The only AI adjacency is the three Reed launcher buttons on the plan page (`ai.reed`), and Reed's plan proposals are applied only through the Reed inbox accept endpoint.
- **You cannot add or remove a person in the app.** Staff rows are created only by SQL seed/direct DB insert (must link a real auth user). The UI edits, reparents, deactivates, and photographs existing rows. No offboarding flow beyond status=inactive.
- **`modules.reviews` is a dead flag**: declared default-off and seeded, but no layout/route checks it — 360 reviews are live for any tenant with `modules.staff`.
- **Review competencies and metric definitions are data-entry-by-migration**: no create/edit UI or API for `review_competencies` or `metric_definitions` (incl. targets/owners/cadence).
- **`/admin/kpis` (Metric Catalog) has no sidebar entry** — reachable only from an Ops Friday-nudge link or by URL.
- **Staff auto-KPIs never refresh automatically** — only the per-person Refresh button; the daily cron covers plan + catalog metrics but not `staff_kpis`.
- **Permission patterns differ by module (verified):** Staff routes use session client + RLS. Plan routes use the service-role client but re-assert `org.manage` in every route file and org-scope every query. Metric snapshot route: session client for the write.
- **Plan "people" page owners are free-text strings** ("Remi / Empathy Labs"), not user or staff ids — no enforcement, dedupe, or notification.
- **Manual steps:** monthly OGSM review is a human ritual; manual KPIs/metrics rely on someone typing values (staleness badges + Friday nudges are the enforcement, no email chasing); review-cycle stage transitions are manual dropdown clicks; no reminder emails to raters with unfinished 360 forms.
- **Env vars:** `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, standard Supabase keys. No ANTHROPIC key needed anywhere in scope.
- **Data entry/exit:** no CSV/export anywhere in scope (no export of plan, scorecard, reviews, or metric history); narrative "export" is presenting the live page.
- **Expected-but-missing (HR):** payroll, compensation, PTO/leave, e-signature, documents-per-employee, onboarding/offboarding checklists, review reminder emails, review PDF export, goal cascading (staff goal→plan goal link exists but nothing rolls staff goals up into the plan).
- **Known duplication/transition:** plan_kpis.current vs metric_snapshots dual-write is deliberate transition scaffolding; three metric metadata registries coexist (`PLAN_METRIC_META`, `AUTO_METRIC_CATALOG`, `STAFF_METRIC_META`) kept key-aligned by hand.

# Board, Compliance, Documents, Messages, and Platform Shell — capability inventory

| Capability | Evidence | Status | Note |
|---|---|---|---|
| **BOARD** | | | |
| Board roster list + stats (active count, board giving %, COI current, terms expiring 180d) | `app/admin/board/page.tsx` | SHIPPED | Gated by `modules.board` (`app/admin/board/layout.tsx` FeatureGate) |
| Add board member (name/email/role/term end) | `BoardControls.tsx` → POST `app/api/admin/board/members/route.ts` | SHIPPED | Exact email match auto-links `constituents` row so giving reads real gifts |
| Edit member (role, term end), mark past/reactivate, remove | MemberRow → PATCH/DELETE `board/members/[id]` | SHIPPED | Audited |
| COI tracking (one-click "Record COI", annual currency, 990 Part VI Q12 framing) | MemberRow patch → PATCH route stamps today | SHIPPED | Distinct audit action `board.member.coi_recorded` |
| Board giving status (gave this FY via linked constituent's gifts) | `board/page.tsx` gifts query | SHIPPED | Calendar-year, real `gifts` rows; unlinked members show "?" |
| Board meetings: create, agenda (normal + consent items), attendance toggles with quorum check, minutes draft → approve & freeze | MeetingCard/NewMeetingForm → `board/meetings/*` routes | SHIPPED | Approve makes minutes/agenda/attendance immutable and blocks DELETE. Meeting creation UX is a raw `prompt()` for the date; no UI to edit meeting title |
| Board member profile page (contact/bio/notes, onboarding checklist, attendance %, giving YTD/lifetime, tasks/documents/comments/history) | `app/admin/board/[id]/page.tsx` + `MemberProfileControls.tsx` | SHIPPED | Attendance derived only from meetings that recorded attendance |
| Board packet/minutes docs on latest meeting | `EntityDocuments entityType="board_meeting"` | SHIPPED | Docs linked to a board_meeting are the only docs a `board_viewer` can read (RLS carve-out) |
| board_viewer role experience | role exists, RLS carve-outs | UNVERIFIED | No dedicated board-portal UI found; to resolve: sign in as a board_viewer and record what renders (most module layouts gate on entitlement, not role) |
| **COMPLIANCE** | | | |
| Compliance calendar (Overdue / Next 60 days / Later / Filed-waived + stats) | `app/admin/compliance/page.tsx` | SHIPPED | Gated `modules.compliance`; feeds action queue via `v_action_items` |
| New item form (9 kinds, recur annual/quarterly/biennial/none, jurisdiction, assignee, notes) | `ComplianceControls.tsx` → POST `compliance/route.ts` | SHIPPED | |
| Mark filed → rolling due date (rolls +1 period; non-recurring becomes filed) | PATCH `compliance/[id]/route.ts` `rollForward()` | SHIPPED | Auto-inserts a `compliance_filings` history row |
| Filing history (permanent per-period record; backfill; edit confirmation #/fee/notes; delete) | `compliance/[id]/filings` routes, FilingsPanel | SHIPPED | |
| Item detail page (status actions, edit, notes + checklist, tasks/documents/comments/history) | `app/admin/compliance/[id]/page.tsx` | SHIPPED | |
| 501(c)(3) template seed | `create_compliance.sql` one-time seed | SHIPPED | Seed is migration data, not a UI action |
| Compliance/grant deadline reminder emails (T-14/7/1 + daily overdue) | `app/api/cron/daily-reminders/route.ts` (14:00 UTC, `CRON_SECRET`) via Resend | PARTIAL | Cron queries `compliance_items`/`grant_requirements` with **no org filter** and mails `org_email_allowlist` owner/admins (also unfiltered) — effectively single-tenant reminders |
| **DOCUMENTS** | | | |
| Documents hub (list, filters, stat cards) | `app/admin/documents/page.tsx` | SHIPPED | Gated `modules.documents`; session client so RLS is authority |
| Upload (25 MB cap, mime allowlist, title/type/expiry/restricted at upload) | `UploadDocumentButton.tsx` → POST `documents/route.ts`; private bucket `bloomos-documents` | SHIPPED | Requires `documents.write`; failed row insert rolls back the storage object |
| Attach documents to records (upload with auto-link from any record page; list; open; unlink) | `EntityDocuments.tsx` on board/compliance/donor/prospect/student pages; `documents/[id]/links` routes | SHIPPED | No UI to link an *existing* hub doc to an additional record (POST /links exists, API-only) |
| Signed-URL access (5-min TTL, minted per request after RLS read) | GET `documents/[id]/url/route.ts` | SHIPPED | |
| Archive/unarchive, delete (row + links + object) | `DocumentActions.tsx` → PATCH/DELETE `documents/[id]` | SHIPPED | |
| Metadata edit after upload (title, doc_type, expires_at, visibility) | PATCH `documents/[id]/route.ts` | PARTIAL | API complete; **no edit UI** — hub actions are only Archive/Delete |
| Document versioning | `version` column, `superseded` status filtered | SCHEMA ONLY | No supersede/new-version endpoint or UI anywhere |
| Expiring-documents view (60-day window) | `lib/documents/config.ts`, hub "Expiring soon" tab | SHIPPED | |
| Ask files (fundraising attachments) surfaced in hub | `documents/page.tsx` askDocs section | READ ONLY | Managed on their asks |
| **MESSAGES** | | | |
| Team chat: DMs (deduped per pair) + groups (optional title) | `app/admin/messages` + `lib/messaging/threads.ts` | SHIPPED | Gated `modules.messages`; recipients validated against org memberships |
| Send / edit own / soft-delete own messages (tombstone), 4000-char cap | `MessagesView.tsx` + messages routes | SHIPPED | |
| Emoji reactions (6 quick emojis, toggle) | `reactions/route.ts` | SHIPPED | |
| Read state + receipts, unread pills, sidebar/mobile badges | `[threadId]/read`, `unread-count`, `AdminBadges.tsx` | SHIPPED | |
| Realtime delivery | org-scoped `postgres_changes` channel; `messaging_realtime.sql`; polling fallback | SHIPPED | Needs Supabase Realtime enabled |
| Chat → Inbox pointer (one standing unread notification per thread per recipient) | `fanOutInbox` in `threads.ts` | SHIPPED | |
| Attachments, adding members to existing group, leaving/renaming a thread | — | SCHEMA ONLY / missing | No API or UI for any of these |
| **NOTIFICATIONS / INBOX** | | | |
| Inbox feed (newest-first, unread dot, click-through, mark-one/all-read) | `app/admin/inbox/*`, `notifications/*` routes | SHIPPED | RLS scopes to recipient; always in nav |
| Single notify() write path (mentions, message pointers, research events, task assignment) | `lib/notifications/notify.ts` | SHIPPED | |
| Notification emails | `EMAIL_TYPES = {research.completed, research.failed}` only, via Resend | PARTIAL | Only research events email; mentions/messages are in-app only; no digest, no per-type preference UI |
| **COMMENTS** | | | |
| Record-anchored comments (post, one-level reply, soft-delete own) on constituent, prospect, board_member, compliance_item, student | `CommentThread.tsx` + `comments/*` routes | SHIPPED | Entity-type allowlist server-side; no comment editing |
| @mentions (autocomplete from org members, server-side resolution, mention notification) | `MentionTextarea.tsx`, `lib/comments/mentions.ts` | SHIPPED | Members without a display_name are not mentionable (documented gap) |
| **SEARCH** | | | |
| Global search overlay (Cmd/Ctrl-K) across constituents, prospects, grants, commitments, tasks, projects, partners, students, cohorts, meeting bookings + page/action matches | `search/GlobalSearch.tsx`, `app/api/admin/search/route.ts` | SHIPPED | Live ilike queries (no separate index); trigram fuzzy people search via `bloomos_search_people` RPC; opt-in `notes=1` searches interactions |
| 360° profile card (constituent fan-out: gifts, grants, recurring, tasks, relationships, household, interactions, meetings) | `search/profile/route.ts` + `EntityProfile.tsx` | SHIPPED | |
| **PLATFORM SHELL** | | | |
| Login: password + magic link + forgot-password reset link | `LoginScreen.tsx`, `login/route.ts`, `account/password/reset-link` | SHIPPED | Supabase Auth; failed logins audited; session-without-membership rejected |
| Logout / sign out of all devices | `logout/route.ts`, `account/signout-all/route.ts` | SHIPPED | |
| Change password + `/admin/reset-password` recovery page | `account/password/route.ts`, `reset-password/page.tsx` | SHIPPED | |
| Display-name profile | Settings DisplayNameForm → `account/profile` | SHIPPED | |
| Settings page (account, name, AI spend meter, Google Calendar connect, data sources, password, sessions) | `app/admin/settings/page.tsx` | SHIPPED | |
| Multi-org: active-org cookie, org switcher (renders with 2+ memberships), membership-validated switch | `OrgSwitcher.tsx`, `org/switch/route.ts`, `lib/admin/auth.ts` | SHIPPED | |
| Entitlement gating (module layouts, sidebar hiding, 401/402 route gate) | `lib/admin/entitlements.ts`, FeatureGate layouts | SHIPPED | Gating works; **no UI shows or edits an org's entitlements** — seeding is SQL |
| Terminology (per-tenant renames driving nav + program module) | `lib/admin/terminology.ts` | PARTIAL | Reader fully wired; the only editor UI is the Staff page "Rename". Other renames = SQL insert into `org_terminology` |
| Member management / invitations | `invitations` table; staff chart reads pending invites as "ghost" nodes | SCHEMA ONLY | **No UI/API to invite, create, role-change, or remove members.** Provisioning = Supabase dashboard or magic-link self-signup + `org_email_allowlist` trigger. Allowlist itself is SQL-managed |
| Org/tenant provisioning | `orgs` table; `lib/admin/orgs.ts` | SCHEMA ONLY | No create-org UI or API anywhere — operator SQL only |
| org_settings (e.g. default_steward) | `lib/fundraising/steward.ts` reads | SCHEMA ONLY | Seeded by migration; no writer UI/API |
| Custom field definitions (drive import mapping + participant forms) | `lib/admin/customFields.ts`, `custom_field_defs` | PARTIAL | Fully consumed (validation, import wizard, forms); adding a field is SQL only, no UI |
| CSV import wizard (upload → map → stage/validate with dedupe verdicts → budgeted re-entrant commit → done; resumable; past-runs list) | `app/admin/imports/*`, `imports/*` routes, `lib/admin/imports/engine.ts` | SHIPPED | Targets: students + constituents. Dedupe: fingerprint ledger (`external_refs`) + email match. 2,000 rows / 2 MB caps. Gated `modules.program` OR `modules.fundraising`; linked from Settings + Students page, not main nav |
| Import PII retention | commit route nulls `import_rows.raw` on completion | PARTIAL | Only `raw` is blanked; `normalized` (mapped PII) **stays in import_rows** |
| Second (legacy) fundraising import w/ gifts + per-year reconciliation | `/admin/fundraising/import` wizard → `import/constituents/route.ts` | SHIPPED | Separate flow; gift-level idempotency |
| QuickAdd (global + button: task with category/priority/assignee/due/project/pins) | `QuickAddButton/QuickAddModal.tsx` → `ops/tasks` API | SHIPPED | |
| Rail quick-capture (task auto-filed against viewed entity) | `rail/CaptureBox` → `rail/capture/route.ts` | SHIPPED | |
| Action queue drilldown (30/60/90-day windows, one-click complete) | `app/admin/queue/page.tsx` | SHIPPED | (Nav-orphaned — see Ops module) |
| Command Center (greeting + CEO cockpit) | `CommandCenter.tsx`, `overview/CeoCockpit` | SHIPPED | |
| In-app issue reporter ("Report" FAB: bug/confusing/idea + photo → private bucket, task in "BloomOS Upgrades" project, email both operators; AI interview synthesizing a debug prompt) | `ReportModal.tsx`, `report/route.ts`, `report/debug/route.ts` (`claude-sonnet-4-6`, `ANTHROPIC_API_KEY`) | SHIPPED | |
| Audit log | `lib/audit.ts` — written by essentially every admin write route (before/after, IP, UA, request id), plus auth events | SHIPPED (write) / PARTIAL (read) | Only viewer is the per-record `EntityHistory` panel; **no global audit-log browsing UI** |
| How-to guide | `app/admin/howto/page.tsx` (static) | SHIPPED | |
| data-age API (spine freshness) | `data-age/route.ts` → `lib/admin/dataAge.ts` | SHIPPED (AA only) | Gated `aa.hubspot_mirror` |
| ai-spend API (MTD per-surface AI cost from `ai_calls`) | `ai-spend/route.ts`, Settings card | SHIPPED | Read-only ledger view; cap from env |
| Quiz stats/submissions APIs (career-quiz analytics) | `stats/route.ts`, `submissions/route.ts` | SHIPPED | Legacy AA surface: service-role read of `quiz_submissions` with **no org fence and no aa.* entitlement gate** — any authed tenant member could call it |
| PWA shell, mobile tab bar, host guard (app.bloomos.org serves only /admin), middleware auth gate | `AdminPWA.tsx`, `MobileTabBar.tsx`, `middleware.ts` | SHIPPED | Middleware is coarse gate; real enforcement in routes + RLS |

## HONEST NOTES

**Manual/SQL-only operator steps (matters for selling):**
- Tenant provisioning end-to-end is operator SQL: create `orgs` row, seed `org_entitlements`, `org_email_allowlist`, roles, optional `org_terminology`/`custom_field_defs`/`org_settings`. Zero UI for any of it.
- User onboarding: no invite UI. Users are added in the Supabase dashboard or self-signup via magic link; membership auto-granted only if their email/domain is in `org_email_allowlist` (SQL). The `invitations` table exists and is read but nothing in the app creates invitation rows.
- No role management, no member removal, no entitlement viewing/toggling in-app.
- Custom fields, terminology (beyond the Staff rename), org settings: SQL inserts.

**Half-built / stubbed:**
- Document versioning: `version` column + `superseded` status are dead schema.
- Document metadata edit and existing-doc linking: API-only, no UI.
- Import PII nulling incomplete: `raw` blanked but `normalized` (mapped PII) persists in `import_rows`.
- Notification email fan-out limited to two research event types; no digests, no preferences.
- Daily reminder cron not multi-tenant (unfiltered queries + allowlist recipients).
- Inbox `LINK_MAP` resolver covers only constituent/prospect for rows without an explicit url.
- Board meeting creation via `window.prompt()`; meeting titles not editable in UI.
- board_viewer role: schema/RLS support, no verified board-facing UI path.

**Integrations + env vars:**
- Supabase (`NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`); Storage buckets `bloomos-documents`, `bloomos-reports`, `staff-photos`, `bloomos-asks`; Realtime publication for messaging.
- Resend (`RESEND_API_KEY`) for notification/reminder emails, hardcoded from-address `BloomOS · Ambition Angels <careers@mail.ambitionangels.org>` — a tenant's email would come "from Ambition Angels."
- `CRON_SECRET`, `ANTHROPIC_API_KEY` (report/debug interview), Google OAuth (calendar connect), HubSpot (AA-only sync panel), `RESIDENT_ORG_SLUG` (defaults `ambition-angels`).

**Data entry/exit:**
- In: two CSV import doors, HubSpot sync (AA-entitled only), manual forms everywhere. Out: **no export anywhere in this scope** — no CSV export of board, compliance, filings, audit log, documents metadata, or messages.

**Expected-but-missing:**
- Global audit-log viewer/exporter (writes are thorough; no disclosure-report UI).
- Message attachments, group membership editing, thread mute/leave.
- Comment editing.
- Notification email digests/preferences.
- Any billing/plan surface (entitlements comment: "plan → entitlement mapping is billing's job (later)").
- Quiz `stats`/`submissions` endpoints lack the org fence the rest of the codebase is rigorous about — a cross-tenant read risk of AA quiz data.

# Reed (AI assistant), AA-only surfaces, MS career game, donations & public forms — capability inventory

## Reed

| Capability | Evidence | Status | Note |
|---|---|---|---|
| Reed chat ("Ask") — orchestrator | `app/api/reed/ask/route.ts` POST: `requireEntitlement("ai.reed")` (402 if not held) → per-org Reed cap → global AI cap → tool-use loop → persist | SHIPPED | Model `claude-sonnet-4-6` (`lib/agents/reed/cost.ts`); needs `ANTHROPIC_API_KEY`; max 6 tool turns, 1024 output tokens |
| Reed UI entry points | `app/admin/layout.tsx` mounts `ReedLauncherProvider` + `AskReedButton` only when org holds `ai.reed`; FAB mobile-only, xl+ uses the right rail | SHIPPED | Layout gate is cosmetic; server entitlement check on /api/reed/ask is the real boundary |
| Cost caps | `reed_activity_log` MTD sum vs $25/mo cap, warn at $18; org-wide backstop $100/mo default via `lib/ai/cap.ts` (`ORG_MONTHLY_AI_CAP_USD`, fail-open) reading `ai_calls` | SHIPPED | Backstop deliberately fail-open |
| Read tools (13) — permission-gated | `lib/agents/reed/tools.ts`: finance snapshot, fundraising forecast, grant deadlines, meeting brief, constituent dossier, partner dossier, needs-you queue, status/outlook, metric audit/explain, list/read documents, org foundation/strategy plan/coherence — each mapped to a module.read permission | SHIPPED | All run on the RLS session client; denial returns `permission_denied`. read_document wraps content as `<untrusted_document>` (tag-forgery sanitized), PDF ≤8MB / text ≤300KB |
| Write tools — all inert | `save_draft` → `reed_drafts`; `propose_next_best_action` + `propose_document_extraction` → `reed_suggestions`; `propose_plan_element` → `reed_plan_proposals` | SHIPPED | Reed can never send/submit/move money/delete; every write is a proposal row |
| Human decision layer (Reed inbox) | `app/admin/reed/page.tsx` + `ReedInbox.tsx` → POST `/api/reed/drafts/[id]` (approve marks "approved", DOES NOT send), `/api/reed/proposals/[id]` (accept APPLIES an OGSM element into plan_* behind org.manage), `/api/reed/suggestions/[id]` (accept applies typed extraction: documents field update or ops_tasks insert) | SHIPPED | /admin/reed not in sidebar — reached via link inside the Reed drawer; also replays all Q&A threads |
| Activity log / AI ledger | Every ask logged to `reed_activity_log` (tokens, cost, tool_calls); mirrored to `ai_calls` via `logAICall` | SHIPPED | Two ledgers on purpose |
| Context modes | Meeting-prep mode, strategy/OGSM facilitation, audit mode, coaching offer when org holds `coaching` entitlement | SHIPPED | Prompt-injection defense baked into system prompt |

## AA-only admin surfaces

All five route groups are wrapped by `FeatureGate` in their `layout.tsx`: analytics→`aa.site_analytics`, legacy+careers→`aa.quiz`, demoday→`aa.demoday`, ygb→`aa.ygb`. Single-tenant by design — keys seeded only for the resident org.

| Capability | Evidence | Status | Note |
|---|---|---|---|
| Site analytics dashboard | `/admin/analytics` → GET `/api/admin/analytics` (isAuthed only; service-role read of `page_views` + `click_events`, 20k rows each) | READ ONLY | DDL for page_views/click_events NOT in repo migrations — created out-of-band; API route checks isAuthed but NOT the aa.site_analytics entitlement (page layout does) |
| Public pageview/event writers | `/api/analytics/pageview` + `/api/analytics/event`: unauthenticated service-role inserts, silent-fail, refuse `/admin` + `/api` pages | SHIPPED | No rate limit on these two endpoints |
| Legacy dashboard (quiz + donations) | `/admin/legacy` client page reading quiz_submissions + donations stats | READ ONLY | Not in sidebar — linked only from the overview "Recent Donations" widget |
| Public career quiz | `components/CareerQuizModal.tsx` (on `/` and `/curriculum`) → `/api/career-match` (Claude `claude-sonnet-4-6`, IP rate-limited 10/10min, returns 10 careers) then `/api/quiz-submit` (insert `quiz_submissions` + Resend results email + notify remi@) | SHIPPED | quiz-submit has NO rate limit and no auth; sender `careers@mail.ambitionangels.org` |
| Career Library (card pipeline) | `/admin/careers` → queue (`/api/admin/careers/queue` inserts draft ms_cards), generate (`/api/admin/careers/generate`, `claude-opus-4-8`, writes DRAFT only, one auto-regen on gate failure, refuses to overwrite approved), inline edit (`/api/admin/careers/card` PATCH, drafts only, re-runs gates; clues 6–7 rendered from data, not editable), review (`/api/admin/careers/review` approve/unapprove/retire/delete) | SHIPPED | Approval is structurally human-only (DB constraint `ms_cards_approved_requires_review`); AI writes drafts only. `scripts/import-onet.ts` (manual CLI) populates ms_occupations |
| Demo Day | `/admin/demoday`: Tracker (static roster `lib/demoday/attendees.ts` + notes/star/status upsert via `/api/admin/demoday/notes`) + Signups (GET `/api/admin/demoday/signups`). Public: `/api/demoday/signup` (rate-limited, Resend notify), `/api/demoday/login` (shared `DEMODAY_PASSWORD` → cookie for /demoday lookbook) | SHIPPED | Attendee roster is hardcoded in code; admin routes tolerate missing tables |
| YGB Camp | `/admin/ygb`: registrations list (GET `/api/admin/ygb/registrations`) + per-day attendance check-in (GET/POST `/api/admin/ygb/attendance`, audited). Public: `/api/ygb/register` (rate-limited 8/hr, capacity 20 → waitlist server-side, ≤4 campers/family, Resend confirmation), `/api/ygb/showcase-rsvp` (updates registration by parent_email ilike — no auth beyond knowing the email) | SHIPPED | |

## MS career game (public)

| Capability | Evidence | Status | Note |
|---|---|---|---|
| Solo flow: assess → results | `/ms` → `/ms/assess` → POST `/api/ms/session`: `answersToTraits` → `traitsToRiasec` → `rankCareers` (`lib/ms/instrument.ts`, `riasec.ts`, `score.ts` — pure functions, zero model imports) over approved `ms_cards` join `ms_occupations`; inserts `ms_sessions` with claim_code | SHIPPED | Deterministic-matching claim VERIFIED: no LLM anywhere in the scoring path; payload is 30 integers, no free-text field (COPPA structural) |
| AI results summary | `generateSummary` (`lib/ms/summary.ts`): `claude-sonnet-4-6`, input = 6 trait sums + ≤3 titles only, strengths-only prompt, regex post-check, returns null on any failure | SHIPPED | Fails soft — results render without it |
| Card play + reveal | `/ms/card/[session]/[soc]` server-renders vignette + clues 1–7 only (title & clue_8 never in payload); POST `/api/ms/reveal` stages clue_8 or answer — answer returns title AND upserts `ms_explored` with server-clamped clues_used | SHIPPED | Only approved cards resolve |
| Permanent deck | `/ms/deck` code entry → `/ms/deck/[code]` (no login, claim code only) | SHIPPED | |
| Adult email handoff | `SendToAdult` → POST `/api/ms/deliver`: rate-limited 5/10min, validates claim code, sends deck email via Resend, logs `ms_deliveries` | SHIPPED | The single email field in /ms, framed as adult-only; requires `RESEND_API_KEY` |
| Group mode | `/ms/host` → POST `/api/ms/room`; students join with 4-char room code (random handle, never a typed name); `/ms/room/[room]` wall polls GET (handles only); host-token-gated `assign` (tables of 4, career dedup) and `deliver` (one Resend email to host with every deck + claim codes + AI facilitator prompts — fails soft) | SHIPPED | Wall never learns any career; host_token is the only host auth |
| Annual pay refresh | `supabase/functions/ms-refresh-oews` edge function: manual POST with bls.gov URL + vintage; plus `scripts/import-onet.ts` CLI | PARTIAL | Manual once-a-year operations — never invoked by any product surface (by design) |

## Donations & public forms

| Capability | Evidence | Status | Note |
|---|---|---|---|
| Donate UI | `/donate` → `DonateButton` → `DonateModal` (card + Apple/Google Pay one-time; card recurring) | SHIPPED | Headline stats hardcoded |
| Payment creation | POST `/api/create-payment-intent` (rate-limited 10/10min): one-time PaymentIntent, or recurring = Customer + Price + Subscription (`STRIPE_SECRET_KEY`) | SHIPPED | |
| Record + receipt (client-triggered) | On confirm success `DonateModal.finalize` fires `/api/save-donation` (insert `donations` stamped with resident org_id; Resend notify to remi@) and, if email given, `/api/send-receipt` (Resend 501(c)(3) receipt, EIN 87-2513010) | PARTIAL | Recording depends on the donor's browser completing `finalize` — a closed tab after charge means no donations row for the initial payment (webhook only records renewals); send-receipt is unauthenticated + un-rate-limited (anyone can make it email arbitrary receipts) |
| Stripe webhook | `/api/stripe-webhook` (signature-verified, `STRIPE_WEBHOOK_SECRET`): payment failures → status flags + notify; subscription-cycle invoice.payment_succeeded → insert donations renewal row; subscription.deleted → cancelled | SHIPPED | Handler errors return 200 (deliberate, no Stripe retry storm) |
| Fundraising-ledger ingestion | DB trigger `donations_fr_ingest` (`create_fundraising_core.sql`): every donations insert upserts a `constituents` row by email, upserts `recurring_plans` for subscriptions, inserts a `gifts` row keyed on stripe_payment_id (idempotent), sets acknowledgment_status pending when ≥$250 | SHIPPED | The app code never writes gifts/constituents for donations — Postgres does |
| Guide waitlist | `/for-adults` form → `/api/partner-waitlist`: insert `partner_waitlist` + Resend confirmation + notify remi@ | SHIPPED | No rate limit on this route |
| Program partner signup | `/program-partners` → `/api/program-partner-signup`: inserts into `partners` spine (status prospect, resident org stamped) + Resend confirmation + notify remi@ | SHIPPED | No rate limit; the confirmation email promises a dashboard that does not exist (see marketing-claims section) |

## HONEST NOTES

- **AI autonomy boundaries (verified, not just claimed):** Reed's only autonomous writes are inert rows (reed_drafts/reed_suggestions/reed_plan_proposals); every state change to real data happens only in the human accept endpoints, permission-checked at click time. Draft "approve" changes a status string only — nothing sends an approved draft anywhere; sending is a manual copy-paste step. MS card generation writes drafts only; approve is a human click backed by a DB constraint; the two live model calls in /ms both fail soft.
- **Models/env:** Reed ask + career quiz + MS summary + room prompts = `claude-sonnet-4-6` ("fast" tier); MS card generation = `claude-opus-4-8` ("deep" tier) via `lib/ai/gateway.ts`. Env: `ANTHROPIC_API_KEY` (all AI), `RESEND_API_KEY` (every outbound email, all from `careers@mail.ambitionangels.org`), Stripe three keys, `ORG_MONTHLY_AI_CAP_USD`, `DEMODAY_PASSWORD`, `DEMODAY_NOTIFY_EMAIL`, `YGB_NOTIFY_EMAIL`.
- **Half-built / gaps:** page_views/click_events tables have no DDL in the repo. `/api/admin/analytics` and `/api/admin/donations` gate on isAuthed only, not the aa.* entitlement (the page layouts do). `/admin/legacy` is orphaned from nav. Demoday attendee roster hardcoded in code. Initial-donation recording is client-fired (browser-dependent). `/api/send-receipt`, `/api/quiz-submit`, `/api/partner-waitlist`, `/api/program-partner-signup`, and both analytics writers have no rate limiting; the rate limiter itself is in-memory, per-instance (deterrent only).
- **Manual operations:** O*NET import and OEWS pay refresh are deliberate once-a-year manual runs; MS summary preview script is the pre-ship human review for the child-facing prompt.
- **Data entry/exit:** money enters via Stripe → donations → DB trigger → gifts/constituents/recurring_plans (single ingestion path, idempotent); public form data enters quiz_submissions, partner_waitlist, partners, demoday_signups, ygb_registrations, ms_*; data exits only as Resend emails — no other outbound integrations in these paths.

# Marketing claims vs implementation

## Claims with no working implementation found

| Claim | Where claimed | What was searched / why not found |
|---|---|---|
| "Sign up as a Program Partner… You get **immediate access to the Guide dashboard**" and "Every program gets a **unique code**… that's how they connect to your dashboard" | `app/program-partners/page.tsx:51,56` | The signup posts to `app/api/program-partner-signup/route.ts`, which only inserts a `partners` row with `status: "prospect"` and sends two Resend emails. Searched all of `app/`, `lib/`, `supabase/` for any guide dashboard, program-code generation, or partner-login provisioning — none exists. Nothing is granted, immediately or otherwise. |
| "You watch it happen **in real time from your dashboard**" / "Guide dashboard login included" / "Fill this out and you'll have access same day" | `app/program-partners/page.tsx:66,352,362` | Same as above. No dashboard route, no partner-facing auth, no student-progress data model anywhere in the repo. |
| Confirmation email: "will send your **program code and Guide dashboard login within 24 hours**… see what each student is working on in real time" | `app/api/program-partner-signup/route.ts:34,42–43` | The email is sent by code in this repo and promises artifacts no code in this repo produces. |
| Investor update: "The parent and mentor dashboard is **built and in use**: customized conversation guides, learning insights, and adult engagement tools… **rolling out to parents now**" | `app/update/page.tsx:132` | No adult/guide dashboard exists in this repo. Contradicted by the site's own copy: `/for-adults` sells it as a waitlist ("Be among the first to get access **when we launch**", `app/for-adults/page.tsx:427–431,569`) and the Koshland deck labels the adult tool "**Being built.**" (`app/update/koshland/Deck.tsx`). |
| "We give them the tools (career conversation prompts, learning insights, and **real-time visibility** into what their teen is exploring)" | `app/update/page.tsx:429` | No visibility/insights surface in repo; only three hardcoded prompt strings on `/for-adults`. |
| MESA pilot: "You and your MESA team **get the Guide dashboard**. See what every student is exploring, follow their progress…" (also listed as a deliverable) | `app/mesa/page.tsx:48,65`; `mesa-pages.md:76,92` | Same missing product. The MESA student signup form posts to the generic waitlist endpoint. |
| "Parents, coaches, teachers, and mentors **get their own portal**" (present tense) and "When a teen completes lessons, their trusted adult **receives a customized conversation guide**" | `site-copy.md:100,876` | No portal, no per-lesson prompt delivery mechanism anywhere in the repo. Other lines of the same file use the honest "coming soon" framing. |
| Guide steps: "**We'll send you** conversation prompts tied to what they're experiencing" | `app/for-adults/page.tsx:39` | No guide-prompt email/notification pipeline. `partner_waitlist` insert + nothing further. Mitigated by the page's waitlist framing, but stated as how the product works. |
| Impact: "The Future Orientation Score (FOS)… **We measure before and after every program cycle**" | `app/impact/page.tsx:259` | No survey/FOS instrumentation exists in this repo; the admin howto itself lists "Surveys — Coming soon" (`app/admin/howto/page.tsx:193`). Measurement, if real, happens entirely outside this codebase. |
| Corporate tiers: "Biannual impact reports with completion data", "Annual impact report with program data", "Premier Partner badge **across the platform**" | `app/companies/page.tsx:118,133,145` | No report-generation pipeline or partner-badging code in repo; completion data lives in the out-of-repo mobile app. Operational promises with no supporting implementation here. |

Hardcoded stats — unverifiable-from-code assertions, not capabilities: `lib/stats.ts` (`3,500+ teens`, `87% Title I`, `14% future orientation`, `1,100+ hours`, `36+ partners`, `74% second internship`), plus `/update`'s "1,000+ active", "20 partners running it now (50 more in pipeline)", "$1.12M raise", `/impact`'s "1,000+ teens pre/post", and MESA pilot numbers in `lib/mesa.ts`. The homepage/impact student testimonials (Destiny M., Marcus T., Aaliyah R.) are static strings.

## Claims broader than the implementation

| Claim | Where claimed | What actually exists (evidence) |
|---|---|---|
| Compliance: "Upcoming items **feed the weekly digest**" | `app/admin/howto/page.tsx:244` | Compliance items feed the **daily** reminders email (`app/api/cron/daily-reminders/route.ts:80–92`), not the weekly digest — `weekly-digest/route.ts` never queries `compliance_items`. (Grants → weekly digest is accurate.) |
| "Same app, built two different ways — one for your teen, one for you" + Guide bullets "See exactly what they're learning in real time / Track their progress and engagement" | `app/for-adults/page.tsx:189,222–228` | Present-tense description of the Guide experience; the only thing implemented is the waitlist form. The page's own footer walks it back to "when we launch". |
| "Make a deal with them… **We'll give you a starter list** of what works" | `app/page.tsx:414` → `/for-adults#the-deal` | What exists is three example deal cards and one future-tense sentence. No actual list is delivered anywhere. |
| Strategy: "Track KPIs against targets — **Monday snapshots** build ~4-week trend lines" | `app/admin/howto/page.tsx:41` | Implementation is broader: `metric-snapshots` cron runs **daily** at 13:00 UTC. Trend data exists; the "Monday" description is stale. |

## Claims that depend on code outside this repo

| Claim | Where claimed | Note |
|---|---|---|
| Everything about the teen mobile app: 30-day simulated internships, 15 min/day, videos/quizzes/activities, gift-card rewards, "Available in the App" badges on all 19 curriculum tracks | `app/page.tsx`, `app/the-app/page.tsx`, `app/curriculum/page.tsx:436–442`, `app/impact/page.tsx`, `app/update/page.tsx` | The Ambition app's code is not in this repo; store links point to real iOS/Android listings. All in-app behavior is unverifiable here. |
| "Students discover real-world opportunities **tailored to their age, experience, interests, and location**" | `app/the-app/page.tsx:288` | A recommendation-engine claim about the mobile app. Nothing in this repo implements or feeds it. |
| Ambition Fund: "Low-income teens can **apply directly through the app**" | `app/for-adults/page.tsx:328` | In-app application flow; out of repo. |
| "Web School Platform… **In active build now**" | `app/update/page.tsx:75,146–148` | Framed as in-progress; no web student platform exists in this repo. |
| Adult dashboard "In active buildout (**Hub v8** with Demetric)"; teen "AI as critic" features | `app/strategy/StrategyRoom.tsx:229,162` (seed copy) | Hub v8 is an external codebase. Honest "buildout" framing, but note the tension: /update says the same artifact is "built and in use". |
| Twilio/companies sponsored tracks "produced into internships… on the app" | `app/twilio/page.tsx:24`, `app/companies/page.tsx:362,437` | Content production + in-app delivery; out of repo. |
| Ambition Coaches (4 sessions / 4 weeks, coach matching) | `app/update/page.tsx:142`, `app/mesa/page.tsx:56`, `app/twilio/page.tsx:32` | Human program, not software; no matching/scheduling code in repo (labeled "First pilot in progress"). |

## Howto-guide vs UI mismatches

The in-app guide (`app/admin/howto/page.tsx`) is otherwise accurate — essentially every non-"Soon" module claim was verified against working code. The exceptions:

- **"Sync HubSpot in the sidebar… The colored dot below it shows data freshness"** (`howto:269`) — the sidebar contains no HubSpot sync control or freshness dot. That UI lives on the Settings page (`HubspotSyncPanel.tsx`). The guide points operators at a control that isn't where it says it is.
- **"Team — Team roster and roles. Coming soon."** (`howto:225`) — a staff module is already live (`/admin/staff` + APIs). The guide understates the product.
- **"Documents — Shared document hub. Coming soon."** (`howto:226`) — Documents is live (`/admin/documents`).
- **Guide claims to mirror the sidebar** but four live sidebar items are absent from the guide: **Inbox**, **Messages**, **Volunteers**, **Career Library**. The guide's seven "Soon" modules (Ambition App, Internships, Career Readiness, Events, App Analytics, Student Analytics, Surveys) correctly do not appear in the sidebar.
- **Compliance → weekly digest** wording: the guide names the wrong email (see above).

Cross-cutting finding: the single biggest gap between marketing and code is the **Guide/adult dashboard**. The repo simultaneously ships four incompatible versions of its status — "coming, join the waitlist" (`/for-adults`, `site-copy.md`), "built and in use, rolling out now" (`/update`), "immediate access on signup, login included" (`/program-partners` page + its transactional email), and "Being built" (`/update/koshland` deck, Strategy Room seed) — and no code in this repo implements or provisions any of it.

---

# THE HONEST SECTION (cross-cutting)

The single most important list first.

## 1. Capabilities claimed in marketing copy or docs with no working implementation

(Full evidence tables in the "Marketing claims vs implementation" section directly above this one. Summary:)

- **The Guide / adult / partner dashboard does not exist in this repo, and the repo claims it four incompatible ways:** waitlist-only ("when we launch", `/for-adults`), "built and in use, rolling out now" (`/update`), "immediate access on signup, dashboard login included" (`/program-partners` page **and its transactional confirmation email**, which promises "program code and Guide dashboard login within 24 hours"), and "Being built" (`/update/koshland`, Strategy Room seed copy). No dashboard route, no partner-facing auth, no program-code generation, no student-progress data model exists anywhere in the codebase. This is the highest-risk gap for a sales conversation.
- "Real-time visibility into what their teen is exploring" / per-lesson conversation-guide delivery — no pipeline of any kind.
- Future Orientation Score "measured before and after every program cycle" — no survey/FOS instrumentation; the in-app guide itself lists Surveys as "Coming soon."
- Corporate sponsor deliverables (biannual/annual impact reports with completion data, "Premier Partner badge across the platform") — no report-generation or badging code.
- Headline stats (3,500+ teens, 87% Title I, 14%, 1,100+ hours, 36+ partners, 74%) and student testimonials are hardcoded strings — assertions, not measured outputs of this system.

## 2. Half-built, stubbed, or behind a flag

- **No-UI write paths (API exists, no button):** gift edit; household delete; pledge delete; recurring-plan edit/delete; campaign/appeal edit or delete (no route at all); comms campaign draft edit; document metadata edit; link-existing-document-to-record.
- **No-interface tables (SCHEMA ONLY):** `relationships`, `funds` (create), `grant_payments`, `fr_touches`, `fr_email_drafts`, `fr_funding_opportunities`, `fr_prospect_promoted`, `fr_prospect_disqualified` (superseded), document versioning columns, message attachments/membership editing, `metric_definitions` CRUD, `review_competencies` CRUD, staff create/delete, invitations, org/entitlement/org_settings provisioning, meeting-type create/delete + availability-window editing, agenda delegations (read-honored, SQL-administered), QR/kiosk attendance methods.
- **Dead or orphaned:** `modules.reviews` and `modules.comms` entitlement keys are defined but checked nowhere; `/admin/queue` works but lost its only inbound links; `/admin/kpis` (Metric Catalog) has no sidebar entry; `/admin/legacy` reachable only via one widget; `/admin/program` is a header-only placeholder; `bv_*` tables + `aa.bv` key have zero code; a dead fetch to a nonexistent finance budget-import endpoint.
- **Config that stores but doesn't act:** `org_comms_settings.daily_send_cap` is editable and enforced nowhere.
- **Deploy-dependent:** `/admin/finance/model` requires a Google Apps Script that ships as a TODO-placeholder template; Google Calendar push webhooks are inert without `APP_ORIGIN` (15-minute polling is the real sync).
- **Tier fences with wide blast radius:** the entire Prospects section (including non-AI bench list and manual scoring) is behind `ai.prospect_research`; the entire HubSpot mirror/import/enrichment pathway is behind `aa.hubspot_mirror` (AA-only).

## 3. Manual steps required outside the app

- **Tenant + user provisioning is operator SQL end to end:** create org, seed entitlements, email allowlist, terminology, custom fields, participant stages, stewardship rules, chart of accounts, funds, meeting types, org settings. No invite UI, no role management, no member removal in-app.
- **Finance:** a human downloads the bank CSV from Wells Fargo and uploads it (no bank feed/Plaid); the trusted cash number is typed by hand or set by an out-of-app scheduled Claude agent parsing a Wells Fargo balance-alert email; weekly reconcile proposals come from another out-of-app scheduled agent sweeping Gmail/HubSpot — without those agent sessions the Reconcile inbox stays empty; QuickBooks budget arrives as a manually exported CSV.
- **Email/credentials:** Resend domain verification; Google OAuth refresh token minted out-of-band for Gmail sync and `/meet`; HubSpot token/env vars + webhook subscription configured inside HubSpot ("Connect" in the UI only flips a DB row).
- **Fundraising:** all outreach email is sent from the operator's own mail client (Reed drafts are copy/mailto); grant applications and reports are submitted on funder portals; letter batches must be marked thanked after printing.
- **Program:** offering/accepting/declining an applicant sends no email to the family — staff email guardians manually (mailto links only); MOUs are signed outside the app.
- **Migrations:** applied via a GitHub Action or by hand; two `*.MANUAL.sql` files (OGSM reseed, finance budget rebase) are apply-by-hand and hardcode the AA org UUID.
- **Rituals:** Monday plan / Friday close / monthly OGSM review / 360 stage transitions / metric value entry are human rituals the app structures but does not perform.

## 4. Integrations — what they connect to, live vs scaffolded

| Integration | State | Notes |
|---|---|---|
| Stripe | Live | Public donation pipeline (one-time + subscriptions), signature-verified webhook; a Postgres trigger — not app code — turns donations into constituents/gifts/recurring plans. Initial-payment recording is client-browser-dependent (webhook records renewals only). |
| Resend | Live | Nearly all outbound email. From-address hardcoded to `…@mail.ambitionangels.org` in acknowledgments, operator email, and public forms — only campaigns/journeys use per-org `org_comms_settings`. No delivery/bounce webhook: bounces never reach suppressions automatically; no open/click tracking. |
| Gmail (read) | Live | Hourly read-only sync of one env-configured mailbox into donor timelines + intro-candidate detection. Single-mailbox, single-tenant. |
| Google Calendar | Live, two models | Public `/meet` runs on one env account (freebusy, events, confirmation emails); Agenda/meeting-records use per-user encrypted OAuth connections + 15-min cron sync; push webhooks conditionally inert. Resident-org-only for public booking (`lib/meet/host.ts` 503s other tenants). |
| HubSpot | Live, fail-soft | Chunked read sync into `hs_*` mirror (2×/day cron) behind `aa.hubspot_mirror`; outbound push of contacts/opportunities/gifts (no retry queue, duplicate-contact risk noted in code); signed inbound webhook applies contact/company changes only. No OAuth — env token. |
| Anthropic (Claude) | Live | ~12 surfaces: Reed chat/tools, briefing narratives, NBA/next-move, prospect research (+web search), prospect discovery, grant coach, angle drafting, ack drafting, finance categorization, meeting transcripts, career quiz, MS summaries/cards, bug-report interviews. Cost caps: per-surface wallets + org-wide `ai_calls` ledger cap. Everything is draft-and-approve **except**: journey emails (auto-send hourly once a journey is active) and briefing narratives (display-only). |
| QuickBooks | CSV only | Budget CSV parser. No API/OAuth. |
| Google Sheets (finance model) | Scaffold | Requires manually deployed Apps Script; repo copy has TODO placeholders. |
| Plaid / bank feeds, payroll (Gusto), e-sign, SMS/Twilio | Absent | No code. (`/twilio` is a marketing page for the company Twilio, not an integration.) |
| MCP / machine ingest | Live | `POST /api/ingest/tasks` + a remote MCP server (`/api/mcp/[secret]`) for external Claude agents to create/list tasks — capability-URL auth, resident-org, default assignee "shannon". Read-only life-hub snapshot at `/api/hub/v1/snapshot` hardcoded to two named users. |

## 5. Where data enters and where it leaves

**In:** manual forms throughout; two separate CSV import wizards (generic staged wizard for students/constituents at `/admin/imports`; legacy fundraising import with gifts at `/admin/fundraising/import`); public website forms (donate, apply, partner signup, guide waitlist, demoday, YGB, career quiz, MS game); Stripe webhook + DB trigger; Gmail sync; HubSpot mirror sync + inbound webhook; calendar sync; task ingest/MCP; out-of-app finance agents.

**Out:** donors CSV export and gifts CSV export (10k-row caps, audited) — **the only two data exports in the product**; browser print-to-PDF (board finance report, receipt letter batch); outbound HubSpot push; operator/donor emails via Resend; Google Calendar events + attendee ICS; the life-hub snapshot API. There is **no export** of: pipeline, grants, asks, prospects, students, attendance, cohorts, board, compliance, filings, documents metadata, messages, plan/scorecard, metric history, transactions/budget, audit log.

## 6. What the system does NOT do that a nonprofit would reasonably expect

- **Accounting:** no general ledger, double-entry, journal entries, period locking, trial balance, balance sheet, accruals, A/P, A/R, invoicing, payroll, bank feeds, multi-account/currency. Finance is categorized-cash-plus-runway, reconciled to a hand-typed (or agent-emailed) bank balance. Restricted funds are a boolean carve-out, not fund accounting.
- **Email marketing:** no open/click tracking, no bounce handling, no scheduling, no HTML editor, one merge field (`{{first_name}}`), no A/B, no suppression-list UI, 2000-recipient cap per send.
- **Donor-facing:** no donor portal, no year-end giving statements, no receipt numbers, no online pledge payment.
- **Program-facing:** no family/guardian portal or automated family communications, no report cards/outcomes/surveys, no attendance export or funder-ready dosage report, no consent/media-release or medical-fields structure, no billing.
- **HR:** no payroll, comp, PTO, onboarding/offboarding checklists, e-signature, per-employee documents, review reminder emails, review PDF export. Cannot add a staff member in-app.
- **Governance:** no board-member portal experience verified for the `board_viewer` role (UNVERIFIED); no global audit-log viewer or disclosure report despite thorough audit writes.
- **Platform/admin:** no tenant self-service of any kind (org creation, members, roles, entitlements, custom fields, stages, terminology beyond one rename, chart of accounts, stewardship rules, meeting types); no billing surface; no recurring tasks; no task assignment notifications; no external task/calendar/report integrations beyond those listed.
- **Multi-tenant hardening:** daily-reminders cron and several service-role reads are not org-fenced; `fin_config` is a physical singleton; unique constraints on finance dedup/budget are global, not org-scoped; quiz stats/submissions endpoints lack org fences; sender identity is hardcoded to AA in several paths. A second real tenant hits these today (the seeded second tenants are a fictional demo org and a partially-onboarded one).

## 7. Seed, demo, and fixture data (not real usage)

- `supabase/seed/ygb_demo_tenant.sql` — fully fictional demo tenant ("Young, Gifted & Black"); every person, funder, and number invented. Any demo given from that org is staged data.
- `supabase/migrations/seed_partners_2026.sql` — ~95 real Bay Area org names inserted as prospect/outreach partners from a planning workbook; pipeline demos showing these rows reflect seeded data, not usage.
- `supabase/seed_meeting_types.sql` (7 meeting types), `ack_v2_4_seed_aa_stewardship.sql` (AA stewardship matrix), `create_org_entitlements.sql` + `seed_aa_*` (AA entitlements), 78 default finance rules from AA's own bank descriptions, 501(c)(3) compliance template seed, demoday attendee roster hardcoded in `lib/demoday/attendees.ts`.
- `supabase/seed/ms_occupations_*.json` + OEWS JSON — real O*NET/BLS reference data (imported by manual script), reference not usage.

---

# Summary count of capabilities by status

Counted over every row in the module capability tables above (compound statuses counted by their primary label, e.g. "SHIPPED (write) / PARTIAL (read)" → SHIPPED, "SCHEMA ONLY (create) / READ ONLY (use)" → SCHEMA ONLY).

| Status | Count |
|---|---|
| SHIPPED | 289 |
| PARTIAL | 44 |
| READ ONLY | 9 |
| SCHEMA ONLY | 15 |
| UNVERIFIED | 1 |
| **Total** | **358** |

The one UNVERIFIED item: what a `board_viewer`-role user actually sees when signing in (schema and RLS carve-outs exist; no dedicated board-portal UI was found; resolving it requires signing in as a board_viewer against a live environment, which code reading alone cannot do).

---

*Produced 2026-07-29 by reading the code on branch `claude/bloomos-capability-inventory-q4q7jn`. No source file was modified; this file is the only addition.*
