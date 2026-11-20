# Spec: BloomOS company profiles

**Status:** v1.1, approved by Remi 2026-11-20 with the recommended answer to every open decision. Stage 1 in build.
**Findings:** `specs/bloomos-companies-phase0-findings.md`
**Brief:** handoff of 2026-11-20 (company intake and profiles)

---

## Problem statement

Company information lives in three places that do not link to each other:

1. Company inquiries from /companies land in `partner_waitlist`.
2. Coach sign-ups from /coach land in `coach_people`, with the company as typed text.
3. Grants, gifts and asks live in Fundraising, on `constituents`.

No screen shows one company's money, people and activity together. The first corporate partner already has
records in several of these places and no single view.

## Who's affected

- **Remi and Shannon**, who manage corporate relationships and need one place to see where each stands.
- **Whoever answers a company inquiry**, who today finds out about it from an email and nothing else.
- **Company contacts**, indirectly: the year-end report promised on /companies depends on this data.

## Current behavior

See the findings doc. In short: organization constituents already hold the money and already have a detail
page (Donor 360). They have no stage, no domain, no link to inquiries or coaches, and no record of which
introships a company's people built.

## Desired behavior

One company profile under `/admin/fundraising` that shows, for one company:

- **Money:** grants, gifts, pledges and open asks.
- **People:** contacts, session volunteers, and coaches.
- **Activity:** sessions run, and introships built from that company's people.
- **Stage and next step.**

Intake attaches itself: a /companies inquiry or a /coach sign-up shows up against the right company once
a staff member confirms the match.

---

## Decisions in this spec

| # | Decision | Why |
|---|---|---|
| D1 | A company is a `constituents` row with `type = 'organization'`. No company table. | The money and the detail page already key on it. Findings, section 1. |
| D2 | An organization becomes a "company" when staff set its stage. `company_stage is null` means not tracked. | 1,083 organizations exist and most are foundations. One field answers "which" and "where". |
| D3 | The profile is a view of Donor 360, not a second page. | `specs/bloomos-v2-spec-fundraising.md` decided on one detail page. |
| D4 | Nothing attaches automatically. Every intake link is confirmed by a person. | The brief: never auto-merge on a fuzzy name. At today's volume (one inquiry, two coaches) a click costs nothing. |
| D5 | `partners` rows stay where they are. A company profile reads a linked `partners` row through `partners.constituent_id`. | Findings, section 3, option A. |
| D6 | Stage is set by a person. It is never derived or advanced by code. | Same rule as career card approval: a human click. A derived stage would be wrong the first time a deal happens off the books. |

---

## Scope

**In:**

- Company stage and domains on organization constituents
- A Companies list and a company view of the constituent detail page
- Links from `partner_waitlist` and `coach_people` to a company, with a confirm step
- Employer links between people and a company
- Introship credits

**Out (unchanged from the brief):**

- Automated outreach emails
- HubSpot write-back
- A public per-company report page
- The year-end report itself. This spec builds the data it needs (introship credits). The report is its
  own spec, because student usage data does not live in this database.
- Moving company rows out of `partners`

---

## Data model

All additive. Every statement idempotent.

### 1. `constituents`: two columns

```sql
alter table public.constituents add column if not exists company_stage text;
alter table public.constituents add column if not exists domains text[] not null default '{}';
-- check: company_stage is null or in the seven keys below
-- check: company_stage is null or type = 'organization'
create index if not exists constituents_company_stage_idx
  on public.constituents (org_id, company_stage) where company_stage is not null;
create index if not exists constituents_domains_idx on public.constituents using gin (domains);
```

Stage keys and labels, in order:

| Key | Label |
|---|---|
| `identified` | Identified |
| `engaged` | Engaged |
| `qualified` | Qualified |
| `opportunity` | Opportunity |
| `committed` | Committed |
| `active_partner` | Active Partner |
| `renewal` | Renewal |

Keys and labels live in one module, `lib/fundraising/company-stages.ts`. The labels can be relabeled per
org later through `org_terminology` if a second tenant wants different words. Not in v1.

`domains` holds lowercase bare domains (`example.com`). Staff edit it on the profile. Stage 1 offers to
prefill it from `hs_companies.domain` when the constituent has a `hubspot_company` external id. A person
accepts the prefill; it is not written silently.

**Next step is not a column.** The profile shows the earliest open task linked to the constituent, using
the entity task link that Donor 360 already renders (`EntityTasks`). One source of truth for what is owed.

### 2. `partner_waitlist` and `coach_people`: two columns each

```sql
alter table public.partner_waitlist
  add column if not exists company_constituent_id uuid references public.constituents(id) on delete set null,
  add column if not exists company_suggested_id  uuid references public.constituents(id) on delete set null;
-- same two columns on public.coach_people
```

