# Duplicate constituent merge — report and reviewable SQL

**Read-only report**, generated 2026-09-03 against the production database. Nothing has been
applied; the companion SQL (`supabase/migrations/merge_duplicate_hubspot_org_constituents.MANUAL.sql`)
is for Remi to review and run by hand. This is data hygiene ahead of the identity backfill — merging
the three partner-side pairs collapses all three `ambiguous` partner matches in
`docs/identity-backfill-dryrun.md` to `probable`. A fourth pair, **Sobrato**, was added at Remi's
direction from the wider duplicate scan: it is a live funder (the anchor ask in the V2 design's
sample data), and a split record means two people can work it from different rows without seeing
each other's history.

---

## 1. Where a constituent id can be referenced (discovered, not assumed)

From `pg_constraint` and a catalog sweep for id-shaped columns, verified against live data:

**19 FK columns** onto `constituents(id)`:
`asks.funder_id`, `board_members.constituent_id`, `connection_candidates.constituent_id`,
`email_sends.constituent_id`, `fr_nba_suggestions.constituent_id`, `funder_angles.constituent_id`,
`gifts.constituent_id`, `grant_contacts.constituent_id`, `grants.funder_id`,
`interactions.constituent_id`, `journey_enrollments.constituent_id`, `opportunities.constituent_id`,
`partners.constituent_id`, `pledges.constituent_id`, `recurring_plans.constituent_id`,
`relationships.a_id`, `relationships.b_id`, `soft_credits.constituent_id`, `students.constituent_id`.

**2 constituent-id columns with no FK constraint** (a latent integrity gap worth its own fix some
day, noted in passing): `fr_prospects.constituent_id`, `fr_prospect_promoted.constituent_id`.

**Polymorphic references** (`entity_type = 'constituent'`, per the `entity_types` registry):
`external_refs.entity_id`, `document_links.entity_id`, `entity_comments.entity_id`,
`reed_next_moves.entity_id`, `notifications.linked_entity_id`, `ops_tasks.linked_entity_id`,
`meeting_suggested_tasks.suggested_entity_id`, `fr_agent_activity_log.target_id`,
`reed_activity_log.target_id`, `reed_suggestions.target_id` (text), `acknowledgments.subject_id`,
`story_subjects.subject_id`.

**History tables, deliberately left untouched by the merge**: `audit_log` (+ monthly partitions)
and `import_rows.created_entity_id` / `matched_entity_id` — rewriting them would falsify what
happened. `households` is a parent of constituents, not a child; none of the six rows has a
`household_id`.

Every one of these columns was queried for the eight ids. The complete set of live references:

| Reference | Rows | Points at |
|---|---:|---|
| `external_refs.entity_id` | 8 (one per constituent) | all eight |
| `opportunities.constituent_id` | 1 | `997d0505` (Friends of the Children) |
| everything else | **0** | — |

The duplicates are nearly bare shells, which is what makes this merge cheap.

---

## 2. The four pairs, side by side

All eight rows: `org_id` = ambition-angels, `type = organization`, `source = hubspot_import`,
**identical `created_at` (2026-06-12 01:52:48 — one import batch)**, empty `emails`, empty `tags`,
empty `custom_fields`, no notes, no household, not archived. The *only* distinguishing data is
`external_ids.hubspot_company` — each pair maps to **two distinct HubSpot company records with the
same name**, so the duplication originates in HubSpot, not in the import logic. `created_at` cannot
break the tie; the HubSpot records behind them can.

### Enterprise for Youth

| | `8629367d-8ab7-47fe-ab13-9720f17f993f` | `5d005bf6-10fb-46a5-bc3a-aa32a2fe6d13` |
|---|---|---|
| `emails` / `tags` | `[]` / `[]` | `[]` / `[]` |
| HubSpot company | `30727001508` | `34979055920` |
| — created in HubSpot | 2025-03-05 | 2025-06-11 |
| — domain / industry | enterpriseforyouth.org / EDUCATION_MANAGEMENT | enterpriseforyouth.org / CONSUMER_SERVICES |
| `external_refs` | 1 (its company id) | 1 (its company id) |
| child rows | none | none |

### Friends of the Children

| | `997d0505-98c0-46e5-8fc5-0d6fb98952d1` | `9a891ff1-eba4-40a9-bd5a-9469ec8c1ec5` |
|---|---|---|
| `emails` / `tags` | `[]` / `[]` | `[]` / `[]` |
| HubSpot company | `284228510405` | `38895653946` |
| — created in HubSpot | 2026-02-05 | 2025-08-28 |
| — domain / industry | — / — | friendsofthechildren.org / CIVIC_SOCIAL_ORGANIZATION |
| `external_refs` | 1 | 1 |
| child rows | **1 opportunity** (`16e740b7`, "Friends of the Children", stage identify, HubSpot deal `288120924876`) | none |

