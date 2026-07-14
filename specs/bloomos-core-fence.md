# BloomOS — Core fence and the move to app.bloomos.org

Status: draft for review, 2026-07-14
Depends on: Phase 0 recon report (delivered 2026-07-14), live schema reads of project `kzzdtibbwsucloaoqpqa`
Companion doc: `docs/bloomos-migration-runbook.md` (the step-by-step operator instructions)

## 1. Problem statement

BloomOS runs at `ambitionangels.org/admin` as a single-tenant system wearing multi-tenant clothes. Three distinct products live tangled in one repo and one schema: the universal nonprofit operating system (the product), AA's program shape (universal structure, AA-specific fields), and AA's public marketing website (quiz, Demo Day, YGB, Mesa, newsletter, legacy donations). Nothing in the codebase names which is which.

The recon confirmed the specific debts: 62 tables carry a hardcoded `org_id` default of AA's UUID; 75 of 109 insert call sites ride that default, 45 of them on the service-role client where the default is the only tenancy assignment; `fin_config` is a structural singleton (`{id: 1}`); `getOrgContext()` resolves an arbitrary membership row with no ordering; `getAdminUser()` maps every non-shannon email to `"remi"`; and roughly a dozen modules hardcode AA hosts or identity in emails, prompts, and chrome.

None of this errors today because there is one tenant. All of it corrupts data or leaks identity the day there are two.

## 2. Who's affected

- Remi and Shannon: their logins, PWA installs, and email deep links move hosts.
- Safespace: the first external tenant. Blocked until the fence and the default drop land.
- Every future tenant: the fence decides what a clean BloomOS surface looks like.
- SOBO Consulting: bloomos.org gains a Sign in link and the product gains a sellable shape.

## 3. Current behavior

- Admin served only at `ambitionangels.org/admin`. Middleware is path-gated and host-blind.
- Auth: Supabase password + magic link. `emailRedirectTo` is request-derived (good). No cookie domain set anywhere (good). Membership bootstrap trigger grants `staff` to any `@ambitionangels.org` signup.
- Tenancy: one `orgs` row, two memberships, both owner. `org_terminology` empty and unread. `org_entitlements` has 2 rows (`ai.reed`, `coaching`) and is unread.
- 62 org_id column defaults live; full inventory in the recon report §6.
- AA website routes (`/api/quiz-submit`, `/api/demoday/*`, `/api/ygb/*`, `/api/ms/*`, `/api/partner-waitlist`, `/api/program-partner-signup`, `/api/save-donation`, `/api/stripe-webhook`) write directly into the shared schema on the service-role client, tenancy assigned by column default.

## 4. Desired behavior

- `app.bloomos.org` serves the admin for any tenant. `bloomos.org` header carries a Sign in link. `ambitionangels.org/admin` keeps working through a transition window, then 308s.
- Existing logins work unchanged on the new host (same Supabase project; one fresh sign-in per person per host, which is expected cookie behavior, not a migration).
- The shell is tenant-derived: org name from the `orgs` row, module visibility from `org_entitlements`, labels from `org_terminology` with `entity_types.display_name` as fallback.
- Every insert path sets `org_id` explicitly from session context or a parent row. Product tables carry no org_id defaults.
- AA's website features are fenced: flagged as `aa.*` entitlements, their tables classified as AA-site, their write paths eventually moved behind the ingest API and out of core schema.
- A user with two memberships lands in a deterministic org and can switch via a validated cookie.

## 5. Scope

**In:**
- Host split (Vercel domain, DNS, Supabase redirect allowlist, middleware host guard).
- The two bleeding cuts: `getOrgContext()` determinism, `lib/admin/ops/ingest.ts` org assignment.
- Entitlement reader + sidebar/route gating. Branding reader. Terminology reader.
- Table classification (the fence) and the `aa.*` flag set.
- Insert-path fixes across the product tables; `fin_config` restructure; the default-drop migration.
- Active-org cookie and switcher.
- Email/link origin fixes (`APP_ORIGIN`), the four hardcoded `www.ambitionangels.org/admin` literals, operator-notification links from public routes.
- Safespace tenant seed SQL (draft, pending their answers).

