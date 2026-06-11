# Module 02 — Program

**Sidebar:** Students · Schools · Ambition App · Internships · Career Readiness
**Job:** the participant CRM — every student's journey from discovery to launch, every school partnership, every placement — with youth-data compliance built in. This is the module with the least competition at small-org prices (the Apricot-vs-Airtable price chasm) and our vertical wedge.

Data model: 05 §4 (modeled on Salesforce PMM: Program → Enrollment → Session/Attendance, simplified).

## Students

1. **Roster & profiles**: demographics (OMB SPD-15 combined race/ethnicity multi-select), school, grade, guardians (M:N with custody/pickup flags), emergency contacts, medical profile (restricted tier), tags. Profile timeline = interactions, attendance, milestones, surveys, consents in one feed.
2. **Journey pipeline** (the mockup's Discover → Learn → Practice → Connect → Launch): configurable stage model over `enrollments.stage` with per-stage gate checklists (consents signed, training done, placement confirmed). Funnel view with counts + conversion %; drag-to-advance with gate validation. Maps to peer-org models (Year Up, Genesys Works lifecycles).
3. **Intake**: application forms (public form builder → `applications`), eligibility screening, priority tiers, waitlist with auto-offer; over-recruitment support (selectivity correlates with outcomes).
4. **Consent dashboard** (the compliance centerpiece, see 04 §3): per-student grid of consent types × status (signed/expiring/missing); dual parent-permission + youth-assent e-sign slots via clickwrap flow (emailed link to guardian-of-record + audit trail); annual renewal campaigns at program-year rollover; age-18 transfer flag.
5. **Attendance & dosage**: sessions per cohort; check-in via roster-tap (mobile/PWA) + QR/kiosk mode; rollups per enrollment (rate, hours, consecutive absences, 21st-CCLC-style "regular attendee" configurable threshold); thresholds gate stipends/certificates (80% completion convention).
6. **Cohorts**: program_term × site; capacity, cohort dashboard (enrollment vs capacity, attendance, completion). Demo Day and YGB fold in as cohorts/events here.
7. **Case notes** with three confidentiality tiers (general / case / sensitive) enforced by RLS; same-day entry encouraged; mentors/volunteers never see case notes.
8. **Early-warning flags** (rule-based, transparent — 04 §5): consecutive absences ≥ N, attendance < threshold, days-since-last-touch. Framed as "outreach prompts" with a one-tap "log outreach" action; flag-rate audit by demographic.
9. **Alumni**: exit capture (personal email/phone/secondary contact + consent), survey waves (6mo/12mo/annual, gift-card incentive tracking), **National Student Clearinghouse StudentTracker export/import** (roster out, enrollment/persistence/degree data in).

## Schools (partner CRM)

1. School/district records (org constituents) with tier (prospect → pilot → active → anchor), named **champion/site-coordinator contacts**, touchpoint log on the kickoff/mid-year/end-of-year cadence ("days since last principal touch" health chip).
2. **Agreements**: MOU + DSA records per school — term dates, renewal countdown (90-day alert), board-approval date, COI/insurance expiry, per-staff clearance cross-check (*the* documented renewal-delay failure), authorized data elements (NDPA Exhibit B), breach SLA. AI copilot extracts terms from uploaded MOU PDFs into the record (draft-then-approve).
3. **Partnership health**: per-school referral→enrollment yield, regular-attendance rate, cadence health, compliance health, data-reciprocity status. Renewal pipeline view (active / due <90d / negotiating / lapsed).

## Ambition App

Ingestion endpoint + dashboard for the student app's events (active students, opportunities applied, simulations/challenges completed, mentor connections, hours logged — the mockup's panel). v1: the app POSTs events to a BloomOS ingest API keyed per org; events land in an `app_events` table feeding Data → App Analytics and per-student profiles (engagement on the journey pipeline).

## Internships

Placement tracking: participant × company × role, supervisor contact, start/end, hours, status (sourcing → matched → active → completed), supervisor feedback capture. Company partners are constituents (shared with Fundraising — a corporate partner can be both internship host and donor; one record). `lib/internships.ts` (public catalog) eventually reads from this table.

## Career Readiness

1. **Mentor/volunteer management** (MENTOR EEP-aligned): screening pipeline (application → interview → references → background check via Sterling/Checkr integration or manual record → ≥2h pre-match training gate); matching (weighted criteria: interests/availability/proximity + youth/parent preference, staff decides); match support contact log enforcing **2x-first-month-then-monthly** cadence with overdue dashboard; structured closure with exit forms. Clearance expiry blocks student-facing assignment (04 §4).
2. **Career interest & readiness tracking**: quiz/app interest data (the mockup's Top Career Interests donut), curriculum/simulation completion (Career Readiness milestones), volunteer hours valued at the Independent Sector rate ($36.14/hr 2025, configurable annual update) for impact reporting.

## AI features (all draft-then-approve)
- MOU/agreement term extraction; outreach-prompt summaries ("3 students need a touch this week, here's context"); session-note summarization for coordinators; survey thematic coding (with modules/05); draft parent communications.

## KPIs
Students served, enrollment vs capacity, attendance/dosage, stage conversion %, placement rate, completion rate, regular-attendee count, mentor match health, school renewal rate, consent coverage %.

## Open questions
- Which journey stages are gates vs labels for AA's actual programs (workshop with Remi).
- App event schema — coordinate with the app team before Ring 3.
- Background-check vendor: Sterling Volunteers ($19–39/check, volunteer-priced) vs Checkr (API-first) — decide at build; v1 supports manual record-keeping either way.
