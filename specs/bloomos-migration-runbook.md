# BloomOS migration runbook — ambitionangels.org/admin → app.bloomos.org

Your step-by-step instructions. Every step says who does it (You = dashboard/SQL editor actions, CC = a Claude Code PR you review and merge), what exactly to do, how to verify it worked, and how to back out. Do them in order. Don't skip verifications: each one is the tripwire for the step before it.

Companion spec: `specs/bloomos-core-fence.md`. SQL appendices are at the bottom; you apply all SQL yourself through the Supabase dashboard SQL editor, per standing agreement.

---

## Phase A — app.bloomos.org serves BloomOS (target: 1 session + DNS wait)

### Step 1 — Attach the domain in Vercel (You, ~5 min)

1. Vercel dashboard → the **ambition-angels** project (the one serving ambitionangels.org, not bloomos-site) → Settings → Domains.
2. Add `app.bloomos.org`. Vercel will show "Invalid Configuration" until DNS exists; that's expected. Note the CNAME target it asks for (`cname.vercel-dns.com`).

Back-out: remove the domain from the project. Nothing else changes.

### Step 2 — DNS in Cloudflare (You, ~5 min + propagation)

1. Cloudflare dashboard → the **bloomos.org** zone → DNS → Records → Add record.
2. Type `CNAME`, name `app`, target `cname.vercel-dns.com`, proxy status **DNS only** (grey cloud, not orange). Vercel manages the cert; proxying adds nothing here and complicates issuance.
3. Save. Back in Vercel Domains, wait for the check to flip to valid and the certificate to issue (usually minutes, allow up to an hour).

Verify: `https://app.bloomos.org` loads over TLS with no cert warning. It will serve the AA marketing homepage for now. That's expected and is exactly what Step 4 fixes; don't share the URL yet.

Back-out: delete the DNS record.

### Step 3 — Supabase redirect allowlist (You, ~2 min)

1. Supabase dashboard → project `kzzdtibbwsucloaoqpqa` → Authentication → URL Configuration.
2. **Additional Redirect URLs**: add `https://app.bloomos.org/**`
3. **Site URL: do not change it.** It stays on the AA host until cutover (Step 14). The recon confirmed the code derives magic-link redirects from the request origin, so the allowlist entry is the only Supabase change needed now.

Verify: deferred to Step 5 (the magic-link round trip).

Back-out: remove the allowlist entry.

### Step 4 — The Phase A PR set (CC, you review and merge)

Paste the Phase A kickoff prompt from the spec (§11) into Claude Code. It produces three small PRs:

- A1: middleware host guard (app host: `/` → `/admin`, marketing paths 404; AA host: unchanged).
- A2: the one-line `order by created_at` fix in `getOrgContext()`.
- A3: explicit `org_id` on the task-ingest path (`lib/admin/ops/ingest.ts`), the unauthenticated write hole.

Review each against the recon report, merge one at a time, let each deploy before merging the next.

Verify after A1 deploys, on the live hosts:
- `app.bloomos.org/` redirects to `/admin` and shows the login screen.
- `app.bloomos.org/donate` does NOT show AA's donate page.
- `ambitionangels.org` homepage, `/admin`, `/demoday`, and `/strategy` all behave exactly as before.

Verify after A3: create a task through the ingest path (MCP or `/api/ingest/tasks`), then in the SQL editor:
```sql
select id, title, org_id, created_at from public.ops_tasks
order by created_at desc limit 3;
```
The new row's `org_id` must be `17c75da8-082d-4c8f-b00b-a4100fb2eb22`.

Back-out: revert the PR. The host guard is additive; reverting restores today's behavior on both hosts.

### Step 5 — Login smoke on the new host (You + Shannon, ~10 min)

1. Go to `https://app.bloomos.org/admin`. Sign in with your existing email and password. You should land in the Command Center. Nothing about your account changed; the fresh sign-in is just cookies being host-scoped.
2. Sign out, then request a **magic link**. Click it from the email. It must land back on `app.bloomos.org/admin`, signed in. If it lands on ambitionangels.org instead, Step 3's allowlist entry is wrong (check for typos, the `/**` matters).
3. Have Shannon do the same, both methods.
4. Poke five modules (fundraising, ops, finance, strategy, board): all data present, because it's the same database. Any missing data means you're somehow on the wrong deployment, stop and check Vercel.

