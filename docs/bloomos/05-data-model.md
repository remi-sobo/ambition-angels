# 05 — Data Model

The unifying idea: **one party table (`constituents`), one money spine (`gifts` + `fin_transactions`), one program spine (`enrollments` + `attendance`), one work spine (`tasks`), one metric spine (`metric registry` + `kpi_snapshots`)** — all carrying `org_id` + RLS. Below are the core entities per domain (columns abridged; every table implicitly has `id uuid pk`, `org_id`, `created_at`, `updated_at`, and RLS as per 03).

## 1. Platform core
- `orgs`, `memberships`, `invitations`, `role_permissions` — see 03 §2.
- `audit_log` (partitioned, append-only) — see 04 §2.
- `connections`, `webhook_events` — see 03 §5.
- `notifications (user_id, type, payload jsonb, read_at)`.
- `documents (folder_id, storage_path, title, doc_class, retention_class, uploaded_by)` + `doc_folders` — doc_class drives retention (permanent | 7yr | program | safeguarding); storage path = `{org_id}/{folder}/{file}`.
- `pending_actions`, `agent_actions`, `ai_usage`, `embeddings` — see 03 §6.
- `dashboards (user_id nullable, layout jsonb, widgets jsonb, version)`.
- `kpi_snapshots (metric_key, period, value numeric, meta jsonb)` — nightly materialization of registry metrics for trends/`vs last month` chips.

## 2. CRM core (shared by Fundraising and Program)

```
constituents          -- people AND organizations (funders, schools, companies)
  type ('person'|'organization'), first/last/org_name, emails[], phones[],
  address fields, tags text[], do_not_contact bool, household_id?,
  source ('givebutter'|'hubspot_import'|'manual'|...), external_ids jsonb
households            -- grouping + addressing/salutation; drives auto soft-credits
relationships         -- typed constituent↔constituent edges (spouse, employer,
                      -- board_contact, school_champion, knows)
interactions          -- calls/emails/meetings/event-attendance touch log
                      -- (constituent_id, kind, occurred_at, notes, logged_by)
```

