# Module 05 — Data (Analytics, Surveys & Impact)

**Sidebar:** Website Analytics · App Analytics · Student Analytics · Surveys
**Job:** evidence. First-party analytics for web + app, the impact-measurement engine (logic model → instruments → persistent-ID surveys → funder-grade outcomes), and the funder report generator. Competitors charge $1,450–$6,250/yr (UpMetrics) to $500+/mo (Sopact) for the impact half alone.

## Website Analytics

Existing first-party capture (`page_views`, `click_events`) formalized: visitors, conversion rate (configurable goal events — donate click, signup, quiz completion), email signups, top pages, UTM/source attribution, trends. Privacy-first (no third-party ad-tech — also a compliance requirement, 04 §3). Dashboard = mockup's panel.

## App Analytics

`app_events` ingestion API (Program module owns the pipe): active students (DAU/WAU/MAU), opportunities applied, simulations/challenges completed, mentor connections, hours logged — org-level trends here; per-student detail on Program profiles. Schema contract with the app team is a Ring-3 prerequisite.

## Student Analytics

Cross-cutting program evidence views (reads Program data):
- Journey funnel conversion over time; cohort comparisons (attendance, completion, outcomes by cohort/site/term).
- Demographics served, disaggregatable (OMB SPD-15 categories) — **the funder ask** — with small-cell suppression on export (04 §3).
- Dosage-outcome views (attendance bands × outcome change) — the evidence pattern funders and the research base reward.
- WIOA-vocabulary KPI templates (placement Q2/Q4-style, credential attainment, measurable skill gains) — the lingua franca even private funders borrow.

## Surveys & Impact (the engine)

1. **Logic model builder** (Kellogg 5-column: Inputs → Activities → Outputs → Outcomes → Impact): guided setup; **every metric and survey question maps to a logic-model node** — this addresses the documented #1 small-org capacity gap (outputs reported as outcomes) and auto-structures funder reports.
2. **Instrument library**: free validated instruments shipped in-product — Career Adapt-Abilities Scale (free), CMI Form C (free via Vocopher), Search Institute SCALE social-capital measures (free), Employability Skills Framework items, retrospective pre/post templates. Licensed scales (CDSE-SF ~$2.50/admin, DAP, HSA) flagged "bring your own license." Custom questions allowed, with a **PPRA protected-topics screen** that gates school-administered surveys behind consent/opt-out settings (04 §3).
3. **Survey runner with persistent participant IDs** — the single biggest technical differentiator vs Google Forms: responses link to `participants`, so pre/post matching, longitudinal waves, and demographics joins are automatic. **Retrospective pre/post ("post-then-pre") is the default methodology** (validated with HS youth; one administration; avoids response-shift bias); true pre/post optional. Delivery: link/QR/kiosk during program time (the response-rate winner), incentive tracking for alumni waves. Consent linkage: a survey can require an active consent record before assignment.
4. **Analysis**: change scores ("% maintained or improved" — the BBBS-style framing funders digest), disaggregation, trend by cohort. **AI thematic coding of open-ended responses**: AI proposes themes → staff approve/edit codebook → every theme traceable to quotes; sentiment automated (κ≈0.9 reliable); "evidence of impact" judgments stay human (κ≈0 — the research is unambiguous).
5. **Funder Report Generator** (the output that closes renewals): select grant/funder + period → assembles the universal ask — demographics served (disaggregated), outputs vs targets, outcome change scores, 1–2 stories (pulled from coded quotes, human-picked), budget vs actual for the funded program (Finance crossover), challenges/lessons field → branded PDF/doc draft. Trust-based-philanthropy ready: the same data renders as a one-pager.

## KPIs for this module
Survey response rates by wave, instrument coverage (% of enrolled with pre+post), report turnaround time (target: funder report <1 hr), logic-model coverage (% of metrics mapped).

## Open questions
- AA's current theory of change / logic model — workshop to encode it (good onboarding-flow dry run).
- NSC StudentTracker for Outreach pricing (unpublished — inquire) for the alumni outcomes feed.
- Story library workflow: where quotes/photos with media-consent status live (ties to consent records).
