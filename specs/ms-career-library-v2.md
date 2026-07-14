# /ms v2: The Career Library

Supersedes the eight-career catalog in `specs/ms-career-game.md` and the trait-weight matrix in `specs/ms-decisions-after-recon.md`.

**What changed.** The earlier plan had Remi hand-authoring a 6-dimension trait model and a hand-tuned weight vector for every career. That does not scale past about a dozen careers, and a dozen careers is not a career exploration product. It is a demo.

The federal government has already published the thing we were about to invent. This doc rebuilds the catalog on top of it.

---

## The insight

**O\*NET publishes a RIASEC interest profile for every occupation.** Free, public domain, machine-readable, keyed to SOC codes. Around 900 occupations.

The six RIASEC dimensions are the six traits, in adult language:

| Our trait | RIASEC | What it is |
|---|---|---|
| **Build** | Realistic | Making, fixing, physical work, working outdoors |
| **Analyze** | Investigative | Studying, researching, figuring out why |
| **Create** | Artistic | Designing, expressing, making something new |
| **Help** | Social | Teaching, caring, being the person someone needs |
| **Lead** | Enterprising | Persuading, deciding, running it |
| **Organize** | Conventional | Order, systems, records, knowing where everything is |

We did not pick these because they are convenient. We arrived at them independently and then found out Holland got there in 1959 and the Department of Labor has been maintaining the occupational data ever since.

**Consequence: the trait weights are a download, not a judgment call.** The 8×6 matrix in the recon decisions doc is deleted. So is any plan to hand-author weights for 100 careers.

---

## What is data vs. what is content

This is the whole reframe. Be precise about it.

### Data (imported, not written)

Per occupation, from O\*NET and BLS:

- `soc_code` — the canonical key
- `title`, `title_variants[]` — O\*NET publishes lay titles and alternate titles
- `riasec_profile` — six numeric scores. **This is the trait weight vector.**
- `job_zone` — 1 to 5. How much education the job actually needs.
- `pay_median`, `pay_p90` — BLS OEWS, joined on SOC
- `education_typical` — BLS OOH
- `pay_source_url`, `pay_as_of`

None of this is written by us and none of it is written by a model. It is imported and it is citable.

### Content (written, reviewed, ours)

Per occupation, exactly two things:

- `day_vignette` — the 150-word private prep
- `clue_1` through `clue_8` — the ladder

**That is the entire content lift.** Claude drafts. Machine gates reject. Remi approves.

The pay clue and the education clue are **rendered from the data**, not written by the model. The model never touches a number.

---

## The scorer

O\*NET already defines the method, and it is better than the dot product I proposed.

**Match on the shape of the profile, not the magnitude.** A student's six RIASEC scores get compared to each occupation's six, by Pearson correlation across the profile. This finds occupations with the same *pattern* of high and low interests, rather than favoring occupations that score high on everything.

Rank by correlation. Return the top ten.

**Job Zone as a second lever, and this one matters to us specifically.** Job Zone encodes how much school an occupation requires. Guarantee that **every student's top ten contains at least three careers in Job Zone 1 through 3** — jobs a person can reach without a four-year degree.

That is not a technical nicety. That is the thesis. A 12 year old in East Oakland who thinks the only good jobs need a bachelor's degree needs to see a surgical technologist at $62,830 with a community college certificate sitting in his top ten. The scorer should make that structurally impossible to miss.

---

## The catalog

**Import ~120 occupations, not 900.** Curated by Remi, with these filters:

- Real spread across Job Zones 1 through 5. Not all bachelor's-and-up.
- Real spread across RIASEC. If every career in the catalog is Investigative, the Artistic kid gets nothing.
- Legible to an 11 year old. "Epidemiologist" is a fine career and a bad card.
- No occupations we would not want a middle schooler to aspire to.
- Include the invisible ones on purpose. That is the whole game.

**Ship when ~40 are approved.** The scorer only ranks `status = 'approved'`. The catalog grows to 120 over the following weeks with zero code changes and zero migrations. Career 41 is a row, not a release.

---

## Schema

```
ms_occupations                              -- IMPORTED. Never hand-edited.
  soc_code            text primary key
  title               text not null
  title_variants      text[]
  riasec              jsonb not null        -- {R,I,A,S,E,C} numeric. from O*NET.
  job_zone            int not null          -- 1..5. from O*NET.
  pay_median          int
  pay_p90             int
  education_typical   text
  pay_source_url      text not null
  pay_as_of           text not null
  imported_at         timestamptz

ms_cards                                    -- WRITTEN. Reviewed. Ours.
  soc_code            text primary key references ms_occupations(soc_code)
  field               text                  -- business|tech|health|creative|trades|public
  day_vignette        text
  clue_1 .. clue_8    text                  -- clue 6 and 7 are RENDERED from ms_occupations
  status              text not null         -- draft | approved | retired
  generated_by        text
  generated_at        timestamptz
  reviewed_by         text
  reviewed_at         timestamptz
  reading_grade       numeric
```