Constituents are the single party record: a donor, a school district, a parent, a corporate partner, a board member — with role-specific extension tables below. Dedupe/merge UI is a first-class requirement (every CRM's dirty secret).

## 3. Fundraising

```
funds        -- accounting designation; carries QBO class/GL mapping; restricted flag
campaigns    -- umbrella effort: goal, date range
appeals      -- specific solicitation; belongs to campaign; source codes
gifts        -- the money spine: constituent_id (hard credit), amount, date, method,
             -- deductible_amount, fair_market_value (IRS quid-pro-quo split),
             -- campaign_id, fund_id, appeal_id, event_id?, recurring_plan_id?,
             -- pledge_id?, external (givebutter_txn_id / stripe_id),
             -- acknowledgment_status, acknowledged_at
soft_credits -- gift_id, constituent_id, type (household|daf_advisor|match_originator|solicitor), amount
tributes     -- gift_id, type (honor|memory), honoree, notify_constituent_id
pledges      -- total, schedule jsonb, balance; installments link from gifts
recurring_plans -- amount, frequency, status, external plan id
opportunities   -- major-gift asks: constituent_id, stage (identify→qualify→cultivate→
                -- solicit→steward), ask_amount, ask_date, probability, owner,
                -- capacity_rating, affinity_rating, next_move task link
grants          -- funder (org constituent), stage (prospect→qualified→loi→proposal→
                -- submitted→awarded|declined→active→closed), amount_requested/awarded,
                -- restrictions, period start/end, program_id?
grant_requirements -- grant_id, kind (loi|application|interim_report|final_report|
                   -- financial_report), due_date, status, submitted_at  ← the calendar
acknowledgments    -- gift_id, template, channel, sent_at, pdf_path (regenerable, audited)
segments           -- saved query definitions (jsonb filter tree)
```

Invariants: GL/fund codes derive from `funds`, never hand-typed on gifts. Soft credits never count in revenue rollups, always in recognition rollups (two aggregate paths). Gifts ≥$250 require acknowledgment tracking; quid-pro-quo >$75 requires FMV disclosure fields.

## 4. Program (participant CRM)

```
programs            -- the offering (e.g., Internship Simulations, YGB)
program_terms       -- year/semester/summer cycle
cohorts             -- program_term × site/school grouping; capacity
participants        -- extends constituents (person): DOB, school_id, grade,
                    -- race_ethnicity (OMB SPD-15 combined multi-select + detail),
                    -- ses fields (FRPL + alternatives), preferred language
guardians           -- constituent link + relationship + custody/pickup flags (M:N)
applications        -- form responses, eligibility result, priority tier, lottery number
waitlist_entries    -- position, priority, offer/expiry
enrollments         -- participant × cohort: stage (applied→accepted→enrolled→active→
                    -- placed→completed | withdrawn/dismissed), start/end, exit_reason
                    -- + rollups: attendance_rate, consecutive_absences, last_service_date
stage_transitions   -- enrollment_id, from→to, gate_checklist jsonb, actor, ts
milestones / milestone_completions   -- per-stage checklists → certificates/badges
sessions            -- scheduled service instances (cohort, date, location)
attendance          -- enrollment × session: status, checkin/checkout ts, method
                    --   (kiosk|qr|roster|admin), recorded_by  → dosage rollups
case_notes          -- enrollment_id, body, note_type, confidentiality_tier
                    --   (general | case | sensitive), author  ← tier drives RLS
consent_records     -- see 04 §3: type, signer slots (guardian + youth assent),
                    -- e-sign audit jsonb, valid_from/until, doc_version, pdf_path
schools             -- org constituents + district, tier (prospect|pilot|active|anchor)
school_agreements   -- MOU/DSA per school: kind, term dates, renewal_due, board_approved,
                    -- coi_expiry, data_elements jsonb (Exhibit B), breach_sla, status
school_contacts     -- champion/site-coordinator roles on relationships
internships         -- placement records: participant, company constituent, role,
                    -- start/end, hours, supervisor contact, status
alumni_profiles     -- personal contact (non-school email/phone), secondary contact,
                    -- consent to contact
outcome_records     -- alum outcomes: kind (college_enrollment|persistence|degree|
                    -- employment|wage_band), source (nsc|survey|self_report), date
volunteers/mentors  -- constituent extension: skills, availability, employer
screening_records   -- application, interview notes, references, background check
                    --   (vendor, package, status, completed, expires), training hours
matches             -- mentor × participant: criteria scores, status, closure reason
match_support_contacts -- cadence log (2x first month, monthly after — EEP B.5.1)
volunteer_hours     -- logged + approved hours; valued at Independent Sector rate
incident_reports    -- restricted tier, long retention
```

Modeled on Salesforce PMM (`Program → Engagement → ServiceDelivery`, verified field-level) simplified for small orgs; 21st-CCLC-compatible (configurable "regular attendee" thresholds, hours rollups).

## 5. Finance

```
fin_accounts        -- mirrored QBO chart of accounts (read-only)
fin_classes         -- QBO classes = program/functional dimension mapping
fin_transactions    -- (exists) + qbo_id, class_id, functional_category
                    --   (program|mgmt_general|fundraising), restricted flag, fund_id?
fin_budgets         -- (exists, reshaped) period × account × class amounts; source
                    --   ('qbo_read'|'manual')   ← QBO budgets are READ-ONLY via API
fin_report_cache    -- cached QBO report payloads (P&L, BS, by-class) + computed
                    --   budget-vs-actual joins; refreshed nightly + on-demand
revenue_commitments -- (exists) pledged/expected revenue feeding cash forecast
cash_forecast_lines -- 13-week rolling: source (recurring|pledge|grant_schedule|
                    -- payroll|rent|manual), week, amount, confidence
```

## 6. Operations & Governance

```
projects / tasks        -- (exist) + assignee, due, status, recurrence rule, triage flag
meeting_types/bookings  -- (exist, /meet)
team_members            -- staff/contractor/volunteer records; gusto_id?; clearances→
                        --   screening_records; onboarding_checklists; checkin_notes
board_members           -- constituent ext: officer_role, term_start/end, term_number,
                        --   class (stagger group), coi_signed_at (annual), giving_status
board_meetings          -- date, agenda jsonb (consent-block item type), packet_doc_id,
                        --   quorum_met, attendance jsonb
minutes                 -- motions (text, mover, seconder, tally), approved_at, immutable_after_approval
resolutions             -- incl. unanimous-written-consent e-votes (must be unanimous)
compliance_items        -- the calendar engine: kind (form_990|state_charitable_reg|
                        --   corporate_report|insurance|941|1099|w2|sales_tax_exempt|
                        --   contract_renewal|policy_review|custom),
                        --   jurisdiction, basis (fixed_date|fye_offset|anniversary),
                        --   due_rule jsonb, assigned_to, status, evidence_doc_id
contracts               -- counterparty, value, start/end, auto_renew, notice_deadline
                        --   (the alert anchor), owner, doc_id
strategic_plans / plan_goals / plan_initiatives  -- goal → initiative → linked tasks/KPIs
surveys / survey_questions / survey_responses    -- instrument library; respondent =
                        -- participant_id (persistent ID = the differentiator) or token;
                        -- retrospective-pre/post paired fields; PPRA protected-topic flags
```

## 7. Conventions

- Soft delete via `deleted_at` + scheduled purge per retention class (04 §3).
- `external_ids jsonb` on synced entities; sync upserts match on `(provider, external_id)`.
- Generated TS types from Supabase (`database.types.ts`) replace hand-maintained types.
- Money: `numeric(12,2)`; dates in UTC timestamptz; org-local timezone in `orgs.settings`.
- Every new table ships in the same migration as its RLS policies + indexes (org_id, FKs) — CI rejects tables without policies.
