# 01 — Vision & Strategy

## 1. Product vision

BloomOS is the operating system a small nonprofit runs on. One login, one data model, seven workspaces:

1. **Command Center** — what's happening across the mission today; AI executive briefing.
2. **Program** — the participant CRM: students, schools, app engagement, internships, career readiness.
3. **Fundraising** — donor CRM, major-gift pipeline, grants, campaigns, events.
4. **Finance** — the decision layer on top of QuickBooks: revenue, expenses, cash flow, budget vs actual.
5. **Data** — website/app/student analytics, surveys, impact measurement.
6. **Operations** — team (HR-lite), meetings, projects/tasks, documents.
7. **Governance** — board, KPIs, strategic plan, compliance calendar.

Design center: a **nonprofit CEO with 1–10 staff** who currently runs the org across 8–12 disconnected tools and spreadsheets. BloomOS exists so that person can answer any operational question in under 10 seconds, run the weekly operating ritual in one place, and produce a board packet or funder report in minutes instead of days.

## 2. The market gap (validated by research, June 2026)

**Finding 1 — Nobody does the whole job at small-org prices.** The competitive scan across four research streams converged on the same matrix:

| Need | Affordable incumbent | What's missing |
|---|---|---|
| Donor CRM | Little Green Light $45/mo; Bloomerang ~$125/mo | No grants mgmt, no programs, dated UIs, per-record pricing punishes growth |
| Payments/giving | Givebutter (free) | CRM layer is thin; grants "on 2026 roadmap"; no moves mgmt |
| Participant/case mgmt | Bonterra Apricot ~$10K/yr; CharityTracker $20–60/user/mo | Price chasm: nothing credible between DIY Airtable and $10K/yr; reporting is the universal complaint |
| Work mgmt | Asana/Monday (~$0–15/mo w/ nonprofit discounts) | Generic; no nonprofit rituals; the abandonment problem |
| Finance dashboards | Fathom $53+/mo; Jirav $10K/yr | Not nonprofit-aware (no restricted funds, no 990 mapping, no program ratio) |
| Board portal | Boardable $79/mo; enterprise $5–12K/yr | Meeting mechanics only — no term tracking, COI workflow, board-giving badge |
| Impact measurement | UpMetrics $1,450+/yr; Sopact ~$500+/mo | No youth-validated free instruments + persistent participant IDs at low cost |
| Everything | Salesforce ("free" licenses) | $30K–$100K first-year true cost; consultant dependency is the defining failure for 1–10 staff orgs |

**Finding 2 — The integration tax is the real product.** Small orgs pay in staff hours to stitch Givebutter→HubSpot→QuickBooks→Sheets→Asana. BloomOS's moat is one schema where a donation, a student, a grant deadline, a task, and a board metric are rows that join.