Two tables, on purpose. The data is not the content and they do not get to rot into each other. Re-importing O\*NET next year touches `ms_occupations` and leaves every reviewed card intact.

**The anon view joins them, filters `status = 'approved'`, and excludes `title` and `clue_8`.** Per D8, the reveal goes through a route handler that also writes `clues_used`.

---

## The generation pipeline (now Phase 1, not Phase 6.5)

This is no longer a convenience. It is how the content gets made.

`/admin/careers`, behind BloomOS auth. Remi-facing.

**1. Import.** O\*NET database bulk download plus BLS OEWS join. `ms_occupations` fills. One-time, then annual.

**2. Curate.** Remi picks ~120 SOC codes off the imported list. This is a checkbox exercise, not a writing exercise.

**3. Generate.** One Claude call per occupation, best tier, offline batch. The prompt gets:
- The O\*NET occupation description and detailed work activities
- The real BLS pay figure and education path, **as data the model must not restate or alter**
- The eight approved hand-written cards from `ms-career-cards-v1.md` as few-shot examples
- The format rules and the clue-ladder rule

Returns `day_vignette` and `clue_1` through `clue_5`, `clue_8`. **Clues 6 and 7 (education and pay) are rendered from `ms_occupations` and never generated.** The model cannot hallucinate a salary if it is never asked to produce one.

**4. Machine gates.** Auto-reject and regenerate on any of:
- Vignette contains the title or any `title_variant`
- Clue 1 contains the title, the industry, or any variant
- Clue 8 does not contain a specific, concrete detail
- Vignette reading grade ≥ 6.0
- Any clue empty

**5. Review.** Remi reads the clue ladder. Approves or edits. `reviewed_by` and `reviewed_at` stamp. **A card cannot reach `approved` except by a human click.** No timeout, no fallback, no batch-approve.

**6. Serve.** Approved rows enter the catalog automatically.

---

## The assessment, revised

It is now a **grade-5 interest inventory**. Not something we invented.

Roughly 30 items, one per screen, tap-only, no free text. Each item is a work activity written for an eleven year old ("Build a treehouse." "Figure out why a plant died." "Teach a little kid to read.") The student taps how much they'd like it. Items are tagged to one of the six RIASEC dimensions. Sum by dimension, that's the profile.

Three things this buys:

1. **No free text from a child ever exists.** The COPPA and safety posture becomes structural.
2. **It is defensible.** "Our assessment is a middle-school adaptation of the Holland interest model used by the U.S. Department of Labor" is a sentence you can say to Koshland, to Salesforce, and to a school district. "We made up a quiz" is not.
3. **It is deterministic.** Same answers, same result, every time. No model in the matching path.

---

## What Remi actually has to do

| Task | What it is | Cost |
|---|---|---|
| Curate 120 SOC codes | Checkboxes off an imported list | An afternoon |
| Write the ~30 assessment items | Real writing. Grade 5. No free text. | A session |
| Review cards to launch | Read 40 clue ladders, edit, approve | ~2 hours |
| Review the rest | 80 more cards, whenever | Ongoing |

The eight hand-written cards in `ms-career-cards-v1.md` are not thrown away. **They become the few-shot examples that teach the generator what good looks like.** That is now their most important job.

---

## Failure modes

**A generated card gets approved unread.** The product becomes "AI wrote our curriculum," which is exactly the thing we tell funders we do not do. Mitigation: `reviewed_by` is not nullable on an approved row. Machine gates never set `approved`. There is no batch-approve button and there will not be one.

**The model invents a salary.** Mitigation: it is never asked to. Clues 6 and 7 are rendered from `ms_occupations`. The model does not see a number and does not produce one.

**The catalog is all Job Zone 4 and 5.** Every career in a kid's top ten needs a bachelor's degree, and we have just told a 12 year old in East Oakland that the world is closed to him unless he goes to college. This is the worst thing this product could do. Mitigation: the scorer guarantees three Job Zone 1 to 3 careers in every top ten, and the curation step is checked against Job Zone spread before any generation runs.

**The catalog is boring.** 120 careers and all of them are ones a kid could already name. Mitigation: curation explicitly targets the invisible ones. If a 12 year old can define it, it is not doing work.

**Import becomes a project.** Somebody builds a beautiful O\*NET sync service. Mitigation: it is a CSV download and a script. It runs once. It is not a service.
