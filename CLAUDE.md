# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server at localhost:3000
npm run build    # production build
npm run lint     # ESLint via next lint
```

No test suite exists in this repo.

## Stack

Next.js 14 (App Router), TypeScript, Tailwind CSS, Anthropic Claude API. Deployed to Vercel. No database — all data is static or fetched client-side.

## Architecture

**App Router** — all routes live under `app/`. Each folder is a page (`app/about/page.tsx`, `app/curriculum/page.tsx`, etc.). The root layout (`app/layout.tsx`) wraps every page with `<Nav>` and `<Footer>`.

**Pages:**
- `/` — homepage (`app/page.tsx`, client component with `IntersectionObserver` for `.fade-up` animations)
- `/about` — board of directors + advisory board (static data inline)
- `/curriculum` — internship directory grid; detail pages at `/curriculum/[slug]`
- `/donate` — GiveButter donation widget + FAQ
- `/the-app` — app showcase
- `/founder` — founder profile
- `/impact` — impact metrics
- `/update/[slug]` — update/blog posts

**Data layer:**
- `lib/internships.ts` — typed `Internship[]` array with all internship data; exported `categories` array. Used by `/curriculum` and `/curriculum/[slug]`.
- `lib/donors.ts` — static donor data.
- No CMS, no database. Content changes require code edits.

**API:**
- `app/api/career-quiz/route.ts` — POST endpoint that calls Anthropic API (`claude-sonnet-4-20250514`) with a user prompt from the career quiz and returns JSON career matches. Requires `ANTHROPIC_API_KEY` env var.

**Components:**
- `GiveButterEmbed` — renders `<givebutter-widget id="LWq3rp">` then loads script with `strategy="afterInteractive"`. The element MUST appear before the script (GiveButter scans DOM on init).
- `GiveButterWidget` — popup/trigger variant.
- `CareerQuizModal` — multi-step quiz modal, calls `/api/career-quiz`.
- `IPhoneMockup` — animated phone mockup for the app showcase.
- `AnimatedCounter` — scroll-triggered number animation.
- `DonateFaq` — accordion FAQ for donate page.
- `Doodles` — decorative SVG doodle assets.

## Brand / Design System

**Colors** (defined as Tailwind tokens and CSS vars):
- `orange` / `--orange`: `#E8500A` (primary CTA, accents)
- `orange-dark`: `#B83D06`
- `orange-light`: `#FFF0EA`
- `ink`: `#0E0E0E` (dark backgrounds)
- `cream`: `#FAFAF8` (page background)
- `charcoal`: `#3D3D3D`
- `gray-warm`: `#6B6960`
- `gray-mid`: `#C8C6BE`
- `gray-light`: `#F0EEE8`

**Fonts** (loaded in `app/layout.tsx` via `next/font/google`):
- `font-display` — Big Shoulders Display (large hero headlines, uppercase)
- `font-heading` — Poppins (section headings, UI labels)
- `font-body` — DM Sans (body text)

**Utility classes** (defined in `globals.css`):
- `.container-site` — centered 1200px max-width container with responsive padding
- `.section-pad` — `py-20 lg:py-28`
- `.fade-up` / `.fade-up.visible` — scroll-triggered fade-in animation (triggered via `IntersectionObserver` on client pages)
- `.stagger-1` through `.stagger-4` — animation delay classes

**Border radii:** `rounded-card` (1.25rem), `rounded-card-lg` (1.75rem)

**Dot texture pattern** used across dark sections:
```jsx
style={{
  backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
}}
```

## GiveButter

Campaign widget ID: `LWq3rp`. The custom element `<givebutter-widget>` requires a type declaration — see `givebutter.d.ts` at the project root.

## Environment Variables

`ANTHROPIC_API_KEY` — required for the career quiz API route.
