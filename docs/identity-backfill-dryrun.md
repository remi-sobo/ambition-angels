# Identity backfill — dry-run match report (adults only)

**Read-only report.** Generated 2026-09-03 against the production database. Nothing was written: no
migrations, no schema changes, no rows touched. This file is the only artifact.

Scope decision (already made, restated for the record): only the adult bridges get backfilled —
`partners.constituent_id` and `board_members.constituent_id`. `students.constituent_id` stays NULL
permanently and by design (SafeSpace agreement; platform principle for youth-serving tenants).
This report also verified that no code assumes `students.constituent_id` is populated — see §8.

In-scope rows, confirmed against live data: **147** unlinked `partners`, **135** `partner_contacts`,
**5** unlinked `board_members`, matched against **3,631** `constituents` across 4 orgs.

**Matching rules used** (in order, as specified):
1. **Email overlap** — source email checked against the *full* `constituents.emails` array, case-folded.
2. **Normalized name + organization** — lowercase, punctuation stripped, whitespace collapsed; org
   corroboration required (for partners the name *is* the org; for people, the candidate's org
   affiliation or notes must corroborate).
3. **Normalized name alone** — reported, but flagged as `name only` in the basis column.

Candidates in a different `org_id` are never linkable; they are excluded from the tiers and reported
separately in §6.

---

## 1. Tier counts

| Source | In scope | `exact` | `probable` | `ambiguous` | `new` |
|---|---:|---:|---:|---:|---:|
| `partners` (organizations) | 147 | 0 | 61 | 3 | 83 |
| `partner_contacts` (people) | 135 | 132 | 1 | 0 | 2 |
| `board_members` (people) | 5 | 0 | 2 | 2 | 1 |
| **Total** | **287** | **132** | **64** | **5** | **86** |

**Ambiguous = 5**, well under the 15-row threshold → this fits one reviewed batch.

**On the "high probable, low exact" worry** — the shape looks alarming at the table level (64
probable vs 132 exact) but splits cleanly by source, and the worry does *not* materialize:

- **Partner organizations have no emails at all.** 0 of the 143 Ambition Angels partner rows carry a
  `champion_email` (contact emails were moved to `partner_contacts` when that table shipped), so
  every partner-org match is name-based *by necessity*, not because email coverage is thin. All 61
  are exact normalized `org_name` equality against `hubspot_import` organization rows — differing
  only in case, punctuation, or whitespace (e.g. "Aim High" ↔ "AIM High", "Hack The Hood" ↔
  "Hack the Hood"). For an organization, that is the analog of an email match, not fuzzy matching.
- **Partner contacts — the rows the worry was actually about — are 132/135 exact by email.**
  Email coverage on contacts is 134/135. Name matching is load-bearing for exactly **3 people**
  across the whole backfill: 1 partner contact and 2 board members (all flagged `name only` below).

No scope narrowing needed.

---

## 2. `probable` — 64 rows for review

### 2a. Partner organizations (61)

Every candidate below is `type = organization`, `source = hubspot_import`, with an **empty email
array and empty tags** — they are the partner-org shells created by the HubSpot import, sitting in
the spine unlinked. (Stated once here so the table stays readable; the id column is the full
constituent id.) All are in the `ambition-angels` org on both sides.

One source-side quirk: **"Oxford Day Academy" appears twice** in `partners` (rows #41–42 below,
two separate partner rows, same name) and both match the *same* constituent. That is a duplicate
partner row to resolve during review — either merge the partners or accept both linking to one
constituent (the FK allows it).

