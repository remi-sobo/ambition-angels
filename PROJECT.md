# Ambition Angels project rules

Read this first when working in this repo. This is the product and site
guidance for Ambition Angels, including the public site, teen games,
internal admin surfaces, donations, and program intake.

## Commands

```bash
npm run dev        # start dev server at localhost:3000
npm run build      # production build
npm run lint       # ESLint via next lint
npm test           # vitest run (unit tests in tests/*.test.ts)
npm run qa:visual  # Playwright visual QA, auth-gated, run on a real session
```

CI runs typecheck, lint, and unit tests. Migration checks live in the
GitHub workflows and Supabase test scripts.

## Stack

Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase (Postgres +
auth), Stripe (donations), Anthropic API, Resend/Gmail, HubSpot, and
Vercel.

## Public site

The public site is the redesigned Ambition Angels marketing site. The source
of truth for the current public-page build is `specs/site-redesign-v2.md`.

Primary pages:

- `/` homepage
- `/how-it-works`
- `/curriculum`
- `/schools`
- `/companies`
- `/guides`
- `/impact`
- `/students`
- `/about`
- `/donate`

Standalone or older surfaces, including `/admin`, `/teens/*`, `/coach`,
`/founder`, `/meet`, `/update`, `/mesa`, `/twilio`, `/program-partners`,
and `/apply`, keep their own constraints unless a task explicitly changes
them.

## Brand and voice

Ambition Angels should feel direct, energetic, and grounded in real youth
work. The site can be bold. It should not feel like a generic startup,
edtech template, or fundraising deck.

- Write for schools, youth programs, students, families, supporters, and
  partners. Keep the reader clear on which audience a page is serving.
- Use plain language. Name the real action: introships, career exposure,
  guides, schools, students, donations, Ambition Coach, Life Lessons.
- Avoid corporate filler: "seamless", "unlock", "empower", "leverage",
  "transform", "supercharge", "reimagine", "revolutionize".
- Avoid vague claims such as "make an impact" unless the surrounding copy
  names the actual outcome.
- Use real stats from `lib/stats.ts`. Do not invent metrics, student quotes,
  partner names, testimonials, logos, or funder claims.
- If content is missing, use `[NEEDS REAL INPUT]` in internal specs only.
  Do not ship placeholder testimonials or invented personas.

## Design quality bar

Do not let new public pages drift into template patterns.

- No generic centered hero followed by a 1-2-3 feature grid unless that is
  the clearest structure for the audience and the copy is specific.
- No stock photos, fake logo walls, invented testimonials, decorative blob
  backgrounds, glassmorphism, beige SaaS palettes, or purple gradients.
- Cards must earn their place. Avoid nested cards and repeated card grids
  where a list, timeline, proof block, form, or real product capture would
  say more.
- Use the brand system already here: Big Shoulders Display for large
  headlines, Poppins for headings and labels, DM Sans for body copy,
  orange/ink/cream as the dominant system, and real Ambition illustrations
  or product screens when visual support is needed.
- Keep motion purposeful and reduced-motion safe. Do not add decorative
  animation just to make a section feel alive.
- Mobile layouts must be designed, not merely stacked. Check touch targets,
  line breaks, horizontal overflow, form states, and whether visual content
  still communicates when images are hidden or cropped.

## Code quality bar

- Follow existing file boundaries. Do not refactor broad areas while making
  a copy or visual change.
- Comments should explain why a constraint exists. Do not leave
  tutorial-style comments, line-by-line explanations, or tool provenance.
- Public forms need labels, clear error states, preserved values after
  failure, loading feedback, and a recovery path.
- Data claims must stay true to the source. If a product or legal behavior
  changes, flag any docs, trust pages, or emails that may now be inaccurate.

## Architecture notes

The root layout (`app/layout.tsx`) wraps most public pages with
`SiteHeader` and `SiteFooter` through `components/SiteChrome.tsx`. Standalone
routes skip the chrome where appropriate.

Shared public-site pieces live in `components/site/`: `SiteHeader`,
`SiteFooter`, `PillCTA`, `NumberedBlock`, `StatBar`, `Fit`, and the product
mockups in `components/site/screens/`.

Public-site tokens, hover classes, breakpoints, header/footer styles, and
screen scaling live in `app/site.css`. Brand colors and fonts live in
`tailwind.config.ts`, `app/globals.css`, and `app/fonts/`.

Public-site content is static in page files or `lib/` files. Admin and
meeting data lives in Supabase.

## Environment variables

- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Admin-only integrations include HubSpot, Google, and Resend. Check the
relevant `lib/` modules before changing those flows.
