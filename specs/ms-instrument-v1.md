# /ms Instrument v1 — DRAFT for Remi's review

Status: **draft. Nothing here ships until Remi has read every item.**
Per `specs/ms-career-library-v2.md` ("The assessment, revised") and D9: a
grade-5 interest inventory. 30 items, one per screen, tap-only, no free
text, each tagged to one RIASEC dimension. Sum by dimension → the profile.
The scorer (`lib/ms/score.ts`) matches profile shape, so the response scale
just needs to be consistent, not calibrated.

**Response scale, every item the same** (tap one):

> **No way** · **Not really** · **Maybe** · **I'd like that** · **I'd love that**

Scored 0–4. The question at the top of every screen: **"Would you want to
spend a day doing this?"** Then the item, as big type.

Review bar, same as the cards: every item read aloud by a middle schooler;
any word they stumble on comes out. Items must describe an *activity*, not
a job. No item may hint that some answers are better than others.

---

## Build (Realistic) — R

1. Fix a bike that stopped working, and figure out what was wrong.
2. Build a treehouse from a pile of boards.
3. Take something apart just to see what is inside it.
4. Plant a garden and take care of it all summer.
5. Put together furniture from the instructions, and get it right.

## Analyze (Investigative) — I

6. Figure out why a plant died when the one next to it lived.
7. Do a science experiment to see if something you believe is really true.
8. Solve a mystery using clues nobody else noticed.
9. Watch a video about how volcanoes work, on purpose, for fun.
10. Keep testing a game until you find the exact spot where it breaks.

## Create (Artistic) — A

11. Make up a story and tell it so well people want to hear it again.
12. Design the cover for an album or a game.
13. Make a video and edit it until it feels exactly right.
14. Write a song about something that happened to you.
15. Turn a plain room into one that looks amazing.

## Help (Social) — S

16. Teach a little kid to read.
17. Sit with somebody at lunch who is having a bad day.
18. Show a new student around so they are not lost on day one.
19. Help your grandmother figure out her phone without making her feel bad.
20. Coach younger kids on a team and watch them get better.

## Lead (Enterprising) — E

21. Talk your friends into doing your plan for the weekend.
22. Run a bake sale: set the prices, make the signs, count the money.
23. Be the captain who decides who plays where.
24. Convince an adult to change their mind about something, politely.
25. Start a club at school and get people to actually show up.

## Organize (Conventional) — C

26. Organize your whole room so everything has a spot.
27. Keep score for a tournament and never lose track.
28. Make the packing list for a trip so nothing gets forgotten.
29. Sort a huge messy playlist into perfect order.
30. Plan a party: the list, the schedule, who brings what.

---

## Notes for review

- **Balance check:** 5 items per dimension, so a raw sum per dimension is
  comparable across dimensions. If any item gets cut, cut to 4 per
  dimension everywhere, never unevenly.
- **The flat-profile case is handled in code:** a kid who taps the same
  answer 30 times gets a stable, Job-Zone-diverse list, not an error
  (`lib/ms/score.ts`, flat-profile rule). No item needs to force spread.
- **No reverse-scored items.** Eleven year olds answer the question in
  front of them; trick items measure reading, not interest.
- **Gender/culture pass needed:** read the list asking "does any item
  assume whose hobby this is?" Items 4, 19, 30 are the ones to watch.
- **Vocabulary pass:** target is grade 5. Current suspects: "tournament"
  (27), "instructions" (5). A middle schooler reading aloud settles it.
- **Screen balance:** screen-adjacent items are spread across dimensions
  (10 in Analyze, 13 in Create, 29 in Organize) so a kid who lives on a
  phone is not funneled to tech by default, and a kid without one is not
  locked out of any dimension.