- `company_constituent_id`: the confirmed company. Set only by a staff action.
- `company_suggested_id`: the matcher's guess, shown as a suggestion. Cleared on confirm or dismiss.

A row with neither is "unmatched". All three states are visible in the inbox (Screens, 3).

### 3. People at a company: reuse `relationships`

A contact, a session volunteer or a coach's person record links to the company with
`relationships (a_id = person, b_id = company, kind = 'employer')`. Session volunteers are person
constituents with `is_volunteer = true`. No schema change. Stage 2 adds the first writer for this table.

Open item 1 in the findings (what the 107 existing rows contain) is checked before this ships.

### 4. `introship_credits`: the one new table

```sql
create table if not exists public.introship_credits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id),
  constituent_id uuid not null references public.constituents(id) on delete cascade,  -- the company
  person_constituent_id uuid references public.constituents(id) on delete set null,   -- whose story
  introship_slug text not null,
  credited_on date,
  created_at timestamptz not null default now(),
  unique (org_id, constituent_id, introship_slug, person_constituent_id)
);
```

`introship_slug` matches `lib/internships.ts`. Introships that have no public page yet can still be
credited by slug; the UI offers the known slugs and accepts a typed one.

### 5. Sessions run

A session is an `interactions` row on the company with `kind = 'event'`. No new table. The profile counts
them. If sessions later need attendees and a structured date, that is a follow-up.

---

## Matching rule (intake)

Runs when an inquiry or coach sign-up is saved, and again on demand from the inbox.

1. Take the email's domain, lowercased.
2. If the domain is a free-mail domain (gmail.com, outlook.com, yahoo.com, icloud.com and the like, one
   list in `lib/fundraising/company-match.ts`), stop. The row is unmatched.
3. Find organization constituents in the same `org_id` whose `domains` contains it.
4. Exactly one hit: write `company_suggested_id`. Zero or several: leave it null.
5. **The typed company name is never used to attach anything.** In the inbox it is used only to rank the
   search results a person picks from.

A person then does one of three things: confirm the suggestion, pick a different company, or create one.
"Create" makes an organization constituent at stage `identified`, with the email's domain in `domains`
(unless free-mail) and the typed company name as `org_name`, both editable before saving.

The matcher never fails intake. If it throws, the public form still succeeds and the row is unmatched.

The brief says an unmatched inquiry "creates one at stage Identified". This spec makes that a one-click
staff action instead of an automatic insert (D4), because a public form that creates constituents is a
way for spam to fill the donor list. Flagged as open decision 2.

---

## Screens

### 1. Companies list: `/admin/fundraising/donors-funders/companies`

A view over organization constituents where `company_stage is not null`, in the same list shell as
Donors & Funders. Columns: company, stage, money to date, open asks, people, last activity, next step.
A board view groups by the seven stages. Changing stage is a menu on the row, never a drag that can
happen by accident.

"Add a company" searches existing organization constituents first and sets the stage on the one chosen.
Creating a fresh record is the fallback. This is how staff enter the first company: find the existing
record, set its stage.

### 2. Company profile: the constituent detail page, company view

Shown at `/admin/fundraising/donors-funders/[id]` when the constituent has a `company_stage`. Same page,
same loader, with four panels added or reordered:

- **Header:** name, stage (editable), next step, domains.
- **Money:** gifts, grants (with reporting owed), pledges from the `pledges` table, open asks, open
  opportunities. Totals come from the same queries Donor 360 uses, so the numbers cannot disagree with it.
- **People:** contacts (employer relationships), session volunteers, coaches from `coach_people`, and
  contacts from a linked `partners` row. Each row says which of these it is.
- **Activity:** the existing activity stream, plus sessions run, introships credited, and inquiries
  received.

Each panel renders from what the session can read. A member without `program.read` sees Money and
contacts but not coaches or inquiries, with a one-line note saying so. No service-role fallback.

### 3. Intake inbox: a "Needs matching" view on the Companies list

Lists inquiries and coach sign-ups with no confirmed company: who, the company they typed, the email
domain, the suggestion if there is one, and the three actions. Dismiss ("not a company") is a fourth, for
personal sign-ups. This replaces the Partner Waitlist section of `/admin/legacy` as the place company
inquiries are read. The legacy section is left alone.

---

## Intake wiring

