# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Commands

```bash
npm run dev     # Start dev server (localhost:3000)
npm run build   # Production build
npm run lint    # ESLint
```

## Architecture

Next.js 14 App Router. Static pages with one dynamic API route.

**Route structure:**
```
/                     Home (with career quiz modal)
/about                About (story, team, boards)
/founder              The Founder -- not in nav, linked from About
/the-app              The App
/donate               Donate (GiveButter widget)
/curriculum           Internship directory
/curriculum/[slug]    Internship detail (dynamic, not in nav)
/api/career-quiz      POST -- calls Anthropic, returns JSON career array
```

**Key files:**
- `app/layout.tsx` -- Root layout with Nav and Footer, Space Grotesk + DM Sans fonts
- `components/Nav.tsx` -- Fixed nav, mobile drawer, scroll detection
- `components/Footer.tsx` -- Full footer with orange CTA band, links, app store buttons
- `components/CareerQuizModal.tsx` -- Full quiz component (audience select, 6-section survey, results)
- `app/api/career-quiz/route.ts` -- Server-side Anthropic call, keeps API key out of browser

**Design tokens (Tailwind):**
```
orange / orange-dark / orange-light / orange-mid   Brand orange system (#E8500A)
ink                                                Near-black (#0E0E0E)
charcoal                                           Dark gray (#3D3D3D)
gray-warm / gray-mid / gray-light                  Neutral grays
cream                                              Off-white background (#FAFAF8)
```

**Fonts:** `font-heading` = Space Grotesk, `font-body` = DM Sans (set via CSS variables)

**Utility classes:**
- `container-site` -- max-w-site centered with horizontal padding
- `section-pad` -- standard vertical section padding (5rem / 7rem on lg)

## Environment variables

```
ANTHROPIC_API_KEY          Server-only. Used in /api/career-quiz only.
NEXT_PUBLIC_MAKE_WEBHOOK   Make.com webhook for emailing quiz results.
```

Never put ANTHROPIC_API_KEY in any client component or expose it in the browser.

## Quiz architecture

The career quiz is a modal (`CareerQuizModal.tsx`) triggered from the homepage. It:
1. Asks audience (teen / adult helping a teen)
2. Walks through 6 survey sections
3. Calls `/api/career-quiz` (server route) which calls Claude
4. Shows 10 ranked career matches with salaries
5. Offers email results via Make.com webhook

The quiz code the client previously had (with exposed API key in the browser) has been replaced with this secure pattern.

## Images

Drop photos in `public/images/`. The logo file should be:
- `public/images/logo.png` -- color version (for light nav)
- `public/images/logo-white.png` -- white version (for dark footer)

Team photos, when available: `remi.jpg`, `demetric.jpg`

## Deployment

GitHub repo, hosted on Vercel at www.ambitionangels.org. See deployment notes in repo.
Set `ANTHROPIC_API_KEY` as a Vercel environment variable (not committed to git).
