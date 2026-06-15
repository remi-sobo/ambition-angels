# Spec: /mesa and /mesa/students

Two new marketing routes on ambitionangels.org that turn the Ambition Angels x MESA pilot into shareable web artifacts. This document is both the design and the build spec. Part 1 is the design (what goes on each page, the copy, the visual direction). Part 2 is the engineering spec (architecture, build order, done criteria, failure modes). Claude Code should read this whole document, then read the live repo, then build.

---

## Fill-in tokens (resolve these before building)

| Token | Meaning | Current best guess | Status |
|---|---|---|---|
| `{{COLLEGE_NAME}}` | The community college where Rance runs MESA | Cañada College, Redwood City | CONFIRM with Remi. Transcript was garbled ("Kenyatta" / "Kañana"). Do not publish unconfirmed. |
| `{{DIRECTOR_NAME}}` | MESA program director | Rance Bobo | Confirmed in transcript |
| `{{LAUNCH_WINDOW}}` | Student launch date | Mid-September 2026 | Rance sets exact date after Aug 28 / Sept 4 orientations |
| `{{STUDENT_COUNT}}` | Pilot cohort size | 50 | Confirmed in transcript |
| `{{INTERNSHIPS_PER_STUDENT}}` | Funded internships per student | 3 | Confirmed in transcript |
| `{{REWARD_PER_INTERNSHIP}}` | Gift card value per completed internship | $100 | Confirmed in transcript |
| `{{CONTACT_EMAIL}}` | Partnership contact | hello@ambitionangels.org | From live site footer |

Keep every token in one constants block so a single edit updates both pages.

---

# PART 1: DESIGN

## Design principles for these two pages

1. **Inherit, do not invent.** These pages are part of ambitionangels.org. They use the existing design tokens, fonts, components, doodle accents, eyebrow-plus-headline pattern, numbered cards, stat blocks, and testimonial cards already in the repo. The reference homepage shows the system: a small eyebrow label, a large multi-line bold headline, warm second-person body copy, numbered step cards, animated stat counters, and playful doodle imagery.

2. **The signature element is the connected three-layer progression.** On the existing site the three layers (Exposure, Conversations, Connections) appear as separate sections. On /mesa they should render as one connected progression that visibly narrows from "all 50 students" at Exposure to "the serious few" at Connections. This is not decoration: it is exactly how Remi described the model to Rance ("top of the funnel... a smaller version of the funnel"). The connecting line and the narrowing are the one memorable thing. Keep everything else quiet.

3. **Two different energies.** /mesa is calm, organized, and a touch more formal: a digitized partnership overview that Rance can forward to his board and his district. /mesa/students is loud, fast, mobile-first, and student-voiced, because it is reached by scanning a QR code on a printed flyer.

4. **Co-brand, do not co-opt.** Show "Ambition Angels x MESA" as a lockup. MESA gets visible, respectful billing. If a MESA logo asset is not available in the repo, use a clean typographic treatment of the word MESA and leave a clearly named slot for the logo later. Do not fabricate a MESA logo.

5. **Voice.** Match the homepage exactly. Warm, direct, second person, short sentences, contractions, sentence case. Examples from the live site: "We meet them there." "The app does the work. You make it stick." No corporate polish. No em dashes anywhere (house rule).

---

## Page A: /mesa (the partnership overview)

**Audience.** Rance Bobo and his MESA team first. Then anyone he forwards it to: his MESA board, his community college district, other MESA directors. Secondary audience: a future funder who wants to understand the model.

**The page's single job.** Make the partnership feel real, organized, and worth forwarding, and make crystal clear who does what.

**Tone.** Confident and concrete. This reads like a partnership agreement that a human wrote, not a brochure.

### Section A1: Hero

- Eyebrow: `Ambition Angels x MESA`
- Headline (multi-line, bold): `A career-readiness partnership for MESA students.`
- Subhead: `Ambition Angels and MESA at {{COLLEGE_NAME}} are piloting a full career pathway for {{STUDENT_COUNT}} students this year: real career exposure, a team that guides them, and a coach for the ones ready to go further.`
- Primary CTA: `See the student experience` linking to /mesa/students
- Secondary CTA: `Talk to us` linking to `mailto:{{CONTACT_EMAIL}}`
- Visual: reuse the hero pattern and a doodle accent from the existing system. No new illustration required.

