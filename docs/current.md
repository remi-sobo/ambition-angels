# BloomOS Fundraising — Current State (as-built)

> Snapshot: June 2026. The fundraising module after Phases 0B–3 and the HubSpot
> two-way sync. Companion to `docs/fundraising-roadmap.md` (the plan); this doc
> is what actually exists today. Live Supabase project: **Ambition-Angels**
> (`kzzdtibbwsucloaoqpqa`).

## Summary

The stack is at or beyond commercial-CRM parity (Bloomerang / Virtuous / NPSP)
on operations, money-in, reporting, donor communications + automation, and a
connectable two-way HubSpot sync. The `gifts` table remains the single revenue
spine; every money path (Stripe, manual entry, pledge fulfillment, import)
lands there, and rollups/retention/engagement read from it.

## Admin pages (`app/admin/fundraising/`)

| Route | Purpose |
|---|---|
| `/` | Major Gifts moves-management pipeline (shared `Pipeline`) |
| `/prospects`, `/prospects/[hubspot_id]` | HubSpot prospect research + 7-dim scoring + AI brief |
| `/donors`, `/donors/[id]` | Donor list (retention + engagement) and the unified profile (Profile, Household, Activity timeline) |
| `/grants`, `/grants/[id]` | Grant pipeline + requirements calendar |
| `/campaigns` | Campaign → appeal attribution |
| `/acknowledgments` | IRS-compliant thank-you queue (AI-drafted notes) |
| `/reports` | Gifts report (date/campaign/fund/method) + saved segments + CSV |
| `/pledges`, `/pledges/[id]` | Pledges + installment schedules; fulfillment → gifts |
| `/recurring` | Recurring plans, monthly run-rate, failed-payment follow-up |
| `/comms` | Email campaigns → saved segments |
| `/journeys` | Triggered multi-step email sequences |
| `/duplicates` | Email-based duplicate detection + merge |
| `/import` | CSV import wizard (donors + gifts) |
| `/settings` | HubSpot connection + sync toggles; Data-hygiene links |

Public: `/donate` (Stripe card + Apple/Google Pay + cover-the-fee + stock/DAF).

## Key API routes (`app/api/`)

- **Gifts:** `admin/gifts` (POST), `admin/gifts/[id]` (PATCH/DELETE), `admin/gifts/[id]/soft-credits`, `admin/gifts/export`
- **Constituents:** `admin/constituents` (POST), `[id]` (PATCH), `admin/constituents/merge`
- **Interactions / households:** `admin/interactions`, `admin/households` (+`[id]`)
- **Opportunities / grants / campaigns:** `admin/opportunities*`, `admin/grants*`, `admin/campaigns*`, `admin/appeals`
- **Pledges:** `admin/pledges` (+`[id]`, `payments/[id]`)
- **Recurring:** `admin/recurring` (+`[id]`)
- **Segments / reports / import:** `admin/segments` (+`[id]`), `admin/donors/export`, `admin/import/constituents`
- **Comms:** `admin/comms` (+`[id]`, `[id]/test`, `[id]/send`)
- **Journeys:** `admin/journeys` (+`[id]`), cron `cron/journeys`
- **Acknowledgments:** `admin/acknowledgments/{draft,send,mark}`
- **HubSpot:** `admin/integrations/hubspot`, `webhooks/hubspot` (inbound)
- **Donations (public):** `create-payment-intent`, `save-donation`, `stripe-webhook`, `send-receipt`, `unsubscribe`

## Data model (Postgres / Supabase)

Spine + money: `constituents`, `households`, `relationships`, `interactions`,
`funds`, `campaigns`, `appeals`, `gifts`, `recurring_plans`
(+`last_charged_at`/`last_payment_failed_at`), `soft_credits`,
`acknowledgments`. Pipelines: `opportunities` (+`external_ids`), `grants`,
`grant_requirements`. Phase 2/3: `pledges`, `pledge_payments`, `segments`,
`email_campaigns`, `email_sends`, `journeys`, `journey_steps`,
`journey_enrollments`. Integration: `connections`, `webhook_events`, `hs_*`
mirror, `fr_*` (scores/briefs/agent). All fundraising tables carry `org_id`
(resident-tenant default) + per-domain RLS (`fundraising.read/write`).

## Shared libraries (`lib/fundraising/`, `lib/hubspot/`)

- `fundraising/`: `display`, `retention` (LYBUNT/SYBUNT/cadence), `engagement`
  (0–100 score, unit-tested), `receipt` (IRS Pub 1771), `grants`, `pledges`
  (schedule generator), `segments` (recipient resolver), `comms-email`,
  `unsubscribe` (signed tokens).
- `hubspot/`: `client` (GET + POST/PATCH), `fetchers`, `upserts`, `connection`
  (gates: `sync_out` / `sync_in` / `sync_gifts_as_deals`), `sync-out`, `sync-in`.

## Integrations

- **Stripe** — one-time + recurring donations; webhook ingests renewals,
  flags failed recurring payments. Wallets + cover-the-fee on `/donate`.
- **Resend** — receipts, acknowledgments, comms campaigns, journey steps.
- **HubSpot (two-way, opt-in)** — outbound push (contacts/companies/
  engagements/deals) on local writes; inbound webhooks apply contact/company
  changes back. BloomOS is system of record; off by default; managed from
  `/settings`.
- **Anthropic** — acknowledgment-note drafting + funder-research briefs.

## Automation (Vercel cron, `vercel.json`)

`cron/journeys` (hourly :15) enrolls on first-gift / lapsed triggers and
advances due enrollments. Other crons: meet-reminders, daily-reminders,
weekly-digest.

## Environment variables

`ANTHROPIC_API_KEY`; Supabase (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`); Stripe
(`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`STRIPE_WEBHOOK_SECRET`); `RESEND_API_KEY`; `CRON_SECRET`;
`NEXT_PUBLIC_SITE_URL` (unsubscribe links); optional `UNSUBSCRIBE_SECRET`;
HubSpot (`HUBSPOT_ACCESS_TOKEN` outbound, `HUBSPOT_CLIENT_SECRET` inbound
webhook verification).

## Activation checklist (owner)

- **Donate wallets:** verify the domain in Stripe for Apple Pay (Google Pay
  works without). ACH not yet enabled (needs Financial Connections).
- **Comms/journeys:** ensure `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL`,
  `CRON_SECRET` are set; start sends on a small segment.
- **HubSpot:** set tokens, create the inbound webhook subscription →
  `/api/webhooks/hubspot`, then connect + toggle directions in `/settings`.

## Remaining (optional)

- **Epic L** — wealth/firmographic enrichment (DonorSearch/iWave) + QuickBooks
  Online sync (fields `funds.gl_code`/`qbo_class` already exist).
- **X5** — durable outbound retry queue + Stripe-ingested-gift → HubSpot deal.
- **X8** — move the HubSpot token from env into encrypted
  `connections.access_token_enc`.
