# 07 — Roadmap: Rings

Principles:
1. **Every ring ships to production at `/admin` and Ambition Angels runs on it.** No long-lived branches, no big-bang.
2. **Foundations early, modules incrementally.** Multi-tenancy/auth/RLS are Ring 1 because retrofitting them is the one catastrophically expensive deferral. Everything else can iterate.
3. **Fundraising before Program before HR** — ordered by money-impact for AA and by commercial importance.
4. Each ring lists an exit criterion ("done means"). Sizes assume one strong builder + AI tooling; a ring ≈ 4–8 focused weeks.

---

## Ring 0 — Stop the bleeding (days, do immediately)
- Migrate all Anthropic calls off `claude-sonnet-4-20250514` (retires **June 15, 2026**) → `claude-sonnet-4-6`; replace prefill/prompt-JSON with structured outputs (`output_config.format`).
- Pin Next.js ≥ 14.2.25 (CVE-2025-29927 class).
- Enforce MFA on operator accounts (GitHub, Vercel, Supabase, Google Workspace).
- Set up nightly off-platform `pg_dump` (GitHub Action → R2/S3).

**Done means:** production AI features keep working past June 15; backups exist outside Supabase.

## Ring 1 — Foundation (auth, tenancy, shell)
- Supabase Auth replaces password-cookie: email+password + TOTP for admins, magic links for future board viewers. Real users for Remi + Shannon.
- `orgs` / `memberships` / `role_permissions` / `invitations`; backfill AA org; add `org_id` to all existing tables; **enable RLS table-by-table**; convert routes from service-role to user-JWT clients; cross-tenant leak tests in CI.
- New sidebar IA (06) over existing pages; shadcn/ui + tokens installed; stat-card/table/pipeline primitives.
- Inngest installed; `meet-reminders` cron migrated; `webhook_events` + `connections` tables; audit_log (partitioned) live with writes on sensitive paths.
- Metric registry skeleton + `kpi_snapshots` nightly job; Command Center v1 (finance + ops widgets from existing data, org-health placeholder).
- Trust basics: trust page draft, subprocessor list, IR/retention policies, signed Supabase/Vercel DPAs.

**Done means:** AA logs in with real auth; every table has RLS; the new shell is the daily driver; Command Center v1 replaces the old dashboard.

## Ring 2 — Fundraising + Finance core (the money ring)
- **Fundraising:** constituents/households/gifts schema; **Givebutter connection** (API key + webhooks + nightly reconciliation); Stripe donations merged; HubSpot one-time importer (parallel-run); donor profiles + giving timeline; acknowledgments queue with IRS-compliant templates + AI-drafted thank-yous; LYBUNT/lapse flags v1; segments + CSV export; major-gift pipeline (opportunities Kanban) with funder-research agent attached (migrated to structured outputs).
- **Grants:** pipeline + `grant_requirements` calendar + Command Center surfacing.
- **Finance:** QuickBooks OAuth connection (start Intuit security questionnaire immediately); nightly CDC sync + report cache; Revenue/Expenses pages from QBO (Class-mapped functional view); computed Budget-vs-Actual; months-of-cash headline; CSV import demoted to fallback.
- Campaigns/funds/appeals attribution on gifts.

**Done means:** HubSpot frozen; every gift flows automatically; Remi sees pipeline + BvA + runway without spreadsheets; grant deadlines never live in someone's head.

## Ring 3 — Program + Impact (the mission ring)
- Students roster + guardians + journey pipeline (configurable stages) + cohorts; Demo Day/YGB folded in.
- Attendance (roster-tap mobile + QR) with dosage rollups; consent dashboard with clickwrap dual-signature flow + program-year renewals.
- Schools partner CRM: agreements (MOU/DSA records, renewal countdowns, clearance cross-check), champion contacts, partnership health v1.
- Internships placements; volunteers/mentors with screening + clearance tracking (manual records; vendor API later).
- **Surveys & Impact:** logic-model builder, instrument library (free instruments), persistent-ID survey runner (retrospective pre/post default), change-score views, AI thematic coding (draft-then-approve), **Funder Report Generator v1**.
- App analytics ingestion endpoint (schema contract with app team); Student Analytics views; case notes with confidentiality tiers; early-warning outreach prompts (rule-based).
- Cash-flow 13-week forecast (needs pledge/grant schedules from Ring 2).

**Done means:** every AA student, school, and consent lives in BloomOS; attendance taken on a phone; one funder report produced end-to-end in under an hour.

## Ring 4 — Governance + Ops polish + AI everywhere (the leverage ring)
- **Board:** members/terms/COI/giving tracking; agenda builder + consent blocks; minutes workflow; **packet generator**; magic-link board portal (board_viewer role live); written-consent e-votes (SignWell).
- **Compliance calendar** with seeded template library + contract/vendor tracker.
- **KPIs scorecard + Strategic Plan** (migrate `/strategy`).
- **Ops:** Monday Plan/Friday Review productized with AI suggestions; Triage inbox; meeting notes→tasks; recurrence; Team records + onboarding checklists + check-ins (Gusto connection if pre-approval cleared).
- **Executive Briefing** full version (daily/weekly/board modes) + org-data chat agent; org health score real formula; per-org AI metering + Langfuse.
- Trust hardening for sale: CAIQ Lite pre-filled, NDPA-ready posture, counsel review of compliance claims, accessibility pass (WCAG 2.1 AA).

**Done means:** board meetings run from BloomOS (packet <30 min); compliance calendar is the org's source of truth; the Monday/Friday ritual is AI-assisted; AA runs 100% of weekly operations in BloomOS.

## Ring 5 — Productization (BloomOS the company)
- Org onboarding flow (create org, connect Givebutter/QBO, import CSVs, seed compliance templates, logic-model wizard) — **time-to-first-value < 1 day, zero consultants** (the anti-Salesforce promise).
- Tenant theming; billing (Stripe) with flat tiers + AI credit pools; usage metering surfaces.
- 3–5 design partners onboarded; feedback loop; pricing validated.
- Public site for BloomOS; security questionnaire kit; SOC 2 budget-path kickoff **only when a deal demands it** (~$8–15K, 5–7 months to Type II — see 04 §6).
- Adapters roadmap opens by demand: Stripe/Zeffy giving, Bloomerang/LGL importers (switching kits), Sterling/Checkr API, NSC StudentTracker, ESP sync, SAML.

**Done means:** a nonprofit that isn't Ambition Angels runs its Monday morning in BloomOS without us on a call.

---

## Cross-ring tracks (always-on)
- **Spec maintenance:** module docs updated as decisions land (this folder is the source of truth).
- **Data safety:** every migration ships RLS + indexes; quarterly restore test; advisors lint in CI.
- **Dogfood journal:** weekly friction notes from AA usage — the Ring-5 onboarding flow is built from this list.

## Biggest open risks to manage early
1. **Intuit production approval + CorePlus metering** (Ring 2 gate) — file the questionnaire the week QBO work starts.
2. **Gusto partner pre-approval lead time** (Ring 4 dependency) — file at Ring 3.
3. **App event schema** (Ring 3) — agree the contract with the app team a ring ahead.
4. **Counsel review** of consent/compliance features before any external sale (Ring 4 exit).
