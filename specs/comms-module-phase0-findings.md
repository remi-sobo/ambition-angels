# Phase 0 recon findings — Comms module (story bank, editions, composer)

Read-only recon per `specs/comms-module.md` §13. No migrations run, no schema changed, no code
written. Live schema probed read-only against project `kzzdtibbwsucloaoqpqa`.
Date: 2026-08-19. Branch: `claude/comms-stories-editions-composer-2mn5w5`.

**Verdict up front: the architecture holds. The data model, the send-path reuse, the consent
object, and the tenant-genericity story all match what the code actually does. But the draft SQL
in §12 will not merge as written** — it breaks the repo's migration idempotency test, uses the
wrong `has_permission` schema for the house RLS pattern, and misses two required CI registrations.
There are also three real design gaps the spec doesn't yet cover: nav has no permission gate
(so DoD "board viewer sees no Comms nav item" can't be met without extending `lib/admin/nav.ts`),
the AI gateway/spend-ledger seam isn't referenced in §6.4, and the storage path prefix is
backwards relative to every other bucket in the system. Details in §11.

Nothing below contradicts the spec's *intent*. Nine of the ten items came back confirming the
spec's read of the code. The corrections are mechanical and each has a named fix.

---

## 1. `role_permissions` — shape, seeding, and whether the §12 insert is valid

**Table** (`supabase/migrations/create_bloomos_core.sql:48-52`):

```sql
create table if not exists role_permissions (
  role org_role not null,
  permission text not null,
  primary key (role, permission)
);
```

- `role` is the **`org_role` enum**, not text. Values: `owner`, `admin`, `staff`, `finance`,
  `board_viewer` (`create_bloomos_core.sql:21`).
- `permission` is free text. There is no check constraint and no vocabulary table — a new
  permission key is purely an inserted row.
- Primary key `(role, permission)`, so `on conflict do nothing` is correct and idempotent.

**Verdict on the §12 insert: valid.** `('staff','comms.manage')` casts the literal to `org_role`
cleanly, and `on conflict do nothing` matches the seed style used at `create_bloomos_core.sql:138`.
No column-name change is needed.

**Live seed (as of today), by role:**

| role | permissions |
| --- | --- |
| owner / admin | `board.read/write`, `comments.read/write`, `compliance.read/write`, `documents.admin/delete/read/write`, `finance.read/write`, `fundraising.read/write`, `members.manage`, `messages.read/write`, `metrics.admin/read/write`, `notifications.read/write`, `ops.read/write`, `org.manage`, `program.read/write`, `reports.read`, `staff.manage/read/write` |
| staff | same minus `org.manage`, `members.manage`, `board.*`, `documents.admin/delete`, `metrics.admin`, `staff.manage/write`, `compliance.write`, `finance.write` |
| finance | `compliance.read`, `documents.read/write`, `finance.read/write`, `messages.read/write`, `metrics.read/write`, `notifications.read/write`, `reports.read`, `staff.read` |
| board_viewer | `board.read`, `metrics.read`, `notifications.read`, `reports.read`, `staff.read` |

Two things worth noting for the build:

1. **The live seed has drifted ahead of `create_bloomos_core.sql`.** Domains `comments`,
   `documents`, `messages`, `metrics`, `notifications`, `staff` were all added by later
   migrations. The core migration is not the authority on the current permission set; the live
   table is. Read it before assuming.
2. **No `comms.*` key exists today.** Confirmed by inspection of the full live set. The module
   is starting from zero, exactly as the spec assumes.

**⚠️ Vocabulary divergence (spec §6.3).** Every permission in the system uses the verb set
`read` / `write` / `manage` / `admin` / `delete`. The spec introduces `comms.subjects.view` —
`.view` is a **new verb with no precedent**. It works technically (the column is free text), but
it breaks a consistent convention that has held across nine domains. See §11-D for the
recommendation.

**⚠️ Read/write asymmetry.** The spec gives `comms.manage` to owner/admin/staff and uses it for
*both* select and write in the same policy. Every other domain in the system splits read from
write (`fundraising.read` / `fundraising.write`). A single `comms.manage` key means there is no
way to grant read-only comms access to `finance` or a future role without also granting write.
Not a blocker for v1 (the spec explicitly says board viewers get no comms access), but it is a
one-way door on the seeding — adding `comms.read` later means revisiting every policy. Flagged,
not fixed.

## 2. `has_permission` — the two schemas, session org context, and the membership question

**Both functions exist and are one authority.**

`private.has_permission` (`create_bloomos_core.sql:71-82`) is the real implementation:

```sql
create or replace function private.has_permission(p_org uuid, p_perm text)
returns boolean
language sql security definer stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role = m.role
    where m.user_id = auth.uid()
      and m.org_id = p_org
      and rp.permission = p_perm
  );
$$;
```

`public.has_permission` (`create_reed_schema.sql:28-40`) is a thin RPC shim added for Reed,
because PostgREST cannot call `private.*`:

```sql
create or replace function public.has_permission(p_org uuid, p_perm text)
returns boolean language sql security definer stable set search_path = ''
as $$ select private.has_permission(p_org, p_perm); $$;
revoke all on function public.has_permission(uuid, text) from public;
grant execute on function public.has_permission(uuid, text) to authenticated;
revoke execute on function public.has_permission(uuid, text) from anon;
```

The spec's §3 claim ("`public.has_permission` delegating to `private.has_permission`") is **exactly
right**.

**⚠️ But RLS policies must use `private`, not `public`.** Every one of the ~30 policy definitions
in the repo uses the same form:

```sql
using ( (select private.has_permission(org_id, 'fundraising.read')) )
```

The `(select …)` wrapper is deliberate and load-bearing — it lets Postgres cache the result as an
InitPlan instead of re-evaluating per row (`create_bloomos_core.sql:54-56` documents this).
The §12 appendix writes `using (public.has_permission(org_id, 'comms.manage'))`: wrong schema,
and no `(select …)` wrapper. It will *work* but adds a function-call layer and loses InitPlan
caching on every row. Fix in §11-B.

The `public.` shim is the right call for **app-layer** checks. `lib/admin/permissions.ts:22`
calls it via `supabase.rpc("has_permission", …)` with the session client, and fails closed on
error. That is the pattern comms API routes should use for a clean 403.

**Session org context** — `getOrgContext()` in `lib/admin/auth.ts:97-109`:

1. Read the Supabase session user.
2. Read **all** their memberships, `.order("created_at", { ascending: true })`, with `orgs(name)`
   embedded (RLS on `memberships` proves membership).
3. Resolve the active org: `resolveActiveMembership(memberships, cookieOrgId)` at
   `lib/admin/auth.ts:83-91` — a cookie (`bloom_active_org`) naming an org the user belongs to
   wins; otherwise the **oldest** membership.
4. Return `{ userId, email, orgId, orgName, role }`, React-`cache`d per request.

**On the "nondeterministic membership" flag in the spec's recon prompt: it does not apply to
comms routes as written.** The resolution is deterministic — ordered by `created_at` ascending,
with an explicit cookie override, and the fallback rule is a pure function with its own test seam.
The only residual nondeterminism is a `created_at` tie between two memberships created in the same
transaction, which does not occur through the bootstrap trigger or the invite flow. Comms routes
should do what every other route does: `const ctx = await getOrgContext()` → `.eq("org_id",
ctx.orgId)` on **every** read. RLS alone would merge rows across every org the user belongs to;
pinning to the active org is the app's job. `app/admin/fundraising/comms/page.tsx:29-31` carries
that comment verbatim.

There is a second helper worth knowing: `ctxHasPermission(ctx, perm)`
(`lib/admin/auth.ts:141-150`) reads `role_permissions` directly through the session client. It
exists for **service-role** routes, which bypass RLS and must re-assert the gate in app code. Comms
should not need it (all writes go through the session client), but if any comms route reaches for
`getSupabaseAdmin()`, that check is mandatory.

## 3. Storage — buckets, path convention, and EXIF

**Buckets (live):** `bloomos-asks`, `bloomos-documents`, `bloomos-reports`, `bv-showcase-uploads`,
`staff-photos`. All five are `public = false`.

**No comms bucket exists.** A new one is needed for `story_media`.

**Buckets are NOT created in migrations.** `documents_schema.sql:17-23` explains why: the RLS
harness runs against a scratch Postgres where `storage.buckets` doesn't exist, so the bucket is
created by hand in the Supabase dashboard and only the commented `insert` is kept in the file.
`bloomos_staff_phase1.sql:176` is the exception (it does insert), which is one of the reasons that
file is excluded from the RLS harness (`scripts/test-rls.sh`, exclusion list). **Follow the
`documents_schema.sql` pattern: comment the bucket insert, create it in the dashboard.**

**Path convention — org id FIRST.** Documents:
`{org_id}/{document_id}/{safe_filename}` (`app/api/admin/documents/route.ts:92`). Staff photos use
the same shape, and the storage RLS policies key off it:

```sql
-- bloomos_staff_phase1.sql:197
(select private.has_permission(((storage.foldername(name))[1])::uuid, 'staff.write'))
```

`storage.foldername(name)[1]` is the **first** path segment, and it must be castable to the org
uuid. The spec's `comms/{org_id}/` prefix puts a literal string first, which makes that policy
form impossible without an index shift. **Use `{org_id}/{story_id}/{filename}` inside a
`comms-media` bucket.** Fix in §11-C.

**EXIF: nothing strips it today.** Grepped for `exif` across the whole tree — zero hits. The
documents upload route (`app/api/admin/documents/route.ts:93-…`) validates size, mime allowlist,
dates, and link target, then streams bytes to storage untouched. `image/png` and `image/jpeg` are
both in the allowlist (`lib/documents/config.ts:18-19`), so **the existing documents path already
accepts photos with GPS coordinates intact.** The spec's EXIF-strip requirement is new work with no
existing helper to reuse — budget for a dependency (`sharp` is not currently in `package.json`) or
a hand-rolled JPEG APP1-segment stripper. This is a real Phase 2 line item, not a checkbox.

**One more storage note for consent evidence.** The spec stores the signed release as a
`documents` row (`story_consents.evidence_document_id`). Two frictions in the existing upload
route: `doc_type` is validated against a fixed list (`lib/documents/config.ts:28-41`) that has no
`consent_release` entry, and `expires_at` is rejected unless it is in the future
(`app/api/admin/documents/route.ts:141-145`, `minExpirationISO`). Both are one-line additions, but
they are additions.

## 4. The send path — files, statuses, suppression

**Routes:**

| purpose | file |
| --- | --- |
| create draft | `app/api/admin/comms/route.ts` (POST) |
| update / delete draft | `app/api/admin/comms/[id]/route.ts` |
| test send | `app/api/admin/comms/[id]/test/route.ts` |
| send to segment | `app/api/admin/comms/[id]/send/route.ts` |
| org sending identity | `app/api/admin/comms/settings/route.ts` |
| UI | `app/admin/fundraising/comms/page.tsx` + `_components/CommsControls.tsx`, `_components/SettingsCard.tsx` |
| unsubscribe (public) | `app/api/unsubscribe/route.ts` |

**Statuses — exactly three.** `create_email_campaigns.sql:15`:

```sql
status text not null default 'draft' check (status in ('draft','sending','sent'))
```

Code agrees: create inserts `'draft'`; send claims with a conditional update to `'sending'`
(`send/route.ts:50-58`, the double-submit guard), then flips to `'sent'` with `sent_at`,
`sent_count`, `failed_count`. **There is no `scheduled`, `paused`, or `failed` campaign status.**
Edition compile must insert `status: 'draft'` and the edition's own status machine
(`planning → drafting → review → compiled → sent → archived`) stays entirely on
`comms_editions` — it must not try to mirror itself into `email_campaigns`.

**Compile's insert must supply**: `org_id` (explicit — see below), `name`, `subject`, `body`
(`.slice(0, 20000)` is the existing cap), `status: 'draft'`, `created_by`, and optionally
`segment_id`. `subject` and `name` are `not null`; the create route rejects an empty body. The
edition title maps to `name`; **the spec does not say where the email subject line comes from** —
that is an unresolved Phase 5 detail (recommendation: a `subject` column on `comms_editions`,
defaulting to the title).

**Suppression is enforced in one place**: `resolveRecipients()` in
`lib/fundraising/segments.ts:41-88`. It excludes, in order, constituents with `do_not_contact`,
addresses present in `email_suppressions` (case-folded), and rows with no email — returning
`{ recipients, excluded: { doNotContact, suppressed, noEmail } }`. Both the send route and the UI
preview call it. **Compile must not touch this.** It creates a draft and hands off; every
suppression guarantee comes free.

**Sending identity** is `loadOrgCommsSettings()` + `sendBlocker()` (`lib/comms/settings.ts`) —
refuses without a from address and a physical mailing address (CAN-SPAM floor). `footer_text` is
the field the spec's §6.5 "stitch with the org's footer" refers to; note that
`buildCampaignEmail()` (`lib/fundraising/comms-email.ts`) already appends the footer and mailing
address at send time. **Compile should NOT pre-stitch the footer into the body** or it will appear
twice. Spec §6.5 is wrong on this detail — see §11-F.

**Other send-path facts for Phase 5:** per-send recipient cap is 2000 (`CAP` in `send/route.ts`),
chunk size 25, personalization is `{{first_name}}` via `personalize()`, and the ledger is
`email_sends` upserted on `(campaign_id, email)`.

**org_id defaults on the send tables:** `email_campaigns` and `segments` had theirs dropped
(`comms_v2_phase1_default_drops.sql:14-15`) and the live probe confirms neither carries one now.
`email_sends` also carries none. So compile **must** pass `org_id` explicitly — which the existing
create route already does (`app/api/admin/comms/route.ts:22`).

## 5. Metrics — the resolver to reuse

**`getMetricCatalog()`** in `lib/admin/metrics/catalog.ts:42-82` is the helper the spec asks for.
It does exactly what the edition metrics slot needs, in one place:

- reads `metric_definitions` for the active org and `metric_snapshots` (newest first, capped at
  3000) in a single `Promise.all`,
- groups snapshots per metric, keeps up to 26 for sparks,
- returns `latest: { value, captured_on } | null` and a computed `stale: boolean` per metric,
- goes through the **session client** so `metrics.read` RLS applies (board_viewer included),
- is React-`cache`d, so the edition builder and any sibling read share one query.

Shape: `CatalogMetric` at `catalog.ts:16-36` — `id`, `metric_key`, `name`, `unit`, `direction`,
`cadence`, `target`, `baseline`, `latest`, `stale`, `history`.

**Staleness** is `isStale(lastCapturedOn, cadence)` in `lib/admin/metrics/staleness.ts:25-29`,
against `STALE_AFTER_DAYS = { daily: 2, weekly: 10, monthly: 40, quarterly: 100 }` (default 40).
There is a **drift guard**: that table is duplicated in SQL by `metrics_stale_queue_arm.sql` and
`tests/metrics.test.ts` asserts the two match. Do not add a comms-local staleness rule.

The spec's §7.4 "updated 47 days ago in ochre" should render from `latest.captured_on` + the
`stale` flag this helper already computes — not a new calculation.

**For the redaction boundary (§6.4 step 3):** resolving metric values server-side is trivial with
this helper — the composer picks `metric_ids`, `getMetricCatalog()` supplies name + latest value +
unit, and the prompt gets a rendered string. `metric_snapshots.id` is what
`comms_outputs.model_grounding` should record for audit (the snapshot, not the definition, is what
was actually sent).

## 6. `ops_tasks.linked_entity_type` — current accepted values

**Live constraint** (`pg_constraint`, `ops_tasks_linked_entity_type_check`):

```
partner, constituent, opportunity, volunteer, milestone, student, cohort,
application, program, grant, document, metric, fr_prospects, board_member,
board_meeting, compliance_item
```

Last widened by `board_compliance_profiles.sql:84-96`. The convention is
`drop constraint if exists` → `add constraint` with the **full** list; three migrations have done
this (`ack_v2_5_entity_vocab.sql`, `program_spine_schema.sql`, `board_compliance_profiles.sql`),
so a fourth adding `story` and `comms_edition` is routine.

**Two coupled registries, not one.** Adding a linkable type means touching both:

1. the check constraint above, and
2. `public.entity_types` (`spine_entity_registry.sql`), which `lib/admin/entities.ts` reads to
   resolve a `(type, id)` reference to a label, deep link, module, and icon. Columns:
   `entity_type, display_name, module, route_pattern, icon`. Current rows include `campaign`,
   `gift`, `message_thread`, `ops_task`, `ops_project`, `pledge` — **note `message_thread` is in
   `entity_types` but NOT in the `ops_tasks` constraint**, which is the exact drift
   `lib/admin/entities.ts:23-26` warns about (unknown types render as an unlinked chip).

`document_links.entity_type` is a **real FK** into `entity_types`, so if comms wants documents
attached to a story (beyond the direct `evidence_document_id` FK), the registry row is mandatory,
not optional.

Suggested rows when tasks get wired: `('story','Story','comms','/admin/comms/stories/{id}','book-open')`
and `('comms_edition','Edition','comms','/admin/comms/editions/{id}','newspaper')`. Note the module
value `comms` is new to the registry too.

## 7. `plan_goals` — is the nullable FK safe?

**Yes.** `create_kpis_and_plan.sql:36-47`:

```sql
create table if not exists plan_goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id),
  title text not null, description text, target_date date,
  status text not null default 'on_track' check (status in ('on_track','at_risk','behind','done')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

`id` is a plain `uuid` primary key. Live columns confirm later additions (`objective_id`, `owner`,
`status_override`, `status_override_reason`) — none affect the FK.

**Two cautions, both manageable:**

1. **`plan_goals.org_id` has no default** (dropped in `bloomos_strategy_phase1b.sql:17`), which is
   correct and matches the comms tables. But the FK from `stories` is **not** org-scoped —
   Postgres will happily let a story in org A point at a goal in org B. RLS hides the goal from
   reads, so nothing leaks, but the row is still wrong. The API layer must verify the goal belongs
   to `ctx.orgId` before writing (the same check
   `app/api/admin/documents/route.ts:155-165` does for link targets). Worth a line in §6.1.
2. **Goals get deleted wholesale on OGSM reseeds.** `2027_ogsm_v3_phase2_seed.MANUAL.sql:53`
   runs `delete from plan_goals where org_id = '…'`. With the spec's plain
   `references plan_goals(id)` (no `on delete` clause), that delete would **fail** on any story
   linked to a goal — blocking a routine annual reseed. Add `on delete set null`. Fix in §11-E.

## 8. The sidebar — where nav lives, and the gating gap

**Config**: `lib/admin/nav.ts`. `NAV_SECTIONS` (line 68) is the single source of truth; two
surfaces render it — `app/admin/_components/Sidebar.tsx` and
`app/admin/_components/SectionSubNav.tsx`. Sections today: Command Center, Operations, Fundraising,
Program, Finance, Data, Governance.

Adding a top-level Comms section is a literal array entry:

```ts
{
  label: "Comms",
  items: [
    { label: "Stories",  icon: …, href: "/admin/comms",           feature: "modules.comms" },
    { label: "Editions", icon: …, href: "/admin/comms/editions",  feature: "modules.comms" },
    { label: "Settings", icon: …, href: "/admin/comms/settings",  feature: "modules.comms" },
  ],
}
```

Note `IconName` (line 22) is a closed union — a new icon name is a compile error until added there
*and* to the Sidebar's icon map.

**`modules.comms` already exists** as a `FEATURE_KEYS` entry (`lib/admin/entitlements.ts:41`) and
is already seeded for the YGB demo tenant (`supabase/seed/ygb_demo_tenant.sql:39`). Nothing to
create.

**Route gating** is a per-module `layout.tsx` wrapping children in `<FeatureGate>` — e.g.
`app/admin/documents/layout.tsx`. Comms needs the same at `app/admin/comms/layout.tsx`. The
comment there is worth quoting because it states the rule: *"Direct URL hits are covered here —
sidebar hiding alone is cosmetic."*

**⚠️ THE GAP: nav gating is entitlement-only. There is no permission/role gate.**
`visibleSections(features)` (`lib/admin/nav.ts:279-286`) filters solely on `FeatureKey`. `NavItem`
has no `perm` field. Grepping `board_viewer` across `app/` and `lib/` turns up only display
labels, an assignee filter, and comments — **no nav filtering by role anywhere.**

So DoD item *"Board viewer role sees no Comms nav item"* **cannot be met by configuration.** It
requires extending the nav model. Fix in §11-A. (The second half — "gets 403 on comms routes" —
is met for free: `board_viewer` will hold no `comms.manage`, so RLS returns zero rows and the API
403s on an explicit `hasPermission` check.)

**On the spec's §7 visual language:** it reads as a contradiction against the code (existing admin
pages use `bg-ink`, `text-ink-2`, `bg-tile`) but it is **not**. Inside `.admin-shell`,
`--c-ink` is redefined to `245 239 226` = `#F5EFE2` (`app/globals.css:59`), so `bg-ink` *is* the
cream workspace and `navy` *is* the espresso sidebar. Spec §7 and the code agree. No action.

## 9. `org_id` default audit — the live list

Re-ran the `pg_attrdef` join. **Exactly 13 tables**, all defaulting to
`'17c75da8-082d-4c8f-b00b-a4100fb2eb22'::uuid`:

```
bv_newsletter_subscribers   bv_showcase_submissions   click_events
demoday_notes               demoday_signups           hs_companies
hs_contacts                 hs_deals                  hs_engagements
hs_sync_jobs                page_views                partner_waitlist
quiz_submissions
```

**The spec's count is exactly right, and `bv_newsletter_subscribers` is on it.** The §12
Migration 1a drop is valid and needed.

**There is already a CI ratchet enforcing this.** `supabase/tests/tenant-default-ratchet.sql` holds
a frozen baseline of tables allowed to carry an org_id default and fails the build if a **new** one
appears:

> *"New tenant table(s) with a hardcoded org_id default: %. … Add the column with org_id NOT NULL
> and NO default, or update the baseline in this file deliberately."*

Two consequences for build day:

- Any new comms table with a default fails CI automatically. Good — the trap is already guarded.
- Dropping `bv_newsletter_subscribers`'s default keeps the live set a **subset** of the baseline,
  so the ratchet still passes with no edit. The baseline array does not need touching (it is
  house style to add a dated comment noting the removal — see the existing 2026-07 comments).

## 10. `audit_log` — the pattern for consent grant/revoke

**Writer**: `audit()` in `lib/audit.ts:54-…`. Signature:

```ts
await audit(req, {
  action: "fundraising.campaign_email.send",   // dotted domain.entity.verb
  entityType: "email_campaigns",
  entityId: campaign.id,                       // MUST be a uuid (column type)
  after: { recipients, sent, failed, excluded },
});
```

Key properties:

- Goes through the **service-role** client (the table is append-only for app roles).
- **Never throws** — every error is swallowed and console-logged. "Auditing must never break the
  audited request."
- Attributes to `getOrgContext()` by default; falls back to the resident org only for
  session-less events (failed logins).
- `entityId` must be a uuid — non-uuid identifiers go in `after`.
- Naming convention is documented at `lib/audit.ts:20-22`: `domain.entity.verb`, verbs aligned
  with create/update/delete/export.

**Recommended comms actions**, following that convention:

```
comms.story.create           comms.story.update        comms.story.approve
comms.consent.request        comms.consent.grant       comms.consent.revoke
comms.output.draft           comms.edition.compile
```

`comms.consent.grant` / `comms.consent.revoke` are the ones that matter — the spec's §10
"Revocation after send" mitigation says *"the audit log records who revoked and when."* That comes
free from `audit()` with `entityType: "story_consents"`, `entityId: consent.id`, and
`before`/`after` carrying the `revoked_at` transition. **Note the reads:** existing comms routes
audit writes only, and `audit()` is called *after* the mutation succeeds. Follow that ordering.

---

## 11. Spec assumptions the code contradicts

Nine of ten recon items confirmed the spec. These are the corrections, most severe first. Each is
mechanical; none changes the architecture.

### A. DoD "board viewer sees no Comms nav item" is not achievable as specced — **blocking for §9**

`lib/admin/nav.ts` gates on entitlements only. `NavItem` has no permission field and
`visibleSections()` takes only `features`. There is no role-based nav filtering anywhere in the
codebase.

**Fix (Phase 1 or 2, small):** add an optional `perm?: string` to `NavItem` / `SectionTab`, thread
the caller's permission set (or role) into `visibleSections()` from the admin layout, and filter on
it alongside `allowed()`. Set `perm: "comms.manage"` on the three Comms entries. This is a
generally useful addition — every future permission-gated section needs it — but it is **new work
the spec does not budget for**, and it touches a shared file two surfaces render.

Alternative if that's too invasive for v1: accept that `board_viewer` sees a Comms nav item that
leads to a not-authorized panel, and amend the DoD. Not recommended — a dead nav item is exactly
the kind of thing a demo lands on.

### B. §12 SQL will fail CI as written — **blocking for Phase 1**

Three independent failures:

1. **Idempotency.** `tests/migrations.test.ts` asserts *every* `create table` and `create index`
   in `supabase/migrations/` uses `if not exists`, per-file, and it runs in the main CI workflow.
   The §12 appendix uses bare `create table public.stories (…)` and
   `create index stories_org_rank_idx …` throughout. **Every one of them must become
   `create table if not exists` / `create index if not exists`.** Same for migrations 2–4.
   (`create or replace view` in migration 2 is already fine.)
2. **`create policy` is not idempotent either.** Not caught by the test, but the whole point of the
   convention is that re-applying the folder is safe. House pattern is
   `drop policy if exists "…" on …;` before each `create policy`. Follow it.
3. **RLS uses the wrong schema.** Change every
   `using (public.has_permission(org_id, 'comms.manage'))` to
   `using ( (select private.has_permission(org_id, 'comms.manage')) )` — matching all ~30 existing
   policies, and keeping InitPlan caching. Add `to authenticated` on selects, as the house
   policies do.

Also: **new migrations must be appended to the `ordered=(…)` array in `scripts/test-rls.sh`.** The
script has an explicit guard that fails the build for any `.sql` file on disk that isn't in the
list. That is a required step, not a nicety, and it is easy to forget.

And: the §12 tables have no `updated_at` trigger. The house pattern is
`create trigger <t>_set_updated_at before update on <t> for each row execute function set_updated_at();`
(with `drop trigger if exists` first). Without it, `updated_at` never advances past insert.

### C. Storage path prefix is backwards — **fix before Phase 2**

Spec §6.1 says `comms/{org_id}/`. Every bucket in the system puts the org id **first**
(`{org_id}/{entity_id}/{filename}`) because storage RLS policies cast
`(storage.foldername(name))[1]` to the org uuid (`bloomos_staff_phase1.sql:197`). A literal
`comms/` first segment makes that policy form impossible.

**Fix:** bucket `comms-media`, path `{org_id}/{story_id}/{filename}`. The bucket name carries the
namespace; the path carries the tenant.

### D. `comms.subjects.view` breaks the permission verb convention — **decide before Phase 1**

Every existing key uses `read` / `write` / `manage` / `admin` / `delete`. `.view` is novel.
Permission strings are baked into RLS policy bodies, so renaming later means a migration touching
every comms policy.

**Recommendation: `comms.subjects.read`.** Same semantics, matches nine domains of precedent,
zero cost to change now. Remi's call — flagging it rather than adapting, per stop-on-conflict.

### E. `stories.strategic_goal_id` FK will block OGSM reseeds — **fix in Migration 1**

`references public.plan_goals(id)` with no `on delete` clause means `restrict`. The annual OGSM
reseed does `delete from plan_goals where org_id = …`
(`2027_ogsm_v3_phase2_seed.MANUAL.sql:53`), which would fail against any linked story.

**Fix:** `references public.plan_goals(id) on delete set null`. The link is decorative (it feeds a
15-point suggestion bonus); losing it on a reseed is correct behavior.

Second, smaller: the FK is not org-scoped, so the API must verify the goal belongs to `ctx.orgId`
before writing. Same guard as `app/api/admin/documents/route.ts:155-165`.

### F. §6.5 double-appends the footer — **fix in Phase 5**

Spec §6.5: compile *"stitches slots in format order with the org's footer from
`org_comms_settings`."* But `buildCampaignEmail()` (`lib/fundraising/comms-email.ts`, called per
recipient in the send route) **already appends** `footer_text` and the mailing address at send
time. Compiling the footer into the body means every edition ships with it twice.

