# Phase 0 findings: BloomOS company profiles

**Spec:** `specs/bloomos-companies.md` (v1, design, pending Remi's approval)
**Read:** 2026-11-20, repo at `52a8573` (main), plus one read-only count query against production
**Status:** read and report only. No code, no migrations, no schema. Stop and wait for approval.

---

## 0. Method

Everything below comes from migration files, application code and tests at `52a8573`. One read-only query
against the production database (`Ambition-Angels` project) supplied the row counts in section 2. It
returned counts only. No names, emails or amounts were read.

---

## 1. The short answer

**A company should be a constituent of type `organization`. No new company table.**

Three reasons:

1. **The money is already there.** Gifts, grants, pledges, asks and opportunities all point at
   `constituents`. A parallel company table would need its own copy of every one of those links.
2. **The detail page is already there.** Donor 360 (`app/admin/fundraising/donors/[id]/DonorProfile.tsx`)
   serves organization constituents today. `specs/bloomos-v2-spec-fundraising.md` decided on one people list
   and one detail page. A company profile is that page with a company view, not a second page.
3. **"Corporate" already means this.** The corporate KPIs (`lib/admin/plan/metrics.ts:64-88`,
   `lib/admin/strategy/money.ts:78-89`) define corporate money as money from `type = 'organization'`
   constituents.

What is missing is small: a stage, a domain to match on, links from the two intake tables, and a way to
credit an introship to a company. Sections 4 to 8 list each gap.

The one real complication is that a second company list already exists in `partners`. See section 3.

---

## 2. What exists today

### Production counts (2026-11-20)

| What | Count |
|---|---|
| Organization constituents, not archived | 1,083 |
| `hs_companies` (HubSpot mirror) | 1,051 |
| `partners`, all kinds | 189 |
| `partners` with `kind = 'company'` | 23 |
| `partners` linked to a constituent (`constituent_id` set) | 7 |
| `relationships` rows | 107 |
| Coaches in `coach_people` | 2 |
| Coaches with a company typed in | 1 |
| Company inquiries in `partner_waitlist` | 1 |

The volume is tiny on the intake side and large on the constituent side. Most of the 1,083 organizations
are foundations and HubSpot imports, not corporate partners. So "company" cannot simply mean "every
organization constituent". It needs a marker (section 4).

### `constituents` (`supabase/migrations/create_fundraising_core.sql:35-56`)

- `type` is `'person'` or `'organization'`. Organizations carry `org_name`.
- `emails text[]`, `tags text[]`, `external_ids jsonb` (keys `hubspot`, `hubspot_company`), `notes`,
  `why_matters`, `custom_fields jsonb`, `is_volunteer`, `archived_at`.
- **No stage or status column.** Donor lifecycle is derived on read (`lib/fundraising/lifecycle.ts:15-21`).
- **No domain or website column.** `hs_companies.domain` exists but the HubSpot sync does not carry it
  over (`import_hubspot_to_constituents.sql:42-88`).
- **No employer column.** People link to organizations only through `relationships`
  (`create_fundraising_core.sql:61-69`: `a_id`, `b_id`, `kind`, `notes`). The comment lists `'employer'`
  as a kind. No application code writes to this table; Donor 360's Connected panel reads it
  (`Donor360Extras.tsx:47`). Production has 107 rows, so something outside the app wrote them. Their
  `kind` values need a look before Stage 1 (open item 1).
- RLS: `fundraising.read` / `fundraising.write`, scoped by `org_id`.

### Money, all keyed to a constituent

| Table | Link | Notes |
|---|---|---|
| `gifts` | `constituent_id` | |
| `grants` | `funder_id` (not null) | stages prospect to closed |
| `pledges` | `constituent_id` | |
| `asks` | `funder_id` (not null) | `form` already includes `corporate_sponsorship` and `event_sponsorship` |
| `opportunities` | `constituent_id` | stages come from the per-org `pipeline_stages` table |

Donor 360 already loads gifts, grants, opportunities and interactions for an organization. It does not load
the `pledges` table (its Pledges panel reads HubSpot deals) or `asks`.

### Intake

| Source | Table | Company signal | RLS domain | Link to a constituent |
|---|---|---|---|---|
| /companies form | `partner_waitlist` | `company` text (added in PR #572), sender's email | program | none |
| /coach sign-up | `coach_people` | `company` text, coach's email | program | none |

`partner_waitlist` is read in admin only on `/admin/legacy`, with no company or interest column shown.

### Activity

- `interactions` (`constituent_id`, kind call/email/meeting/event/note) is the activity log Donor 360 shows.
- **Nothing records which company or person an introship was built from.** `lib/internships.ts` has no
  company, sponsor or credit field, and no table mentions introships. The "credited to your team" promise
  lives only in page copy.
- **No per-company student usage report exists**, and this database holds no student usage of introships.
  That data lives in the mobile app's backend.

---

## 3. The complication: `partners` already has companies

`partners` (`create_partners.sql:17-45`) is the program-side relationship list: schools, districts,
nonprofits, and 23 rows with `kind = 'company'`. It has its own status (prospect, outreach, pilot, active,
anchor, lapsed), its own contacts (`partner_contacts`), its own activity log (`partner_interactions`), and
program RLS. It has an optional `constituent_id` that no code reads or writes. Seven rows have it set.

`consolidate_partnership_pipeline_into_partners.sql` moved 169 partnership deals out of fundraising into
this table on the rule "a partnership is a relationship, not a dollar ask."

So a company like the founding partner is both things at once: a funder (constituent) and a partner
(possibly a `partners` row). Three ways to handle it:

| Option | What it means | Cost |
|---|---|---|
| **A. Constituent is the company. Link `partners` where one exists.** (recommended) | The profile lives on the organization constituent. If a `partners` row points at it through `partners.constituent_id`, the profile shows that row's contacts and interactions too. | Uses a column that already exists. No data moves. |
| B. Move company partners into constituents | Migrate the 23 `kind = 'company'` rows, their contacts and interactions into constituents, relationships and interactions. | A data migration with merge risk, for 23 rows. Not worth it yet. |
| C. Build the profile on `partners` | Company profile under `/admin/programs`. | Money does not link to `partners`. Contradicts the brief. |

**Recommendation: A.** The profile reads through `partners.constituent_id`. Staff link the handful of
company partners by hand from the profile. Revisit B only if the two lists cause real confusion.

---

## 4. Gap: which organizations are companies, and what stage they are in

There is no stored stage on a constituent. The brief's stages are Identified, Engaged, Qualified,
Opportunity, Committed, Active Partner, Renewal.

Existing vocabularies those words collide with:

| Proposed | Already used as |
|---|---|
| Identified | `identified` stage key in the Sales and Angel Connectors pipelines |
| Qualified | grant stage, funder-angle stage, funding-opportunity triage status |
| Opportunity | the `opportunities` table and entity name |
| Committed | Angel Connectors `committed`, which is a won stage |
| Active Partner | overlaps `partners.status` active and anchor |
| Engaged | a flag on participant stages |
| Renewal | not used anywhere |

None of these is a data collision, because the company stage would live in its own column. The risk is
people: "Opportunity" as a stage name next to an Opportunities list on the same page will confuse. The
spec keeps Remi's seven names and flags this one as an open decision.

**Recommendation:** one nullable column, `constituents.company_stage`, with a check constraint on the seven
keys. Null means "not tracked as a company". Setting a stage is what makes an organization show up in the
Companies view. This answers both questions (which organizations, what stage) with one field and leaves
the other 1,000 organizations untouched.

Why a column and not `pipeline_stages`: that table drives opportunity stages per pipeline, with a composite
foreign key from `opportunities`. A company stage describes the relationship, not one ask. Reusing the
table would mean a fake pipeline with no opportunities in it.

Why not a tag: tags are free text. `add_constituents_is_volunteer.sql` made the same call for volunteers
and its header explains why: a first-class field is indexed, enforced and safe to build on.

---

## 5. Gap: matching intake to a company

- `lib/fundraising/constituent-resolve.ts` matches on **name only**, links the first of several matches,
  and **creates a person** when nothing matches. It has no human-confirmation path. It must not be used
  for intake.
- The duplicates screen (`app/admin/fundraising/duplicates/page.tsx:10-12`) deliberately excludes
  name-only matching.
- Capture has the pattern we want: `lib/capture/match.ts` finds candidates, `lib/capture/confirm.ts` has a
  human confirm them.
- There is no domain on a constituent to match an email against.

**Recommendation:** add `constituents.domains text[]` (lowercase, GIN index). Match an intake email's domain
against it. Exactly one match on a non-free-mail domain is a suggestion. Everything else is "unmatched".
Either way a person confirms. Nothing attaches on its own in v1. See the spec for the full rule.

---

## 6. Gap: linking intake rows and people

| Need | Reuse | New |
|---|---|---|
| A company inquiry belongs to a company | `partner_waitlist` | nullable `company_constituent_id`, `company_suggested_id` |
| A coach belongs to a company | `coach_people` | the same two columns |
| A contact works at a company | `relationships` with `kind = 'employer'` | a writer (none exists) |
| A session volunteer | person constituent with `is_volunteer = true`, linked by an employer relationship | nothing |

No new table is needed for any of these.

---

## 7. Gap: introships built from a company's people

Nothing exists. Public introship content is static in `lib/internships.ts`, keyed by `slug`. The brief says
staff enter everything through the UI and nothing is hardcoded, so the credit cannot go in that file.

**Recommendation:** one small table, `introship_credits` (`org_id`, `constituent_id`, `introship_slug`,
optional `person_constituent_id`, `credited_on`). This is the only new table in the design. It is also the
prerequisite for the year-end report promised on /companies.

---

## 8. RLS and test impact

- New columns on `constituents` are covered by the existing fundraising policies.
- New columns on `partner_waitlist` and `coach_people` are covered by their program policies.
- **The profile crosses domains.** Money and contacts need `fundraising.read`. Inquiries and coaches need
  `program.read`. Owner, admin and staff roles hold both (`create_bloomos_core.sql:141-159`). A role with
  only one sees only that half. The page must render each panel from what the session can read and never
  fall back to a service-role read to fill the gap.
- `partner_waitlist` is in `GLOBAL_ALLOW` in `tests/tenant-isolation.test.ts:68` and is read without an
  org filter. Once its rows attach to a tenant's constituents, the reads the profile makes must filter by
  `org_id`. The table has had the column since `add_org_id_to_tenant_tables.sql:13`.
- `coach_people` is already tenant-scoped (`tests/tenant-isolation.test.ts:36`).
- Checklist for the one new table: `org_id not null` with no default
  (`supabase/tests/tenant-default-ratchet.sql`), policies in the migration, `if not exists` everywhere,
  appended to `scripts/test-rls.sh`, added to `TENANT_TABLES`, leak assertions in
  `supabase/tests/rls-leak-test.sql`, and applied to production under the committed filename so the
  migration ledger check passes.
- Neither `organization` nor `company` is a registered entity type
  (`spine_entity_registry.sql:52-66`). Tasks and documents attach to the `constituent` type, which already
  works for organizations. No registry change is needed.

---

## 9. Open items to check before Stage 1 code

1. What `kind` values the 107 existing `relationships` rows use, and whether any are already
   person-to-organization. One read-only query.
2. Whether the founding partner already exists as an organization constituent (likely, through the
   HubSpot import) and as a `partners` row. Staff should open the existing record, not create a second.
3. Where student usage of an introship can be read from. Needed for the year-end report, not for the
   profile.