| # | Partner (source row) | kind / status / city | Candidate constituent id | Candidate `org_name` (spelling as stored) |
|---|---|---|---|---|
| 1 | Able Works | nonprofit / prospect / — | `731f68dd-b07e-4e7f-96cf-96db7925d026` | Able Works |
| 2 | Aim High | nonprofit / active / San Francisco | `1f2d5ca7-7148-45f1-8364-eec844278265` | AIM High |
| 3 | Alameda Unified School District | district / active / — | `6c99a9c2-97d1-44f2-a5f9-89ce3d1e3fe3` | Alameda Unified School District |
| 4 | Alpha Public Schools | school / prospect / — | `17c1fd35-f0ac-4308-bbf8-64112ed815bc` | Alpha Public Schools |
| 5 | Alternatives in Action | nonprofit / prospect / Oakland | `980a30b7-2edc-4428-9807-60da1fa27be0` | Alternatives in Action |
| 6 | Apollo High School | school / prospect / — | `c9f1b1bf-fb7d-4384-9687-fccf26ebe661` | Apollo High School |
| 7 | Arise High School | school / prospect / Oakland | `00b922b2-9d0c-4f5b-8ffe-b0509e652ab4` | Arise High School |
| 8 | Aspire Public Schools | school / prospect / — | `943dddf2-7009-4d79-b248-c5ac4247f2d4` | Aspire Public Schools |
| 9 | Avid (Menlo Atherton, Sequoia, Woodside) | nonprofit / prospect / — | `a598d0f7-a9c3-4e39-9744-f29755f0c9ff` | Avid (Menlo Atherton, Sequoia, Woodside) |
| 10 | Beyond Emancipation | nonprofit / prospect / Oakland | `20312cf6-8b07-4a0c-996a-82fc89c31415` | Beyond Emancipation |
| 11 | Black Teacher Network | nonprofit / prospect / — | `48d1c229-72c6-4535-9073-b3aa49492aad` | Black Teacher Network |
| 12 | Breakthrough | nonprofit / outreach / San Jose | `a96551be-775c-4cbc-9ae5-db1546dbeb49` | Breakthrough |
| 13 | BUILD | nonprofit / prospect / — | `27be8599-2477-4a7f-8863-8e5ae0eeb724` | BUILD |
| 14 | Calistoga High School | school / prospect / — | `c4dcfe34-428f-4e3c-845e-ab412a587812` | Calistoga High School |
| 15 | Civicorps | nonprofit / prospect / Oakland | `80e36b35-54da-441a-abc8-863ff38b86d9` | Civicorps |
| 16 | Digital Nest | nonprofit / active / Watsonville | `4ce28dcc-1013-4402-9354-cdad8dc0aee8` | Digital NEST |
| 17 | Dream Catchers | nonprofit / prospect / EPA | `93e04b09-886b-4089-9be3-b3488bf37cc3` | Dream Catchers |
| 18 | East Oakland Youth Development Center | nonprofit / prospect / — | `91a81a3b-7d6c-48de-821c-4739835883ce` | East Oakland Youth Development Center |
| 19 | Envision | nonprofit / prospect / — | `6d4bea51-50df-4977-956e-e3598a31850a` | Envision |
| 20 | Ever Forward Club | nonprofit / outreach / Oakland | `f3b7299d-9340-4583-b2b4-2e28691a63a1` | Ever Forward Club  |
| 21 | First Place for Youth | nonprofit / pilot / — | `82383cbc-7296-4dfe-acd0-2e81ea0b519f` | First Place For Youth |
| 22 | Foundation for College Education | nonprofit / prospect / — | `522bd062-8195-404d-b2a6-21126b344179` | Foundation for College Education |
| 23 | Friends for Youth | nonprofit / active / — | `3ddf8287-17ac-4ad6-a6f9-e936127fb79b` | Friends for Youth |
| 24 | Gateway High School | school / prospect / — | `58c1b47d-193c-4199-9653-24e5e21795e0` | Gateway High School |
| 25 | Girl Ventures | nonprofit / prospect / — | `d4cb4dc1-3dd1-4855-af3f-b7db2c3747f2` | Girl Ventures |
| 26 | Hack The Hood | nonprofit / active / Oakland | `3493ae63-9795-4e5f-87df-90c743f8568d` | Hack the Hood |
| 27 | Hayward High School | school / prospect / Hayward | `6f59dfc5-4500-4852-b36f-a7f0130f7270` | Hayward High School |
| 28 | iFoster | nonprofit / outreach / Truckee | `a35b5a4a-0ab0-4ba7-93e7-6cc98781ceae` | iFoster |
| 29 | Jobs for American Graduates (JAG) | nonprofit / prospect / — | `af78a104-91b6-4110-b5f5-579c92242db9` | Jobs for American Graduates (JAG) |
| 30 | Just Keep Livin' Foundation | nonprofit / active / — | `b612b4cf-64c2-4459-ad32-7fc2a2732316` | just keep livin Foundation |
| 31 | Live in Peace | nonprofit / outreach / EPA | `6c5b75b7-9b9b-41fd-987b-deba0e010fe7` | Live In Peace |
| 32 | McClymonds High School | school / pilot / Oakland | `acb96239-0019-4ab9-b03e-a3f67b5af895` | McClymonds High School |
| 33 | National Association of Manufacturers | nonprofit / prospect / — | `f0e5eaed-444b-4a9c-a483-cffcc85ce1ea` | National Association of Manufacturers |
| 34 | National Equity Project | nonprofit / prospect / — | `677a0ea0-6977-4e51-b013-6e5cb61b3ce2` | National Equity Project |
| 35 | Next Generation Atlanta | nonprofit / prospect / — | `668f8b50-27a0-403e-b1e7-09385f9d5d46` | Next Generation Atlanta |
| 36 | Oakland Kids First | nonprofit / prospect / Oakland | `cf052ea3-58cb-40c0-8847-5f3a467eb7dc` | Oakland Kids First |
| 37 | Oakland Promise | nonprofit / prospect / — | `cb50d603-47ca-406a-91ce-28a8d044d531` | Oakland Promise |
| 38 | Oakland Serves | nonprofit / prospect / — | `a726f97d-abcb-4cb1-8c60-fd45a708d5e9` | OAKLAND SERVES |
| 39 | OneGoal | nonprofit / outreach / Oakland | `5e30f1d2-7587-43cd-9b6c-6e27dc02a977` | OneGoal |
| 40 | Opportunity Trust | nonprofit / prospect / St. Loius | `c271f523-b043-40db-91f9-53a7ebc28811` | Opportunity Trust |
| 41 | Oxford Day Academy | school / prospect / East Palo Alto | `c54adede-d133-4db9-bc84-c045e784a163` | Oxford Day Academy |
| 42 | Oxford Day Academy | school / prospect / — | `c54adede-d133-4db9-bc84-c045e784a163` | Oxford Day Academy |
| 43 | Peninsula Bridge | nonprofit / pilot / San Mateo | `bcdf9a67-1c76-4266-85c4-bbe01564500d` | Peninsula Bridge |
| 44 | Points of Light | nonprofit / prospect / — | `043e1baa-c030-4eae-bf78-1fbfec38bdc8` | Points of Light |
| 45 | Riekes Center | nonprofit / prospect / — | `65cf177f-4ef0-420e-8827-3c59fc409983` | Riekes Center |
| 46 | RJOY | nonprofit / outreach / Oakland | `84b90aab-4070-415f-a8b9-b1fea65ecf53` | RJOY |
| 47 | Rooted Schools | school / prospect / — | `df8408e7-d69c-47f8-969c-8988ba17e830` | Rooted Schools |
| 48 | San Mateo Library | nonprofit / prospect / — | `9b0e81bd-0066-4531-8168-8e308e3c7dfa` | San Mateo Library |
| 49 | SF Oasis | nonprofit / prospect / — | `fd5f89df-2539-48ae-867c-d325ef3e4912` | SF Oasis |
| 50 | Silicon Valley Education Foundation | nonprofit / pilot / — | `7f6f16ce-dc54-46a7-b0d7-c34ee62aa072` | Silicon Valley Education Foundation |
| 51 | Students Rising Above | nonprofit / outreach / San Francisco | `aa3dc073-3c15-43cf-805c-ce4df5aea04c` | Students Rising Above |
| 52 | Summer Search | nonprofit / prospect / — | `dbee11eb-b7c7-4b82-a9d3-e06e4e97f7c8` | Summer Search |
| 53 | SVEF | nonprofit / prospect / — | `f7e8bcab-100b-4d2f-a4b2-6483b2d0e9f7` | SVEF |
| 54 | TEAM | nonprofit / pilot / — | `a66a438c-f0fa-479e-a768-b9a2972df822` | TEAM |
| 55 | Tech Exposure & Access Through Mentoring (TEAM) | nonprofit / prospect / Oakland | `f19d1fcd-37dc-4fcf-8f0d-f9c728a7c00b` | Tech Exposure & Access Through Mentoring (TEAM) |
| 56 | uAspire | nonprofit / prospect / Oakland | `4299a1ac-cedc-4ad9-8c12-906b22bae4d2` | uAspire |
| 57 | Woodside High School | school / active / Woodside | `d30c3965-f3f8-4cf2-ae9e-3ea915e5c97f` | Woodside High School |
| 58 | XQ America - Latitude High School | school / prospect / Oakland | `c2dc787e-13b3-4300-848f-b45d7c7005a2` | XQ America - Latitude High School |
| 59 | Youth Together | nonprofit / prospect / Oakland | `ef0dac34-9a89-471c-961a-9274d8b7f45c` | Youth Together |
| 60 | Youth Uprising | nonprofit / prospect / — | `fdf5636b-a488-4f00-9b45-d71a05873a95` | Youth UpRising |
| 61 | Youthbeat | nonprofit / prospect / Oakland | `cfd1f55b-a24f-44ee-ad4a-41e67c3d34b1` | Youthbeat |