**Fix:** compile stitches slot content only. The footer stays the sender's job. This is the
"one sender" principle working correctly — the spec just describes the seam one layer too high.

### G. Composer must ride the AI gateway, not a bespoke client — **Phase 3, additive**

§6.4 describes `redactStoryForModel` and the tier gate but never mentions the existing AI seam.
The codebase has one:

- `lib/ai/gateway.ts` — `generateText()`, with `MODEL_BY_TIER = { fast: "claude-sonnet-4-6",
  deep: "claude-opus-4-8" }`, ephemeral system-prompt caching, a shared voice sweep, and usage +
  `costUsd` returned.
- `lib/ai/ledger.ts` — `logAICall()`, one append-only `ai_calls` row per model call, per org,
  fire-and-forget.
- `lib/ai/cap.ts` — `orgOverAICap()`, the global per-org monthly backstop (fail-open).
- `requireEntitlement("ai.reed")` (`lib/admin/entitlements.ts:112-120`) — returns 401/402 with the
  upsell boundary already encoded. This is the tier gate §6.4 asks for; no new mechanism needed.

The composer should call `generateText({ tier: "fast", … })`, log to the ledger with
`surface: "comms_composer"`, and check the cap. Redaction stays comms-owned and sits *in front of*
the gateway. Worth writing into §6.4 so Phase 3 doesn't reinvent it.

