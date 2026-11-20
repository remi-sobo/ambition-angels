# Public site v2 (Nov 2026)

Source: the "Ambition Angels Website Redesign" canvas export (`ambition-site-v2.zip`, Nov 19). This is the as-built record.

## The story the site tells

Schools and youth programs are the lead audience. Students explore careers through introships (8 to 10 minutes each). The adults already in the room get a dashboard and a prompt, so what a student explored turns into a conversation. Internships, Life Lessons and Ambition Coach are where a student goes when a career clicks. Every page ends on one of three ways in: bring it to your students, get the app, or give.

## Pages

| Route | Page | Notes |
| --- | --- | --- |
| `/` | Home | Ends on "Where do you fit?", so the footer band is off here |
| `/how-it-works` | How It Works | Replaces `/the-app` (308) |
| `/curriculum` | Careers | 50 introships, filter by category, 19 link to `/curriculum/[slug]`. `/careers` 308s here |
| `/schools` | Schools & Programs | `#start` holds the live inquiry form |
| `/companies` | For Companies | Now indexable. `#coach`, `#start` |
| `/guides` | For Guides | New. `/for-adults` 308s here |
| `/impact` | Impact | |
| `/students` | For Students | New. `/teens` (the games hub) is unchanged and linked from the footer |
| `/about` | About | Board and advisors keep their photos and LinkedIn links |
| `/donate` | Donate | Giving Tuesday band hides itself after Dec 1, 2026 |

Untouched: `/coach`, `/teens/*`, `/curriculum/[slug]`, `/founder`, `/meet`, `/update`, `/mesa`, `/twilio`, `/program-partners`, `/apply`, `/admin`. They sit under the new header and footer.

## What stayed wired

- Donate: every "Donate" / "Become an Angel" button opens the existing Stripe `DonateModal` (`DonateButton`).
- Schools form: `SchoolsInquiryForm` → `/api/schools-inquiry`. Three settings added (middle school, charter, CTE or AVID), mapped to `school`.
- Companies form: `app/companies/ContactForm.tsx` → `/api/partner-waitlist` (role "Corporate Partner"), same intake as before.
- App store links: `AppDownloadLink`, so download clicks are still tracked.
- Headline numbers: `lib/stats.ts`.
- The design's forms opened an email draft. The live forms were kept instead.

## How it is built

- Pages were converted from the canvas export and keep its inline styles. Colors, fonts, radii are CSS variables; `app/site.css` adds the few tokens globals.css did not have (`--paper`, `--muted`, `--rule`, `--surface-tint`).
- `components/site/`: `SiteHeader`, `SiteFooter`, `PillCTA`, `NumberedBlock`, `StatBar`, `Fit`, and `screens/` (the six product mockups, drawn in HTML and scaled in CSS, so they stay sharp at any size).
- Responsive values the canvas computed in script are CSS variables on `.aa-home` and classes in `app/site.css`. No layout depends on JavaScript.
- Hover states from the canvas are the `.hv-*` classes in `app/site.css`.
- Illustrations live in `public/images/site/illus` as WebP. The nurse and chef were redrawn at full resolution from the low-res canvas versions.

## Left out on purpose

- The student quotes block on Impact. It was off by default in the canvas and the quotes are placeholders. Add it back with real, consented quotes.
- The wire details in the giving FAQ. The old page printed the bank account number; the new copy says to email for them.

## Before launch

- Review on the Vercel preview with real env vars (donate checkout, both forms, `/meet`).
- `app/opengraph-image.png` still carries the old tagline.
