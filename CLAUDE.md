# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the Ambition Angels website: the public pages, the teen games, the career library and a small website admin. BloomOS (the operating system Ambition Angels runs on) lives in its own repo, `remi-sobo/bloomos`, at app.bloomos.org. The line between them is in `specs/bloomos-repo-split.md`: anything about the website, the games or the career library lives here; anything about people, money or programs (donors, applicants, partners, coaches, board, tasks) lives in BloomOS.

## Commands

```bash
npm run dev        # start dev server at localhost:3000
npm run build      # production build
npm run lint       # ESLint via next lint
npm test           # vitest run (unit tests in tests/*.test.ts)
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint and `npm test` on every PR. `tests/migrations.test.ts` enforces that every `create table` / `create index` is idempotent (`if not exists`). `tests/split-boundary.test.ts` fails if any code reads a BloomOS database key.

## Stack

Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase (the website's own Postgres + auth for the website admin), Stripe (donations), Anthropic Claude API, Resend (email). Deployed to Vercel (project `ambition-angels-site`).

## Architecture

**App Router** — all routes live under `app/`. The root layout (`app/layout.tsx`) wraps pages with `<SiteHeader>` and `<SiteFooter>` (`components/site/`) via `components/SiteChrome.tsx`, which skips that chrome for standalone routes (`/admin`, `/teens/*` game screens, `/ygb`, `/update/koshland`).

**Public pages (site v2, specs/site-redesign-v2.md):** the ten redesigned pages were ported from a design canvas and keep its inline styles on top of the brand CSS variables. Shared pieces live in `components/site/` (`PillCTA`, `NumberedBlock`, `StatBar`, `Fit`, and the HTML product mockups in `screens/`); tokens, hover classes (`.hv-*`), breakpoints and the header/footer styles live in `app/site.css`. Each redesigned page wraps itself in `.aa-page`, which clears the fixed header.
- `/` — homepage
- `/how-it-works` — the platform (`/the-app` 308s here)
- `/curriculum` — "Careers": 50 introships with a category filter (client component, data inline); the 19 with a `slug` link to `/curriculum/[slug]`, driven by `lib/internships.ts`. `/careers` 308s here.
- `/schools` — schools and programs pitch; `#start` holds `SchoolsInquiryForm` (→ `/api/schools-inquiry`)
- `/companies` — ways to partner; `#start` holds `app/companies/ContactForm.tsx` (→ `/api/partner-waitlist`)
- `/guides` — for the adults (`/for-adults` 308s here); `/students` — app download pitch
- `/impact` — impact metrics and evidence base
- `/about` — story, board of directors, advisory board (static data inline, photos in `public/images`)
- `/donate` — Stripe donation flow (`DonateButton` → `DonateModal`); GiveButter has been removed
- `/coach` — Ambition Coach volunteer sign-up
- `/founder` — founder profile
- `/program-partners` — outreach page (noindex, not linked from nav)
- `/update` — investor update (not linked from nav)
- `/teens` — the games hub (specs/c1d2c9e2-teengamesv1; indexable, standalone chrome). Lists "What Are You Built For" as the hero plus the teen games: Higher Wage is live at `/teens/higher-wage` (pair/guess APIs under `app/api/games/higher-wage/*`, gap rule + signed pair token in `lib/games/` — pay never reaches the client pre-tap, and a CI test asserts it); Never Heard of It is live at `/teens/never-heard-of-it` (daily APIs under `app/api/games/daily/*` — clue 1 + answer hashes only, title never pre-reveal; guesses hash-matched client-side via `lib/games/guess.ts`; `game_daily` calendar human-scheduled in the website admin at `/admin/careers/daily` with a 3-of-7 job-zone≤3 rule, rolls midnight Pacific); The Cut is live at `/teens/the-cut` (rooms + phone voting + solo, `app/api/games/the-cut/*`, engine in `lib/games/the-cut.ts`, ephemeral `cut_*` tables; landing indexable, room/vote screens noindex). `/ms` and `/ms/*` 308-redirect here (`next.config.mjs`) — old flyer/email links never die.
- `/teens/built-for` — "What Are You Built For," the middle-school career game (specs/ms-career-game.md + amendments; landing indexable, session/room screens noindex). Solo: landing → 30-item tap-only wizard (`/teens/built-for/assess`) → deterministic RIASEC ranking (`…/results/[session]`) → card play (`…/card/[session]/[soc]`) → permanent no-login deck by 6-char claim code (`…/deck/[code]`). Group: `…/host` opens a room, `…/room/[room]` is the projected screen, students join by 4-char room code. APIs stay under `app/api/ms/*` (session, reveal, deliver, room), and code stays in `lib/ms/` — the move was a URL decision, not a refactor. Hard rules: no student email/name anywhere (auto handles), no LLM in the matching path, card `title`/`clue_8` only via the reveal route (which writes `clues_used`), AI live only for the results summary + facilitator prompts.

**Forms go to BloomOS.** Every public form route (`apply`, `schools-inquiry`, `program-partner-signup`, `partner-waitlist`, `coach-signup`, `ygb/register`, `demoday/signup`, `quiz-submit`, `save-donation`) validates, then calls `sendToBloomOS()` in `lib/site/bloomos.ts`, which posts to the BloomOS intake API with `BLOOMOS_INTAKE_KEY`. If BloomOS is down the payload waits in `intake_outbox` and `/api/site/cron/intake-outbox` retries it every 15 minutes, so a visitor's form is never lost. The website still sends the visitor their own confirmation emails; BloomOS stores the record and alerts staff. `/apply` reads its open programs from BloomOS too. Hard rule: this site holds no BloomOS database key of any kind. The intake key is its only way in.

**Website admin** (`/admin`, specs/bloomos-repo-split.md §6d) — a small admin for the website only: home (website numbers), careers curation, games health, analytics, and form delivery. Code lives in `app/site-admin/` and `app/api/site-admin/`; middleware rewrites the owned `/admin` paths (`lib/site/adminRoutes.ts`) onto it and 308s every other `/admin/*` path to app.bloomos.org. Sign-in is a Supabase magic link on the website database, limited to `SITE_ADMIN_EMAILS` (Remi and Shannon), and checked again in every page and `/api/site-admin` route. Shared UI pieces are in `app/site-admin/_ui/` and `lib/site/ui/`. Keep it small: when a request is unclear, it belongs in BloomOS.

**Website numbers for BloomOS** — `GET /api/site-admin/stats` serves daily totals behind a bearer `SITE_STATS_KEY`. BloomOS pulls it every morning into Ambition Angels' metrics.

**Old BloomOS links** — `/board`, `/meet`, `/strategy`, `/coach/me/*`, `/api/unsubscribe` and booking links 308 to app.bloomos.org (`next.config.mjs`). Keep them forever: links in sent email never die.

**Data layer:**
- Public-site content is static in page files or `lib/` (e.g. `lib/internships.ts`). Content changes require code edits.
- Games, the career library, site analytics and the form outbox live in the website's own Supabase database, always through `websiteDb()` / `getSiteSupabase()` (`lib/site/`). Migrations are in `supabase/migrations/`, starting from `site_baseline.sql`.

**Career library (`/teens/built-for` groundwork, specs/ms-career-library-v2.md):** `ms_occupations` (imported O*NET RIASEC + BLS pay, `scripts/import-onet.ts`) + `ms_cards` (Claude-drafted, machine-gated, human-approved content) behind the website admin's `/admin/careers`. Core logic in `lib/ms/` (deterministic RIASEC scorer, gates, rendered pay/education clues). Only `status = 'approved'` rows reach the public `ms_catalog` view, which never exposes `title` or `clue_8`. Approval is a human click, never code. The teen games add a second, separate gate: `game_pool` (specs/teen-games-v1.md, reviewed at `/admin/careers/pool`, rules in `lib/games/pool.ts`) — an occupation is not playable in Higher Wage / Never Heard of It / The Cut until a human flips it eligible there and approves its one-line reveal.

**Key API routes (public):**
- `app/api/career-match/route.ts` — Claude-powered career matching. Requires `ANTHROPIC_API_KEY`.
- `app/api/create-payment-intent`, `app/api/send-receipt` — the donor-facing half of the Stripe donation flow. `app/api/save-donation` hands the gift to BloomOS, which also receives Stripe's webhook.

**SEO:** `app/sitemap.ts`, `app/robots.ts`, `app/opengraph-image.png` (regenerate if branding changes), and an Organization JSON-LD block in `app/layout.tsx`.

## Brand / Design System

**Colors** (Tailwind tokens in `tailwind.config.ts`, CSS vars in `globals.css`):
- `orange` / `--orange`: `#E8500A` (primary CTA, accents); `orange-dark` `#B83D06`; `orange-light` `#FFF0EA`; `orange-mid` `#F47840`
- `ink`: `#0E0E0E` (dark backgrounds); `cream`: `#FAFAF8` (page background)
- `charcoal` `#3D3D3D`; `gray-warm` `#6B6960`; `gray-mid` `#C8C6BE`; `gray-light` `#F0EEE8`

**Fonts** (self-hosted via `next/font/local`, never fetched from Google at build time; woff2 files + OFL licenses in `app/fonts/<family>/`, shared definitions in `app/fonts/index.ts`):
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

**Headline stats** (3,500+ teens / 87% Title I / 14% / 1,100+ hours) come from `lib/stats.ts`. Import from there; legacy pages (`/update`, `/twilio`) may still hardcode them.

## Environment Variables

- `ANTHROPIC_API_KEY` — career match, card drafts, game summaries
- `SITE_SUPABASE_URL`, `SITE_SUPABASE_ANON_KEY`, `SITE_SUPABASE_SERVICE_ROLE_KEY` — the website database
- `BLOOMOS_INTAKE_URL`, `BLOOMOS_INTAKE_KEY` — the BloomOS intake API
- `SITE_ADMIN_EMAILS` — who may sign in to the website admin
- `SITE_STATS_KEY` — the bearer key BloomOS uses for the stats feed
- `CRON_SECRET` — the outbox retry cron
- `GAMES_TOKEN_SECRET` — signs Higher Wage pair tokens
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY` — donations
- `RESEND_API_KEY` — confirmation and receipt emails
- `DEMODAY_PASSWORD`, `DEMO_PASSWORD`, `DEMO_COOKIE_SECRET` — the Demo Day lookbook and partner demo gates
- `NEXT_PUBLIC_SITE_URL`, `MARKETING_ORIGIN` — the site's own origin for absolute links