**Out (each gets its own spec):**
- Participant spine + custom fields (spec #4). Gated behind Phase C here.
- Import layer / connector framework (retires `hs_*` from core). Gated behind spec #4's field registry.
- Strategy builders (tenant-facing OGSM setup UX; AA's plan was seeded by SQL, no second tenant can onboard without this).
- Moving AA website routes onto the ingest API and extracting AA-site tables.
- Pretty URLs (`app.bloomos.org/fundraising` without the `/admin` prefix). Deliberately deferred; 21 `entity_types.route_pattern` rows and every `Link href` change together in one later PR.
- Repo extraction. Stays deferred until the first paying tenant, per standing decision.
- Per-tenant subdomains (`safespace.bloomos.org`). Sales feature, not architecture. One host, org switcher.

## 6. Architecture sketch

### 6a. The fence: three classes of table

**Product (universal core).** Ships to every tenant, gated only by module entitlements:

- Fundraising spine: `constituents`, `households`, `relationships`, `interactions`, `opportunities`, `gifts`, `soft_credits`, `acknowledgments`, `ack_templates`, `grants`, `grant_requirements`, `grant_payments`, `pledges`, `pledge_payments`, `recurring_plans`, `campaigns`, `appeals`, `funds`, `segments`, `stewardship_rules`, `asks`, `ask_documents`
- Prospect research (`fr_*`, 10 tables): product, behind `ai.prospect_research`
- Finance: `fin_*` (8 tables)
- Ops: `ops_projects`, `ops_tasks`, `briefings`, `bloomos_briefing_state`, `bloomos_briefing_narrative`
- Board: `board_members`, `board_meetings`, `agenda_delegations`
- Compliance: `compliance_items`
- Strategy: `plan_*` (7 tables), `strategy_angles`, `strategy_room_meta`, `funder_angles` (confirmed product; builders required before tenant 2 can use it)
- Staff and reviews: `staff`, `staff_goals`, `staff_kpis`, `staff_kpi_snapshots`, `review_*` (5 tables)
- Partners: `partners`, `partner_contacts`, `partner_interactions` (product, behind `modules.partners`, off by default)
- Comms: `email_campaigns`, `email_sends`, `email_suppressions`, `journeys`, `journey_steps`, `journey_enrollments`
- Meetings and sync: `meeting_types`, `bookings`, `blackouts`, `connections`, `connection_candidates`, `calendar_events`, `calendar_sync_jobs`, `gmail_sync_jobs`, `meeting_records`, `meeting_suggested_tasks`, `rhythm_sessions`
- Messages, documents, notifications, metrics: `message_*` (4), `messages`, `documents`, `document_links`, `notifications`, `metric_definitions`, `metric_snapshots`, `entity_comments`, `entity_types`
- Reed: `reed_*` (6 tables), behind `ai.reed`
- Platform: `orgs`, `memberships`, `invitations`, `role_permissions`, `org_email_allowlist`, `org_terminology`, `org_entitlements`, `org_comms_settings`, `user_org_state`, `profiles`, `audit_log*`, `webhook_events`, `research_runs`

**Program (universal structure, tenant fields).** `programs`, `cohorts`, `cohort_members`, `cohort_sessions`, `attendance`, `applications`, `participant_stages`, `students`. Held as-is until spec #4 generalizes to the participant spine. Safespace's shape (student leaders, chapters per school, sessions at schools and a hub, likely continuous membership) confirms the spine: program → group → enrollment → session → attendance, with `grade`/`school`/guardian fields moving to per-org custom fields.

**AA-site (fenced).** Written by ambitionangels.org public routes, never shown to another tenant: `quiz_submissions`, `ms_*` (7), `ygb_registrations`, `ygb_attendance`, `demoday_signups`, `demoday_notes`, `bv_newsletter_subscribers`, `bv_showcase_submissions`, `partner_waitlist`, `page_views`, `click_events`, `donations` (legacy pre-spine), `hs_*` (5, retiring via the future connector framework). These keep their org_id defaults for now (they are structurally single-org until their routes move behind the ingest API); admin surfaces for them sit behind `aa.*` entitlement flags.

### 6b. Entitlement keys

Module switches (default on for a standard tenant unless noted):
`modules.fundraising`, `modules.finance`, `modules.program`, `modules.ops`, `modules.board`, `modules.compliance`, `modules.strategy`, `modules.staff`, `modules.reviews` (default off), `modules.partners` (default off), `modules.meetings`, `modules.comms`, `modules.messages`, `modules.documents`, `modules.metrics`

Feature/tier switches: `ai.reed`, `ai.prospect_research`, `coaching`

AA-only flags (on for AA, never seeded for anyone else): `aa.demoday`, `aa.ygb`, `aa.mesa`, `aa.quiz`, `aa.bv`, `aa.site_analytics`, `aa.hubspot_mirror`

Reader: `lib/admin/entitlements.ts` exposing `getEntitlements(orgId)` (one query, request-cached) and `hasFeature(ents, key)`. Sidebar filters nav items by key; a thin server-side guard in module layouts returns the not-authorized panel when the module is off. Unknown keys default to off. The sidebar nav config gains a `feature` field per item; that config is the single mapping from route group to key.

### 6c. Org context and the active-org cookie

`getOrgContext()` today: `.limit(1).maybeSingle()`, no ordering, no switching input. Target:

1. Read `bloom_active_org` cookie. If present, validate against the user's `memberships` rows; a row must exist or the cookie is ignored and cleared.
2. If absent or invalid: pick the sole membership when there is exactly one; with several, pick the oldest (`order by created_at asc`) and set the cookie.
3. `OrgContext` gains `orgName` (joined from `orgs`) so the shell stops hardcoding "Ambition Angels".
4. Switcher UI in the sidebar footer, rendered only when the user has 2+ memberships; POST to a small route that validates and sets the cookie, then `router.refresh()`.

Interim (Phase A, one line): add `order by created_at asc` so resolution is at least deterministic before the cookie lands.

`getAdminUser()`'s `"remi" | "shannon"` union is legacy compat consumed by ops assignment fields. Full replacement (assignment by user id via `staff`/`profiles`) is real work and out of scope here; Phase B narrows the blast radius by deriving display identity from the session email and org membership instead of the ternary, flagged as a follow-up spec.

### 6d. Origins and email links

New module `lib/origins.ts`:
- `APP_ORIGIN` env var (the admin host: `https://app.bloomos.org` after cutover; `https://www.ambitionangels.org` until then). All admin deep links in emails, digests, and reports build from this.
- `MARKETING_ORIGIN` stays the AA site for AA-site email flows (receipts, unsubscribe), later per-org from `orgs.settings`.

Fixes routed through it: `lib/notifications/notify.ts:27`, `lib/email/operator.ts:71`, `app/api/admin/report/route.ts:205`, `lib/admin/crmOverdue.ts:27`, `lib/email/format.ts`, the four public-route operator notifications (`partner-waitlist`, `quiz-submit`, `save-donation`, `demoday/signup`), and `lib/google/watch.ts` (calendar webhook base must equal whichever host owns `/api/google/calendar-webhook`; same Vercel project, so `APP_ORIGIN`).

From-addresses, ICS identity (`lib/meet/ics.ts` hardcodes `remi@ambitionangels.org` and an AA PRODID), receipt legal text, and LLM prompt identity (briefing, NBA, prospect discovery, ack drafts hardcode AA's mission) all become org-derived from `orgs.settings` + `org_comms_settings`. Phase B covers chrome and the worst email literals; prompt identity is folded into the same PR that parameterizes agent prompts by org.

### 6e. fin_config

Structural singleton: three writers upsert `{id: 1}`. Restructure to one row per org: add `org_id`, backfill AA, make `org_id` the primary key, drop `id`, update the three writers to upsert on `org_id` from context. RLS `has_permission(org_id, 'finance.read'/'finance.write')` in the same migration.

### 6f. The default drop

48 product tables drop their org_id defaults (the 62 minus the 14 AA-site tables: `bv_newsletter_subscribers`, `bv_showcase_submissions`, `click_events`, `page_views`, `demoday_notes`, `demoday_signups`, `donations`, `partner_waitlist`, `quiz_submissions`, `hs_companies`, `hs_contacts`, `hs_deals`, `hs_engagements`, `hs_sync_jobs`). The migration runs only after every default-riding insert path into those 48 tables is fixed and deployed; the payoff is that any missed path fails loudly with a NOT NULL violation instead of silently writing into AA.

Insert-path fixes cluster (recon §6): the finance module (all service-role, zero explicit org_id), six sibling constituent-creation paths, HubSpot upserts (stay defaulted, AA-site class), board/compliance/meet service-role routes (derive org from `getOrgContext()` and pass through), and `lib/admin/ops/ingest.ts` (public + MCP reachable, fixed in Phase A).

## 7. Staged build order

Phases match the runbook. Each commit named, each phase independently useful.

**Phase A — host split + bleeding cuts** (no schema changes)
- A1 `chore(domains): host guard for app.bloomos.org` — middleware reads host; on the app host, `/` redirects to `/admin` and marketing paths 404; ambitionangels.org behavior unchanged.
- A2 `fix(auth): deterministic membership resolution` — `order by created_at asc` in `getOrgContext()`.
- A3 `fix(ingest): explicit org on task ingest` — `lib/admin/ops/ingest.ts` resolves org via `getResidentOrgId()`/caller context, never the default.
- A4 (bloomos-site repo) `feat(header): sign in link` → `https://app.bloomos.org/admin`.
- Operator steps: Vercel domain, Cloudflare DNS, Supabase redirect allowlist (runbook steps 1–4).

**Phase B — the fence**
- B1 `feat(entitlements): reader + sidebar gating` + seed SQL for AA's full key set (Remi applies).
- B2 `feat(orgs): tenant-derived branding` — login screen generic BloomOS, `Greeting`/manifest/chrome read `ctx.orgName`, AA strings out of the shell.
- B3 `feat(terminology): reader + label helper` — `org_terminology` override, `entity_types.display_name` fallback; prove on the program nav labels first.
- B4 `feat(origins): APP_ORIGIN link builder` — the email/link fixes in §6d.

**Phase C — org context hardening + the default drop**
- C1 `feat(auth): active-org cookie + switcher`.
- C2 `fix(finance): org-scoped fin_config + explicit org on fin_* writes` + fin_config migration.
- C3 `fix(inserts): explicit org across fundraising paths` (constituents cluster, pledges, recurring, soft-credits, journeys, opportunities, appeals, campaigns, grants).
- C4 `fix(inserts): explicit org across ops/board/meet service-role paths`.
- C5 Migration: drop 48 defaults (Remi applies). Then a full manual smoke as both users on a preview deploy: create one record in every module, verify `org_id` on each.

**Phase D–F (separate specs, order fixed):** participant spine + custom fields → import layer/connector #1 (HubSpot refactor, retires `hs_*`) → strategy builders → Safespace onboarding. Safespace seed SQL is drafted in the runbook appendix and blocked only on their answers (email domain, terminology, current system).

**Cutover (after ≥2 weeks of parallel hosts):** flip Supabase Site URL, set `APP_ORIGIN=https://app.bloomos.org`, add the 308 from `ambitionangels.org/admin/*`, both operators reinstall the PWA from the new host.

## 8. Definition of done (observable)

1. Remi and Shannon each sign in at `app.bloomos.org/admin` with existing credentials; Command Center renders; magic link round-trips to the new host.
2. `app.bloomos.org/` redirects to `/admin`; `app.bloomos.org/donate` does not serve AA's donate page.
3. Toggling `modules.partners` off for AA in `org_entitlements` removes Partners from the sidebar and its routes return the not-authorized panel; toggling back restores it. No deploy in between.
4. The string "Ambition Angels" appears nowhere in the admin shell source; it renders only where `ctx.orgName` puts it.
5. `select table_name from information_schema.columns where column_name='org_id' and column_default is not null and table_schema='public'` returns exactly the 14 AA-site tables.
6. A test insert through every fixed route lands with `org_id` = AA's UUID; deleting the default on a table with a missed path produces a loud NOT NULL error in the smoke, not silent data.
7. With a second membership row present for Remi (test org), the org switcher appears, switching changes the rendered org name and data scope, and removing the cookie lands him deterministically in AA.

## 9. Failure modes

- **A missed insert path after the default drop.** Loud NOT NULL failure by design. Mitigation: the C5 module-by-module smoke before and after applying the migration; the recon's 109-site table is the checklist.
- **PWA stranding.** Installed PWAs on the old host keep working until the 308 lands, then their cached shell trips. Mitigation: both operators reinstall before the 308; the old SW's cache versioning gets a bump in the cutover PR.
- **Cron/webhook host drift.** Same Vercel project so crons are unaffected, but `lib/google/watch.ts` registers an absolute webhook URL with Google. Renewals must use `APP_ORIGIN` and one manual watch re-registration happens at cutover.
- **Entitlement gate misses a route.** Sidebar hiding without route guarding is cosmetic. The guard lives in module layouts, not per-page; DoD #3 tests a direct URL hit, not just nav absence.
- **fin_config migration races a finance write.** Apply during a quiet window; the three writers ship in the same deploy as the migration application (C2 deploy first, migration immediately after, in that order).
- **Bootstrap trigger surprise.** `on_auth_user_created` grants `staff` to any `@ambitionangels.org` email. Fine for AA, but the Safespace seed must extend the trigger's allowlist logic (it reads `orgs.settings.email_domain`), and a personal-gmail Safespace staffer needs an `invitations` path, which exists but has never been exercised (0 rows). Exercise it once with a test account before Safespace.

## 10. Open decisions

1. **Cloudflare proxy mode for `app` CNAME.** Recommend DNS-only (grey cloud): Vercel manages the cert and edge; proxying adds a layer that complicates cert issuance and debugging for zero benefit here.
2. **Transition window before the 308.** Recommend 2 weeks minimum, extended if email/calendar deep links to the old host are widespread. The 308 stays permanently regardless (old links in sent email never die).
3. **`getAdminUser()` replacement timing.** Recommend after Phase C as its own small spec (assignment identity by user id). The Phase B narrowing is a stopgap, not the fix.
4. **`modules.reviews` and `modules.partners` defaults.** Recommend both off for new tenants; AA turns both on. Small orgs without formal reviews or partner networks see a cleaner surface day one.
5. **Safespace terminology and module set.** Provisional: `student` → "Student leader", `cohort` → "Chapter", program on, board on (they'll have one), reviews off, partners probably on (schools are partners). Blocked on their confirmation and their current system (which decides connector #1's second speaker after HubSpot).

## 11. Paste-ready Phase A kickoff prompt

```
BloomOS Phase A: serve the admin at app.bloomos.org. Recon is done
(see docs/recon report 2026-07-14); this is the build.

Ground rules: one PR per commit point below, small and reversible.
No schema changes in this phase. No migrations. Do not touch the
org_id defaults yet.

A1. middleware.ts host guard.
   - Read the host from req.headers (x-forwarded-host, fall back to
     host). Define APP_HOSTS = ["app.bloomos.org"] and treat
     localhost/vercel previews as both-capable.
   - On an app host: "/" 307s to "/admin"; any path outside /admin,
     /auth, /api, and the PUBLIC_ADMIN_PATHS set 404s via
     NextResponse rewrite to a minimal not-found. Marketing routes
     must not render on the app host.
   - On ambitionangels.org: behavior byte-identical to today. Add
     the matcher entries the host guard needs without widening the
     admin gate.
   - Extend the matcher to include "/" and top-level marketing paths
     only as needed for the app-host branch; verify the demoday and
     strategy gates still work on the AA host.

A2. lib/admin/auth.ts: in getOrgContext(), add
   .order("created_at", { ascending: true }) before .limit(1).
   One-line diff plus a comment naming the active-org cookie as the
   real fix (Phase C).

A3. lib/admin/ops/ingest.ts: the ops_tasks insert at ~line 77 must
   set org_id explicitly. Resolve via getResidentOrgId() from
   lib/admin/orgs.ts (same pattern the program tables use). Cover
   both callers (/api/ingest/tasks and the MCP route). Add a test
   or at minimum a comment-documented manual verification.

Definition of done for the PR set:
- Local dev with a hosts-file entry for app.bloomos.org: "/" →
  /admin redirect works, /donate 404s, /admin login renders.
- On the AA host, /admin, /demoday, /strategy behave exactly as
  before (manual smoke).
- A task ingested via /api/ingest/tasks carries org_id explicitly
  (verify the insert payload in the code path, then live).

Stop after A3. Vercel domain attach, Cloudflare DNS, and the
Supabase redirect allowlist are operator steps Remi does from
dashboards, not code.
```
