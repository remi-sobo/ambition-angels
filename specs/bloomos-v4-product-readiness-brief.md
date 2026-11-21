# BloomOS V4: Product Experience & Pilot Readiness Upgrade

> **Status: parked.** This is the brief for a future session. Do not start until Remi says go. When work starts, begin from `main` after the in-flight work lands, and record the starting commit SHA.

## How to start this

Open a new Claude Code session on `ambition-angels` and say: **"Run the V4 brief, Phase 0."** In the same message, list what merged since 2026-11-20 (for example Comms G3, G4, the story bank), so the audit starts from the right picture. The session pulls `main`, records the SHA, reads this file, runs Phase 0, and stops.

We are upgrading BloomOS (`/admin`) inside the `ambition-angels` repository.

This is not a redesign for the sake of redesigning. The mission is to turn BloomOS into one cohesive, intuitive, reliable product that nonprofit organizations can confidently run their operations on.

BloomOS already has substantial functionality. The issue is not a shortage of features. It's making those capabilities feel connected, understandable, useful, and dependable.

Our goal: a nonprofit executive director should be able to open BloomOS, understand what's happening in their organization, know what needs their attention, and take action without having to learn an overly complicated system.

We are preparing for real external organizations to test and use BloomOS.

Think like a senior product designer, product manager, SaaS architect, and customer-experience lead. Challenge unnecessary complexity. Prioritize the user experience over the number of features.

Don't start coding. Follow the phases below.

## Who we are designing for

Design and prioritize for **Ambition Angels as the only active client**. Other tenants are not design inputs.

- **SafeSpace** goes live in late 2026, likely before V4 begins. It is a real organization with real data, so every stage must pass a no-regression check against it: it loads, nav respects its entitlements and terminology, and no data crosses tenants.
- **Young Life EPA** is inactive. **YGB** is a demo tenant, not a real organization. Neither shapes design decisions.
- Future pilots are new, unknown nonprofits. Judge onboarding and generic product surfaces against them, using Ambition Angels' setup as the reference.

## 1. The product we're building

BloomOS should feel:

- **Simple:** easy to understand, even when the underlying system is complex.
- **Connected:** information and actions naturally flow between modules.
- **Calm:** information-dense but not crowded, noisy, or overwhelming.
- **Fast:** responsive navigation, minimal friction, immediate feedback.
- **Trustworthy:** accurate information, dependable actions, understandable failures.
- **Personal:** people see what's relevant to their actual responsibilities.
- **Flexible:** different nonprofits can use it without engineering changes for each organization.

We should never sacrifice essential functionality just to make an interface look simpler. Instead, use progressive disclosure: show the most important things first, and make the advanced capabilities available when they're needed.

## 2. Start with the existing code and product history

Read the current repository before proposing changes. Review:

- `app/admin/**`
- `app/admin/_components/v2/`
- `app/admin/_components/ui/`
- `lib/admin/nav.ts`
- `lib/admin/v2shellNav.ts`
- `lib/admin/v2routes.ts`
- `lib/admin/typeScale.ts`
- `lib/admin/entitlements.ts`
- `lib/admin/auth.ts`
- `lib/admin/errors.ts`
- `tailwind.config.ts`
- Admin-scoped tokens in `app/globals.css`
- Relevant tests, API routes, loaders, and Supabase policies

Also read the existing BloomOS specs, especially:

- `specs/bloomos-v2-spec-quality-floor.md`
- `specs/bloomos-typography.md`
- `docs/bloomos/07-roadmap.md`
- `docs/bloomos/safespace-onboarding.md`, only to understand what a second organization needs to get started
- Comms: `specs/comms-v2-mail-merge.md`, `specs/comms-v2-gmail-amendment.md`, and `specs/comms-module.md` (story bank, editions, composer; on branch `claude/comms-stories-editions-composer-2mn5w5`, not on `main` as of this brief)
- Team messaging: `docs/bloomos/messaging-spec.md`, `specs/bloomos-v2-spec-inbox.md`

Ignore `specs/younglife-epa-tenant-onboarding.md` and `specs/ygb-demo-tenant.md` as design inputs.