### Street Code

| | `5d3c57c4-1c30-4470-a0c7-6cb24e396bdc` | `e8a4297d-b683-4d11-82c8-b1407860bc3f` |
|---|---|---|
| `emails` / `tags` | `[]` / `[]` | `[]` / `[]` |
| HubSpot company | `17150747757` | `15418742280` |
| — created in HubSpot | 2023-08-29 | 2023-04-09 |
| — domain / industry | streetcode.org / CONSUMER_SERVICES | — / — |
| `external_refs` | 1 | 1 |
| child rows | none | none |

### Sobrato (added from the wider scan at Remi's direction)

| | `61279495-60d2-45fc-a37b-f9ebbd742ad5` | `47f87b3c-22de-4ca9-ba24-3b29d3a63774` |
|---|---|---|
| `emails` / `tags` | `[]` / `[]` | `[]` / `[]` |
| HubSpot company | `15855299727` | `17150382166` |
| — created in HubSpot | 2023-05-25 | 2023-08-29 |
| — domain / industry | **sobrato.org** / PROFESSIONAL_TRAINING_COACHING | **sobrato.com** / REAL_ESTATE |
| `external_refs` | 1 | 1 |
| child rows | none | none |

One honest caveat on this pair: unlike the other three, the two HubSpot records point at
**different domains** — sobrato.org (Sobrato Philanthropies, the funder) and sobrato.com (the
real-estate arm). They are two facets of the same family enterprise and Remi has called the merge,
so it proceeds; the archived row keeps its HubSpot id under `hubspot_company_premerge`, so if the
real-estate arm ever needs its own record it can be un-archived rather than recreated.

---

## 3. Proposed survivors

Rule, in priority order: (1) the row that real child rows already hang off; (2) else the row whose
HubSpot company record is more complete (domain/industry); (3) else the older HubSpot record.

| Pair | Survivor | Reason (one line) |
|---|---|---|
| Enterprise for Youth | `8629367d` | No children either side; its HubSpot company (30727001508) is the older record and the correctly classified one. |
| Friends of the Children | `997d0505` | It carries the live opportunity, and its HubSpot company (284228510405) is the deal's primary company — the working identity. |
| Street Code | `5d3c57c4` | No children either side; its HubSpot company (17150747757) has the domain and industry — the fleshed-out record. |
| Sobrato | `61279495` | No children either side; its HubSpot company (15855299727) is the older record and carries sobrato.org — the philanthropy, which is the relationship this record exists for. |

---

## 4. The migration (review, then run by hand)

`supabase/migrations/merge_duplicate_hubspot_org_constituents.MANUAL.sql` — the `.MANUAL.sql`
suffix follows the repo convention for hand-run data migrations (excluded from the RLS scratch-DB
harness, which cannot hold these production rows). Per pair it:

1. **Fails loudly** unless both rows exist, share org and type, and still carry the expected
   `org_name` — a renamed or missing row aborts the whole run rather than guessing. A pair whose
   loser is already archived is skipped, so re-running is safe.
2. **Repoints every reference** — all 19 FK columns, the 2 no-FK columns, and the 12 polymorphic
   columns filtered on `entity_type = 'constituent'` — even where today's count is zero, since rows
   can appear between review and apply. Relationship legs that would become self-loops are skipped.
3. **Keeps both HubSpot identities on the survivor**: both `external_refs` rows end up pointing at
   it (legal — the unique index is `(org_id, entity_type, source, external_id)`), so a future sync
   or import fingerprint for *either* company id resolves to the survivor. In
   `constituents.external_ids`, the loser's `hubspot_company` key is renamed to
   `hubspot_company_premerge` — `lib/hubspot/sync-in.ts` matches
   `external_ids->>hubspot_company` with `.maybeSingle()`, so this both stops webhook updates from
   landing on the archived row and guarantees it never sees two matches. The survivor records the
   absorbed id under `hubspot_company_merged`.
4. **Archives the loser** — `archived_at = now()` plus an explanatory line appended to `notes`.
   **No hard deletes**; `audit_log` and `import_rows` history are untouched.

A read-only verification query at the bottom should return three rows of zeros after the run.

One caveat recorded for honesty: the one-time backfill in
`supabase/migrations/import_hubspot_to_constituents.sql` guards inserts on
`external_ids->>'hubspot_company'`, so on a hypothetical re-run against a database holding
`hs_companies` data it could recreate a constituent for the retired company id (the archived loser
no longer claims it). Migrations don't re-run in production and the scratch DB holds no HubSpot
mirror data, so this is theoretical — but it's the reason the loser keeps the id under
`hubspot_company_premerge` rather than losing it entirely.