### Section A2: The shared problem

- Eyebrow: `Why this partnership`
- Headline: `MESA gets them in the door. We help them walk through it.`
- Body (two short paragraphs):
  - `MESA finds the students who are too often overlooked: first-generation, low-income, and serious about a future in STEM and beyond. The hard part comes next. Knowing a career exists is not the same as believing you belong in it.`
  - `Most students here do not have a parent's best friend in the industry to call. What they need is exposure to real careers, an adult tracking their progress, and a direct line to someone who already does the job. That is exactly what this partnership provides.`
- Optional pull quote styled like the homepage testimonials, attributed softly to the model rather than a person: `The student who chooses the research lab over the easy trip almost always has someone in her corner who helped her see what mattered.`

### Section A3: The model, in MESA terms (THE SIGNATURE SECTION)

- Eyebrow: `How it works`
- Headline: `Three layers. One pathway.`
- Render as a connected progression, not three loose cards. On desktop, three stages left to right joined by a line. On mobile, stacked top to bottom with the connector running vertically. The visual should communicate narrowing: Exposure is the widest (all {{STUDENT_COUNT}} students), Connections is the narrowest (the serious few).

  - **Layer 1, Exposure: The Ambition app.**
    `Every one of your {{STUDENT_COUNT}} students gets the Ambition app. They pick real career internships, work 15 minutes a day on the phone they already have, and earn a {{REWARD_PER_INTERNSHIP}} gift card for every internship they finish. We fund up to {{INTERNSHIPS_PER_STUDENT}} per student.`
    Tag: `All {{STUDENT_COUNT}} students`

  - **Layer 2, Conversations: The Guide.**
    `You and your MESA team get the Guide dashboard. See what every student is exploring, follow their progress, and get conversation prompts tied to exactly what they are working on. You set the accountability. Kids come and go. The adults stay.`
    Tag: `You and your team`

  - **Layer 3, Connections: The Ambition Coach.**
    `When a student gets serious about a direction, we connect them one to one with a professional who actually does that job. Four sessions over four weeks, virtual, focused on turning a goal into a plan. We source the coaches from our network.`
    Tag: `The students ready to go further`

### Section A4: Who does what (THE MOU CORE)

- Eyebrow: `The commitment`
- Headline: `Clear lanes. No surprises.`
- Two columns, equal weight. This is the heart of the digitized MOU.

  - **Ambition Angels provides**
    - `App access for all {{STUDENT_COUNT}} students`
    - `{{REWARD_PER_INTERNSHIP}} in gift card rewards per completed internship, up to {{INTERNSHIPS_PER_STUDENT}} per student, fully funded by us`
    - `The Guide dashboard for your MESA team, plus onboarding on how to use it`
    - `Coach matching from our professional network for students who are ready`
    - `A start-of-year onboarding session with your students, virtual or in person`

  - **MESA at {{COLLEGE_NAME}} provides**
    - `{{STUDENT_COUNT}} enrolled students for the pilot year`
    - `Orientation and a {{LAUNCH_WINDOW}} launch`
    - `Guide-side accountability and encouragement throughout the year`
    - `Help identifying the students ready for a coach`
    - `A space, virtual or in person, for the onboarding session`

- One line under the table, smaller: `This is a working overview of our pilot, not a binding contract. It exists so everyone knows the plan.`

### Section A5: The pilot at a glance

- Eyebrow: `By the numbers`
- Reuse the homepage animated stat block pattern. Four stats:
  - `{{STUDENT_COUNT}}` / `Students in the pilot`
  - `{{INTERNSHIPS_PER_STUDENT}}` / `Internships funded per student`
  - `{{REWARD_PER_INTERNSHIP}}` / `Earned per completed internship`
  - `4` / `Coaching sessions for students ready to go deeper`
- Do not publish a grand total dollar figure on this page. The reward commitment is stated per student. (Internal note for Remi: the ceiling is {{STUDENT_COUNT}} x {{INTERNSHIPS_PER_STUDENT}} x {{REWARD_PER_INTERNSHIP}} = $15,000. Keep this off the public page.)

