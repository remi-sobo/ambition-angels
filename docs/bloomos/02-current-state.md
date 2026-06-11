# 02 — Current State Audit (`/admin` as of June 2026)

BloomOS is **not greenfield**. The existing admin is a real head start: ~30 Supabase tables, working finance/ops/fundraising modules, HubSpot sync, AI research agents, and a PWA shell. This doc inventories what exists, the verdict per area, and the urgent fixes.

## ⚠️ Phase 0 — urgent, independent of everything else

1. **`claude-sonnet-4-20250514` is retired June 15, 2026** (days away). `app/api/career-quiz/route.ts` and any other call sites must move to `claude-sonnet-4-6`. Also note: prompt-based JSON forcing / assistant prefill returns HTTP 400 on 4.6+ — migrate to structured outputs (`output_config.format`).
2. **Auth is a shared-password cookie storing the password itself as the cookie value** (`lib/admin/auth.ts`). Two users ("remi", "shannon") map to env-var passwords. No hashing, no sessions, no revocation, no MFA. This is the single biggest blocker for everything else and is Ring 1's first deliverable.
3. **Every DB access uses the service-role client** (`lib/supabase/admin.ts`), bypassing RLS. There is no RLS posture at all. Acceptable for a 2-person internal tool; fatal for a product holding donor + minor data.

## Inventory and verdicts

| Area | What exists | Verdict |
|---|---|---|
| **Dashboard** (`/admin`) | Stats overview, AnalyticsView | **Replace** with BloomOS Command Center (modules/01) |
| **Fundraising** (`/admin/fundraising`) | HubSpot-synced prospects (`hs_contacts/companies/deals/engagements`, `hs_sync_jobs`), prospect scoring (`fr_prospect_scores`), AI research briefs (`fr_prospect_briefs`, `lib/agents/funder-research/` — already does tool-use + web search + structured briefs) | **Evolve.** The funder-research agent is genuinely ahead of market. The HubSpot mirror becomes a one-time importer; BloomOS's own `constituents`/`gifts`/`opportunities` become the system of record (modules/03) |
| **Finance** (`/admin/finance`) | CSV import + dedup (`fin_imports`, `lib/finance/parsers.ts`), transactions with categorization rules (`fin_transactions`, `fin_category_rules`, restricted-fund toggle), budget vs actual (`fin_budget`, QB budget import), revenue commitments/pledges (`fin_revenue_commitments`), config | **Evolve.** The category/restricted model survives. CSV import is replaced by QuickBooks OAuth sync (modules/04); CSV stays as fallback. Budget editor survives until QBO budget read lands |
| **Ops** (`/admin/ops`) | Projects + tasks (`ops_projects`, `ops_tasks`), Today/This Week views, **Monday Plan / Friday Review pages** (the ritual!), activity log, quick-add | **Keep & polish.** Research confirmed the Monday/Friday ritual is a differentiator no incumbent ships. Becomes Operations → Projects (modules/06) with assignees/recurrence added |
| **Meet** (`/admin/meet` + `/meet`) | Full scheduling product: meeting types, availability, bookings, Google Calendar + Gmail integration, reminders via cron, ICS, blackouts | **Keep.** Becomes Operations → Meetings. Already near product-quality |
| **Board** (`/admin/board`) | Page exists (static) | **Replace** with Governance → Board (modules/07) |
| **Compliance** (`/admin/compliance`) | Page exists (static) | **Replace** with Governance → Compliance calendar (modules/07) |
| **Program** (`/admin/program`) | Page exists (thin) | **Replace** with Program module (modules/02) |
| **Demo Day** (`/admin/demoday`) | Signups, notes, tracker | **Fold into** Program → Events/Cohorts |
| **YGB** (`/admin/ygb`, `/ygb`) | Registrations, attendance | **Fold into** Program (cohort + attendance pattern generalizes it) |
| **Analytics** (`page_views`, `click_events`, `lib/analytics.ts`) | First-party pageview/event capture | **Keep.** Feeds Data → Website Analytics (modules/05) |
| **Career quiz / Shannon / partner funnels** | Public-site features writing `quiz_submissions`, `partner_waitlist`, `program_partners` | **Keep**; surface as Program/Data inputs |
| **Donations** (`donations`, Stripe webhook, receipts) | Stripe payment intents + receipt email | **Keep**; merge into Fundraising gift ingestion alongside Givebutter |
| **PWA shell** (`AdminPWA`, manifest, icons) | Installable admin | **Keep** — mobile-first matters for field use |
| **Email** (Resend, `lib/email/`) | Booking/registration templates | **Keep**; Resend confirmed as the platform email choice |
| **Google integration** (`lib/google/`) | OAuth, Calendar, Gmail, Sheets | **Keep**; token storage moves to the new encrypted `connections` table |

## What the current codebase teaches us (patterns to preserve)

- **Chunked sync jobs with progress polling** (`hs_sync_jobs` + sidebar sync button) — the UX pattern generalizes to QuickBooks/Givebutter syncs.
- **Rule-based auto-categorization with human override** (`fin_category_rules` + manual picker) — the exact draft-then-approve shape we standardize on for AI features.
- **The agent architecture in `lib/agents/funder-research/`** (client, prompt, types, generate) — template for all future agents; needs migration to structured outputs + the new model IDs.
- **Restricted-fund flag on transactions** — the seed of proper fund accounting; research says restricted/unrestricted tracking is the #1 small-org finance failure.

## Migration posture

- **Database:** existing tables are not thrown away. Ring 1 adds `org_id` to every tenant table (backfilled with the Ambition Angels org), turns on RLS table-by-table, and renames/reshapes only where the new data model demands it (e.g., `hs_contacts` → import source for `constituents`).
- **Routes:** `/admin` stays the URL. New sidebar IA (06-design-system) lands first as navigation over existing pages, then pages are replaced module-by-module. No big-bang cutover.
- **HubSpot:** runs in parallel until Fundraising-module parity, then a final import freezes it. Research note: HubSpot webhooks require a public app — polling via a private app is fine for the parallel period.
