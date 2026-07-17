# Safespace onboarding — seeded vs. self-serve

Status: checklist, 2026-07-17. Companion: `specs/bloomos-migration-runbook.md` Appendix 5 (the seed SQL), `specs/bloomos-participant-spine.md`, `specs/bloomos-import-layer.md`, `specs/bloomos-strategy-builders.md`.

The dividing line after Phases B–E: **identity, entitlements, and per-org vocabulary are seeded once by us; everything that is *content* they enter themselves through the product.** Two setups (stages, custom fields) are still data-only — we seed them from their answers until the "Program setup" editor exists.

## 1. What we seed (one-time SQL, Remi)

Run Appendix 5 with the blanks filled, then the two spine seeds. Order matters only in that the org row comes first.

| # | What | Table(s) | Needs from Safespace |
|---|------|----------|----------------------|
| S1 | Org row (name, slug, email domain) | `orgs` | their email domain |
| S2 | Module entitlements | `org_entitlements` | confirm: partners on (schools)? reviews off? AI tier (`ai.reed` / `ai.prospect_research`)? |
| S3 | Terminology | `org_terminology` | confirm labels: student → "Student leader", cohort → "Chapter"; optionally program / session / stage nouns (D6 reads all five keys) |
| S4 | First owner on the allowlist | `org_email_allowlist` | first staffer's email (+ any others, with roles) |
| S5 | Participant lifecycle | `participant_stages` | their stage list: names, order, which count as *engaged*, which are *terminal*. (Without rows they'd run on the generic starter template — fine to start, worse to migrate later.) |
| S6 | Participant custom fields | `custom_field_defs` (`entity_type='student'`) | the fields a student leader carries (e.g. `chapter_school`, grade?, consent?) — key, label, type, options, required |

**Not seeded, ever:** `aa.*` entitlement flags, AA terminology, AA strategy content (the seed route that could leak it is retired in F1), any `hs_*` mirror access.

## 2. What they do themselves (product, no SQL)

| Area | How | Since |
|------|-----|-------|
| Sign in | Invitation flow → password | (see P1 below) |
| Strategy — full OGSM | `/admin/strategic-plan` → "Build your strategy" wizard (foundation → objectives → goals → strategies + measures, live metrics from the catalog) | **spec #6, F2** — until it ships, strategy would need a one-off seed; recommend onboarding after F2 |
| Programs & chapters | create programs + groups (`/admin/cohorts`, program find-or-create + datalist); continuous membership via `ended_on` | D4 |
| Student-leader roster | `/admin/imports` CSV wizard — map their spreadsheet's columns onto spine + their custom fields, preview verdicts, commit; re-upload safe | E3 |
| Donor / contact list | same wizard, "Donors & contacts" target | E4 |
| Individual records | roster + donor forms render *their* fields (registry-driven) and *their* stages automatically | D1–D3 |
| Ops, board, compliance, meetings, documents, metrics, comms | standard module UI | — |
| Fundraising pipeline | opportunities/gifts UI; pipeline stage config is per-org data (`pipeline_stages`) — **verify a new org gets a default pipeline or seed one** (P3) | — |

## 3. Their answers we still need (send before seeding)

1. **Email domain** (S1) and the **first owner's email** (S4).
2. **Module set** confirmations (S2): partners? reviews? AI tier?
3. **Terminology** (S3): "Student leader" / "Chapter" confirmed? Words for program / session / stage?
4. **Lifecycle** (S5): the stages a student leader moves through, in order — and which mean "actively engaged" vs. "no longer active".
5. **Custom fields** (S6): what they track per student leader.
6. **What system do they run today?** (spreadsheet / Airtable / CRM) — CSV export covers day one either way; the answer decides whether connector #2 is worth building (E6 seam is ready for it).
7. **Hub vs. chapters** (spec #4 §10.5): is the central hub a *program* over chapter-groups, or itself a group? Decides how we tell them to structure `/admin/cohorts`.

## 4. Pre-flight (us, before the invite goes out)

- **P1 — Exercise the invitations flow with a test account first.** It has 0 rows ever; Safespace must not be its first user (runbook rule).
- **P2 — Dry-run the whole path on a throwaway org**: seed S1–S6 with dummy answers → invite test account → build a strategy through the wizard → import a 5-row roster CSV → confirm terminology renders on nav + pages, stages on the roster, custom fields on the forms.
- **P3 — Verify new-org fundraising/finance bootstraps**: does an org with no `pipeline_stages` rows get a sane default pipeline, and does `/admin/finance` degrade gracefully with no `fin_config` row? Fix or add to the seed if not.
- **P4 — Timing**: onboard after spec #6 **F2** merges (the strategy wizard is the difference between "here's your OS" and "here's your OS except the strategy module is empty and we have to SQL it").

## 5. The one-hour onboarding session (them + us)

1. They sign in via the invitation (their password, their org — org switcher never shows AA).
2. Build the strategy together in the wizard (or from the generic template) — by the end of the hour the scorecard is live.
3. Upload the student-leader roster CSV; watch the verdicts; commit.
4. Create the hub/chapter structure per their §3.7 answer; enroll a few leaders.
5. Leave them with: the imports page for the donor list, and the review cadence armed.
