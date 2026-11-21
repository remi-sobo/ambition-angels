# V4 Phase 0, Track 3: Tenancy, permissions, security, data correctness

Base: checkout HEAD `dff62859` (brief says main `37472e56`; the audit read the working tree). Production catalog: Supabase project `kzzdtibbwsucloaoqpqa` ("BloomOS"), read-only catalog queries and row counts only, 2026-11-20. No application row contents were read.

Production today: 5 orgs, 28 memberships, 26 users, 1 user in more than one org. Roles in use: owner 7, admin 5, staff 11, finance 2, board_viewer 3.

## Findings

| # | P | Finding | Status | Evidence |
|---|---|---|---|---|
| 1 | P0 | Anyone with the public anon key can create, resolve and snooze tasks, grant requirements and compliance items in **any org**. `upsert_obligation`, `resolve_obligation`, `snooze_obligation` are SECURITY DEFINER, executable by `anon`, and skip the permission check when `auth.uid()` is null. `upsert_obligation` takes `p_org` from the caller. | verified (catalog + code) | prod `proacl` = `{postgres,anon=X,authenticated=X,service_role=X}`; body `if auth.uid() is not null and not private.has_permission(...)` at `supabase/migrations/spec_a_obligation_rpcs.sql:66,231` and `capture_obligations.sql:309`. Repo revokes from `public` only (`spec_a_obligation_rpcs.sql:318-320`); Supabase's default grant to `anon` survives that. Advisor lint 0028 flags all three. |
| 2 | P0 | Role permissions are not enforced on service-role routes. 84 `/api/admin` write handlers use the service-role client with an org fence but no permission check, so any member (including the 3 live board_viewer accounts) can edit or delete finance, students (minors), board, compliance, cohorts, attendance, imports, partners, and export finance/impact reports. RLS would deny these to board_viewer and to finance (for program data). | verified | e.g. `app/api/admin/students/[id]/route.ts:14,121` (getOrgContext then service-role delete); `finance/transactions/[id]/route.ts:19,73`; `board/members/[id]/route.ts:127-144`; `finance/reports/export/route.ts`. Full list in scratch classification; pattern: `getSupabaseAdmin` + `getOrgContext`/`requireEntitlement`, no `ctxHasPermission`. Only ~30 service-role routes (plan/*, report, documents, comms callback) call `ctxHasPermission`. |
| 3 | P0 | Same bypass on pages. 47 of the 48 `app/admin` files that read through the service-role client have no permission check: board_viewer and finance users see the full student roster and student detail; board_viewer sees all finance pages. | verified | `app/admin/students/page.tsx:23-26`, `app/admin/finance/page.tsx:47`, `finance/transactions/page.tsx:72-74`; `students` RLS requires `program.read`, which finance and board_viewer lack (prod `role_permissions`). |
| 4 | P0 | Cross-tenant reads: any authenticated member of **any** org (SafeSpace on day one) can read Ambition Angels data through routes that use the service-role client with no org filter. Includes minors' PII. | verified | `api/admin/submissions/route.ts:10-14` and `stats/route.ts:77` (quiz_submissions: teen name, age, email, location; 55 rows); `fundraising/prospects/hubspot-search/route.ts:12-28` (AA HubSpot contacts, 2,541 rows, via un-scoped `hubspot_bench_candidates` RPC); `partners/route.ts:12` (partner_waitlist contacts); `programs/route.ts:27` (program_partners); `analytics/route.ts:40-45` (page_views, click_events). Gate is `isAuthed()` only. |
| 5 | P0 | Any member of any org can approve, edit, delete and AI-generate the public teen career content (ms_cards, game_pool, game_daily). These are global tables with no tenant, and the "human approval" rule assumes AA staff. | verified | `api/admin/careers/card/route.ts:22`, `careers/review/route.ts:13,78`, `careers/generate/route.ts:15`, `careers/pool`, `careers/daily`, `careers/queue`: `isAuthed()`/`getOrgContext()` only, no entitlement or role check. |
| 6 | P1 | The CI tenant scanner cannot see findings 4 and 5: it allow-lists `quiz_submissions`, `page_views`, `click_events`, `partner_waitlist` as "global", omits `program_partners`, and does not inspect `.rpc()` calls. | verified | `tests/tenant-isolation.test.ts:67-71`, TENANT_TABLES list lacks `program_partners`. |
| 7 | P1 | The RLS test DB does not reproduce Supabase's default function grants to `anon`, so finding 1 passes CI. Obligation RPCs are only exercised as service role and as authenticated. | verified | `supabase/tests/setup-supabase-stub.sql:55-58` (table grants only); `rls-leak-test.sql:1452-1477`. |
| 8 | P1 | Multi-org users get mixed-tenant data. RLS answers "is a member of org_id", not "is the active org". 57 session-client admin routes have no explicit org filter, including donor export, gift export, donations, constituent search, ops tasks. With one multi-org user today and SafeSpace operators likely joining both orgs, exports and lists will union both tenants. | verified (code), impact needs-runtime-access | `api/admin/donors/export/route.ts:24-41` (no `org_id` filter, session client); compare `api/admin/search/route.ts:109` which pins `ctx.orgId`. |
| 9 | P1 | No MFA anywhere, though doc 04 makes it binding for owner/admin. Leaked-password protection is off. Admin magic link login uses the default `shouldCreateUser`, so anyone can create an auth user (if project signups are on). | verified (code + advisor); signup setting needs-runtime-access | no `aal2`/`mfa` in `app/`, `lib/`, `middleware.ts`; `api/admin/login/route.ts:36`; advisor `auth_leaked_password_protection`. |
| 10 | P1 | `/strategy` and `/demoday` accept **any** signed-in user, member or not, and `/strategy` reads AA's strategy rows with the service role by slug. SafeSpace users will see AA strategy. | verified | `middleware.ts:91-105` (`return hasUser`); `app/strategy/page.tsx:60-65`. |
| 11 | P1 | Minors' data goes to Anthropic with no redaction boundary. There is no shared redaction module (only a private-body redaction in `lib/meetings/dossier.ts:77`). Public `/api/career-match` sends the teen's name and quiz answers; Capture sends raw transcripts; doc 04 requires ZDR before student PII in prompts. ZDR status unknown. | verified (code); ZDR needs-runtime-access | `app/api/career-match/route.ts:40`; `lib/capture/prompt.ts:172`; `lib/ai/gateway.ts` has no redaction step. |
| 12 | P1 | Non-transactional multi-step writes on core flows. Constituent merge runs ~9 sequential writes, ignores errors on grants/relationships/journeys, and can leave a half-merged donor. Partner merge, import commit, application accept, coach match create are the same shape. | verified | `api/admin/constituents/merge/route.ts:125-160` (lines 132-137 discard errors); write counts: partners/merge 5, imports/commit 9, applications/accept 3, coach/matches 4, none use an RPC. |
| 13 | P1 | Public donation pipeline trusts the client. `/api/save-donation` records any `stripePaymentId` and amount without verifying it with Stripe (only an in-memory per-instance rate limit). `/api/send-receipt` is an unauthenticated, unthrottled mailer that sends AA-branded receipts to any address for any amount. | verified | `app/api/save-donation/route.ts:41-80`; `app/api/send-receipt/route.ts:87-100`; `lib/rate-limit.ts:2-10`. |
| 14 | P1 | Org admins can self-grant entitlements (paid modules, `aa.*` fences) directly through PostgREST, since `org_entitlements` is writable with `org.manage`. Admin and owner have identical permissions, so an admin can demote or remove the owner. | verified (catalog) | policy `managers write org_entitlements` = `has_permission(org_id,'org.manage')`; owner and admin rows in `role_permissions` are identical. |
| 15 | P2 | Seven tenant tables have unique indexes on `(external_source, external_id)` without `org_id`: students, gifts, opportunities, partners, partner_contacts, recurring_plans, interactions. CSV import uses a content fingerprint as `external_id`, so an identical row in another tenant blocks the import and the error confirms the row exists elsewhere. | verified (catalog + code) | `pg_indexes` query; `api/admin/imports/[id]/commit/route.ts:48,155`. |
| 16 | P2 | 12 prod tables still default `org_id` to the AA org: hs_companies, hs_contacts, hs_deals, hs_engagements, hs_sync_jobs, page_views, click_events, quiz_submissions, partner_waitlist, demoday_notes, demoday_signups, bv_showcase_submissions. All are AA-site or HubSpot-mirror tables. The ratchet baseline still lists 62 and so would not notice a re-added default on one of the 50 already cleaned. | verified | prod `information_schema.columns`; `supabase/tests/tenant-default-ratchet.sql:31-46`. |
| 17 | P2 | `meeting_types` is readable by `anon` across all orgs (`is_active = true`), so every tenant's public booking types are enumerable. Intended for `/meet`, but not org-scoped. | verified | policy `public_reads_active_meeting_types`. |
| 18 | P2 | AI spend cap covers 9 of 18 AI call sites and fails open; careers generate and finance categorize have no cap. Public `/api/shannon` calls Claude with no auth or rate limit. `quiz-submit`, `partner-waitlist`, `schools-inquiry`, `analytics/event` have no rate limit. | verified | `grep orgOverAICap` (9 files) vs AI callers (18); `app/api/reed/ask/route.ts:74` "Fail-open"; `app/api/shannon/route.ts:374`. |
| 19 | P2 | 70 of 231 admin write handlers do not write an audit row (e.g. finance reconciliation create, categorize suggest, import stage/patch, org switch). No DB-level audit triggers on participants or consents, which doc 04 calls for. | verified (route grep) | audit grep over `app/api/admin/**/route.ts`. |
| 20 | P2 | No API exists to invite members or change roles (members route is GET only, `invitations` has 0 rows). Role changes are operator SQL, with no audit trail. | verified | `app/api/admin/members/route.ts`; prod count. |
| 21 | P3 | `ms_catalog` is a SECURITY DEFINER view (advisor ERROR). It is intentional (public catalog without `title`/`clue_8`) and the leak test checks its columns, but document it as an exception. Other 9 views are `security_invoker`. | verified | advisor 0010; `rls-leak-test.sql:929`. |
| 22 | P3 | Hygiene: cron and ingest secrets compared with `===` (not constant time); MCP secret sits in the URL path (`app/api/mcp/[secret]/route.ts:123`); games token falls back to the service-role key (`lib/games/token.ts:32`); `fr_map_dealstage` has mutable search_path; `citext`, `pg_net` in public schema; demoday/strategy cookies store the plaintext password. | verified | as cited; advisor. |

Positive controls confirmed: RLS is enabled on every public table (prod); all SECURITY DEFINER functions pin `search_path` except `fr_map_dealstage`; `anon` has no usage on `private`; all 12 cron routes fail closed without `CRON_SECRET`; unsubscribe tokens are HMAC with no fallback and timing-safe compare; OAuth tokens are AES-256-GCM with a required key; the org-switch cookie is validated against membership on every read (`lib/admin/auth.ts:83-112`, `api/admin/org/switch/route.ts:29-45`).

## 1. Cross-tenant isolation (catalog)

| Check | Production result |
|---|---|
| Tables with RLS | All 200+ public base tables, including 16 without `org_id` (global: ms_*, cut_*, game_*, orgs, profiles, role_permissions, entity_types, webhook_events) |
| RLS on, zero policies (service-role only) | 23: audit_log partitions, ms_*, cut_*, game_*, connections, org_settings, webhook_events, calendar_sync_jobs, bloomos_briefing_* |
| `org_id` nullable | `calendar_sync_jobs` only |
| `org_id` column default | 12 tables (finding 16) |
| Policies not filtering by org | `entity_types`, `role_permissions` (`true`, config), `meeting_types` (anon), self-row policies on profiles/notifications/staff/messages, staff_* via `can_view_staff` (org-aware). No tenant table has an org-blind permissive policy. |
| SECURITY DEFINER callable by anon | 12 in public; 3 are exploitable (finding 1). Trigger functions and `can_view_staff` are harmless when called directly. |
| Views without security_invoker | `ms_catalog` only |

Repo vs prod drift that matters: the repo intends obligation RPCs to be non-anon (`revoke ... from public`), prod grants anon. Fix with explicit `revoke execute ... from anon`, and change the guard to `if auth.uid() is null and current_user <> 'service_role' then raise`.

## 2. API authorization

Classification of all 348 handlers under `app/api` (266 under `/api/admin`):

| Pattern | Count | Notes |
|---|---|---|
| Admin, session client only (RLS enforces role + org) | 152 | Sound for single-org users; 57 lack an explicit active-org filter (finding 8) |
| Admin, service-role client | 114 | 97 fence by `ctx.orgId`; 17 do not (finding 4, 5 plus agenda/sync, briefing, documents which read via session first and are fine) |
| Admin, service-role, permission re-checked | ~30 | plan/*, report, documents POST, comms connect callback |
| Admin, service-role writes, no permission check | 84 | finding 2 |
| Admin with no session check | 0 real | the 22 my grep flagged use `requireEntitlement` (coach, capture, data-age) or `resolveStaffAccess` (staff/*), both resolve the session; login/logout/signout-all are auth endpoints |
| Org from request body | 1 | `org/switch`, validated against membership |
| IDOR (by-id fetch, service role, no org filter) | 0 found in tenant tables | students, finance, board, compliance by-id routes all carry `.eq("org_id", ctx.orgId)` |

Public endpoints and their protection:

| Endpoint | Protection |
|---|---|
| `api/cron/*` (12) | Bearer `CRON_SECRET`, fail closed |
| `stripe-webhook`, `webhooks/hubspot` | Signature verification |
| `google/calendar-webhook` | Per-channel token |
| `hub/v1/snapshot`, `ingest/tasks`, `mcp/[secret]` | Shared secret; resident org only (doc 04 exception) |
| `unsubscribe` | HMAC token |
| `t/o/[token]`, `t/c/[token]/[n]` | Random per-send token, constant response |
| `meet/*`, `meet/booking/[token]/*` | Booking token; rate limited |
| `ms/*`, `games/*` | Anonymous by design; room/session codes; service-role with no student identity |
| `board/*` | `getBoardContext()` (session + board roster) |
| `save-donation`, `send-receipt` | Weak (finding 13) |
| `career-match`, `shannon` | Rate limit on career-match only |
| forms (`quiz-submit`, `partner-waitlist`, `schools-inquiry`, `apply`, `coach-signup`, `ygb/*`, `demoday/signup`) | Resident org stamped server-side; 4 lack rate limits |

## 3. Roles and permissions

Production `role_permissions` (35 permissions):

| Module | owner | admin | staff | finance | board_viewer |
|---|---|---|---|---|---|
| Org settings, members, entitlements | manage | manage | no | no | no |
| Fundraising | rw | rw | rw | no | no |
| Comms (manage, send) | yes | yes | yes | no | no |
| Program / participants | rw | rw | rw | no | no |
| Ops / tasks | rw | rw | rw | no | no |
| Finance | rw | rw | read | rw | no |
| Compliance | rw | rw | read | read | no |
| Board | rw | rw | no | no | read |
| Metrics | admin | admin | rw | rw | read |
| Documents | admin | admin | rw | rw | board packet only |
| Staff | manage | manage | read | read | read |
| Reports | approve | approve | read | read | read |

Where enforcement lives:

| Layer | What it checks |
|---|---|
| Nav (`lib/admin/nav.ts:35`) | Entitlement only. No role filter: board_viewer sees Finance, Programs, Fundraising nav. |
| Pages | Org fence; no role check on 47 of 48 service-role page files (finding 3) |
| Session-client APIs | RLS `has_permission`, correct |
| Service-role APIs | Mostly org fence only (finding 2) |
| Reed tools | `hasPermission` per tool plus RLS (`lib/agents/reed/tools.ts:132,175`), correct |

So the matrix above is true for RLS, and false for roughly a third of the API and most server-rendered pages.

Persona mapping:

| Persona | Real role | Fit |
|---|---|---|
| ED / owner | owner (admin is identical) | Good |
| Development manager | staff | Too broad: also program write, ops write, finance read |
| Program manager | staff | Same role as development manager; indistinguishable |
| Ops / finance | finance | Finance-only: no ops, program or fundraising read. An ops person must be staff. |
| Board / limited | board_viewer | Good in RLS; leaks via findings 2, 3 |

Gap: two of five personas collapse into `staff`, and nothing records who owns a donor, program, or cohort. Assignment columns exist only on `ops_tasks.assigned_to_id`, `compliance_items.assigned_to_id`, `grant_requirements.owner_id`, `metric_definitions.owner_id`, meeting/calendar owners; none on constituents, opportunities, gifts, students, programs or cohorts. Role-based Today needs a responsibilities (assignment) concept layered on the existing permission roles, not new roles.

## 4. Sensitive data

| Data | Where it flows | Boundary |
|---|---|---|
| Teen quiz answers + name/email (`quiz_submissions`) | Anthropic (career-match), service-role reads, cross-tenant via finding 4 | None |
| Students (364 rows) | Service-role pages and routes; RLS `program.read` bypassed | Org fence only |
| ms_* game (452 sessions) | No student names by design; adult emails in ms_deliveries/ms_rooms, service-role only | Good; leak test covers anon/owner direct reads |
| Story consents | RLS `comms.manage` plus participant check | Good in RLS |
| Donors (constituents, gifts, hs_contacts) | Exports audited (`donors/export`, `gifts/export`); HubSpot mirror cross-tenant via finding 4 | Partial |
| Finance | Service-role pages and routes, no role check | Org fence only |
| Capture transcripts | Anthropic; purge function exists (`private.capture_purge_transcripts`) | No redaction |
| Logs | Mostly error messages; `lib/notifications/notify.ts:151` logs a staff email | Minor |
| Analytics | First-party `page_views`/`click_events` only; no third-party SDK found | Good |

Reed: tenant-separated (session client, `ctx.orgId` filters), permission-aware, per-org monthly cap plus fail-open global cap, writes go through drafts/proposals/suggestions approval routes. Capture: personal RLS on captures and cards, human confirm per card, AI cap applied, leak test covers tenant-two and board_viewer. Both are in better shape than the rest of the admin API.

## 5. Data correctness

| Area | State |
|---|---|
| Duplicates | Unique keys on fin_transactions dedup hash, donations stripe id, suppressions, external_refs (org-scoped). Constituents have no email uniqueness; dedupe is app-side. Cross-tenant unique keys (finding 15). |
| Partial saves | Finding 12. No RPC-wrapped transactions on merge/import/accept. |
| Audit | 161 of 231 admin writes audited; no DB triggers on sensitive tables; audit_log read gated `org.manage`, no update/delete grants on parent. |
| Import/export | Imports staged, fingerprinted, org-fenced, but committed by service role with no permission check (any member can import students). Exports audited, no permission check beyond RLS, no small-cell suppression. |
| Secrets | Fail closed for unsubscribe, token encryption, cron. Games token falls back to service-role key. |
| Org switching | Cookie validated on every read; fallback to oldest membership. Safe, but see finding 8. |

## 6. Safety nets

| Net | Covers | Misses |
|---|---|---|
| `rls-leak-test.sql` (283 assertions) | anon/non-member/tenant-two reads and writes on fundraising, programs, imports, capture, obligations (authenticated), metrics, work blocks, ms_*/cut_*/game_* direct reads, board packet, v_action_items invoker | Anything through the service role (findings 2 to 5); anon RPC execution (finding 1); multi-org union (finding 8); role checks for finance/staff beyond a few tables |
| Tenant-default ratchet | New `org_id` defaults | Stale 62-table baseline (finding 16) |
| `tests/tenant-isolation.test.ts` | Service-role reads on listed tenant tables must carry `org_id` | Allow-listed "global" tables, `program_partners`, RPCs, permission checks |
| `tests/service-role-writes.test.ts` | notify() is the only notifications insert | Other write-on-behalf paths |
| Migration ledger CI | DDL drift | Grant drift from Supabase defaults |

Missing entirely: a static check that every service-role write route calls `ctxHasPermission`, and an anon-grant check on SECURITY DEFINER functions (`get_advisors` lint 0028 could run in CI).

## Could not check (needs-runtime-access)

Supabase Auth settings (signups enabled, MFA factors, email rate limits), Anthropic ZDR status, live exploitation of finding 1 (not attempted: write), Vercel env (whether `GAMES_TOKEN_SECRET` is set), storage bucket policies beyond comms-media and staff-photos, backups. Note: a second Supabase project named "ambition angels" (`sfmlktoeveovujjurihn`) was created 2026-11-20 21:29 UTC and is not referenced in the repo; not inspected.