---

## 5. Are there more duplicates? Yes — reported, not merged

Merges are proposed only for the four pairs above (the three from the backfill's ambiguous tier
plus Sobrato, promoted out of this list by Remi); the rest of the scan is counts only.

**People: zero.** No two `person` rows in the same org share a normalized full name *and* an
overlapping email address. The person side of the spine is clean by this test.

**Organizations: 22 groups, 101 rows** share a normalized `org_name` within the same org (all in
ambition-angels, all unarchived). That is large, so per instructions this report stops rather than
proposing 19 more merges. The full list:

| Normalized name | Rows | Note |
|---|---:|---|
| linkedin | **54** | employer/vendor shells, almost certainly from contact-employer records |
| clickup | 4 | vendor shell |
| stanford university | 4 | |
| netsuite | 3 | vendor shell |
| enterprise for youth | 2 | **this report's pair** |
| friends of the children | 2 | **this report's pair** |
| street code | 2 | **this report's pair** |
| a to z impact foundation | 2 | |
| braven | 2 | |
| children now | 2 | |
| give forward foundation | 2 | |
| hubspot | 2 | vendor shell |
| jones lang lasalle | 2 | |
| mckinsey company | 2 | |
| morgan stanley | 2 | |
| next gen personal finance | 2 | |
| rescue a generation | 2 | |
| rushordertees | 2 | vendor shell |
| sobrato | 2 | **merged in this PR** (live funder — Remi's call) |
| the hidden genius project los angeles | 2 | |
| think of us | 2 | only group with two spellings ("Think of us" / "Think of Us") |
| university of notre dame | 2 | |

Two observations for whenever this queue gets worked: the LinkedIn ×54 group suggests the HubSpot
company import created one org shell per contact-employer association rather than one per employer,
which is a different (and bigger) cleanup than pairwise merging; and none of these groups touches
the identity backfill — the backfill's partner matching only collided with the three pairs merged
here. The `/admin/fundraising/duplicates` queue is the natural home for the rest.

---

## 6. Effect on the backfill

Once this merge is applied, re-running the dry-run matching collapses Enterprise for Youth,
Friends of the Children, and Street Code from `ambiguous` (two candidates) to `probable` (one
candidate each — the survivor), taking the backfill's ambiguous count from 5 to 2 (the two board
members, which remain genuine per-row decisions). The Sobrato merge doesn't touch the backfill —
it is funder-record hygiene so the anchor ask works off one history.

---

## 7. `fr_prospect` family hardening (proposed, not applied)

Follow-up to §1's missing-FK observation, at Remi's direction — one migration covering both gaps
in that family: `supabase/migrations/fr_prospect_family_fks_and_org_not_null.sql`.

**The gaps, verified live:**

| Table | Gap | Live damage today |
|---|---|---|
| `fr_prospects.constituent_id` | no FK to `constituents` | 9 linked rows, **0 orphaned** |
| `fr_prospect_promoted.constituent_id` | no FK to `constituents` | 0 rows in table |
| `fr_prospect_promoted.org_id` | nullable, **and no FK to `orgs`** | **0 NULL rows** (0 rows total) |
| `fr_prospect_disqualified.org_id` | nullable (FK to orgs exists) | 20 rows, **0 NULL** |

So there is no data damage to repair — the constraints can go straight on. The NULL-org_id risk is
real, though: both tables are RLS-scoped by `org_id` (`rls_reed_phase1_four_tables.sql`), so a row
inserted with NULL `org_id` is invisible to every tenant including its owner. Today nothing hits
it — the current promote/disqualify API routes write `fr_prospects` (org-explicit), and no
TypeScript code writes the two legacy tables anymore — but the schema shouldn't depend on that
staying true.

**The proposed migration** (registered in the RLS harness ordered list, after
`rls_reed_phase1_four_tables.sql` which backfills any historical NULLs):

- adds `fr_prospects.constituent_id` → `constituents(id) on delete set null`
- adds `fr_prospect_promoted.constituent_id` → `constituents(id) on delete set null`
- adds the missing `fr_prospect_promoted.org_id` → `orgs(id)` FK
- sets `org_id NOT NULL` on `fr_prospect_promoted` and `fr_prospect_disqualified` — with **no
  default**, per the tenant-default ratchet: an insert omitting `org_id` should fail loudly, not
  vanish behind RLS

Not covered on purpose: `fr_prospect_promoted.opportunity_id` also lacks an FK; same family,
same fix pattern, left out because the brief scoped this to the constituent FKs and the org_id
nullability — one line here so it isn't forgotten.
