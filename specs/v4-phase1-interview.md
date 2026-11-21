# BloomOS V4 Phase 1: interview and decision summary

Interview with Remi, 2026-11-20. Twelve questions, one at a time. This records his answers, what they decide, and what still needs an outside voice. It feeds `specs/bloomos-v4-product-readiness.md` (Phase 2).

## Answers

| # | Question | Remi's answer |
|---|---|---|
| 1 | What do you open BloomOS to do most days? | See what needs me. Work donors and gifts. Check the money. Not tasks and meetings. Added on his own: "always would love to be able to log things via voice recorder and see cards to confirm. That's important for everyone to have easy access to log something." |
| 2 | What should voice logging be able to file? | All four: a donor conversation, to-dos and follow-ups, a gift or pledge, a story or program moment. |
| 3 | What does Shannon do in a normal week? | Tasks and projects. Finance upkeep. Donor records and thank-yous. Not programs. |
| 4 | Where does program work live? | In the Ambition Angels mobile app, not BloomOS. But BloomOS Programs "will host some when we build out the Ambition Coach model" (ambitionangels.org/coach). No spreadsheets, HubSpot-first work, or outside email tools were named. |
| 5 | What do pilot orgs need on day one, beyond tasks and meetings? | All four: Fundraising, Programs, Finance, Comms. |
| 6 | If only one could be excellent in a pilot's first month? | Fundraising. |
| 7 | What annoys you today? | I can't find things. Too many steps. Too much on the screen. Not speed or flakiness. |
| 8 | The top of Today, two things only? | He chose three: what's mine and overdue, money at a glance, my day. Not "donors who need me." |
| 9 | Who logs in at a pilot org in month one? | The ED plus one or two staff. |
| 10 | How should setup work for the first pilots? | We set it up, they finish: one script with good defaults, then a short in-app checklist. |
| 11 | Whose feel should BloomOS borrow, besides HubSpot's layout? | Stripe's dashboard: dense numbers you can trust at a glance, each explaining where it came from. |
| 12 | What is the phone for? | All four: talk to log something, look someone up, check what needs me, take attendance. |

Earlier direction that stands (see the brief): structured calm; the HubSpot list and board anatomy; a flush dark sidebar with a rounded bright working surface; Comms as its own destination, with the story bank.

## What this decides

1. **Voice capture becomes a first-class entry point, not a module.** It was the one thing Remi raised unprompted, and he wants it for everyone. It should be reachable from anywhere (the quick-add button on desktop, the center button on the phone), file all four kinds of record, and always end in cards to confirm. Capture exists today behind the `ai.capture` entitlement; V4 promotes it and finishes the four record types.
2. **Fundraising is the first module rebuilt to the new standard.** Stage B leads with donor list, donor record, gift entry and thank-you as one flow. This matches the audit's worst-workflow list (gift to thank-you is about 9 clicks over 3 screens).
3. **The three complaints map to three pieces of work.** "Can't find things" is navigation and a real Settings home. "Too many steps" is the workflow rebuilds. "Too much on the screen" is the page anatomy and progressive disclosure. Speed did not make his list, so performance work is limited to the known failures (the Donors & Funders timeout).
4. **Today's top for an ED is: mine and overdue, money at a glance, my day.** Donors who need attention sit one level down or inside "mine" as assigned next steps. This needs the "assigned to me" concept the audit called for.
5. **Numbers follow the Stripe standard.** Every figure states its source and freshness. This settles the open design-system question: stat displays go through the one component that records where a number came from.
6. **Programs is built for Ambition Coach and for pilots, not for today's Ambition Angels use.** Nobody at Ambition Angels uses Programs weekly. Its design should be judged against the coach model and a pilot org's rosters and attendance.
7. **Pilot target: an ED plus one or two office staff, set up by us with a short checklist.** This is the "pilot-ready" milestone in the brief. Self-service signup, a whole field team on phones, and board logins are later.
8. **The phone gets four jobs:** talk to log, look someone up, check Today, take attendance. Everything else on a phone only has to work, not shine.

## Where I pushed, and what I recommend

- **"All four modules on day one" for pilots is too wide to make excellent at once.** Remi's own tiebreak was Fundraising. Recommended order for pilot quality: Fundraising first, then Today with voice capture, then Comms, then Programs with phone attendance, with Finance kept correct and trustworthy rather than redesigned early. Finance already works for Ambition Angels and gets its per-org fixes in the hardening work.
- **Three things at the top of Today is one more than asked.** It is workable if "my day" is a thin strip (next meeting and what changed) rather than a full panel. The prototype will show it that way.
- **Shannon's answers are Remi's account of her week.** Fifteen minutes with Shannon on tasks, finance upkeep and thank-yous would catch what he does not see.

## Decide with an outside user, not alone

- Whether a pilot ED also wants "donors who need me" at the top of Today. Remi did not; an ED without a development person might.
- What a pilot org expects from Programs on day one. Ask SafeSpace what they track today and how.
- Whether Comms from their own Gmail is a reason to adopt, or a nice extra. Ask before investing in it ahead of Programs.
- Whether a non-founder will actually talk to their phone to log things. Watch one SafeSpace staff member try it.
- The setup checklist: have SafeSpace's ED do it once while we watch, and count where they stall.

## Next

Phase 2: write `specs/bloomos-v4-product-readiness.md` and the remaining prototypes (Today for an ED, donor record with next actions and gift to thank-you, finance snapshot, program roster with phone attendance, first-run setup, Comms home, and voice capture's confirm cards). Stop for Remi's approval before any build.
