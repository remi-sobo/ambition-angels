# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

BloomOS: the operating system for nonprofits, served at app.bloomos.org. This repo holds only the app. The Ambition Angels website (ambitionangels.org, the teen games, the career library and the website admin) lives in its own repo, `remi-sobo/ambition-angels`, with its own Vercel project and Supabase database (specs/bloomos-repo-split.md).

## Commands

```bash
npm run dev        # dev server at localhost:3000 ("/" goes to /admin)
npm run build      # production build
npm run lint       # ESLint via next lint
npm test           # vitest run (tests/*.test.ts)
npm run qa:visual  # Playwright visual QA (e2e/, auth-gated, run on a real session)
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint and `npm test`. `rls-test.yml` applies every migration to a throwaway Postgres and runs the cross-role leak assertions in `supabase/tests/rls-leak-test.sql`. `migration-ledger.yml` diffs production's applied-migration ledger against `supabase/migrations/` in both directions, so DDL applied without a committed file, or a file committed without being applied, fails the build (`scripts/check-migration-ledger.ts`). `tests/migrations.test.ts` enforces that every `create table` / `create index` is idempotent (`if not exists`).

## Stack

Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase (Postgres, auth, RLS), Anthropic Claude API, Resend and Gmail (email), Google Calendar, HubSpot sync, Stripe webhook. Deployed to Vercel.

## What's here

- `/admin`: the app itself, an installable PWA (fundraising, finance, programs, work, impact, organization, comms, inbox, settings). Multi-tenant: membership and permissions come from `getOrgContext` in `lib/admin/auth.ts` and RLS. Middleware only checks that someone is signed in and enforces two-step login.
- `/board`: the board portal. `/meet`: the meeting scheduler. `/strategy`: the Strategy Room (password or an `aa.strategy_room` session). `/coach/me/[token]`: Ambition Coach private links.
- `app/api/intake`: the intake API the Ambition Angels website sends its forms to, authenticated by a per-org key (`org_api_keys`), never a database key.
- `app/api/cron/*`: scheduled jobs (`vercel.json`), each behind `CRON_SECRET`. `site-signals` pulls the website's daily numbers into Ambition Angels' metrics.
- `app/api/{google,webhooks,reed,mcp,hub,ingest,stripe-webhook,unsubscribe,t}`: integrations, the MCP connector, the Trellis hub snapshot, task ingest, gift recording, unsubscribe and email tracking.
- `middleware.ts`: "/" redirects to /admin; session refresh and the auth gates. `next.config.mjs` holds the V1 to V2 admin redirect map (never removed: sent emails carry old paths) and the redirects for Careers and Analytics, which moved to the website admin.
- Ambition Angels-only features sit behind `aa.*` entitlements (`lib/admin/entitlements.ts`). No other tenant sees them.

Data lives in Supabase (`lib/supabase/*`, types in `lib/database.types.ts`). Migrations in `supabase/migrations/`.

The website's tables (`ms_*`, `game_*`, `cut_*`, `page_views`, `click_events`) are still in this database until phase 4 of the split drops them. Nothing in this repo reads them; the RLS leak test still covers them until then.

## Brand

Tailwind tokens in `tailwind.config.ts`, CSS variables in `app/globals.css`. Admin chrome uses `navy` `#10214B`; `orange` `#E8500A` is the accent. Fonts are self-hosted via `next/font/local` (`app/fonts/`): Big Shoulders Display, Poppins, DM Sans, Instrument Sans.

## Environment variables

See `.env.example`. This project holds no website-only keys: no `STRIPE_SECRET_KEY`, `DEMO_*`, `DEMODAY_PASSWORD`, `GAMES_TOKEN_SECRET`, `SITE_*` or `BLOOMOS_INTAKE_*`.
