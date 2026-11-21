# V4 Phase 0, Track 4: New-org onboarding and external-product readiness

Base: `main` 37472e56 (checkout HEAD dff62859 differs only by the brief file). Read-only code audit. No dev server, no production access. Tags: **V** = verified in code, **A** = assumption, **R** = needs runtime access.

## Headline

A new nonprofit cannot get into BloomOS today without **10 operator actions per org** (SQL and Google console work), plus **one more per additional user and per role change**. Before any pilot, **5 code defects** must be fixed, because a second tenant would send tax receipts as Ambition Angels, could push its donors into AA's HubSpot, and could edit AA's public teen games. Nothing in the UI creates an org, invites a user, or changes a role.

## Top findings

| # | Pri | Finding | Evidence | Tag |
|---|-----|---------|----------|-----|
| 1 | P0 | Every org's donor thank-you and tax receipt is sent **from "Ambition Angels <careers@mail.ambitionangels.org>"** and the receipt footer states **"Ambition Angels is a 501(c)(3)"**. Manual sends and the stewardship auto-send cron both do this. | `app/api/admin/acknowledgments/send/route.ts:114`; `lib/fundraising/stewardship.ts:76,216`; `lib/fundraising/receipt.ts:34-36,65,97` | V |
| 2 | P0 | Any member of any org, any role, can "Connect" HubSpot and turn on outbound sync. The gate `hubspotMeta()` reads *any* org's active row (no `org_id` filter) and the token is AA's env `HUBSPOT_ACCESS_TOKEN`. If AA has `sync_out` on, a new tenant's constituent, interaction and opportunity writes push into AA's HubSpot. | `app/api/admin/integrations/hubspot/route.ts:44-60`; `lib/hubspot/connection.ts:17-28`; callers e.g. `app/api/admin/constituents/route.ts:5`; UI unfenced at `app/admin/fundraising/settings/page.tsx:44-49` | V (exposure R) |
| 3 | P0 | Hourly Gmail-sync cron picks the org with `orgs ... limit(1)` and no order. AA's mailbox (env `GOOGLE_REFRESH_TOKEN`) can be attributed to whichever org Postgres returns, matching that org's constituents. | `app/api/cron/gmail-sync/route.ts:33-34`; `lib/fundraising/gmail-sync.ts:145-147`; `vercel.json` (`45 * * * *`) | V (exposure R) |
| 4 | P0 | AA teen-game and career-library admin APIs check only "is signed in". A board viewer at any tenant can approve game content or trigger Claude card generation, via service role. Pages are gated (`modules.content`), APIs are not. | `app/api/admin/careers/pool/route.ts:16-18`; same pattern in `careers/{review,daily,generate,card,queue}`, `ygb/*`, `demoday/*` | V |
| 5 | P0 | `fin_categories.id` is a **global text primary key** holding AA's category set. A second org cannot own `payroll.ceo` etc.; the YGB demo had to namespace ids (`ygb.payroll.program`). "Seed default rules" inserts rules pointing at AA-owned category ids. No UI creates categories. Finance is unusable for a new org without a migration. | `supabase/migrations/create_fin_schema.sql:44-45,263`; `supabase/seed/ygb_demo_tenant.sql:873`; `app/api/admin/finance/rules/seed/route.ts`; `lib/finance/default-rules.ts:1-3` | V |
| 6 | P1 | No user or role management anywhere. Invites are SQL rows in `org_email_allowlist`; the `invitations` table has zero writers. The login screen says "Ask your organization's admin for an invite" and the 403 message says "An owner can grant it in Settings". Neither is possible. | `supabase/migrations/create_membership_bootstrap.sql:9-62`; `app/admin/staff/_lib/read.ts:89` (only reader); `app/admin/_components/LoginScreen.tsx:193`; `lib/admin/errors.ts:50` | V |
| 7 | P1 | Every generic error toast in 109 files says **"tell Remi if it keeps happening"**. Capture says "Tell Remi." No support address, no in-app report path. | `lib/admin/errors.ts:56-57`; `app/admin/capture/_lib/captureApi.ts:84` | V |
| 8 | P1 | No org identity record. `orgs` has name, slug, settings jsonb only. No logo, address, EIN, timezone. EIN and address live as free text in `org_comms_settings.footer_text` and are not used by receipts. 27 lines hardcode `America/Los_Angeles`. | `supabase/migrations/create_bloomos_core.sql:11-18`; `comms_v2_phase1_tables.sql:89-96` | V |
| 9 | P1 | Strategy narrative shows **AA's stats ("3,500+ teens reached", "87% Title I")** as a new org's proof points until it sets its own. | `app/admin/strategic-plan/narrative/_components/MovementPlan.tsx:89-94,99` | V |
| 10 | P1 | Staged import API (`/api/admin/imports/*`) runs on service role with only a session check: no role permission and no per-entity module check. A board viewer can create students or constituents. | `app/api/admin/imports/route.ts:23-25,58`; `[id]/stage/route.ts:30-33`; `[id]/commit/route.ts:69` | V |
| 11 | P1 | No product analytics, no error reporting service, no feedback component. Public analytics explicitly skips `/admin`. The admin error boundary only `console.error`s a digest. | `package.json` (no Sentry/PostHog); `components/Analytics.tsx:54`; `app/admin/error.tsx:30`; `app/admin/_components/feedback/` holds only Toast and Confirm providers | V |
| 12 | P1 | Google OAuth: Calendar requests the full `calendar` scope while Settings copy says "Read-only". Comms uses `gmail.send`. Both are sensitive scopes, so an unverified app needs every pilot user added as a test user, with a warning screen. | `lib/google/oauth.ts:16`; `lib/comms/gmail-oauth.ts:17`; `app/admin/settings/page.tsx:149` | V (status R) |