### Section A6: Timeline

- Eyebrow: `The year ahead`
- Headline: `From orientation to a real pathway.`
- Horizontal timeline on desktop, vertical on mobile. Four nodes:
  - `August: Orientations` — `MESA runs student orientations and gauges interest.`
  - `{{LAUNCH_WINDOW}}: Launch` — `Students download the app and start their first internship. We onboard them.`
  - `Through the year: Explore and earn` — `Students complete internships, your team guides, the serious few get matched with coaches.`
  - `End of year: Review` — `We look at what worked and decide where this goes next.`

### Section A7: The bigger picture (restrained)

- Eyebrow: `Where this could go`
- Headline: `One college now. A model that could travel.`
- Body (one short paragraph): `MESA reaches first-generation STEM students across more than 90 California community colleges. We are starting with one. If this pilot moves the needle for your students, there is a real path to taking it further, together.`
- Keep this to a single paragraph. Do not overcommit. No CTA here, or a soft one only.

### Section A8: Footer CTA

- Headline: `Questions about the partnership?`
- Body: `We will keep this page current as the plan evolves. Reach out any time.`
- CTA: `Email Remi` to `mailto:{{CONTACT_EMAIL}}`
- Secondary link: `See what students see` to /mesa/students
- Reuse the global site footer.

---

## Page B: /mesa/students (the student-facing page)

**Audience.** The {{STUDENT_COUNT}} MESA students, ages roughly 18 to 24, first-generation, low-income, STEM-leaning, at {{COLLEGE_NAME}}. They arrive by scanning a QR code on a flyer Rance hands out at orientation.

**The page's single job.** Get a student from "what is this" to "downloaded and started" in under a minute, and kill the "what's the catch" fear.

**Critical constraint: mobile-first.** Most visitors arrive on a phone via QR. Design for a 380px viewport first, then scale up. Big tap targets. Download buttons reachable with a thumb. Fast.

**Tone.** Energetic, plain, student-to-student. Loud about the money. No jargon.

### Section B1: Hero

- Eyebrow: `MESA x Ambition Angels`
- Headline (big, bold): `Get paid to figure out your future.`
- Subhead: `Explore real careers on your phone. Earn a {{REWARD_PER_INTERNSHIP}} gift card every time you finish an internship. Built for MESA students at {{COLLEGE_NAME}}.`
- Primary CTA: app store buttons (iOS and Android), reusing the existing download button component and store URLs from the live site.
- Secondary line under the buttons: `Free. Always. No catch.`
- Visual: a doodle accent and the hero pattern. Mobile-first layout.

### Section B2: What you get

- Eyebrow: `Here's the deal`
- Three benefit cards in student language (these map to the three layers but never use the internal layer names):
  - `Explore real careers` — `Tech, healthcare, game design, business, and more. Pick what you are curious about. 15 minutes a day, on your phone.`
  - `Earn real money` — `Finish an internship, get a {{REWARD_PER_INTERNSHIP}} gift card from brands you actually use. Up to {{INTERNSHIPS_PER_STUDENT}} of them.`
  - `Get a real coach` — `When you find your thing, we connect you with someone who actually does that job. Four sessions to build your plan.`
- A fourth, smaller reassurance card or line: `Your MESA team has your back. {{DIRECTOR_NAME}} and the team can see your progress and help you keep going.`

### Section B3: How it works

- Eyebrow: `Start in two minutes`
- Numbered steps (reuse homepage numbered card pattern):
  - `01 Download the app` — `Free on iPhone and Android.`
  - `02 Pick your path` — `Choose a career internship that sounds interesting. You can switch later.`
  - `03 Show up 15 minutes a day` — `Watch, answer, do. No commute. No classroom.`
  - `04 Finish and earn` — `Complete it and your {{REWARD_PER_INTERNSHIP}} gift card is yours.`

### Section B4: What you can explore

- Eyebrow: `The careers`
- A scannable grid of internship tracks. Lead with STEM and career-relevant tracks given the MESA audience, then breadth. Pull the real track names from the repo or the live curriculum page. Example set: `Tech and software`, `Healthcare and nursing`, `Game design`, `Entrepreneurship`, `Wealth management`, `Sales`, and more.
- Link: `See all internships` to the existing curriculum page.