### H. Minor, non-blocking

- **"Plain text" is half true.** The spec repeatedly says the sender stays plain text. The *body*
  is plain text with `{{first_name}}` — correct — but `buildCampaignEmail()` wraps it in a
  "light branded HTML shell" and sends both `html` and `text` parts
  (`lib/fundraising/comms-email.ts:39-52`). So a compiled edition already goes out as a
  reasonable-looking HTML email, not a bare text blob. That is good news for the newsletter
  promise and it does not change the Out-of-scope call on MJML/templating — but §5 and §6.5 read
  as more austere than reality, and someone will be surprised by the first send otherwise.
- **`comms_editions` has no email subject field.** §6.5 maps the edition title to
  `email_campaigns.name`, but `subject` is also `not null` and is what recipients see. Add
  `subject text` to `comms_editions` (defaulting to the title in the UI), or decide at Phase 5.
- **`documents` needs a `consent_release` doc type** and an exemption from the future-only
  `expires_at` rule, if consent evidence uploads reuse the documents route (both one-line changes
  in `lib/documents/config.ts` / the upload route).
- **`comms.manage` conflates read and write** where every other domain splits them (§1). One-way
  door on seeding; flagged, not fixed.
- **`story_media` bucket must be created in the dashboard**, with the bucket `insert` left
  commented in the migration — the RLS harness has no `storage` schema.