### 2b. People (3) — all name-only, flag before linking

These are the only rows in the entire backfill where a link would rest on a name match alone.
Per the tier rules these sit in `probable` (single candidate, no conflicting email), but the basis
is weaker than 2a and they deserve individual eyeballs:

- **Amika Guillaume** (below) is effectively corroborated: the source row has no email, but the
  candidate's email domain is `collegetrack.org` and the source contact belongs to partner
  "CollegeTrack". Safe to treat as org-corroborated.
- **Lara Sellers** and **Todd Singleton** are genuine name-only matches: the board rows carry no
  email, and the candidates' emails are personal Gmail addresses that corroborate nothing. Confirm
  these are the actual board members before linking (both candidates came in via the HubSpot
  import, which is consistent with real people Remi has corresponded with — but the data alone
  can't prove identity).

**Partner contact: Amika Guillaume** — partner org `CollegeTrack`, email `—`, title —, tenant `ambition-angels`  
Match basis: name only

- candidate `903af5be-5ea2-4ba8-a4c2-53cb760697f4` — person **Amika  Guillaume** · emails: aguillaume@collegetrack.org · tags: (none) · source: hubspot_import

**Board member: Lara Sellers** — email `—`, role member, status active, tenant `ambition-angels`  
Match basis: name only

- candidate `5888ea03-ef62-45ba-bb81-b81712c5453c` — person **Lara Sellers** · emails: lara.sellers@gmail.com · tags: (none) · source: hubspot_import

**Board member: Todd Singleton** — email `—`, role member, status active, tenant `ambition-angels`  
Match basis: name only

- candidate `86bc7c27-192b-4360-bb46-8775059103bd` — person **Todd Singleton** · emails: toddsingleton@gmail.com · tags: (none) · source: hubspot_import

---

## 3. `ambiguous` — 5 rows, per-row decisions needed

A pattern worth naming before the rows: **all three ambiguous partners are ambiguous because the
constituents table itself contains duplicate organization rows** — two identically named
`hubspot_import` shells each. The decision per row is really "which duplicate survives", i.e. these
are constituent-side merges waiting to happen (the `/admin/fundraising/duplicates` queue is the
natural home). The two ambiguous board members are a different case: two real, distinct-looking
email identities per name, and the board rows carry no email to disambiguate.


**Partner: Enterprise for Youth** — kind nonprofit, status active, city San Francisco, tenant `ambition-angels`  
Match basis: name: multiple candidates

- candidate `8629367d-8ab7-47fe-ab13-9720f17f993f` — organization **Enterprise for Youth** · emails: (none) · tags: (none) · source: hubspot_import
- candidate `5d005bf6-10fb-46a5-bc3a-aa32a2fe6d13` — organization **Enterprise for Youth** · emails: (none) · tags: (none) · source: hubspot_import

**Partner: Friends of the Children** — kind nonprofit, status outreach, city Portland, tenant `ambition-angels`  
Match basis: name: multiple candidates

- candidate `9a891ff1-eba4-40a9-bd5a-9469ec8c1ec5` — organization **Friends of the Children** · emails: (none) · tags: (none) · source: hubspot_import
- candidate `997d0505-98c0-46e5-8fc5-0d6fb98952d1` — organization **Friends of the Children** · emails: (none) · tags: (none) · source: hubspot_import

**Partner: Street Code** — kind nonprofit, status prospect, city —, tenant `ambition-angels`  
Match basis: name: multiple candidates

- candidate `e8a4297d-b683-4d11-82c8-b1407860bc3f` — organization **Street Code** · emails: (none) · tags: (none) · source: hubspot_import
- candidate `5d3c57c4-1c30-4470-a0c7-6cb24e396bdc` — organization **Street Code** · emails: (none) · tags: (none) · source: hubspot_import

**Board member: Jerrel Brown** — email `—`, role member, status active, tenant `ambition-angels`  
Match basis: name: multiple candidates

- candidate `fe605df4-dccb-4b4c-83ca-4e6c8bc6d1b1` — person **Jerrel Brown** · emails: jerrelbrown@ymail.com · tags: (none) · source: hubspot_import
- candidate `9329ac4c-c2f0-477c-a079-000ff8f78df8` — person **Jerrel Brown** · emails: jerrel@dapperdownbarberlounge.com · tags: (none) · source: hubspot_import

**Board member: Michelle Vilchez** — email `—`, role member, status active, tenant `ambition-angels`  
Match basis: name: multiple candidates

- candidate `36b47969-a9eb-4c06-8c82-8eee1c7ee25b` — person **Michelle Vilchez** · emails: mvilchez@innovateschools.org · tags: (none) · source: hubspot_import
- candidate `21c425a3-7774-4a5a-ab78-c739eb60daaa` — person **Michelle Vilchez** · emails: michelle@webuildpower.org · tags: (none) · source: hubspot_import

---

## 4. `new` — 86 rows to insert

| Source | New constituents | `type` to stamp |
|---|---:|---|
| `partners` | 83 (79 ambition-angels + 4 young-gifted-black; 66 nonprofit / 15 school / 2 district) | `organization` ✓ |
| `partner_contacts` | 2 | `person` ✓ |
| `board_members` | 1 (Susan Bird — see §6, cross-org) | `person` ✓ |

This is the expected shape: most partner organizations were never donors, so a clean insert is
correct, not a merge. The `constituents.type` check constraint allows exactly
`('person','organization')`, so the stamping above is valid. The 4 young-gifted-black partners
matched nothing because their champion emails are `@example.org` seed addresses (YGB is the demo
tenant) — clean inserts into *their* org.

The two new partner contacts both carry real emails and simply have no constituent yet:

- Dr. Sabrina Silverman-Fernandez — `ssilverman@seq.org`
- Komoia Johnson — `komoia@rjoyoakland.org` (contact of partner "RJOY"; the RJOY *org* itself is a
  §2a probable — the person row is new even though the org row exists)

The full list of 83 new partner organizations is in Appendix A.

---

## 5. Role tags — live spellings checked

Live tag census on `constituents.tags` (full list): `gala` 8, `board` 7, `donor-master-b1` 7,
`monthly_donor` 7, `household` 6, `funder` 6, `major_donor` 6, `imported:hubspot_deal` 6,
`foundation` 6, `stewardship` 6, `AIG` 5, `reconnect` 3, `corporate` 3, `parent` 2, `government` 1,
`partner` 1, `placeholder` 1.

| Proposed tag | Exists today? | Verdict |
|---|---|---|
| `partner` | **Yes** (1 — St. Mark AME Church, the one already-linked partner whose constituent carries a role tag) | Use as-is. |
| `board member` | **No — but `board` does (7)**, and those 7 are exactly the constituents of the 7 already-linked YGB board members | **Do not stamp `board member`** — it would be a second spelling of a live concept. Stamp **`board`**. |
| `partner contact` | No, and no near-variant exists (`contact`, `partner_contact`, etc. all absent) | Net-new tag, no collision. Fine to introduce — but note the live convention for multi-word tags is underscore (`major_donor`, `monthly_donor`), so decide `partner contact` vs `partner_contact` deliberately before the backfill writes 130+ of them. |

Caveat for honesty: the 7 `board`-tagged rows are all in the young-gifted-black demo tenant (the
only org with linked board members today), so the "convention" comes from seed data — but it is
the spelling the prompt's live-tag list already acknowledges, and diverging from it would strand
those 7.

---

## 6. Org boundaries — 1 cross-org hit, must not link

All four orgs share these tables; every candidate was checked against the source row's `org_id`.
Result: **every linkable candidate in §2–3 and every `exact` match is same-org.** Exactly one
cross-org candidate exists, caught by both the email and name passes:

> **Susan Bird** — `board_members` row in **safespace** (`susan@safespace.org`, role member) matches
> constituent `e2df7bcb-099f-429d-a873-c604ffbad158` — person "Susan Bird",
> emails `[susan@safespace.org]`, no tags — which lives in **ambition-angels**.

She is presumably the same human (an AA constituent who also sits on SafeSpace's board), but the
bridge must not cross tenants: the backfill should **insert a new SafeSpace constituent** for her
(hence her `new` tier above). The same person existing once per tenant is the correct outcome of
tenant isolation, not a dedup failure. Flagging it here so nobody "helpfully" links it during
review.

---

## 7. Insert-path checks

**Unique constraints:** `constituents` has none beyond the primary key. The GIN email index, the
trigram name indexes, and the partial HubSpot `external_ids` index are all non-unique. Two
consequences:

1. The inserts cannot hit a unique-constraint violation — nothing blocks the backfill.
2. Nothing blocks it *twice*, either. The database will happily accept a re-run's duplicate
   inserts. The backfill script must be idempotent by its own logic — the natural guard is the
   bridge column itself (only insert for rows where `constituent_id is null`, and set the FK in
   the same transaction as the insert).

**`org_id` — say-it-loudly section:** in the live production database, `constituents` (and
`partners`, `partner_contacts`, `board_members`) have **no column default on `org_id`** — the
tenant-default hardening removed them (see `supabase/tests/tenant-default-ratchet.sql`). So:

- No insert path can silently rely on a column default in production — an insert omitting `org_id`
  fails NOT NULL. Good.
- **But the checked-in migrations still create the default.** `create_fundraising_core.sql` (and
  the partners/board migrations) run `alter table … alter column org_id set default '<AA org id>'`,
  so a fresh database built from migrations *would* have the hardcoded Ambition Angels default, and
  a backfill script tested there could pass while omitting `org_id`. Do not copy that pattern; the
  frozen baseline in the ratchet test documents that these defaults are trap-listed for removal.
- There is no session-context mechanism that injects `org_id` on insert (RLS's
  `private.has_permission(org_id, …)` checks the value, it doesn't supply one) — and a
  service-role backfill bypasses RLS entirely. **The script must copy `org_id` per-row from the
  source table, never use a constant**: the source rows span three orgs (ambition-angels,
  young-gifted-black, safespace).

---

## 8. `students.constituent_id` — no code assumes it

The column exists (`create_students.sql`, nullable, `on delete set null`). A sweep of `app/` and
`lib/` found **no reader or writer of `students.constituent_id` anywhere** — the student↔constituent
touchpoints in code are the leader picker (volunteer-flagged constituents) and the import wizard's
entity split, neither of which touches the bridge. Nothing to report as a bug; the NULL-forever
design holds today.

---

## 9. Other source-data quirks for the review pass

- **Duplicate partner rows**: "Oxford Day Academy" ×2 (§2a). Related: the exact-tier matches
  reveal partner pairs "East Oakland Youth Development Center" / "EOYDC" and "Hayward High
  School" / "Hayward Unified" sharing a contact — possible same-org duplicates on the partners
  side too, worth a look while reviewing.
- **Three people are contacts at two partners each**, and both their contact rows email-match the
  same constituent: Sharon Washington-Barnes (EOYDC + "EOYDC"), Diana Levy (Hayward High School +
  Hayward Unified), Domenichi Morris (Oakland Kids First + Youth Organizing Council (YOC)). That
  is fine — one person, one constituent, two partner-contact rows — the backfill just needs to not
  treat "constituent already claimed" as an error.
- **"TEAM" and "Tech Exposure & Access Through Mentoring (TEAM)"** are two distinct partner rows
  matching two distinct constituents. Probably genuinely the same org twice under different names;
  both pairs link cleanly, but worth an eyeball during the §2a scan.

---

## 10. Recommendation

**One reviewed batch.** Ambiguous is 5 (< 15). The tier that looked like the risk — name-leaning
matches — is 3 people total, each individually explained in §2b. Suggested order within the batch:

1. `exact` (132 partner contacts) — link automatically.
2. `probable` 2a (61 partner orgs) — a quick scan; they are spelling-identical org names.
3. `probable` 2b (3 people) + `ambiguous` (5) — the 8 rows needing real judgment.
4. `new` (86) — clean inserts, with §6's Susan Bird kept in safespace and §7's per-row `org_id`.

No backfill script has been written; per the brief, that waits on this review.

---

## Appendix A — the 83 `new` partner organizations

Would be inserted as `type = organization`, tag `partner`, in their own tenant (young-gifted-black
rows marked; all others ambition-angels):

- Acts Full Gospel Church (nonprofit, prospect)
- African American Male Achievement (nonprofit, prospect)
- AIMS College Prpe (nonprofit, prospect)
- Alameda Unified (school, outreach)
- ARISE charter (school, lapsed)
- Avid (nonprofit, prospect)
- Bay Tech School (nonprofit, prospect)
- BGCP (nonprofit, outreach)
- Big Brothers Big Sisters Bay Area (nonprofit, prospect)
- Boombox Collaboratory Partnership (nonprofit, lapsed)
- Boys and Girls CLub of Oakland (nonprofit, prospect)
- BrAVen Partnership (nonprofit, pilot)
- Carol Dweck Partnership (nonprofit, lapsed)
- CASA (nonprofit, outreach)
- Casey.org Partnership (nonprofit, lapsed)
- Castlemont High School (school, active)
- Caterpillar Ministries (NC) (nonprofit, outreach)
- CollegeTrack (nonprofit, active)
- Curtis Feeny - FY26 (nonprofit, prospect)
- Derek Peterson Partnership (nonprofit, prospect)
- Dewey Academy (school, lapsed)
- East Oakland Boxing Association (nonprofit, prospect)
- East Palo Alto Academy (school, outreach)
- Eastside College Prep (school, outreach)
- Encinal High School (school, active)
- Envision Academy (school, lapsed)
- EOYDC (nonprofit, active)
- Ever Forward Club  - New Deal (nonprofit, pilot)
- FLY (nonprofit, outreach)
- Fresh Lifelines for Youth (FLY)  (nonprofit, active)
- Get Schooled Partnership (nonprofit, lapsed)
- Girls Inc of Alameda County (nonprofit, prospect)
- Girls Rock (nonprofit, prospect)
- GirlVenture (nonprofit, prospect)
- GoodWill/Workforce Dev Project (nonprofit, lapsed)
- Hayward School District (district, pilot)
- Hayward Unified (school, outreach)
- Hidden Genius (nonprofit, outreach)
- Hidden Genius Long Beach (nonprofit, pilot)
- Hidden Genius Oakland (nonprofit, active)
- Hidden Genius Project Richmond (nonprofit, active)
- Hopelab Partnership - Foundation - FY23 (nonprofit, prospect)
- iFoster partnership (nonprofit, pilot)
- Improve Your Tomorrow (nonprofit, pilot)
- Inqli Partnership (nonprofit, lapsed)
- Just Keep Livin (nonprofit, outreach)
- Juvenile Hall (nonprofit, outreach)
- Kingmakers (nonprofit, outreach)
- Kingmakers of Oakland (nonprofit, pilot)
- LEMO (nonprofit, pilot)
- MAM, Houston (nonprofit, outreach)
- Millenium High School (school, pilot)
- My Digital TAT2 partnership (nonprofit, lapsed)
- Oakland Made Teen Center (nonprofit, prospect)
- Oakland Public Library (nonprofit, prospect)
- Oakland Student Service (nonprofit, prospect)
- Oakland Tech (nonprofit, prospect)
- One Goal (nonprofit, pilot)
- OneGoal - FY25 (nonprofit, prospect)
- Peer Heatlh Exchange (nonprofit, outreach)
- Pivotalnow (nonprofit, outreach)
- Ralph J. Bunche Academy (school, prospect)
- Redwood City High School (school, outreach)
- Rooted School (nonprofit, prospect)
- Silicon Valley Urban Debate Leage (nonprofit, prospect)
- Singleton Foundation Grant (nonprofit, lapsed)
- Sojourner Truth Independent Study (nonprofit, prospect)
- Summit Charter Schools (school, prospect)
- Think of us Foster Youth Partnership (nonprofit, lapsed)
- Tides Academy (school, outreach)
- United Charitable - New Deal (nonprofit, pilot)
- United Charitable Partnership (nonprofit, pilot)
- University of Silicon Valley - New Deal (nonprofit, pilot)
- University of Silicon Valley Partnership (nonprofit, pilot)
- Woodnext/Friends of the Children (nonprofit, pilot)
- YMCA of Silicon Valley (nonprofit, prospect)
- Youth Employment Partnership (nonprofit, prospect)
- Youth Guidence (nonprofit, prospect)
- Youth Organizing Council (YOC) (nonprofit, prospect)
- Bayside Community Center (nonprofit, pilot, young-gifted-black)
- Belle Haven Elementary (school, active, young-gifted-black)
- Peninsula Black Professionals Network (nonprofit, active, young-gifted-black)
- Ravenswood City School District (district, active, young-gifted-black)