### Section B5: The money is real

- Eyebrow: `About that {{REWARD_PER_INTERNSHIP}}`
- Headline: `Your time has value. We pay it.`
- Body: `Every internship you finish earns a {{REWARD_PER_INTERNSHIP}} gift card from real brands. This is not points. This is not a maybe. Finish the work, get the reward.`

### Section B6: Social proof

- Eyebrow: `From students like you`
- One or two testimonial cards reusing the homepage component and existing student quotes. If a MESA-specific quote is not available, reuse an existing one and keep the styling identical.

### Section B7: FAQ (kills the catch)

- Eyebrow: `Real questions`
- Short accordion or simple list:
  - `Is it actually free?` — `Yes. Always. We are a nonprofit and your MESA program covers nothing out of your pocket.`
  - `Do I need any experience?` — `No. These are made for people exploring, not experts.`
  - `How long does an internship take?` — `30 days, about 15 minutes a day.`
  - `What's the catch?` — `There isn't one. You explore careers, we reward you for finishing, and your MESA team helps you keep going.`
  - `Who is behind this?` — `Ambition Angels, a nonprofit that puts career exposure in every pocket, partnering with your MESA program.`

### Section B8: Final CTA

- Headline: `Ready? Start now.`
- App store buttons again (iOS and Android).
- Optional, pending Remi's decision: a lightweight `I'm a MESA student` signup capturing first name and email so the team can track who started. If included, keep it to two fields and a button, no friction, and store via the existing form mechanism (see Part 2).
- Reuse the global site footer.

---

# PART 2: BUILD SPEC

## Problem statement

Remi committed to Rance to ship two web pages before August: a partnership overview Rance can share with his board and district, and a student-facing page reached by a QR code on a printed flyer. Today neither page exists, and there is no /mesa route on ambitionangels.org. After this ships, Rance has a link he is proud to forward, and every MESA student who scans the flyer lands on a fast, mobile-first page that gets them to download the app and start.

## Scope

**In:**
- New route `app/mesa/page.tsx` (partnership overview), public, shareable, no auth.
- New route `app/mesa/students/page.tsx` (student-facing), public, mobile-first.
- Reuse of existing design tokens, fonts, layout primitives, and shared components (header, footer, stat block, numbered cards, testimonial cards, download buttons, doodle accents).
- A single shared constants module for the fill-in tokens so both pages stay in sync.
- Correct metadata (title, description, Open Graph) for both routes.
- Responsive down to 380px, visible keyboard focus, reduced-motion respected.

**Out:**
- The printed flyer artifact and the QR code image. The QR will point to /mesa/students. The flyer is a separate deliverable, not these pages. (Note for Remi: generate the QR pointing at the live /mesa/students URL once deployed.)
- Any change to the global nav. These are intentionally unlinked from the main marketing nav for now (they are shared by direct link and QR). Revisit later if Remi wants them in nav.
- The MESA logo asset. Leave a named slot; do not fabricate one.
- Backend for the optional student signup beyond the existing form/email mechanism already in the repo. Do not build new infrastructure.
- Any admin route. These are marketing routes only and must not overlap `/admin`.
- Resolving the STEM-only vs open-internship product decision. The copy is written to work either way.

## Architecture sketch

```
app/
  mesa/
    page.tsx            <- partnership overview (server component, static)
    students/
      page.tsx          <- student page (server component; client island only if signup form is included)
  _components/ or components/   <- reuse existing shared components, do not duplicate
lib/ (or wherever constants live)
  mesa.ts               <- single source of truth for fill-in tokens