- `app/api/partner-waitlist/route.ts`: after a successful insert of a `Corporate Partner` row, run the
  matcher and write `company_suggested_id`. The route already saves `company`, `role_category` and
  `interest` (PR #572). It also starts writing `org_id` on insert.
- `app/api/coach-signup/route.ts`: the same for `kind = 'coach'` rows with a company.
- The notification email to the team gains a link to the inbox.
- Public responses do not change. A match is never revealed to the sender.

---

## RLS impact

- `constituents`: no policy change. The new columns ride the fundraising policies.
- `partner_waitlist`, `coach_people`: no policy change. New columns ride the program policies.
- `introship_credits`: new table. `fundraising.read` to select, `fundraising.write` for all, both through
  `private.has_permission(org_id, ...)`. `org_id not null`, no default.
- Cross-tenant: the two foreign keys from intake rows to constituents must never cross orgs. The confirm
  action checks that the intake row and the chosen constituent share the session's `org_id`, and the leak
  test asserts that a member of one org cannot attach another org's row.
- `partner_waitlist` reads on the profile and inbox filter by `org_id`. The table stays in `GLOBAL_ALLOW`
  for the legacy aggregate read; the new reads are written org-scoped from the start.
- Tests to update: `scripts/test-rls.sh` ordered list, `supabase/tests/rls-leak-test.sql`,
  `tests/tenant-isolation.test.ts` (`introship_credits` in `TENANT_TABLES`), `tests/migrations.test.ts`
  passes by construction.
- Migration ledger: each migration is applied to production under its committed filename before its PR
  merges.

---

## Staged build order

One PR per stage. Each is usable when it merges.

| Stage | What ships | Done when |
|---|---|---|
| **1. Stage and list** | `company_stage` and `domains` on constituents. Companies list and board. Stage and domains editable on the detail page. Money panel adds pledges and asks. | Staff can find the first company's existing record, set its stage, and see its money on one page. |
| **2. People** | Employer relationship writer. People panel: contacts, volunteers, linked `partners` contacts. | Staff can add a contact to a company and see everyone attached to it. |
| **3. Intake** | Link columns on the two intake tables. Matcher. Needs-matching inbox. Coaches and inquiries on the profile. | A test inquiry from a known domain appears as a suggestion, and confirming it puts it on the profile. |
| **4. Activity** | `introship_credits`. Sessions count. Activity panel. | Staff can credit an introship to a company and see it on the profile. |

Stage 1 has no dependency on the others. Stages 2, 3 and 4 depend only on Stage 1 and can go in any order.

---

## Definition of done

- [ ] Staff entered the first company through the UI. No name, person or dollar amount appears in code,
      migrations, seeds or tests.
- [ ] One page shows that company's grants, gifts, open asks, contacts, coaches, sessions and credited
      introships, with its stage and next step.
- [ ] Money totals on the company view equal the totals Donor 360 shows for the same constituent.
- [ ] An inquiry from a known domain is suggested, not attached. An inquiry from a free-mail address is
      unmatched. Two companies sharing a domain produce no suggestion.
- [ ] A failed match never fails a public form submission.
- [ ] A member of a second org cannot see, or attach to, the first org's companies, inquiries or credits
      (leak test).
- [ ] A member without `program.read` sees the page without errors and without program data.
- [ ] Typecheck, lint, `npm test`, the RLS workflow and the migration ledger check pass.

## Failure modes to watch for

- **Two records for one company.** The HubSpot import likely already created the organization. "Add a
  company" searches first for this reason.
- **Shared domains.** A parent company and a subsidiary on one domain, or a staffing agency. Several hits
  means no suggestion.
- **Spam inquiries.** Nothing is created from a public form without a person's click.
- **A `partners` row and a constituent drifting apart.** The profile shows both and labels which is
  which. It does not copy data between them.
- **Stage meaning two things.** A company can be an Active Partner with an open ask at "ask made". The
  company stage describes the relationship. Opportunity stages describe one ask. The page shows both and
  never rolls one into the other.

---

## Decisions (approved 2026-11-20)

Remi approved the recommendation on all five:

1. **Stage name "Opportunity"** stays as given for v1. Rename only if it confuses in use.
2. **Unmatched inquiries** do not create a profile automatically. Creating one is a single click in the inbox.
3. **Route:** a Companies page of its own. Built at `/admin/fundraising/donors-funders/companies`, not
   `/admin/fundraising/companies`: the fundraising tab row is fixed at five tabs by a signed ruling (and a test,
   `tests/gift-table-nav.test.ts`), so Companies sits under the Donors & Funders tab, the same way gift tables sit
   under Campaigns. Donors & Funders links to it.
4. **Company partners in `partners`** stay where they are and are linked by hand.
5. **Sessions** are an `interactions` row with `kind = 'event'` for v1.

One addition from Stage 1: an edit that changes only `company_stage` or `domains` does not trigger the outbound
HubSpot push, because HubSpot write-back is out of scope.