## 1. The journey as it exists today

| Step | Status | How it works today | Evidence |
|------|--------|--------------------|----------|
| Org creation | **Operator** (SQL) | Insert into `orgs`. No route writes `orgs`. | grep: no `.from("orgs").insert/update` in `app/`, `lib/` (V) |
| First user invitation | **Operator** (SQL) | Insert `org_email_allowlist(email, org_id, role)`; `handle_new_user` trigger grants membership on first sign-up. Users who already exist need a manual membership backfill. | `create_membership_bootstrap.sql:21-62` (V) |
| Login, first access | Self-service once allowlisted | Magic link creates the user and the trigger grants membership. "No workspace yet" screen is good. Signup and email templates are Supabase console config. | `app/api/admin/login/route.ts:31-51`; `LoginScreen.tsx:185-195` (V); auth config (R) |
| Password reset | Self-service, good enough | Reset link from login and Settings → `/auth/callback` → `/admin/reset-password`. Does not reveal which emails exist. | `app/api/admin/account/password/reset-link/route.ts:21-49` (V) |
| Org identity (name, logo, address, EIN) | **Missing** / operator | Name and email domain by SQL only. Comms from-name and mailing address are editable in Comms settings, but only after Gmail is connected (PATCH 403s if the row is missing). | `app/api/admin/comms/settings/route.ts:77-87`; `connect-gmail/callback/route.ts:128` (V) |
| Terminology | Partial | Only "Staff" can be renamed in the UI. Student, cohort, program, session and stage need SQL. | `app/admin/staff/_components/StaffHeaderActions.tsx:33`; `app/api/admin/staff/terminology/route.ts` (V) |
| Modules and entitlements | **Operator** (SQL) | `org_entitlements` rows; reader defaults everything off. No admin UI. | `lib/admin/entitlements.ts:16-17,87-95` (V) |
| Invite staff, assign roles | **Operator** (SQL), recurring | Allowlist row per person, or `orgs.settings.email_domain` (grants everyone on the domain `staff`). Role changes and removals edit `memberships` by hand. Roles are global (`role_permissions`). | as above (V) |
| Participant stages | **Operator** | No writer. Without rows, the fallback is AA's career journey ("Exploring careers… through the app"). | `lib/admin/program/stages.ts:27-56` (V) |
| Custom fields | **Operator** | `custom_field_defs` has no writer route. | grep (V) |
| Pipeline stages | **Operator** for the first step | Stage editor exists but rejects any org without a `pipelines` row ("Unknown pipeline"); nothing creates one. The board falls back to a legacy funnel, so it works but cannot be customized. | `app/api/admin/pipeline-stages/route.ts:38-45`; `lib/fundraising/stages.ts:9-11` (V) |
| Ack templates | Self-service | CRUD routes exist. | `app/api/admin/fundraising/ack-templates/*` (V) |
| Stewardship rules | Missing (degrades) | No writer; empty rules mean every gift creates a task for the default steward. If the owner has no display name, that steward is the literal handle `"shannon"`. | `lib/fundraising/stewardship.ts:296`; `lib/fundraising/steward.ts:59` (V) |
| KPI and strategy | Self-service | Strategy setup wizard; metric catalog. Good enough. | `app/admin/strategic-plan/setup/` (V) |
| Finance categories and rules | **Broken** for org two | See finding 5. `fin_config` self-heals via the Config editor. | (V) |
| Import donors and gifts | Self-service, but limited | Two wizards, see section 6. | (V) |
| Import participants and rosters | Self-service | Staged wizard. | (V) |
| Import finance transactions | Self-service | Bank or QuickBooks CSV with preview and dedupe; no undo; no role check. | `app/api/admin/finance/import/route.ts:22-45` (V) |
| Google Calendar | Per user, self-service | OAuth into `connections`. Google verification and test users are console work. | `lib/google/connection.ts:1-12` (V), (R) |
| Gmail for Comms | Per org, self-service | OAuth sender per org in `connections`. Same verification gate. | `lib/comms/gmail-connection.ts:1-15` (V) |
| Gmail interaction sync | **AA-only env** | Single env refresh token; mis-attributed by the cron (finding 3). | (V) |
| HubSpot | **AA-only env**, unfenced in one place | Settings data-sources card is fenced; the Fundraising settings card is not (finding 2). | (V) |
| Stripe | AA-only | Public `/donate` only, written to the resident org. No per-org connection. | `lib/admin/orgs.ts:19-29` (V) |
| QuickBooks | CSV only | No OAuth; parsers for QBO exports. | `lib/finance/parsers.ts` (V) |
| Read AI; Meet (Zoom) | Not integrated; AA env | Read AI is only a comment (`lib/meetings/reed.ts:11`). `ZOOM_URL`, `MEET_HOST_EMAIL` are single env values. | `app/api/meet/book/route.ts:307` (V) |
| First meaningful task | Possible after seeding | Add a donor, record a gift, create a task all work. The gift's thank-you goes out as AA (finding 1). | (V) |
| Knowing what to do next | **Missing** | No setup checklist. Today has one empty state ("Define a program metric"). `/admin/howto` is static, not entitlement-aware, and describes Demo Day, YGB Camp and Ambition App. | `app/admin/today/page.tsx:150-153`; `app/admin/howto/page.tsx:80-105` (V) |