**Finding 3 — AI is a genuine differentiator window.** Incumbent AI is thin (Bloomerang's email assistant, DonorPerfect's DonorSearch scores) or premium-priced enterprise add-ons (Blackbaud's Development Agent, Bonterra Que). Almost all sector AI investment targets fundraising; **program-operations AI for small youth orgs is open territory.** Small nonprofits adopt AI at half the rate of large ones — not from unwillingness (only 1% oppose) but from missing strategy/tools. An AI-native OS with draft-then-approve guardrails meets them where they are.

**Finding 4 — Trust and compliance are sellable features.** Youth-serving orgs hold minors' data on non-compliant Airtable tiers; districts demand NDPAs and security questionnaires nobody at a small org can answer. Shipping FERPA-aware consent tracking, audit logs, and an NDPA-ready posture converts compliance anxiety into a buying reason.

## 3. Positioning

> **For** founders/EDs of small nonprofits (1–10 staff) **who** run their mission across a dozen disconnected tools, **BloomOS** is the all-in-one nonprofit operating system **that** unifies programs, fundraising, finance, operations, and governance on one AI-assisted platform. **Unlike** Salesforce or Bonterra, it costs less than one month of consultant time per year and sets up in a day, not a quarter. **Unlike** point tools, everything connects.

Strategy formula: **LGL's price point + Bloomerang's retention intelligence + Virtuous's AI next-actions + native grants management + Salesforce PMM's program data model (simplified) + the board/compliance whitespace nobody serves — riding on Givebutter, QuickBooks, and Gusto as systems of record.**

### What BloomOS deliberately does NOT do
- **Payment processing** — Givebutter (and Stripe) keep that; we ingest.
- **Accounting** — QuickBooks Online is the ledger; we are the decision layer (the "Fathom for nonprofits" pattern).
- **Payroll/tax filings** — Gusto. We read employees, time-off, payroll totals.
- **Grant discovery** — Instrumentl's data-licensing moat; we do pipeline/deadlines/reporting, not funder search.
- **Wealth screening data** — integrate DonorSearch/import CSV; never build proprietary wealth data.
- **Email marketing at scale** — basic sends + sync to an ESP; not a Mailchimp replacement in early rings.

## 4. Pricing strategy (future SaaS)

Research-validated buyer pains: per-record pricing (Bloomerang), per-user pricing (CharityTracker, Boardable counts every board member), quote-only opacity (DonorPerfect, Apricot, every board portal), and add-on stacking.

**Therefore: flat, published, per-org pricing. Unlimited users. Unlimited records.**

Three tiers — no free tier. Names match the entitlement model in code
(`lib/admin/entitlements.ts`): Grow is the AI tier (`ai.reed` +
`ai.prospect_research`), Flourish adds human coaching (`coaching`).

| Tier | Price (target) | Includes |
|---|---|---|
| Bloom | ~$99/mo | All modules, all integrations — the complete operating system, no AI |
| Grow | ~$249/mo | Everything in Bloom + the AI layer: Reed assistant, prospect research + discovery, next-move drafting (metered per-org credit pool) — plus advanced impact/reporting, NDPA/district features, priority support |
| Flourish | TBD | Everything in Grow + human SOBO coaching (the judgment-heavy 20%) |

Anchors: total incumbent replacement cost for the same coverage is $400–$1,200+/mo (LGL + Apricot + Boardable + Fathom + UpMetrics + Asana). At $99–249 flat we are simultaneously the cheapest credible option in every category and a 5–10x consolidation saving. Per-org AI metering (see 03-architecture §AI cost controls) protects margins.

Pricing is a Ring-4 concern; it shapes architecture now only in two ways: per-org metering hooks and flat-cost infra choices (validated: full stack runs ~$50–100/mo at Ambition Angels' scale).

## 5. Go-to-market sequence

1. **Ring 0–3: Ambition Angels is the customer.** Everything ships to production at `/admin`. Dogfooding pressure-tests workflows that consultants normally configure per-client.
2. **Design partners (Ring 4):** 3–5 friendly small nonprofits (ideally youth-serving, school-partnered — our compliance posture is most differentiated there). Free/cheap in exchange for weekly feedback.
3. **Vertical-first launch:** youth-development / career-readiness nonprofits, where Program + Impact + school-compliance features have no competition at this price. Expand horizontally after.
4. **Distribution levers:** TechSoup listing, state nonprofit associations, the "Salesforce refugee" and "Bonterra price-hike" segments named explicitly in reviews, and the NDPA "General Offer" mechanism (one signed district agreement extends state-wide — a structural sales accelerator).

## 6. North-star metrics

- **For Ambition Angels (Rings 0–3):** % of weekly operations run inside BloomOS (target: 100% — HubSpot retired, spreadsheets retired); time to produce board packet (<30 min); time to produce funder report (<1 hr).
- **For the product (Ring 4+):** weekly active orgs; % of orgs connecting ≥2 integrations in week 1; time-to-first-value (<1 day); logo retention.

## 7. Honest risks

| Risk | Mitigation |
|---|---|
| Givebutter moves upmarket into CRM (they ship 180+ features/yr; grants on their roadmap) | Stay payments-agnostic (Stripe/Zeffy adapters later); our depth is programs+finance+governance, which they show no sign of entering |
| Scope: this is 7 products | Ring discipline (07-roadmap); each module ships at "small-org sufficient," not feature-parity with category leaders |
| Solo-builder bus factor | Spec-first development (this doc set), boring/standard stack, everything in one repo |
| AI features create trust incidents with minors' data | Draft-then-approve everywhere; ZDR API agreement; no PII in prompts where avoidable; see 04 §AI guardrails |
| Compliance claims create liability | Ship features + disclaimers, not legal advice; counsel review at Ring 4 before selling to school-partnered orgs |
