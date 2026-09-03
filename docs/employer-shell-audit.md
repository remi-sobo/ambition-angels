# Employer-shell audit — the 1,049 organization constituents

**Read-only report**, generated 2026-09-03. No writes, no migrations. Every one of the 1,049
unarchived `type = 'organization'` constituents was classified. Database reads went against
production Supabase; where the mirror lacked a needed field, the live HubSpot API was queried
read-only (details in §2).

**The headline: 676 of 1,049 (64%) are employer shells.** Removing them leaves **373** — that is
what Fundraising → Donors & Funders would actually open on (169 confirmed-real, plus 204 that need
Remi's eye, listed in full in the appendix). And the employer information is **not lost** by
removing a shell — but it never lived on the spine in the first place; see §5.

## 1. Counts per class

| Class | Count | Definition applied |
|---|---:|---|
| **Real relationship** | **169** | any spine linkage (money, pipeline, program, activity), or a HubSpot deal on the company, or a `partners`-row name match, or any profile data (emails/tags/address/notes) |
| **Employer shell** | **676** | none of the above, and explained as an employer record: at least one HubSpot contact lists it as their employer, or it is a LinkedIn per-contact integration row |
| **Ambiguous** | **204** | no spine linkage, but plausibly a real institution: a grantmaker/institution-looking name (184, all auto-created), or a company someone deliberately entered in HubSpot with no explaining contact (20) |

By tenant: all 676 shells and all 204 ambiguous are ambition-angels; young-gifted-black (10) and
safespace (3) org constituents are all in the real class.

Within **real**, what made them real: 122 have a HubSpot deal on the company (68 deal-only,
54 combined with other signals), 66 name-match a `partners` row (the backfill's partner orgs), 40
have spine children or profile data. Within **employer shell**: every one of the 676 is
name-matched as at least one contact's employer; 54 of them are the LinkedIn rows (see §2 — they
are literally one-per-contact integration artifacts).

## 2. Signals used, and which ones actually worked

- **Spine linkage** (worked, definitive): every FK and polymorphic reference column from the
  dedupe report's discovery sweep, queried per constituent — gifts, opportunities, grants/asks
  (`funder_id`), interactions, partners, pledges, soft credits, recurring plans, grant contacts,
  funder angles, NBA suggestions, fr_prospects, email sends, journeys, documents, comments, tasks.
- **HubSpot deal association** (worked): `hs_deals.primary_company_id` — a company on a deal is a
  real relationship even when the spine constituent is still bare.
- **`partners` name match** (worked): the 61 partner orgs from the backfill dry run have no
  children *yet*; without this signal they would have misclassified as shells.
- **Contact-employer match** (worked, the shell signal): `hs_contacts.company` — the free-text
  employer field on the contact mirror — normalized-name-matched against `org_name`. LinkedIn is
  54 rows because dozens of contacts work there. Exact-name matching only, so an employer written
  as a variant spelling escapes this signal — some of the 204 "ambiguous" are likely shells with
  name variants.
- **HubSpot creation source** (worked, but NOT available in the mirror — this is the finding the
  brief asked for): `hs_companies.raw_json` carries only 7 properties (name, domain, industry,
  createdate, object id, owner, last-modified). The auto-creation marker lives in HubSpot's
  `hs_object_source_label` property, so it was fetched read-only from the HubSpot API:
  - **`CRM_SETTING`** = HubSpot's "create companies from contact email domains" automation — the
    auto-created records. The setting was switched on **2023-08-29 at 16:20**, which backfilled
    261 companies in a two-minute burst, and it has kept creating one company per new contact
    email domain ever since. This is what created the ClickUp/NetSuite/HubSpot/Salesforce-style
    shells — and also the Sobrato sobrato.com duplicate merged in this PR.
  - **`INTEGRATION`** = created by a connected app: all sampled LinkedIn rows carry this label,
    one row per contact, `num_associated_contacts = 1` each. That is why LinkedIn appears 54
    times — nobody typed it once, an integration stamped it 54 times.
  - **`CRM_UI`** = a person created it (including the bulk CRM-setup session of 2023-04-09,
    visible as records created minutes apart by the same user).
  Labels were fetched for **all 204 ambiguous rows** (exact split: 184 `CRM_SETTING`, 20 `CRM_UI`)
  and for ~420 of the remaining rows as validation; the three-label pattern held everywhere
  sampled.
- **`hubspot_owner_id`** (did NOT work): 681 of the original shell set have an owner assigned —
  HubSpot hands companies to a default owner, so ownership says nothing about intent.
- **Empty emails/tags/address, `source='hubspot_import'`** (corroborating only, as the brief
  required): true of every shell, but also of most real partner orgs — never used alone.
- **Person-side references** (checked, empty): no `constituents` person row references any of
  these orgs through `custom_fields` (7 person rows have any custom fields at all), `notes` (32),
  or `external_refs` — the import wrote names/emails/phones only.

## 3. What Donors & Funders opens on

Today the screen's underlying population is 1,049 organizations, 64% of which are employer shells.
After removing shells: **373** (169 confirmed + 204 pending the ambiguous review). If every
ambiguous row Remi rejects also leaves, the floor is 169. Either way the number is realistic once
shells go — 122 deal-carrying funders, the 66 partner orgs, and the institutional maybes below.

## 4. The ambiguous 204, in full

Two groups with different textures (full lists in the appendix):

- **A1 — 20 deliberately created (`CRM_UI`), no spine data.** Someone typed these into HubSpot on
  purpose — Raikes Foundation, Charter School Growth Fund, Cisco Foundation, Ravenswood Education
  Foundation, Rotary Club of Oakland, A to Z Impact Foundation, Stanford, USF, Cornell, two school
  districts. These look like prospect research or partner intent that never went anywhere.
  Keep-or-cut is a judgment call per row.
- **A2 — 184 auto-created (`CRM_SETTING`) with grantmaker/institution names.** Mechanically these
  are the same artifact as the shells — a contact's email domain spawned them. But the *contact*
  behind a foundation domain is usually a program officer, which is a real relationship in embryo:
  Packard Foundation, Stupski Foundation, The California Endowment, James Irvine, Schultz Family
  Foundation, Emerson Collective, NewSchools Venture Fund, plus the Stanford/Notre Dame/Berkeley
  university family the brief predicted. Auto-created is not the same as delete-safe here.

## 5. Would removing a shell lose the employer information?

**No — but only because the spine never had it.** Verified:

- The spine's person rows carry no employer data at all: no employer column, 7 of 2,582 person
  rows have any `custom_fields`, 32 have notes, and `external_refs` holds only identity mappings.
- The affiliation graph is unbuilt, as the brief noted and the data confirms: `relationships` has
  0 rows, `households` has 1. There is nothing to repoint employer edges onto today.
- The person→employer edge lives in the **HubSpot mirror**: `hs_contacts.company` (free text) is
  populated on 1,772 of 2,541 contacts, and HubSpot itself additionally holds the
  contact↔company association objects (not mirrored). The mirror is a read-only sync — archiving
  or deleting an org *constituent* does not touch `hs_companies` or `hs_contacts`.

So the honest statement for the ruling: **removing employer-shell constituents loses nothing from
BloomOS that BloomOS ever had, and the raw employer facts survive in the mirror and in HubSpot.**
The flip side: if "where does this person work?" should ever be answerable from the spine without
HubSpot, that data has to be deliberately landed somewhere (person fields or the relationships
graph) — deciding whether `constituents` holds employers at all is exactly the ruling this report
feeds, and per the brief no fix is proposed here.

---

## Appendix — the ambiguous list in full

### A1. Deliberately created in HubSpot (`CRM_UI`), no spine data — 20 rows

| Name | Constituent id | HubSpot company · domain | Employer-match contacts |
|---|---|---|---:|
| A to Z Impact Foundation | `b3af0302-83ee-4a23-94e3-d192b9fd8156` | 329907715781 | 1 |
| agape foundation charitable trust | `a9c91a3d-de03-48d6-8425-14a0d5561c44` | 16095758120 | 1 |
| Charter School Growth Fund | `838dc4f8-5f0b-4593-b3c7-e988f52211b7` | 15481151850 · chartergrowthfund.org | 1 |
| Cisco Foundation | `cbc996c1-7d2f-424f-891d-fe0a694ce6d7` | 27594930762 · cisco.com | 1 |
| Clayful Health | `02b90cc5-676d-45e0-ab42-ac0d7eb93d7a` | 15481123717 · clayfullhealth.com | 0 |
| cornell university | `6fd8a4fc-abbb-4f48-a1c2-e94456e2f0a5` | 16704845444 · cornell.edu | 2 |
| nextplayventures.com | `54ae8bd1-05d8-41c1-9713-3c4acea11413` | 15481209934 · nextplayventures.com | 0 |
| piedmont unified school district | `595c714b-ab4f-49c1-b206-85a2d62e1329` | 15419218188 · piedmont.k12.ca.us | 2 |
| Raikes Foundation | `8b80416a-ed10-4d5d-8d85-8dfea3a8d88f` | 15481123672 · raikesfoundation.org | 1 |
| RAVENSWOOD EDUCATION FOUNDATION | `d32ac0fc-02b8-413e-a2e2-7571e9c39b17` | 15418785100 · ravenswoodef.org | 1 |
| Reach University | `f166f92b-b032-4b56-a5e0-48815dafa556` | 15419059974 · reach.edu | 9 |
| Redwood City Highschool  | `64e20c88-db8a-446c-a65e-719153a70a05` | 282646573782 · www.redwoodhs.org | 0 |
| Rotary Club of Oakland | `c847eb5c-d7d0-4412-afc6-2f5019cac02c` | 30250083196 · oakland-rotary.org | 0 |
| Sectionschool | `e3755586-0960-4cd4-86b8-6c23679e1e16` | 15523880202 · sectionschool.com | 0 |
| Sequoia Union High School District | `d04f204c-d417-4981-ae94-c57e2c260800` | 15481151924 · seq.org | 8 |
| Stanford | `ff260e53-9c85-4973-8a02-041d1d7cfe6c` | 15418785061 · Stanford.edu | 31 |
| The Hidden Genius Project - Los Angeles | `2e974562-6e9b-41cf-b240-6177c5eef439` | 33651666807 · www.hiddengeniusproject.org | 0 |
| The Hidden Genius Project - Los Angeles | `c6c391aa-adb4-42b7-b0b8-caa918077c0d` | 33651666872 · www.hiddengeniusproject.org | 0 |
| The Magic Beans | `40a9914a-eb39-48aa-b067-6f0a0ea2e5d6` | 15469110928 | 0 |
| University of San Francisco | `52125828-cc1b-4f8f-b8c3-2aed24bbc5fb` | 15419221843 · usfca.edu | 1 |

### A2. Auto-created from a contact's email domain (`CRM_SETTING`), grantmaker/institution-looking name — 184 rows

| Name | Constituent id | HubSpot company · domain | Employer-match contacts |
|---|---|---|---:|
| 100 Women Charitable Foundation | `7a0429f3-336a-43fe-bdb1-72e82cd722e3` | 19637317733 · 100womenfoundation.org | 3 |
| 1803 Fund | `819526a2-9ff1-4c7c-af2f-04ab3ea3a0cc` | 29978957916 · 1803fund.com | 1 |
| 5 Buckets Foundation | `7792a29f-595c-443b-b131-7d02bd0fbff0` | 30628880669 · 5buckets.org | 2 |
| Advanced Energy | `1cd61da7-be83-4d00-a534-18029e298799` | 17150752927 · aei.com | 0 |
| AfterSchool HQ LLC | `a2183833-10da-4bfb-b042-0a94478e47cd` | 17150684703 · afterschoolhq.com | 0 |
| AIMS K-12 College Prep Charter District | `79854911-3f59-489c-b36d-b1800d4038fb` | 30091415899 · aimsk12.org | 1 |
| Altamont Capital | `7ae9f940-28c5-44e9-b04c-dbc3880d9f2b` | 282785484494 · altamontcapital.com | 0 |
| Am Trust Financial Services | `65acf35a-7c77-4cf8-bbf7-6568e3a32983` | 312770330315 · amtrustgroup.com | 1 |
| Amazing CEO LLC | `66a36de1-a070-4e97-b0d2-a4dd17c413f0` | 17150346339 · amazingceo.com | 0 |
| Ambition | `1e8abf23-8aa8-4067-8a91-f60f6af8c18e` | 17150379928 · theambitionapp.com | 0 |
| arizae.com | `9260464a-fbee-4782-ad47-638f0f2f2cde` | 17150714297 · arizae.com | 0 |
| Arkansas | `0773b7f3-a6d3-467b-8d36-f25ae1642d36` | 18169919539 · arkansas.gov | 0 |
| Babson College | `ac813b68-ccd9-47e8-92a7-a64a1e8af20d` | 26321788593 · babson.edu | 1 |
| Basicfund | `015b12ba-10ad-45de-9a21-1cb114044a48` | 17150340666 · basicfund.org | 1 |
| Basil Tech | `0cc0861a-b850-48fb-a652-b33331b4038d` | 17150677820 · basiltech.org | 0 |
| Be Strong Inc | `5778343b-9904-4f38-a6fa-87139b0d1517` | 17150738005 · bestrong.global | 0 |
| Bella Charitable Foundation | `d7234d9c-e8cb-4cc3-aa4c-7f5a7775fd68` | 253675661030 · bellacf.org | 1 |
| Bellarmine College Preparatory | `ff1245fc-7d22-416c-ae09-54de3a34504c` | 32321500343 · bcp.org | 3 |
| benevity.org | `ed9f1694-4686-400e-b725-7e0a5df68249` | 17150740269 · benevity.org | 0 |
| Berkeley Unified School District | `fb7d3675-53bb-434a-baf7-dfa18736b296` | 19527793006 · berkeley.net | 1 |
| Bozzuto & Associates Insurance Services | `cb3117cb-5cc4-48ea-93d5-01077ef36731` | 17150744909 · dbinsurance.com | 0 |
| Calendly LLC | `05b451ff-b2c9-4f3b-93fb-2a69364214fd` | 17150682390 · calendly.com | 0 |
| California Children's Trust | `6a458ead-9245-4e43-879d-39f281f0a167` | 17150330974 · cachildrenstrust.org | 0 |
| Campbell Union High School District | `ba7ea33f-6a8e-4cbd-a02a-564aab738277` | 36442469267 · cuhsd.org | 5 |
| Canva Pty Ltd | `b097df11-e30e-4924-b5d0-ff4045a2df03` | 18738861198 · canva.com | 0 |
| Care/of | `66dfca51-f473-433a-b65a-7926bc5dcc23` | 17150391678 · takecareof.com | 0 |
| CASA smc | `20604f3f-7ca9-49ac-b101-9786522e4ebf` | 41100451401 · casaofsanmateo.org | 0 |
| Caterpillar | `04b662b8-1226-49d0-89e2-6984969df737` | 42346074652 · caterpillarministries.org | 0 |
| championcharities.org | `3ed62f1a-cd94-470e-a3e4-709e64cdcdcc` | 17150747760 · championcharities.org | 0 |
| Charles Koch Foundation | `11d94ee7-62e1-41a2-bfb9-552bcd7c8f2e` | 23843772835 · charleskochfoundation.org | 1 |
| Children's Defense Fund | `cfeb383c-357f-47c7-814a-9f5981d09792` | 37339448405 · childrensdefense.org | 1 |
| CHM | `85a67bcb-5943-4630-a85d-26fde6c4896f` | 17150389159 · computerhistory.org | 0 |
| College Is Real | `3b9691a2-c9e5-4044-9ea6-b066798ac409` | 22207734033 · collegeisreal.org | 1 |
| Covenant House | `880dd1b4-5a53-4ee8-a04e-fc7181356f90` | 215686852322 · covenanthouse.org | 0 |
| Craft Education | `e1b61393-9ed8-490d-b941-9d2dd1effe10` | 27512807955 · crafteducation.com | 0 |
| Crown Castle Inc | `89755055-ff1e-46c6-a90f-afc2663a4d19` | 17150348580 · crowncastle.com | 0 |
| crown-chicago.com | `187dd3ba-4f86-4b5d-b8d1-82e7be991ffb` | 17150377625 · crown-chicago.com | 0 |
| DAMI | `0b7d3a9c-39a8-40a7-b1ad-ca5e0f95057c` | 17590179238 · damicc.us | 0 |
| David and Lucile Packard Foundation | `27fb3e46-eefa-42d7-a795-2f2f3b66d57e` | 37265932467 · packard.org | 1 |
| DLC Consulting Services | `0c88c79e-3620-49bd-9147-e2a35341f286` | 18781847127 · dlccs.com | 0 |
| Draper Richards Kaplan Foundation - DRK Foundation | `51e6f354-1928-40b3-bfff-3b641aa0b3fc` | 37205213801 · drkfoundation.org | 1 |
| Dream Encore | `69760ce9-2048-4722-b24e-7c146c1aa60b` | 18948008297 · letsdreamencore.com | 0 |
| East Side Union High School District | `7cd9d479-720a-4b43-8bdb-ae3b8aea1cbd` | 32312891662 · esuhsd.org | 3 |
| Eastern University | `2c971657-cb30-4cdf-b82a-2dc0d1a7c9f5` | 17150344000 · eastern.edu | 1 |
| Eastside College Preparatory School | `ac31dc80-7903-46d9-bc6e-bcfe3f4b0643` | 303881315003 · eastside.org | 1 |
| ECMC Group Inc | `31021260-35d5-49ae-81bb-fd85b8adf054` | 19001011233 · ecmc.org | 0 |
| eeinitiative.org | `38ae27dc-2ad6-401f-8d8a-3053dd4ffe8a` | 23764727337 · eeinitiative.org | 0 |
| Ellie Brown | `3312d7ee-79c1-4689-abc3-2a62f38481f2` | 17667104375 · elliebrown.com | 0 |
| Ergonfoundation | `3741c4c8-9162-4122-ac97-f54c19923219` | 17150768747 · ergonfoundation.com | 1 |
| Eventide Investments | `3ed19eb9-f096-46b2-8af6-e0c36329b4d2` | 17150673062 · eventideinvestments.com | 0 |
| Expedia Inc. | `e6dd6d04-b6a7-4452-9995-7083f92fd5a2` | 17150719101 · expedia.com | 0 |
| Fit Kids Foundation | `19b6e13f-ef05-4cc8-a49c-21b9c62ecccf` | 17150726238 · fitkids.org | 0 |
| Foothill-De Anza Community College District | `20559d6c-7c2d-408d-aaec-734bd25bc99f` | 18594752579 · fhda.edu | 1 |
| Foundation Source | `789c1958-5c32-4e24-af8f-943c7bcf5dc7` | 21823704070 · foundationsource.com | 1 |
| frjusd | `6182ab83-4285-4590-b6a8-5670b1fafa98` | 18679572615 · frjusd.org | 0 |
| Full Circle Fund | `00a91c86-7d46-45e1-94a1-0304ea781c8e` | 17293296225 · fullcirclefund.org | 2 |
| FundingUniversity | `d999868b-582a-4c64-ad1a-59f536736f8e` | 23840826190 · funding-university.com | 1 |
| gatewaymiddle.org | `db70963f-1c57-41f5-ad45-bd16bd47df79` | 17150728521 · gatewaymiddle.org | 0 |
| Girls Inc | `3b31be5b-06dc-47d4-a527-ea7e8228d9d4` | 18843969425 · girlsinc-alameda.org | 0 |
| Give Forward Foundation | `8f335633-a335-418e-818a-89183d960630` | 324600569558 · giveforwardfoundation.org | 2 |
| gladriverventures.co | `14176b23-7b18-49fc-b345-8e300d172f3d` | 17150363924 · gladriverventures.co | 0 |
| Gong.io Ltd | `9abbf969-7a7c-4b38-8841-59da694919d6` | 17150399775 · gong.io | 0 |
| grantinterface.com | `76cdd6b7-d1c9-46bd-b965-962162637fdf` | 17150702410 · grantinterface.com | 0 |
| Guild Mortgage: Southeast Region | `ad31216c-32e8-4cf4-9552-a19b45d7bfcd` | 316179510988 · guildmortgage.net | 0 |
| Hamilton Lane Inc. | `1e22f527-e47b-4774-830b-8399b8417ebf` | 17150742684 · hamiltonlane.com | 0 |
| Hazel Health Inc | `06470dfd-c3dc-4174-9c24-bb9861e4be20` | 17150377627 · hazel.co | 0 |
| HBS Club NorCal | `ce5c9de4-ba1b-4ff5-8031-f8ae44e423d3` | 23493709965 · hbsanc.org | 0 |
| headrushapp.com | `a9acd842-a7a6-4d0f-bec6-a68442820fe8` | 17150757229 · headrushapp.com | 0 |
| Historic | `1f7962c1-2947-4cd7-98f7-8ece097d3b6a` | 18784539283 · makehistoric.com | 0 |
| Hoplin Jackson Charitable Advisors | `de51547c-eeb4-4bcd-8ee3-24788eb8f022` | 19184733872 · hoplinjackson.com | 1 |
| House of Philanthropy | `bee3947c-ec66-425d-90aa-4f0771a85bc6` | 315583772366 · philanthropy.house | 1 |
| Ideos Institute | `8a1c8e65-c457-4f43-bcb4-d687d8881892` | 17150379927 · ideosinstitute.org | 0 |
| Im Not You | `7f26e281-2b0a-4592-80df-5919ed8e5285` | 17150726237 · imnotyou.com | 0 |
| Intuit | `a68a15fa-f6be-44a2-8c26-fe9d5fc471ad` | 17150340669 · intuit.com | 0 |
| iTrack | `d7700d92-786d-4c3c-b2c1-e40ce9f0c70d` | 17150773305 · itracktwc.com | 0 |
| jbmarketingmedia.com | `a587855c-ea4f-4fca-8cf5-3638e5804e31` | 17750497106 · jbmarketingmedia.com | 0 |
| Jordan Park Group LLC | `aaf5197a-1ac1-4cf6-93d3-5b3ddc7f59cd` | 17150377629 · jordanpark.com | 0 |
| juliereeder.com | `6f47591b-2ecf-45eb-9653-669ddba26bf8` | 17590140166 · juliereeder.com | 0 |
| Junior Achievement of San Diego County | `459530d4-61df-433d-be9e-43b1caf32802` | 17150682393 · jasandiego.org | 0 |
| Kapor Center | `84d0f907-45f2-4483-8ede-45a3eab18539` | 17150747756 · kapor.com | 0 |
| KATAMA GROUP | `938f39bc-9562-48c1-999d-a6a3c1433a1d` | 17150354516 · katamagroup.com | 0 |
| Kimberly Dexter | `08087506-f736-4eeb-b168-3faf2602229b` | 17588966465 · kimberlydexter.com | 0 |
| KLA Corporation USA | `5c5c0760-4493-4a29-9dac-333809aadbf7` | 18995291446 · kla.com | 0 |
| LaDoris Hazzard Cordell | `34cb2c4b-cd38-4730-be92-b2e102a10549` | 17150709797 · judgecordell.com | 0 |
| Law Office of Vidhya Babu, APC | `b43cb17c-371b-48ba-9bc3-0219539ba10d` | 18362725527 · babuestatelaw.com | 0 |
| League Outfitters LLC | `02036c42-b139-4238-9d70-a0cf57da7ff7` | 17150684705 · leagueoutfitters.com | 0 |
| Legacy Ventures Inc. | `7bc690a3-c884-48db-b9d2-246c6733b8c4` | 17150354514 · legacyventure.com | 0 |
| levco.com | `ca11cf0c-4527-447c-960f-70c426191b21` | 17150348583 · levco.com | 0 |
| LiveCycleDelight | `a9ba7c93-02c1-462c-8dcb-5b4282531ec8` | 17599045672 · livecycledelight.com | 0 |
| LPL Financial LLC | `896db176-438d-4e01-9cc3-680c162bb3ba` | 18362667329 · lpl.com | 0 |
| Lucile Packard Foundation for Children's Health | `378ac23d-e584-47f8-9275-1440f0d8b343` | 17150695094 · lpfch.org | 2 |
| Luminate | `19e062cf-21fd-4252-af78-cbaf22d6528d` | 17150343999 · luminatecapital.com | 0 |
| MANTRA62 | `bf2f847b-8b84-453e-8048-c6d2aa9fa1d1` | 20946932245 · peninsulabridge.com | 0 |
| Martinelli's | `415017f7-08b8-4251-9f37-543e999ff784` | 17543788698 · martinellis.com | 0 |
| maverick-mail.co | `b039d207-8fd6-4d93-af0c-27845a401b1f` | 17631408389 · maverick-mail.co | 0 |
| MCSB | `df01a0bb-0faf-42b3-a346-17806d706ca0` | 17916834356 · mcschools.net | 0 |
| Merrill Lynch & Co., Inc. | `04164567-aef9-4eb7-8f45-29a296c02ca1` | 17150752928 · ml.com | 0 |
| Michelle Weise | `d8b5233b-afc6-4e27-bac3-6c7db6c34b1e` | 23142630584 · michelleweise.com | 0 |
| MIGMIR and His Fund | `72f5a973-9558-4623-aa8a-819aaf7b2c3e` | 17150694745 · migmir.org | 0 |
| Mills College | `65de9cf0-307b-45e0-b20f-f55cf32ccc01` | 30377412246 · alumnae.mills.edu | 1 |
| Molotsi | `cba17f65-877c-441c-8045-7e2878cc5864` | 26936679719 · molotsi.com | 0 |
| NewSchools Venture Fund | `0d76a984-df32-4a1d-89a9-42449883ab26` | 17150762292 · newschools.org | 3 |
| Next Game Advisors LLC | `51b900f1-fa68-474f-9d28-11766ee708fb` | 17849523080 · nextgameadvisors.com | 0 |
| Northeastern University | `4e5b58bd-7848-4dc2-bd0a-0e21416f9103` | 17150361449 · northeastern.edu | 2 |
| Northern California Promise Coalition | `b0187e10-23a6-4423-aaee-b7c657fe7345` | 17162628967 · norcalpromisecoalition.org | 0 |
| Northwestern University | `7fe33597-c71f-458d-8fb0-7b8d4f18c8d4` | 35387821477 · u.northwestern.edu | 1 |
| nwcc.us.com | `ea2f3e33-32c0-40f6-be58-dcd5ca821ad8` | 17150723883 · nwcc.us.com | 0 |
| O'Melveny & Myers LLP | `98c66b2e-673f-40d5-99de-be8d75bd4a00` | 17150735651 · omm.com | 0 |
| Oakland Unified School District | `f6b8e2ad-02a6-4d03-a986-9652bf1a3cd1` | 20865262396 · ousd.org | 40 |
| OtherForces | `b2279071-8923-435c-b43a-1ab0fd161379` | 17150723887 · otherforces.com | 0 |
| Palo Alto Community Fund | `07e40e5c-5be9-4ebe-b127-c89c4a91deca` | 18659220281 · paloaltocommunityfund.org | 0 |
| passioncoaching.net | `6c7159b5-53d2-4145-a2cf-94c6f131aade` | 17150719102 · passioncoaching.net | 0 |
| Paul Shoemaker | `649eebf7-133b-4a1e-98a0-e2408e282e4f` | 17150343995 · paulshoemaker.org | 0 |
| Peninsula Land and Capital | `281ca4d6-f2a5-4884-bf76-9248067b04f0` | 39249643698 · peninsulaland.com | 0 |
| Philanthropic Ventures Foundation | `7ee53fb5-f92f-453d-acf4-3027643f4df7` | 17150679991 · venturesfoundation.org | 2 |
| Pinetops Foundation | `bb64c713-e2f8-45bc-bc79-66c0784f09e0` | 17150343994 · pinetops.org | 1 |
| PIPs Rewards | `dfce3377-413f-4ba8-adb2-e0292e8b46c5` | 17150762289 · pipsrewards.com | 0 |
| Playground Global LLC | `721a3ba8-b2ab-483a-901c-1a46356cf4d5` | 17150742685 · playground.global | 0 |
| Poder San Francisco | `ffc207b3-1e32-4c4b-b1b2-bac795351356` | 310517052137 · podersf.org | 0 |
| Pro-Tec Data | `0284cb07-8c33-4d91-b90d-ea4cb994f4d7` | 17150689185 · pro-tecdata.com | 0 |
| Publicworksalliance | `1cef4248-213d-4beb-8f7c-e4a80febc926` | 20831142455 · publicworksalliance.org | 0 |
| Radical Candor LLC | `d24822d0-4f32-441e-980d-c9eadf8a03a4` | 17150389158 · radicalcandor.com | 0 |
| Randy Haykin | `87bb14f2-392c-4d94-88a9-e1ad782a1909` | 17150744908 · haykin.net | 0 |
| ravnet.com | `1183a09a-4697-4895-9964-398018e3651d` | 31261682577 · ravnet.com | 0 |
| RealNames | `0de1ff08-d881-401c-aee2-000f13ee603b` | 17150767269 · currie.com | 0 |
| Recor Medical Inc | `31f940eb-e83b-4a9d-a52e-6d260f66eec8` | 17150399776 · recormedical.com | 0 |
| REPLACE | `83e8f0fc-7fa0-4af8-9d9f-2b96c043cd28` | 31284035134 · replace.com | 0 |
| risefortheworld.org | `7f09bb73-1cb6-4df9-9d2e-4aa203f722b6` | 17150346342 · risefortheworld.org | 0 |
| Rogers Family Foundation | `7b853a7a-1070-4813-a183-d940f51412b8` | 19527010606 · rogersfoundation.org | 1 |
| RushOrderTees | `19de7073-644f-4767-b338-fa2c4354ee16` | 19638169626 · rushordertees.com | 0 |
| RushOrderTees | `0d64512a-a3a7-40ce-8656-ae092cdedc51` | 19632742058 · rushordertees.com | 0 |
| Ryan Nece Foundation | `ee737b21-566d-4f86-bf84-fb9ede601800` | 42722304900 · ryannecefoundation.org | 1 |
| San Leandro Unified | `3465934b-66a9-4a30-8c7e-b34940015900` | 30347350557 · slusd.us | 1 |
| San Mateo County Community College District | `6223ea42-b736-4fb5-bb84-01af95ef3f36` | 318501259971 · smccd.edu | 1 |
| Sandberg Goldberg Bernthal Family Foundation | `22d15fce-1260-4eb9-aa63-96f0b524b131` | 28878245277 · sgb.org | 3 |
| SCAPPOOSE OUTFITTERS | `c5fc2714-1049-4370-bf8c-1fec5436dbce` | 17150773307 · scappooseoutfitters.com | 0 |
| Schultz Family Foundation | `4c1330c6-4fa2-4be4-a95a-c1905af44ab5` | 25804138412 · schultzfamilyfoundation.org | 3 |
| Schusterman Initiatives Inc | `235a328f-5d41-4327-8153-f942506a7731` | 17150677818 · schusterman.org | 0 |
| Sentinel Growth Fund Management LLC./Radar Alternative Fund | `985a3ef5-b6e3-4c8f-a847-01369464492a` | 17150682387 · sentinelmgt.com | 0 |
| SFMOMA | `41d85950-5178-4f37-b50d-202bb52acce2` | 282734929598 · sfmoma.org | 0 |
| shahcap.com | `03cf2941-017d-4577-aaeb-a0bca7baf5af` | 17150740270 · shahcap.com | 0 |
| Silicon Valley Bank | `52ebf3b2-350c-4c1c-85c5-14bfef211d36` | 17150744910 · svb.com | 0 |
| siliconvalleyconsulting.biz | `169fc4f8-4300-4c44-9475-457d9b3c7886` | 17150689182 · siliconvalleyconsulting.biz | 0 |
| Slack | `a069ba75-6b97-4f8b-a9af-84c1b8a8ab4e` | 23748781143 · slack.com | 0 |
| Solutionary Advisors | `be9db66a-750c-4371-bb93-03b511f377cd` | 17631196183 · solutionaryadvisors.com | 0 |
| Stanford University | `ec249cd0-83b6-43e1-8e1c-c4e669a5fea5` | 17150354521 · stanford.edu | 9 |
| Stanford University | `cb551545-391c-4fe0-af2a-c0b4b273f96f` | 17150677817 · stanford.edu | 9 |
| Stanford University | `017686fc-06b1-40f2-b1d9-8ae2e2409d31` | 17237749930 · stanford.edu | 9 |
| Stanford University | `ce52b4eb-aed1-46e7-b857-2606ffd5827c` | 25479965725 · stanford.edu | 9 |
| Stayner News | `6c1f5434-14f6-48f9-9a41-c5f3e0df3328` | 27995666254 · stayner.com | 0 |
| Strada Collaborative Inc | `713f5b00-371a-4c9e-ae94-bd6c868181b8` | 17150695095 · stradaeducation.org | 0 |
| Stupski Foundation | `9beca1cf-196b-4eb0-8409-cea67610597d` | 19001849741 · stupski.org | 2 |
| Taylor University Inc | `93873cbc-ccbc-4586-a43d-0c44a27548a6` | 17150354517 · taylor.edu | 0 |
| TEAM Risk Management Strategies | `ac5bd060-9774-4370-b081-dcc6dc386984` | 22869425981 · teamemployer.com | 0 |
| Tecarta Inc | `6048c2b1-c7b6-44b1-900e-eed703deb3d2` | 17150327702 · tecarta.com | 0 |
| Telocity | `9f102546-295e-4a51-ab0a-439b167aac99` | 17150348584 · telocity.co | 0 |
| Telosity | `2b82ddd2-ec43-4f85-993f-c59b528c4ac6` | 17150747762 · telosity.co | 0 |
| The Bridgespan Group Inc | `83e6ba92-8012-44d6-8e21-ec4dd2d33e22` | 17150714369 · bridgespan.org | 0 |
| The California Endowment | `eebd189a-e957-4854-b0ad-522835753ccd` | 328089180883 · calendow.org | 1 |
| The Center for Effective Philanthropy, Inc. | `80713d79-6530-4d00-b668-73360573c245` | 17150379926 · cep.org | 0 |
| The Harry and Jeanette Weinberg Foundation, | `4c9af534-e82c-4e45-858a-5afa317a331f` | 23759225676 · hjweinberg.org | 1 |
| The James Irvine Foundation | `4ea4dadf-d9b0-426c-981f-5cdbc98edf73` | 29967043625 · irvine.org | 1 |
| The Peggy and Jack Baskin Foundation | `dec140c0-be80-4996-8807-3dc898a27d6a` | 17150346341 · baskinfoundation.org | 1 |
| The Peninsula College Fund | `d2f12cc5-2cd3-4c89-84a8-a1e2dd4d89f6` | 319197383381 · peninsulacollegefund.org | 1 |
| The Peralta Colleges | `29ca2f53-006c-4ed9-ac2f-b1d42f5f28d6` | 44074503031 · peralta.edu | 1 |
| The Perkins Fund | `8a6cede9-0b2f-4858-8758-f7a8bcae3d6b` | 22855807832 · theperkinsfund.com | 1 |
| tracyfishercpa.com | `06a5b734-c695-42f4-88b3-7e9d77086a2a` | 17150759983 · tracyfishercpa.com | 0 |
| Trigger Media Group | `d5f53e99-91d7-4770-a7d9-07805b503146` | 17150384450 · triggermedia.com | 0 |
| TrilliconValley | `20f6c9bf-44be-477a-8b8e-b99f7a028943` | 17150747759 · trilliconvalley.com | 0 |
| Tuck Consulting Group LLC | `1be65b27-8f87-4031-bf43-2765c50d87d4` | 18996676478 · tuckconsultinggroup.com | 0 |
| University of Arkansas at Little Rock | `963a089f-012d-4a60-91c3-73d808f6f44f` | 23472566870 · ualr.edu | 0 |
| University of California | `5299d1e9-53c1-4280-b287-28478463c170` | 29784283475 · ucsf.edu | 1 |
| University of California, Berkeley | `104fc61d-9681-4026-96eb-ca926ea26773` | 22127451251 · berkeley.edu | 6 |
| University of Hawaii System | `be560ee9-5ceb-499f-a455-5563c195487b` | 17150343996 · hawaii.edu | 1 |
| University of Notre Dame | `c2b1977c-4a00-4970-9eed-760be65cd175` | 27463645971 · nd.edu | 3 |
| University of Notre Dame | `37a3401c-7efe-4d48-8759-93ffb9e670b4` | 30928354076 · mail.leo.nd.edu | 3 |
| univfilms.com | `85127089-9f0c-4a67-bb61-ae687a1fe08b` | 17150694746 · univfilms.com | 0 |
| Veridian Mortgage | `dc351667-26a9-414e-916d-1e82c8bb2c5d` | 18362627419 · veridianmortgage.com | 0 |
| Vivensity Inc | `001d3827-58d8-49c2-bfe1-a5ee9abf9c76` | 17150709796 · vivensity.com | 0 |
| Welfie LLC | `47d3fd3c-e2fb-42a5-a6dc-6f12573dea49` | 17150354520 · welfie.com | 0 |
| West Contra Costa Public Education Fund | `ed458044-44a0-44e0-b2af-92d899426994` | 17631461533 · edfundwest.org | 1 |
| Western Governors University | `08596d7e-2855-4345-9cea-1dcaed47a399` | 17150343993 · wgu.edu | 1 |
| Whittier Holdings Inc | `9d6ccda1-2a2a-46de-95c6-d56174b4b682` | 17150702409 · whittiertrust.com | 0 |
| Wilfred Jarvis Institute | `a2eb1736-97ef-4c27-b77a-99c577569d17` | 17150330973 · wjinst.com | 0 |