These documents represent previous architectural decisions and work. Some may be outdated. Verify their claims against the current code. Do not rebuild functionality that already exists simply because an older document says it's missing.

Establish the current commit SHA and distinguish verified findings, assumptions, historical findings, and issues requiring runtime access.

## 3. The eight product upgrades to investigate

### A. One coherent design system

Standardize:

- App shell, navigation, headers, tabs, and breadcrumbs where useful
- Page widths, spacing, typography, visual hierarchy
- Buttons, menus, cards, data tables, forms, and dialogs
- Loading, empty, error, success, and permission states
- Responsive behavior, including mobile sheets
- Search, filters, sorting, saved views, and bulk actions
- Action placement and page-level information hierarchy

Extend the existing component kit rather than creating a competing system. Use consistent page archetypes: dashboard, list, detail, board, form, and settings. Components should share behavioral conventions, not just colors and padding.

#### The visual standard: structured calm

Added 2026-11-20 at Remi's direction. BloomOS should have the visual discipline, clarity and polish of a mature SaaS product such as HubSpot, without copying HubSpot's branding or its complexity. It should feel like one coherent operating system, not a collection of independently generated pages.

The acceptance standard: **if a user learns how to operate one part of BloomOS, the rest of the product feels immediately familiar.**

Build the unified design system around:

- A persistent dark navigation shell with a bright, spacious working surface. (BloomOS already has this. Keep the existing tokens.)
- The dark sidebar stays flush to the window edge and the bright working surface sits inside the dark frame as a panel with rounded corners. (Remi, 2026-11-20, after seeing the list and board prototype, which he approved as the direction: https://claude.ai/artifact/KVnhtyF2KqCJKkAYG3eYMb)
- Clear visual hierarchy, disciplined alignment and consistent spacing.
- Neutral surfaces, subtle borders, restrained shadows, and accent color used on purpose.
- Shared components for page headers, breadcrumbs, tabs, filters, tables, cards, buttons, drawers, forms and modals.
- The same interaction patterns in every module.
- Thoughtful density: easy to scan, efficient for daily use.
- Progressive disclosure, so advanced features do not crowd everyday tasks.
- A contextual primary action and an obvious next step on every screen.
- Good empty, loading, error, success, hover, focus and selected states.
- Responsive layouts that stay clear and usable on a phone.

Do not simply round everything, add whitespace, or wrap everything in cards. Keep purposeful density, and let each screen type look like the job it does.

**Reference anatomy for list and board screens** (from a HubSpot Deals board Remi shared; take the structure, not the look):

1. **Page header:** the object's name as the title, one primary action at top right in the accent color, and everything else behind an overflow menu.
2. **Saved views as tabs,** with "mine" first ("My deals", "All deals", then add a view). The default view answers "what is mine."
3. **One filter row:** search with a keyboard shortcut, a Filter button that shows how many filters are on, Sort, three or four one-click filters for the fields people use most, Clear all, and "Advanced filters" as the escape hatch.
4. **View controls on the right:** which pipeline, board or table, and display settings. Always in the same place.
5. **A summary strip** of three or four numbers that reflect the current filters, each with an explanation on hover, and collapsible. One row, not a grid of cards.
6. **The board:** each column shows its stage name and count, with totals at the foot. Each card shows a title that links to the record, two or three key fields, one urgency signal, and who it belongs to.
7. **A footer** with the record count and the bulk actions (refresh, export).
8. **Color discipline:** the accent appears only on the primary action; a second color marks links and active filters; everything else is neutral with thin borders and almost no shadow.

**What not to copy:** ten or more top-level nav items, upsell cards in the sidebar, sales jargon such as weighted pipeline, an AI assistant in the top bar, and control clusters that only power users can read.

This anatomy matches the audit's main design finding: make the Donors & Funders list the standard for every list (filters in the URL, saved views on the server, server-side paging, a phone card layout).

### B. Navigation and information architecture

Audit every route and destination. Identify orphaned pages, duplicate destinations, confusing labels, unnecessary tabs, and screens that don't fit the user's mental model.

Preserve all valuable capabilities, but challenge where they live. A person should know where to find something without remembering the application's internal architecture.

Evaluate the existing seven-destination model before proposing changes. Do not increase navigation complexity unnecessarily.

### C. Role-based experiences

Audit how BloomOS behaves for:

1. Executive director / organization owner
2. Development or fundraising manager
3. Program manager
4. Operations or finance team member
5. Board or limited-access user

These are distinct experiences within one product, not separate applications. Different roles may require different priorities, actions, and information. Keep access controlled by actual permissions.

The code has five roles today: `owner`, `admin`, `staff`, `finance`, `board_viewer`. There is no development-manager or program-manager role. Map each persona to the current roles, and say whether role-based Today needs a new concept (for example, responsibilities based on what is assigned to a person) rather than new permission roles. Report the gap; do not invent roles.

Pay particular attention to Today. Today should answer:

- What needs my attention?
- What changed since I last checked?
- What am I responsible for?
- What is at risk or overdue?
- What can I finish right now?

Every major panel should have a clear next action. Avoid dashboards filled with numbers that don't help anyone make a decision.

### D. Connected records and frictionless workflows

Evaluate the relationships between donors, gifts, tasks, meetings, organizations, participants, programs, finance, documents, and reporting. A record should provide relevant context and the next useful action, without forcing users to jump between unrelated screens.

Audit high-frequency workflows end to end:

- Record a gift and prepare its acknowledgment
- Find a donor, review history, and log the next interaction
- Create, assign, and complete a task
- Prepare for a meeting and capture follow-up actions
- Review the organization's cash position
- Add a participant or import a roster
- Take attendance from a phone
- Find information through global search
- Move from organizational priorities to an actionable work item

For each workflow, record clicks, context switches, unnecessary fields, confusing decisions, feedback, and recovery from errors. Look for opportunities for inline editing, smart defaults, quick actions, contextual links, and bulk operations. Preserve the integrity of the underlying data.

### E. New organization onboarding

This is a major priority for external adoption. Judge it against a new, unknown nonprofit, using Ambition Angels' setup as the reference. Do not tailor it to any existing tenant.

Evaluate the full experience from invitation through first useful action:

- Organization creation and invitation
- Login, password recovery, and initial access
- Organization identity, terminology, and module configuration
- User invitations, roles, and permissions
- Starter templates, defaults, and example workflows
- Importing existing data
- Column mapping, validation, deduplication, preview, and safe recovery
- Connecting supported external services
- Completing the first meaningful task
- Knowing what to do next

Separate what genuinely must be configured by an operator from what can safely be self-service. Explore a guided setup checklist that gets an organization to value quickly without turning onboarding into a long questionnaire.

We have two different milestones:

- **Pilot-ready:** a new organization can begin using BloomOS with limited, documented assistance.
- **Self-service-ready:** a new organization can set itself up successfully without our involvement.

Do not confuse them or force full self-service billing and setup into the first pilot release.

### F. Mobile and PWA experience

Treat mobile as a real working environment. Prioritize the tasks people would realistically perform away from their desks:

- Check today's priorities
- Find a contact or participant
- Take attendance
- Record a conversation or follow-up
- Create or complete a task
- Review an important notification
- Quickly capture information

Do not simply shrink desktop tables. Define mobile-specific views where appropriate.

Test tap targets, keyboard behavior, form entry, scrolling, safe areas, long names, date inputs, network failures, and interrupted actions. Make online/offline states clear. Do not imply a change was saved when it was not.

### G. Trust, reliability, and product readiness

Audit the product beyond visual polish.

**Data and correctness**

- Cross-tenant isolation
- RLS and API authorization
- Role-specific visibility and actions
- Data freshness and source labeling
- Duplicate handling
- Partial-save and failed-save behavior
- Import/export protections
- Audit history for important changes
- Financial reconciliation and accuracy

**Operational reliability**

- Error reporting and monitoring
- Action success and failure tracking
- Slow queries and loading performance
- API and integration failure handling
- Backup and restore procedures
- Safe deployment and rollback
- Migration compatibility
- Regression testing

**External-product readiness**

- Remove founder-specific and Ambition Angels-only language from generic product surfaces
- Ensure organization terminology works throughout the application
- Provide understandable account and organization settings
- Establish a support and issue-reporting path
- Use helpful, direct error messages
- Add privacy-conscious product analytics
- Make it possible to understand what early testers are struggling with

Treat donor information and minors' personal data as sensitive. No real user data should appear in screenshots, demo environments, telemetry, or test artifacts without appropriate authorization and safeguards.

Review accessibility against WCAG 2.2 AA.

**AI and Reed**

Evaluate whether Reed helps people complete important work rather than adding another place to navigate. AI output should be clearly identified, reviewable, permission-aware, and subject to human approval before consequential writes. Assess safeguards for sensitive data, usage limits, error handling, and tenant separation. Do not expand AI functionality merely to make V4 appear more advanced.

### H. Comms as its own destination and value proposition

Remi's direction: Comms becomes a dedicated space in BloomOS and one of its headline reasons to buy, not a tab buried under Fundraising. It is being built now, and V4 should give it a proper home and make it feel like part of the same product.

**The value proposition to design toward.** A small nonprofit's comms person is usually the ED, with a fraction of their week. BloomOS already knows the donors, the gifts, the programs and the outcome numbers. Comms connects them: capture a story from the field, turn it into a newsletter, a donor update or a LinkedIn post, send it from the org's own Gmail to a segment built from giving history, see who opened and replied, and have all of that show up on each donor's record. Standalone tools hold stories or send email. None of them know the donor and the outcome at the same time. Test this framing in the interview and with a pilot org; don't treat it as settled.

**What exists today (verify against the code at the start of Phase 0; this moves fast):**

- **Sending (on `main`).** G1 connects each org's Gmail through the shared `connections` path. G2 added the send queue, scheduling and the per-minute worker. Per-org identity and footer live in `org_comms_settings`, and unsubscribes write `email_suppressions`. Comms got a seat as a Fundraising tab on 2026-11-20, gated by `modules.comms`.
- **Tracking and results (branch `claude/comms-g3`, in review).** Open and click tracking, campaign results, per-org unsubscribe page. G4 safety nets (stuck-send alarm, copy to leadership) are planned.
- **Story bank, editions and composer (`specs/comms-module.md`, branch `claude/comms-stories-editions-composer-2mn5w5`, last commit 2026-08-24, not merged).** Consent-gated stories, newsletter formats and editions, a composer that turns one story into many drafts, and an edition compiling into the existing sender. Remi confirmed on 2026-11-20 that the story bank is still the plan. Phase 0 reports what it takes to land this branch on top of the Gmail sender (G1 to G3): what still fits, what conflicts, and what needs rework.
- **Related surfaces elsewhere:** journeys (automated sequences, still on their own Resend call), acknowledgments and thank-you letters, `ack_templates`, Capture, the notification Inbox, and team Messages.

**What to work out:**

- **Where it lives.** Propose Comms as its own nav destination. Decide what moves in from Fundraising (Campaigns? Acknowledgments? Journeys?) and what stays, so the nav count goes up by one destination at most and nothing ends up with two homes. Keep entitlement gating on `modules.comms`.
- **Comms versus Messages.** Comms talks to constituents outside the org. Messages is team chat inside it. Keep them separate and name them so nobody confuses the two. Replies to campaigns arrive in the connected Gmail, so decide whether BloomOS shows them, and where.
- **The core loop as one flow:** capture a story, choose an audience, compose, test, schedule, send, read results, follow up. Count the clicks and context switches today, the same as the other workflows in 3D.
- **Connections to the rest of the product.** Every send and result appears on the donor or constituent timeline. Segments come from giving and program data. Outcome numbers in drafts come from real metric snapshots, never typed in. Today shows what Comms needs from the person: sends with an `unknown` status that need a human decision, scheduled sends going out soon, replies waiting, and stories ready to use.
- **Mobile.** Story capture from a phone in about 15 seconds is the main mobile job. Checking results is second. Writing and sending stays desktop-first.
- **Onboarding.** Connecting Gmail, setting identity and mailing address, and importing or building a first segment belong in the setup checklist from 3E.
- **AI.** The composer drafts; a person approves every send. AI output is labeled, grounded only in real stories and metrics, and runs through the redaction boundary.

**Trust requirements specific to Comms:**

- Consent is structural: a story about an identifiable participant, especially a minor, without current consent cannot reach a draft or a send.
- Suppressions and `do_not_contact` are honored on every path, including journeys.
- A send with an unclear provider answer is never retried automatically.
- Per-org daily caps are enforced. Tracking tokens and unsubscribe links never leak across tenants.
- **Pilot blocker to check early:** Gmail sending for external orgs depends on Google OAuth app verification for the Gmail scope. Report its status and lead time in Phase 0, because an unverified app may limit or block a real pilot org.

## 4. Technical approach

Do not automatically introduce server actions, a new client cache, or a new state-management library. First establish where the current architecture causes measurable friction or correctness problems. If a new approach is justified, propose the smallest consistent pattern and a migration strategy.

Consider optimistic updates only where failure can be safely rolled back. Avoid optimistic behavior that could misrepresent financial or sensitive records.

Evaluate the existing shared DataTable under realistic data volumes. Determine when server-side pagination, search, or filtering is warranted.

Protect current entitlements, organization terminology, roles, RLS, feature gates, and the public Ambition Angels website. Keep all admin visual changes scoped to BloomOS.

## 5. Phase 0: Complete product audit

No code changes.

Run the application and inspect real flows. Use the `verify` skill if present. Otherwise use the existing Playwright workflow and report any environment or authentication limitations.

**Data and access for the audit**

- Use Ambition Angels with seeded, non-real data for screenshots and walkthroughs. No production data in any screenshot or artifact.
- `verify` runs without real Supabase credentials, so walkthroughs use seeded data. Read-only Supabase advisors and logs are allowed if available. Anything that needs production access (backup and restore, monitoring, slow queries, live RLS behavior) is reported as "requires runtime access," not guessed.

**How to run it**

Run Phase 0 as parallel tracks, each with its own evidence:

1. UX, design system, and navigation
2. Workflows and mobile
3. Tenancy, permissions, and security
4. Onboarding
5. Reliability and testing
6. Comms (all of 3H)

Merge them into one executive summary of two pages or less, with links to the evidence.

Capture desktop and mobile views of every navigation destination, important tabs, and representative detail pages. Include first-run, populated, empty, loading, failed, and permission-restricted states. Build a consolidated visual review artifact grouped by module.

Produce:

1. Route and navigation inventory
2. Existing component adoption and duplication report
3. UX inconsistency inventory with examples
4. Workflow friction and click-count report
5. Mobile usability findings
6. Multi-tenant and permissions risk assessment, including the persona-to-role mapping
7. Onboarding readiness assessment
8. Reliability and testing gaps
9. Comms assessment: current state across `main` and open branches, the core-loop click count, where it should live, and the Gmail verification status
10. Prioritized opportunities, with evidence

Classify findings:

- **P0:** security, data integrity, broken core workflow, or release blocker
- **P1:** major usability issue or pilot adoption blocker
- **P2:** polish, efficiency, or lower-frequency friction
- **P3:** later enhancement

Prioritize against what Ambition Angels actually uses. The interview in Phase 1 confirms or re-ranks.

Distinguish new work from already completed functionality. Deliver the executive summary first. Link each major finding to its evidence.

Stop after the audit. Do not implement.

## 6. Phase 1: Product interview

Interview Remi about actual usage and intended customers. Ask one question at a time, but don't waste time on decisions the repository or existing specs already answer.

Cover:

- What Remi uses daily and weekly
- What Shannon uses
- Where we still rely on spreadsheets or other systems
- How comms works today: who writes, how often, what goes out (newsletters, appeals, updates, social), and which tools it replaces (Mailmeteor, Mailchimp, Canva, Google Docs)
- Which workflows are essential for an external organization
- Which modules early design partners actually need
- The things that feel slow, confusing, or unnecessarily complicated
- What should be visible immediately versus hidden until needed
- The difference between internal use and pilot use
- Which product experiences we admire and why

Show visual alternatives where helpful. Focus on observable behavior and business decisions, not endless aesthetic preferences. Recommend which decisions should be validated with an external user rather than decided solely by Remi.

Stop after the interview and decision summary.

## 7. Phase 2: Write the V4 product specification

Create `specs/bloomos-v4-product-readiness.md`. It must include:

**Product and experience**

- Five or fewer design principles
- Primary personas and jobs to be done
- Final proposed information architecture
- Page archetypes and interaction patterns
- Shared component standards
- Role-specific Today behavior
- Comms: destination, core loop, story and consent model, how results reach donor records, and what moves out of Fundraising
- Core record and workflow improvements
- Mobile-specific behavior
- Onboarding and first-run experience
- Feedback and support mechanisms

**Technical**

- Shared UI architecture and adoption plan
- Any justified API or client-state improvements
- Performance and reliability requirements
- Authorization and tenant-isolation tests
- Observability and telemetry plan
- Accessibility requirements
- Data integrity and migration strategy
- Dependency and integration risks

**Prototypes**

Create visual designs for six anchor experiences:

1. Today, for an executive director
2. Donor detail, including next actions
3. Finance snapshot, emphasizing reliable decision-making
4. Program roster and mobile attendance
5. A new organization's first-run setup experience
6. Comms home: stories ready to use, editions in progress, scheduled and recent sends with results, and the path from a story to a send

Use these to establish the product standard before redesigning dozens of individual pages. Include empty states and mobile versions. Do not create an unrelated parallel design system.

**Delivery plan**

Prioritize the work by user value, risk, and dependency. Separate:

- Existing features needing consistency work
- Existing features requiring functional improvement
- Features required for safe pilots
- Enhancements that can wait until after pilot feedback

Include explicit stages, acceptance criteria, tests, and approval gates.

Stop and get Remi's approval before implementation.

## 8. Phase 3: Implement in controlled stages

Suggested order, subject to audit findings:

- **Stage A: Critical fixes and product foundations.** Resolve any P0 security or data integrity issues first. Then unify shared page patterns, controls, and state handling.
- **Stage B: High-frequency workflows.** Upgrade Today, Tasks, Donor management, and Finance around real user actions.
- **Stage B2: Comms.** Give Comms its own destination and run the core loop as one flow, from story to send to results, tied into donor records and Today. Sequence this with whatever Comms work has landed by then; don't rebuild what shipped.
- **Stage C: Program and field workflows.** Improve participants, attendance, records, and mobile usage.
- **Stage D: External onboarding.** Implement the minimum setup, permissions, defaults, and import experience required for a real pilot.
- **Stage E: Remaining module consistency.** Bring the rest of the application into the shared experience without losing functionality.
- **Stage F: Pilot hardening.** Complete role-based, cross-tenant, mobile, accessibility, security, reliability, and end-to-end testing.

After each stage:

- Run the relevant existing quality gates
- Verify critical workflows
- Provide desktop and mobile before/after evidence
- Run the SafeSpace no-regression check
- Document meaningful changes
- Commit the approved stage
- Stop for review

Do not rewrite the entire application in one pass. Do not delete or weaken tests to get a passing result. Do not execute production schema changes or destructive migrations without explicit approval.

## 9. The pilot-readiness scorecard

Before calling V4 pilot-ready, demonstrate:

**Usability**

- New users can find and complete their core tasks without constant instruction.
- Important workflows have clear success, failure, and recovery states.
- Mobile field workflows are practical on real devices.
- Navigation and terminology make sense for different organizations.

**Onboarding**

- A new organization can be configured using a documented, repeatable process.
- Required starting data can be entered or imported successfully.
- Staff can be invited and assigned appropriate access.
- A pilot user can reach their first meaningful outcome in the first session.
- A pilot org can connect its Gmail and send a test campaign to itself in its first week, with the Google verification question resolved.

**Trust**

- No known critical tenant-isolation or authorization failures.
- Financial and other sensitive workflows have verified integrity.
- Comms never sends to a suppressed or do-not-contact person, never retries an unclear send automatically, and never lets an unconsented story into a draft.
- Common integration and network failures are recoverable.
- Backup and restore processes are documented and tested.

**Quality**

- No unresolved P0 or P1 issues in the agreed pilot scope.
- Representative end-to-end workflows pass for multiple roles, with the SafeSpace no-regression check passing.
- Mobile and desktop regression tests cover priority surfaces.
- We can detect, investigate, and respond to production failures.

**Learning**

- A small group of external testers can complete realistic tasks.
- We can measure task completion, time to first value, workflow friction, and meaningful errors.
- We have a simple process to collect feedback, triage issues, and ship improvements.

Define the actual numerical thresholds during the spec phase using pilot scope, baseline measurements, and risk. Do not invent success metrics and then claim we met them.

## 10. Non-negotiables

- Keep multi-tenancy, RLS, permissions, entitlements, and organization terminology intact.
- Design and prioritize for Ambition Angels as the only active client. Test with real role differences, and pass the SafeSpace no-regression check every stage.
- Preserve existing capabilities unless Remi explicitly approves removing them.
- Do not modify the public website's branding.
- Continue using the existing admin design tokens and component kit.
- Preserve and extend existing quality gates.
- Follow `tests/copy-voice`, including no em dashes in UI copy.
- Never introduce fictional functionality or hardcoded numbers to make a screen appear complete.
- Distinguish missing information from zero values, stale data, loading states, and errors.
- Don't add new layers of architecture without a justified user or engineering benefit.
- Keep the product easy to understand for a small nonprofit, not just for a technical power user.

## 11. How to communicate

Lead every report with the recommendation or finding. Be straightforward, specific, and practical. Don't write long reports simply to demonstrate how much you inspected. Use screenshots, evidence, and concrete workflows. Push back when an idea introduces unnecessary complexity. Be willing to say that an existing feature is already good enough.

The goal isn't to make BloomOS look like the latest SaaS dashboard. The goal is to make BloomOS the software nonprofit leaders actually want to open and trust to help them run their organizations.

Start with Phase 0. Report your findings and stop.

## Appendix: Gmail verification checklist (do this before V4, not during it)

SafeSpace goes live in about two weeks and Comms sends through each org's Gmail, so this runs now, separately from V4. Background is in `specs/comms-v2-gmail-amendment.md`, Risks 1.

**Where things stand.** BloomOS asks for `gmail.send` (`lib/comms/gmail-oauth.ts`) and `calendar` (`lib/google/oauth.ts`). Both are sensitive scopes, not restricted ones, so one Google review covers both and no paid security assessment is needed. Until the review passes, only listed test users can connect (up to 100), and they see an "unverified app" warning.

**Day one for SafeSpace (no review needed):**

1. In Google Cloud Console, add SafeSpace's sending account as a test user on the OAuth consent screen.
2. Confirm the consent screen's publishing status. In "Testing" status, Google expires refresh tokens after 7 days, which would silently break scheduled sends. Set it to "In production" (unverified is fine for test users) so tokens last.
3. Have SafeSpace connect a shared inbox (such as hello@) rather than a personal account, and send a test campaign to themselves.

**Starting the review (takes days to a few weeks):**

1. A public home page and privacy policy on the app's domain. The policy names the Google data used and why, and states that Gmail data is used only to send mail the org asked to send.
2. Verify the domain in Google Search Console under the same Google account that owns the Cloud project.
3. Fill in the consent screen: app name, logo, support email, authorized domains, and both scopes with a plain justification for each.
4. Record a short demo video: an org connects Gmail, sees the consent screen, and sends a campaign.
5. Submit, then answer Google's follow-up emails quickly. Most of the delay is back and forth.

**Not now:** reading replies inside BloomOS would need a restricted Gmail scope and a yearly paid security assessment. Keep replies in the connected inbox until a pilot shows it's worth it.

