# Reed `read_document` — participant-data exclusion (small spec)

Status: scoped, not built. Recorded 2026-09-03.

## Problem

`read_document` (`lib/agents/reed/tools.ts`) returns the text of any PDF or
plain-text document in the org's `documents` bucket to the model, after the
RLS row check and a size cap. A youth roster uploaded as a PDF is just a
document. Nothing about the path distinguishes a board packet from an intake
form, so the SafeSpace restriction on youth data reaching models has no
enforcement point here.

## Current data

`documents` holds 19 rows: Ambition Angels 6, Young, Gifted & Black 13.
`doc_type` already exists and is populated: `policy` 7, `other` 5,
`award_letter` 3, `grant_narrative` 1, `minutes` 1, `mou` 1, `board_packet` 1.
`other` is where a roster would land today.

## Scope

1. **Classification.** Extend the `doc_type` vocabulary with participant
   classes (`intake_form`, `roster`, `consent`, `case_note`, `participant_other`)
   and require a type on upload; `other` stays for non-participant material.
   Existing rows keep their type; a one-time pass reviews the 5 `other` rows.
2. **Reed exclusion list.** A constant set of participant `doc_type`s that
   `read_document` and `list_documents` refuse (`list_documents` omits them,
   `read_document` returns `{ error: "excluded", … }` with a message telling
   the user to open it in the Documents hub). The list lives next to the
   tools and is covered by a test that reads the vocabulary and asserts every
   participant class is excluded.
3. **Unclassified is excluded.** A row with a null `doc_type` is treated as
   participant material until classified. This is the safe default and the
   reason upload must require a type.
4. **Out of scope.** Content inspection or OCR-based detection. The
   classification is a human statement at upload time; the fence enforces
   it.

## Open decisions

- Whether `grant_narrative` and `board_packet` can embed youth stories with
  names (they can). Recommend a per-document `contains_participant_data`
  checkbox on upload, mirroring the A2 obligations flag, rather than
  widening the excluded types.
- Whether YGB's 13 documents need a review pass before Reed is enabled for
  that org.