### Step 6 — Sign in link on bloomos.org (CC in the bloomos-site repo, ~1 PR)

Header gets a "Sign in" link to `https://app.bloomos.org/admin`. One commit, matches the warm-ledger header pattern in site-spec.md.

**Phase A done. State: both hosts serve the admin, AA host untouched, two silent bugs fixed. You can stop here safely for as long as you want.**

---

## Phase B — the fence (target: ~4 PRs over a week)

### Step 7 — Entitlements: reader, gating, and the AA seed

1. CC builds B1 (`lib/admin/entitlements.ts`, sidebar `feature` keys, module-layout guards). Review, merge, deploy.
2. You apply **Appendix 1** (the AA entitlement seed) in the SQL editor. Order matters: deploy first, then seed. The reader defaults unknown keys to off, so seeding before the reader exists is harmless, but deploying a gate before seeding would blank your sidebar.
3. Verify:
   - Sidebar unchanged after seed (AA has everything on).
   - Flip one: `update public.org_entitlements set enabled=false where org_id='17c75da8-082d-4c8f-b00b-a4100fb2eb22' and feature_key='modules.partners';` → refresh → Partners gone from the sidebar AND `app.bloomos.org/admin/partners` shows the not-authorized panel (direct URL, not just nav absence).
   - Flip it back. Confirm restored. No deploys in between: that's the point.

### Step 8 — De-AA the shell (B2)

