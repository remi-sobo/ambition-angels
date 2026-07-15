# /ms Addendum: The Career Library and the Generation Pipeline

Amends `specs/ms-career-game.md` and `specs/ms-decisions-after-recon.md`.
Answers one question: can Claude write the cards, and can we cache them so we never write the same career twice.

Yes. With one hard line.

> **Superseded in part by `specs/ms-career-library-v2.md`:** the single `ms_careers` table becomes the `ms_occupations` / `ms_cards` split, trait weights are imported from O\*NET (never model-generated), and the pipeline moves from Phase 6.5 to Phase 1. The hard line, the SOC dedup key, the rendered clues 6–7, the machine gates, and Phase 7 all stand.

---

## The hard line

**A card that a child reads has been read by a human first. No exceptions, no timeouts, no fallbacks.**

Claude drafts. A human approves. Only `status = 'approved'` rows are ever served to a student.

There is no "generate it live if we don't have it" path in the student experience. Not as a fallback, not under load, not at Dreamforce when something goes wrong. If a card is not approved, the career is not in the catalog, and the student never sees it.

This is not caution for its own sake. The card contains a salary figure, an education path, and a claim about what a job actually is, and a 12 year old is going to read it out loud to three other 12 year olds and believe it. One hallucinated number is one too many.

---

## Why `/ms` has no cache-miss problem at all

Worth being explicit, because it dissolves half the question.

The `/ms` scorer ranks careers **that exist in `ms_careers`.** A student cannot pick a career we do not have, because the catalog is the menu. The career space is closed by construction.

So on `/ms`, "what if we don't have the card" is not a runtime problem. It is a content backlog. The pipeline below is a tool for Remi, not a service for a student.

The place where an open career space genuinely exists is the **high school quiz**, which today asks a model to invent ten arbitrary careers per user, live, every single time. That is where a cache pays for itself. See "Phase 7" below.

---

## The dedup key is the SOC code

Not fuzzy title matching. Not embeddings. **The BLS Standard Occupational Classification code.**

"UX Researcher," "User Experience Researcher," "Product Researcher," and "UX Designer" are four titles and one occupation: **SOC 15-1255**. Match on the code and dedup is exact instead of a guess.

Two things fall out of this for free:

1. **Every card gets a real pay figure by construction.** The SOC code *is* the BLS row. `pay_source` stops being a field somebody has to remember to fill in and becomes a lookup.
2. **The library is a real library.** Any surface, `/ms` today and the high school quiz later, resolves any job title to a canonical occupation and asks: do we already have this one?

---

## Schema

Amends `ms_careers`. This is now the shared career library, not a `/ms`-only table.

```
ms_careers
  id
  soc_code            text unique not null      -- 29-2055. the canonical key.
  title               text not null             -- our display title
  title_variants      text[]                    -- every alias that resolves here
  field               text                      -- business | tech | health | creative
  day_vignette        text
  clue_1 .. clue_8    text
  trait_weights       jsonb                     -- {build, analyze, help, create, organize, lead}
  pay_median          int
  pay_p90             int
  pay_source_url      text                      -- the BLS OOH page. required.
  pay_as_of           text                      -- "May 2024"
  status              text not null             -- draft | approved | retired
  generated_by        text                      -- model id, or 'human'
  generated_at        timestamptz
  reviewed_by         text
  reviewed_at         timestamptz
  reading_grade       numeric                   -- computed, see gates
```

**`status = 'approved'` is the only thing the anon view exposes.** Drafts are invisible to the public surface, full stop. The anon view continues to exclude `title` and `clue_8`, per D8.

---

## The pipeline

An admin surface. `/admin/careers`. Remi-facing, behind existing BloomOS auth. Not a student surface, not a public route.

**1. Add a career.** Remi types a job title, or picks one off a list of SOC codes. The system resolves it to a SOC code and checks the library first. Already have it? Say so and stop. That is the cache.

**2. Generate.** One Claude call through `lib/ai/gateway.ts`. This is an offline batch job with low volume and high stakes, so it runs on the best model available, not the fast tier. The prompt hands the model the format rules, the worked example from `ms-career-cards-v1.md`, and the real BLS figures pulled from the SOC row. **The model does not invent the salary.** It is handed the number and told to write around it.

The call returns: the vignette, eight clues, six trait weights, and a proposed field. All as `status = 'draft'`.

**3. Machine gates, before a human ever looks.** A draft that fails any of these is rejected and regenerated. Cheap, automatic, and it means Remi's review time is spent on judgment, not on catching obvious failures.

- The vignette does not contain the job title or any of its `title_variants`.
- Clue 1 does not contain the title, the industry, or any variant.
- Clue 8 *does* contain something specific enough to be a giveaway.
- Reading grade level of the vignette is under 6.0.
- All eight clues are present and non-empty.
- Trait weights are six integers, 0 to 5, and not all identical.

**4. Review.** Remi reads it. Edits inline. Approves or rejects. `reviewed_by` and `reviewed_at` get stamped. This is the step that cannot be automated and will not be.

**5. Serve.** Approved rows enter the catalog and the scorer picks them up automatically.

---

## What this buys

Eight careers is a launch set. It is not a product.

The pipeline turns "write 60 careers" from a quarter of Remi's writing time into a few sessions of editing. Every partner who asks "do you have anything on trades" or "our kids care about sports" becomes a half-day, not a project. The game gets better by adding careers, and now adding careers is cheap.

The one thing it does not buy is a shortcut around review. Sixty approved cards still means sixty cards Remi read.

---

## Phase 7 (later, not now): the high school quiz reads the same library

Today, `app/api/career-match/route.ts` asks a model to invent ten careers per user, live, on every submission. That means:

- The same career gets rewritten from scratch hundreds of times.
- Two students with identical answers can get different results.
- Every submission costs a model call for content we already own.
- Nothing a student sees has ever been reviewed by anybody.

Once the library exists, the high school quiz gets a cache-first path: **resolve to SOC codes, serve the approved card if we have it, generate and queue for review if we don't.** The student still gets a result immediately, but the *card content* they see is the reviewed one when we have it. The library fills itself out from real student demand, which is a better prioritization signal than anything Remi could guess.

This is a real improvement to a live surface and it is the strongest argument for building the library properly. But it is Phase 7. It does not touch the middle school build and it should not delay it.

---

## Failure modes

**A draft gets approved without being read.** The whole thing collapses into "AI wrote our curriculum." Manifests as a card with a wrong salary or a fake credential path, read out loud in a partner classroom. Mitigation: `reviewed_by` is not nullable on an approved row, and the machine gates never set `status` to approved. Only a human click does.

**The pipeline becomes the product.** Somebody builds a beautiful admin surface and the game does not ship. Manifests as a slipped Dreamforce date. Mitigation: the eight launch cards are already drafted and do not need this tool. **The pipeline is Phase 6.5, after the game works.** Build the game first. Ship it. Then make adding career nine cheap.

**Fuzzy matching creeps back in.** Somebody decides SOC codes are annoying and adds a "close enough" title match. Now "Nurse" and "Nurse Practitioner" collapse into one card and we are telling kids the wrong salary and the wrong education path for a different job. Mitigation: SOC code is `unique not null`. There is no fuzzy path.

**Generate-on-miss shows up as a fallback.** Under load, at Dreamforce, someone adds a "if we don't have the card, make one." Mitigation: it is in the Out list of the spec and it is in the hard line at the top of this doc. The catalog is the menu.