## 2. Operator actions: today, pilot-ready, self-service-ready

**Today, per new org: 10 setup actions + 1 per extra user + 1 per role change.**

| # | Action | Kind |
|---|--------|------|
| O1 | Insert `orgs` row (name, slug, optional `email_domain`) | SQL |
| O2 | Seed `org_entitlements` (about 15 keys) | SQL |
| O3 | Allowlist first owner | SQL |
| O4 | Seed `org_terminology` (student, cohort, program, session, stage) | SQL |
| O5 | Seed `participant_stages` (or accept AA's journey) | SQL |
| O6 | Seed `custom_field_defs` | SQL |
| O7 | Insert a `pipelines` row (and stages) | SQL |
| O8 | Create finance categories, today only possible with namespaced ids | SQL plus schema workaround |
| O9 | Add each pilot user as a Google OAuth test user (Calendar, Gmail sender) | Google console |
| O10 | Confirm Supabase Auth signup and email templates are generic and on (one-time global, re-check per pilot) | Supabase console (R) |
| per user | Allowlist row with role | SQL |
| per change | Edit or delete `memberships` row | SQL |

**One-time code before any external pilot (release blockers):** findings 1 to 5.

**Pilot-ready minimum** (limited, documented help):
1. Fix findings 1 to 5.
2. One idempotent provisioning script (or SQL function) that runs O1 to O8 from a short answers file, using generic starter templates (neutral participant stages, a default pipeline, a per-org finance category template). This turns 8 actions into 1.
3. Replace "tell Remi" with a configurable support address; correct the "owner can grant it in Settings" copy.
4. Generic fallback for strategy proof points (empty, not AA's).
5. Google: verification submitted, or a documented test-user process (O9 stays manual until verified).
6. A one-page operator runbook and the throwaway-org dry run the SafeSpace doc already prescribes (`docs/bloomos/safespace-onboarding.md` P2).

Result: **2 operator actions per org** (run script, add Google test users) plus SQL per user change.

**Self-service-ready minimum:**
1. Members screen: invite (writes the existing `invitations` / allowlist, gated by the existing `members.manage` permission), change role, remove.
2. Org profile: name, logo, legal address, EIN, timezone, fed into receipts, comms footer and letters.
3. Terminology editor for all keys; program setup editor (stages, custom fields).
4. Entitlements shown read-only (plan), billing later.
5. Setup checklist on Today: profile, invite team, connect Gmail, import donors, import roster, record first gift.
6. Gift import inside the staged wizard, with undo.
7. Per-org integration credentials (HubSpot token into `connections`), Google verification complete.
8. Org creation flow (signup or operator-issued link).
9. In-app feedback and error reporting (section 5).

## 3. Ambition Angels and founder leakage

Scope grepped: `app/admin`, `app/api/admin`, `lib/admin`, `lib/fundraising`, `lib/comms`, `lib/email`, `lib/agents`, `lib/ai`, `lib/meetings`, `lib/finance`.

| Pattern | Lines / files (incl. comments) | User-facing, non-comment |
|---------|-------------------------------|--------------------------|
| "Ambition Angels" | 26 / 19 | 9 |
| `ambitionangels.org` | 11 / 11 | 7 |
| "Remi" | 83 / 42 | 3 product strings + AA-only prompts |
| "Shannon" | 39 / 28 | 1 placeholder + 3 `"shannon"` fallbacks |
| AA stats (3,500+, 87%) | 11 / 6 | 3 (1 rendered as data) |
| Youth-program copy outside AA modules ("student", "cohort", "teen") | about 94 strings | terminology applied in only 11 files |
| Tables still carrying the AA `org_id` column default | 62 (ratchet baseline) | `supabase/tests/tenant-default-ratchet.sql:31-43` (live count R) |

Worst examples, in order:
1. Receipts and ack sender as AA, with AA's 501(c)(3) line (finding 1). `lib/email/operator.ts:78` also brands every tenant's operator email "BloomOS · Ambition Angels".
2. `lib/admin/errors.ts:56-57` "tell Remi", across 109 files.
3. `MovementPlan.tsx:89-94` AA stats as a new org's proof points.
4. `app/admin/intake/page.tsx:222` tells every program tenant to share "ambitionangels.org/apply", and `/api/apply` writes only to the resident org.
5. `app/admin/settings/page.tsx:228` CRM-interest mailto goes to `remi@ambitionangels.org`.
6. `lib/admin/program/stages.ts:27-46` default stages describe AA's career app.
7. `lib/google/gmail-read.ts:12` `STAFF_DOMAIN` defaults to `ambitionangels.org`; `lib/admin/orgs.ts:20` and `lib/audit.ts:41` resolve "resident" by AA slug.
8. Placeholders: `CaptureModal.tsx:405` ("Have Shannon send…"), `PlanControls.tsx:513`, `RoomMetaEditor.tsx:98` (AA stats).

Good enough: AI prompts. Every AA-voiced prompt (funder research, next move, next best action, briefing, prospect discovery, angle drafts, ack drafts) switches to a generic prompt for non-resident orgs via `getAgentOrgProfile().isResident` (e.g. `lib/agents/funder-research/prompt.ts:219`). AA-only page modules (ygb, demoday, site analytics, careers) are gated in their layouts. Their APIs are not (finding 4).

**Terminology** reaches nav labels and the students, cohorts, programs, attendance, imports, volunteers and donors-funders pages (11 files). It does not reach attendance-sheet empty states, coach pages, howto, Today, emails or AI prompts. Partial, as stated.

## 4. Settings: what an org admin can manage

| Can manage (UI) | Cannot (operator only or missing) |
|-----------------|-----------------------------------|
| Own display name, password, sign out everywhere, Calendar connect, working hours (`app/admin/settings/page.tsx`) | Org name, logo, address, EIN, timezone |
| See AI spend vs cap (cap is env `ORG_MONTHLY_AI_CAP_USD`, global) | Members, invites, roles. **No user/role management screen exists.** |
| Data sources card: CSV import link, recent runs | Entitlements and modules |
| Pipeline stages (only if a `pipelines` row was seeded) | Participant stages, custom fields |
| Ack templates; Comms identity, footer, daily cap, leadership copy (after Gmail connect) | Terminology other than "Staff" |
| Finance config (fiscal year, runway inputs), finance rules | Finance categories; stewardship rules |
| HubSpot connect toggles (should not be visible to non-AA, finding 2) | Integration credentials (all env) |

Settings is scattered across six places (`/admin/settings`, `fundraising/settings`, `.../stages`, `finance/config`, `finance/rules`, Comms tab). `/admin/settings` is personal ("Your BloomOS account and security"); only its data-sources card is org-level.

## 5. Support and learning loop

| Capability | State | Evidence |
|------------|-------|----------|
| Issue reporting | Missing. Only "tell Remi" copy. | `lib/admin/errors.ts:56` |
| Feedback component | Missing. `_components/feedback` is toast and confirm only. | V |
| Product analytics | Missing for admin. Public site analytics (`page_views`, `click_events`) skip `/admin` by design. | `components/Analytics.tsx:54`; `lib/analytics.ts:13` |
| Error reporting | Server logs only. Error boundary logs route and digest and shows the digest to the user. No Sentry or similar. | `app/admin/error.tsx:27-46` |
| Usage telemetry | Only AI spend (`ai_calls` ledger) and `audit_log`. Audit is useful for support but not for learning. | `app/admin/settings/page.tsx:74` |
| Privacy posture | Nothing collects admin behavior, so there is no exposure, and no signal. Any addition must exclude donor and minor PII from event payloads (record route, action, outcome, org id hash only). | A |

## 6. The two import wizards

| | `/admin/imports` (staged, spec #5) | `/admin/fundraising/import` (Epic M2) |
|---|---|---|
| Targets | Participants, constituents | Constituents **plus gifts** |
| Parsing | Server, tested engine (`lib/admin/imports/engine.ts`) | Hand-rolled client parser (`_components/ImportWizard.tsx:40`) |
| Mapping | Spine + the org's custom fields, auto-suggest | Fixed field list |
| Validation | `validateAndMerge` registry gate, per-row errors | Minimal (name or email, date shape) |
| Preview | Full staged preview with create, skip, invalid counts | First 5 mapped rows, client side |
| Dedupe | `external_refs` content hash, then email (and guardian email) | Email; gifts by (constituent, date, amount) |
| Provenance | `imports`, `import_rows`, `external_refs` | `source:'import'` tag only |
| Resume after crash | Yes | No (re-run relies on dedupe) |
| Undo or rollback | **No** | **No** |
| PII retention | `raw` nulled on completion (`commit/route.ts:193-195`) | Nothing stored |
| Caps | 2,000 rows, 2 MB | 5,000 rows |
| Authorization | Session check only, service role (finding 10) | Session client, RLS enforces `fundraising.write` |
| Extras | HubSpot runs listed | Per-year reconciliation report; stewardship status on imported gifts |

**Keep `/admin/imports`.** It is the safer architecture. Port the gift target, the reconciliation report and the stewardship status into it, add a role check and an "undo this import" that deletes rows created by one run (the `created_entity_id` stamps already make this possible), then retire `/admin/fundraising/import`. `lib/admin/v2routes.ts:171` already marks it for settings disposition.

## 7. Spec claims checked

| Claim | Verdict |
|-------|---------|
| SafeSpace doc: "Invitation flow → password" | Stale. No invitation flow; allowlist plus magic link is the real path. |
| SafeSpace P3: new org gets a default pipeline | Half true: board falls back; editor needs a seeded `pipelines` row. |
| Tenant-two Phase 10, current-org | Done: cookie-based switcher (`lib/admin/auth.ts:25-112`, `app/api/admin/org/switch`). |
| Tenant-two: about 45 tables with AA default | Now 62 in the ratchet baseline; 8 drop migrations landed. Live count R. |
| Settings data-sources spec | Shipped and fenced (`settings/page.tsx:177-238`, `hubspot/sync`, `data-age`). It missed the Fundraising settings HubSpot card. |
| Import layer E1 to E4, E6 | Shipped. Gifts out of scope, as specced. |
| Roadmap Ring 5 onboarding flow | Not started. |