CC: login screen goes generic BloomOS ("Operating system for nonprofits" or just the wordmark; a shared host can't name a tenant before auth), `Greeting` and chrome read `ctx.orgName`, manifest description goes generic. Verify: grep the admin tree for "Ambition Angels" returns only org-derived render sites; the login screen at `app.bloomos.org` shows no AA identity; after sign-in the greeting still says Ambition Angels (from the orgs row).

### Step 9 — Terminology reader (B3)

CC builds the reader with `entity_types.display_name` fallback, proven on program nav labels first (prove on one, then fan out). `org_terminology` stays empty for AA, so nothing visibly changes. Verify by inserting one test row (`term_key='student'`, `label='Scholar'`), refreshing, seeing "Scholars" in the nav, then deleting the row.

### Step 10 — Origins (B4)

CC builds `lib/origins.ts` and routes the recon §4a link literals through `APP_ORIGIN`. You add the env var in Vercel (Settings → Environment Variables): `APP_ORIGIN=https://www.ambitionangels.org` for now (yes, the old host: email links keep pointing where people's PWAs and habits are until cutover). Verify: trigger one operator email (a booking or a report) and check its "Open BloomOS" link resolves and works.

---

## Phase C — hardening + the default drop (the careful one)

### Step 11 — Active-org cookie and switcher (C1)

CC builds it. To verify properly you need a second org, and you want a throwaway, not Safespace:

1. Apply **Appendix 2** (test org + your membership).
2. Sign in: you land in AA (oldest membership, deterministic). The switcher appears in the sidebar footer. Switch to "Fence Test": org name changes, data scope is empty (it's a new org). Switch back.
3. Clear the `bloom_active_org` cookie in devtools, refresh: you land in AA again.
4. Leave the test org in place; it's your canary for Step 13.

### Step 12 — Insert-path fixes (C2–C4, three PRs)

The recon §6 table is the checklist. Order:

1. **C2 finance**: the three `fin_config` writers move to org-scoped upserts, every `fin_*` write sets `org_id` from context. Merge and deploy, THEN apply **Appendix 3** (the fin_config restructure) immediately after, in a quiet window (not while an import or close is running). This ordering is load-bearing: the new code writes both shapes safely, the old code can't write the new shape.
2. **C3 fundraising cluster**: the six constituent-creation paths plus pledges, recurring, soft-credits, journeys, opportunities, appeals, campaigns, grants.
3. **C4 service-role misc**: board, compliance, meet/bookings, briefings, demoday-notes-adjacent admin routes, analytics stays defaulted (AA-site).

Verify after each PR: create one record through each touched route in a live session, then spot-check `org_id` in the SQL editor. Tedious and non-negotiable; this is the smoke that makes Step 13 safe.

### Step 13 — Drop the defaults (You, the big one)

Preflight, all three, in order:

1. C2–C4 deployed and smoked.
2. Run **Appendix 4a** (the audit query): it lists every remaining defaulted table. Expect exactly the 48 product tables; if a table you expected to see fixed still shows a default-riding insert path in the recon table, stop.
3. Do the full module smoke on the preview/live deploy: as yourself and as Shannon, create one of everything (constituent, gift, pledge, grant, task, project, board meeting, compliance item, booking, journey, campaign, appeal, budget row, import). Every row checked for `org_id`.

Then apply **Appendix 4b** (the 48 `DROP DEFAULT`s) in one transaction. It's instant (metadata-only, no table rewrite, no lock pain).

Post-check: run Appendix 4a again. Exactly 14 tables remain (the AA-site set). Then repeat a shortened smoke: one insert per module. Any missed path now fails loudly with `null value in column "org_id" violates not-null constraint`, which is a bug report, not a disaster: fix the path, no data was corrupted.

Back-out: **Appendix 4c** restores all 48 defaults in one statement set. Keep it open in a tab while you smoke.

**Phase C done. The multi-tenancy gate is open. Everything after this is building, not migrating.**

---

## Phase D–F pointers (each its own spec before build)

- **D. Participant spine + custom fields.** Spec #4. Safespace's shape is now known: student leaders, chapters across schools plus a hub, continuous membership likely. AA's 27 student rows and 1 cohort make the data migration trivial; the code references are the work.
- **E. Import layer.** `external_refs` + staged `imports`/`import_rows`, HubSpot refactored as connector #1 (retires `hs_*` from core). Blocked on knowing Safespace's current system: **ask them what they run today** (spreadsheet? Airtable? a CRM?).
- **F. Strategy builders.** Tenant-facing OGSM setup. AA's plan was seeded by SQL; no tenant can onboard to Strategy without this.

### Step 14 — Cutover (You, when ready; ≥2 weeks after Step 5)

1. Vercel: set `APP_ORIGIN=https://app.bloomos.org`, redeploy.
2. Supabase: Auth → URL Configuration → Site URL → `https://app.bloomos.org`.
3. CC: one PR adding the 308 from `ambitionangels.org/admin/:path*` → `app.bloomos.org/admin/:path*` (next.config redirect), plus a service-worker cache-version bump.
4. You and Shannon: uninstall the old PWA, install fresh from `app.bloomos.org/admin`.
5. One manual re-registration of the Google Calendar watch (the webhook URL Google holds is absolute; the renewal cron picks up `APP_ORIGIN`, but don't wait a week for it).
6. Verify: old bookmark redirects, magic link lands on the new host, one operator email's links point at app.bloomos.org, calendar sync still fires.

### Step 15 — Safespace seed (You, after D–F as needed)

Apply **Appendix 5** once their three blanks are filled (email domain, terminology labels, module set). Then send the first invitation through the invitations flow, which you'll have exercised once with a test account first (it has 0 rows ever; don't let Safespace be its first user).

---

## Appendix 1 — AA entitlement seed

```sql
-- Requires unique (org_id, feature_key); add if missing:
-- alter table public.org_entitlements add constraint org_entitlements_pkey_check unique (org_id, feature_key);
insert into public.org_entitlements (org_id, feature_key, enabled, source) values
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'modules.fundraising', true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'modules.finance',     true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'modules.program',     true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'modules.ops',         true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'modules.board',       true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'modules.compliance',  true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'modules.strategy',    true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'modules.staff',       true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'modules.reviews',     true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'modules.partners',    true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'modules.meetings',    true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'modules.comms',       true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'modules.messages',    true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'modules.documents',   true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'modules.metrics',     true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'ai.prospect_research',true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'aa.demoday',          true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'aa.ygb',              true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'aa.mesa',             true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'aa.quiz',             true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'aa.bv',               true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'aa.site_analytics',   true,  'seed:fence'),
  ('17c75da8-082d-4c8f-b00b-a4100fb2eb22', 'aa.hubspot_mirror',   true,  'seed:fence')
on conflict (org_id, feature_key) do update
  set enabled = excluded.enabled, source = excluded.source;
-- ai.reed and coaching already exist from seed:bloom_flourish.
```

## Appendix 2 — throwaway test org (for Step 11)

```sql
with new_org as (
  insert into public.orgs (name, slug, settings)
  values ('Fence Test', 'fence-test', '{}'::jsonb)
  returning id
)
insert into public.memberships (user_id, org_id, role)
select 'aa39cd02-b813-4e75-aa36-52adadf5d2fe', id, 'owner' from new_org;

-- Teardown when done (after Step 13):
-- delete from public.memberships where org_id = (select id from public.orgs where slug='fence-test');
-- delete from public.orgs where slug='fence-test';
```

## Appendix 3 — fin_config restructure (apply immediately after C2 deploys)

```sql
begin;
alter table public.fin_config add column if not exists org_id uuid references public.orgs(id);
update public.fin_config
  set org_id = '17c75da8-082d-4c8f-b00b-a4100fb2eb22'
  where org_id is null;
alter table public.fin_config alter column org_id set not null;

-- Verify the current PK name before running; expected fin_config_pkey:
-- select conname from pg_constraint where conrelid='public.fin_config'::regclass and contype='p';
alter table public.fin_config drop constraint fin_config_pkey;
alter table public.fin_config add primary key (org_id);
alter table public.fin_config drop column id;

-- RLS (table already has RLS enabled; policies re-stated to the org pattern):
drop policy if exists fin_config_read on public.fin_config;
drop policy if exists fin_config_write on public.fin_config;
create policy fin_config_read on public.fin_config
  for select using (public.has_permission(org_id, 'finance.read'));
create policy fin_config_write on public.fin_config
  for all using (public.has_permission(org_id, 'finance.write'))
  with check (public.has_permission(org_id, 'finance.write'));
commit;
```

## Appendix 4a — default audit query (run before and after 4b)

```sql
select table_name, column_default
from information_schema.columns
where table_schema = 'public'
  and column_name = 'org_id'
  and column_default is not null
order by table_name;
```

## Appendix 4b — drop the 48 product-table defaults

```sql
begin;
alter table public.acknowledgments        alter column org_id drop default;
alter table public.appeals                alter column org_id drop default;
alter table public.blackouts              alter column org_id drop default;
alter table public.board_meetings         alter column org_id drop default;
alter table public.board_members          alter column org_id drop default;
alter table public.bookings               alter column org_id drop default;
alter table public.briefings              alter column org_id drop default;
alter table public.campaigns              alter column org_id drop default;
alter table public.compliance_items      alter column org_id drop default;
alter table public.connection_candidates  alter column org_id drop default;
alter table public.connections            alter column org_id drop default;
alter table public.constituents           alter column org_id drop default;
alter table public.email_sends            alter column org_id drop default;
alter table public.fin_budget             alter column org_id drop default;
alter table public.fin_categories         alter column org_id drop default;
alter table public.fin_category_rules     alter column org_id drop default;
alter table public.fin_config             alter column org_id drop default;
alter table public.fin_imports            alter column org_id drop default;
alter table public.fin_revenue_commitments alter column org_id drop default;
alter table public.fin_transactions       alter column org_id drop default;
alter table public.fr_agent_activity_log  alter column org_id drop default;
alter table public.fr_email_drafts        alter column org_id drop default;
alter table public.fr_funding_opportunities alter column org_id drop default;
alter table public.fr_prospect_briefs     alter column org_id drop default;
alter table public.fr_prospect_scores     alter column org_id drop default;
alter table public.fr_touches             alter column org_id drop default;
alter table public.funder_angles          alter column org_id drop default;
alter table public.funds                  alter column org_id drop default;
alter table public.gifts                  alter column org_id drop default;
alter table public.grant_requirements     alter column org_id drop default;
alter table public.grants                 alter column org_id drop default;
alter table public.households             alter column org_id drop default;
alter table public.interactions           alter column org_id drop default;
alter table public.journey_enrollments    alter column org_id drop default;
alter table public.journey_steps          alter column org_id drop default;
alter table public.journeys               alter column org_id drop default;
alter table public.meeting_types          alter column org_id drop default;
alter table public.opportunities          alter column org_id drop default;
alter table public.ops_projects           alter column org_id drop default;
alter table public.ops_tasks              alter column org_id drop default;
alter table public.partner_contacts       alter column org_id drop default;
alter table public.partner_interactions   alter column org_id drop default;
alter table public.partners               alter column org_id drop default;
alter table public.pledge_payments        alter column org_id drop default;
alter table public.pledges                alter column org_id drop default;
alter table public.recurring_plans        alter column org_id drop default;
alter table public.relationships          alter column org_id drop default;
alter table public.soft_credits           alter column org_id drop default;
alter table public.strategy_angles        alter column org_id drop default;
alter table public.strategy_room_meta     alter column org_id drop default;
commit;
-- Remaining defaults (intentional, AA-site class, 14):
-- bv_newsletter_subscribers, bv_showcase_submissions, click_events,
-- page_views, demoday_notes, demoday_signups, donations, partner_waitlist,
-- quiz_submissions, hs_companies, hs_contacts, hs_deals, hs_engagements,
-- hs_sync_jobs
```

Note: that list is 50 lines because `strategy_angles` and `strategy_room_meta` are product (your call #1) and `fin_config`'s default drop rides here after Appendix 3 restructures it. Cross-check the final list against a fresh 4a run before applying; the source of truth is the live catalog, not this file.

## Appendix 4c — rollback (restore defaults)

```sql
-- Only if the post-drop smoke surfaces breakage you can't fix same-day.
-- Re-adds the default to every table listed in 4b:
do $$
declare t text;
begin
  foreach t in array array[
    'acknowledgments','appeals','blackouts','board_meetings','board_members',
    'bookings','briefings','campaigns','compliance_items','connection_candidates',
    'connections','constituents','email_sends','fin_budget','fin_categories',
    'fin_category_rules','fin_config','fin_imports','fin_revenue_commitments',
    'fin_transactions','fr_agent_activity_log','fr_email_drafts',
    'fr_funding_opportunities','fr_prospect_briefs','fr_prospect_scores',
    'fr_touches','funder_angles','funds','gifts','grant_requirements','grants',
    'households','interactions','journey_enrollments','journey_steps','journeys',
    'meeting_types','opportunities','ops_projects','ops_tasks','partner_contacts',
    'partner_interactions','partners','pledge_payments','pledges',
    'recurring_plans','relationships','soft_credits','strategy_angles',
    'strategy_room_meta'
  ] loop
    execute format(
      'alter table public.%I alter column org_id set default %L::uuid',
      t, '17c75da8-082d-4c8f-b00b-a4100fb2eb22');
  end loop;
end $$;
```

## Appendix 5 — Safespace seed (fill the three blanks first)

```sql
-- BLANKS: email_domain, terminology labels, staff emails/roles.
with new_org as (
  insert into public.orgs (name, slug, settings)
  values ('Safespace', 'safespace',
          jsonb_build_object('email_domain', '<safespace-domain.org>'))
  returning id
),
ents as (
  insert into public.org_entitlements (org_id, feature_key, enabled, source)
  select id, k, true, 'seed:safespace' from new_org,
    unnest(array[
      'modules.fundraising','modules.finance','modules.program','modules.ops',
      'modules.board','modules.compliance','modules.strategy','modules.meetings',
      'modules.comms','modules.messages','modules.documents','modules.metrics',
      'modules.partners'   -- schools as partners; confirm with them
      -- reviews off, ai.* off pending plan tier, no aa.* ever
    ]) as k
  returning org_id
),
terms as (
  insert into public.org_terminology (org_id, term_key, label)
  select distinct org_id, t.k, t.v from ents,
    (values ('student','Student leader'), ('cohort','Chapter')) as t(k, v)
  returning org_id
)
insert into public.org_email_allowlist (email, org_id, role)
select distinct '<first-staffer@safespace-domain.org>', org_id, 'owner'::org_role
from terms;
-- Then invite through the app's invitations flow, after exercising it
-- once with a test account (it has never been used: 0 rows).
```
