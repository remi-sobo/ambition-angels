# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start dev server at localhost:3000
npm run build      # production build
npm run lint       # ESLint via next lint
npm test           # vitest run (unit tests in tests/*.test.ts)
npm run qa:visual  # Playwright visual QA (e2e/, auth-gated, run on a real session)
```

Tests live in `tests/*.test.ts` (vitest) and run in CI via `.github/workflows/ci.yml` (typecheck + lint + `npm test`). A separate `.github/workflows/rls-test.yml` applies every migration to a throwaway Postgres and runs the cross-role leak assertions in `supabase/tests/rls-leak-test.sql`. `tests/migrations.test.ts` enforces that every `create table` / `create index` is idempotent (`if not exists`). The public site's only standalone test is `tests/availability.test.ts`; the rest cover BloomOS (finance runway, constituent resolution, briefing, stewardship, and more).

## Stack

Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase (Postgres + auth), Stripe (donations), Anthropic Claude API, Resend/Gmail (email), HubSpot (fundraising CRM sync). Deployed to Vercel.

## Architecture

**App Router** — all routes live under `app/`. The root layout (`app/layout.tsx`) wraps pages with `<Nav>` and `<Footer>` via `components/SiteChrome.tsx`, which skips that chrome for standalone routes (`/admin`, `/ygb`, `/shannon`, `/strategy`, `/update/koshland`).

**Public pages:**
- `/` — homepage (client component; `IntersectionObserver` drives `.fade-up` animations)
- `/about` — story, board of directors, advisory board (static data inline)
- `/the-app` — app showcase with interactive `AppDemo`
- `/curriculum` — track grid (inline `tracks` array); detail pages at `/curriculum/[slug]` driven by `lib/internships.ts` (only tracks with a `slug` link through)
- `/impact` — impact metrics and evidence base
- `/donate` — Stripe donation flow (`DonateButton` → `DonateModal`); GiveButter has been removed
- `/for-adults` — Guide (parent/mentor) pitch + waitlist form
- `/founder` — founder profile
- `/companies`, `/program-partners` — outreach pages (noindex, not linked from nav)
- `/update` — investor update (not linked from nav)
- `/meet` — meeting scheduler backed by Supabase (`meeting_types`, bookings)
- `/ms` — "What Are You Built For," the middle-school career game (specs/ms-career-game.md + amendments; noindex, standalone chrome, shareable by link only). Solo: landing → 30-item tap-only wizard (`/ms/assess`) → deterministic RIASEC ranking (`/ms/results/[session]`) → card play (`/ms/card/[session]/[soc]`) → permanent no-login deck by 6-char claim code (`/ms/deck/[code]`). Group: `/ms/host` opens a room, `/ms/room/[room]` is the projected screen, students join by 4-char room code. APIs under `app/api/ms/*` (session, reveal, deliver, room). Hard rules: no student email/name anywhere (auto handles), no LLM in the matching path, card `title`/`clue_8` only via the reveal route (which writes `clues_used`), AI live only for the results summary + facilitator prompts.

**Admin** — a large internal dashboard under `/admin` (finance, fundraising, ops, KPIs, board, compliance), running as an installable PWA. Auth via `lib/admin/auth.ts`; data in Supabase; HubSpot sync for fundraising.

**Data layer:**
- Public-site content is static in page files or `lib/` (e.g. `lib/internships.ts`, `lib/donors.ts`). Content changes require code edits.
- Admin + meet data lives in Supabase (`lib/supabase/*`, types in `lib/database.types.ts`).

**Career library (`/ms` groundwork, specs/ms-career-library-v2.md):** `ms_occupations` (imported O*NET RIASEC + BLS pay, `scripts/import-onet.ts`) + `ms_cards` (Claude-drafted, machine-gated, human-approved content) behind `/admin/careers`. Core logic in `lib/ms/` (deterministic RIASEC scorer, gates, rendered pay/education clues). Only `status = 'approved'` rows reach the public `ms_catalog` view, which never exposes `title` or `clue_8`. Approval is a human click, never code.

**Key API routes (public):**
- `app/api/career-match/route.ts` — Claude-powered career matching (model `claude-sonnet-4-6`). Requires `ANTHROPIC_API_KEY`.
- `app/api/create-payment-intent`, `app/api/stripe-webhook`, `app/api/save-donation`, `app/api/send-receipt` — Stripe donation pipeline.
- `app/api/partner-waitlist`, `app/api/program-partner-signup` — form intake.
- `app/api/meet/*` — scheduler availability/booking.

**SEO:** `app/sitemap.ts`, `app/robots.ts`, `app/opengraph-image.png` (regenerate if branding changes), and an Organization JSON-LD block in `app/layout.tsx`.

## Brand / Design System

**Colors** (Tailwind tokens in `tailwind.config.ts`, CSS vars in `globals.css`):
- `orange` / `--orange`: `#E8500A` (primary CTA, accents); `orange-dark` `#B83D06`; `orange-light` `#FFF0EA`; `orange-mid` `#F47840`
- `ink`: `#0E0E0E` (dark backgrounds); `cream`: `#FAFAF8` (page background)
- `charcoal` `#3D3D3D`; `gray-warm` `#6B6960`; `gray-mid` `#C8C6BE`; `gray-light` `#F0EEE8`
- `navy` `#10214B` (admin/BloomOS chrome only)

**Fonts** (loaded in `app/layout.tsx` via `next/font/google`):
- `font-display` — Big Shoulders Display (large hero headlines; forced uppercase sitewide via globals.css)
- `font-heading` — Poppins (section headings, UI labels)
- `font-body` — DM Sans (body text)

**Utility classes** (`globals.css`): `.container-site` (1200px container), `.section-pad`, `.fade-up`/`.visible` + `.stagger-1..4` (scroll animations, reduced-motion safe).

**Border radii:** `rounded-card` (1.25rem), `rounded-card-lg` (1.75rem)

**Dot texture pattern** used across dark sections:
```jsx
style={{
  backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
}}
```

**Known duplication to be careful with:** the headline stats (3,500+ teens / 87% Title I / 14% future orientation / 1,100+ hours) are hardcoded in several pages (`/`, `/donate`, `/the-app`, `/companies`, `/update`, `/impact`) — update all of them together. The App Store / Google Play button markup is likewise copy-pasted across pages.

## Environment Variables

- `ANTHROPIC_API_KEY` — career quiz/match routes
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — donations
- Plus admin-only integrations (HubSpot, Google, Resend) — see the relevant `lib/` modules.