---

## 12. What Phase 1 needs, concretely

Not part of the recon, but the corrections above imply a precise Phase 1 checklist. Recording it
so the next session doesn't re-derive it:

1. `supabase/migrations/comms_phase1_story_schema.sql` — four tables, all
   `create table if not exists`, all indexes `if not exists`, all policies
   `drop policy if exists` → `create policy … to authenticated using ( (select
   private.has_permission(…)) )`, `set_updated_at` triggers on `stories`, the two permission-key
   inserts, `alter table public.bv_newsletter_subscribers alter column org_id drop default;`,
   `strategic_goal_id … on delete set null`.
2. Append that filename to `ordered=(…)` in `scripts/test-rls.sh`.
3. Add comms assertions to `supabase/tests/rls-leak-test.sql` — a staff session reads stories,
   a staff session reads **zero** participant `story_subjects` rows, `board_viewer`/stranger/anon
   read zero of everything.
4. API routes under `app/api/admin/comms/stories/*` — session client, `ctx.orgId` pinned on every
   read, `hasPermission()` for clean 403s, `audit()` after each mutation.
5. `app/admin/comms/layout.tsx` with `<FeatureGate feature="modules.comms" label="Comms">`.
6. The `NavItem.perm` extension (§11-A) — or an explicit decision to defer it and amend the DoD.

Migrations are applied by hand in the Supabase dashboard; nothing in this repo runs them against
production.