```

- Both pages are static marketing pages. Prefer server components. No data fetching required for the core build.
- The three-layer progression on /mesa is presentation only (CSS plus existing card components). The connector line and narrowing are layout, not new dependencies.
- If the optional student signup is included, it is the only client component, and it must post through whatever submission path the existing site already uses (for example the same mechanism behind the Guide waitlist on /for-adults). Reuse, do not invent.
- The constants module is imported by both pages. Changing `{{COLLEGE_NAME}}` or `{{LAUNCH_WINDOW}}` in one place updates both pages.

## Staged build order

Phase 1: Recon and report — read the repo's design tokens, fonts, Tailwind config, and the existing marketing page components (start from the homepage and /for-adults). Report back what was found: token names, font families, the component names for header, footer, stat block, numbered cards, testimonials, download buttons, and doodles. Do not write page code yet. Commit point: none, this is a written report to Remi.

Phase 2: Constants and routing skeleton — add `lib/mesa.ts` with all fill-in tokens, and create both routes rendering only a hero and a footer using existing components, so the routes resolve and look on-brand. Commit point: routes live, on-brand shell.

Phase 3: /mesa content — build sections A2 through A8 using existing components and the copy in Part 1. Build the three-layer progression as the signature element. Commit point: /mesa complete and reviewable.

Phase 4: /mesa/students content — build sections B2 through B8, mobile-first, using existing components and the copy in Part 1. Include the signup form only if Remi has said yes. Commit point: /mesa/students complete and reviewable.

Phase 5: Polish pass — metadata and Open Graph for both routes, responsive check at 380px, keyboard focus, reduced-motion, and a self-critique screenshot pass. Commit point: ready to deploy.

One PR per phase. Small radius. Reversible. Test before trust.

## Definition of done

- Visiting `/mesa` renders the full partnership overview, on-brand, with a working "See the student experience" link to `/mesa/students` and a working email link.
- Visiting `/mesa/students` on a 380px viewport renders a clean, mobile-first page with working App Store and Google Play links that match the URLs used on the homepage.
- The three-layer progression on `/mesa` visibly reads as one connected pathway that narrows from all students to the serious few, on both desktop and mobile.
- Changing a value in `lib/mesa.ts` (for example the launch window) updates both pages.
- Both pages pass the quality floor: keyboard focus is visible, reduced motion is respected, nothing overflows at 380px, and contrast is legible.
- No global nav changed. No `/admin` route touched. No fabricated MESA logo shipped.
- Metadata and Open Graph tags are present and specific to each page.

## Failure modes to watch for

- **Publishing the unconfirmed college name.** If `{{COLLEGE_NAME}}` ships as "Cañada College" without Remi confirming, the page could be wrong on a document Rance forwards to his board. Manifests as Rance flagging an embarrassing error. Mitigation: the name lives in one constants file and the build report must call out that it is unconfirmed.
- **Reinventing the design instead of inheriting it.** If Claude Code generates new colors, fonts, or components rather than pulling the repo's, the pages will look like a different site and break the co-brand credibility. Manifests as pages that feel off-brand next to the homepage. Mitigation: Phase 1 recon report is mandatory before any page code.
- **The student page is not truly mobile-first.** If built desktop-first, the QR-scanning student hits a cramped or slow page and bounces. Manifests as low conversion from the flyer. Mitigation: design and test at 380px first, real device check before done.
- **A wrong dollar total leaks onto the public page.** The call contained a math error ($1,500 vs the real $15,000). Manifests as a credibility problem on a shareable partnership doc. Mitigation: no grand total on the page at all; rewards stated per student only.
- **CSS specificity collisions on section spacing.** Reusing type-based and element-based selectors can cancel paddings between sections, a known trap. Manifests as uneven or collapsed spacing between sections. Mitigation: follow the repo's existing section spacing convention rather than introducing new selectors.
- **The signup form invents new backend.** If included and built from scratch, it adds infrastructure and a maintenance burden. Manifests as an orphaned endpoint. Mitigation: reuse the existing form submission path, or omit the form and ship download-only.

## Open questions for Remi (decide before or during build)

1. Confirm `{{COLLEGE_NAME}}`.
2. STEM-only internships or open choice? Affects the track list on /mesa/students (section B4).
3. Student page: download-only, or download plus the lightweight signup form?
4. Should /mesa and /mesa/students appear in the global nav, or stay link-and-QR only? (Spec assumes the latter.)
5. Is there a MESA logo asset to use, or do we ship the typographic treatment and add the logo later?
6. Reward match from Rance and any coaching stipend are unsettled. The pages do not mention them. Confirm that is correct for now.
