-- BloomOS V2 / Spec Finance, stage N3 — the report artifact vocabulary.
-- (specs/bloomos-v2-spec-finance.md, decision 2 — RESOLVED: a generated
-- report is a documents row, signed 2026-09-09.)
--
-- Two additive registrations, no new tables:
--
-- 1. reed_drafts gains the 'report_narrative' kind: Reed may DRAFT a report
--    narrative for approval like it drafts grant narratives — a human
--    approves before the Reports builder will render it, and nothing sends
--    itself. Idempotent: drop-and-recreate the kind check (the
--    add_strategy_review_draft_kind precedent).
--
-- 2. entity_types gains 'fin_report' so the spine knows the artifact kind
--    and document_links can target one. The exported file lives in the
--    ordinary documents table (doc_type 'fin_report'), and
--    export_waivers.artifact_id IS the document id — the draft's report id
--    becomes the documents row id at export, so waivers written while
--    drafting travel with the shipped artifact.

alter table public.reed_drafts drop constraint if exists reed_drafts_kind_check;
alter table public.reed_drafts add constraint reed_drafts_kind_check
  check (kind in ('grant_narrative', 'board_update', 'acknowledgment', 'strategy_review', 'report_narrative'));

insert into public.entity_types (entity_type, display_name, module, route_pattern, icon)
values ('fin_report', 'Financial report', 'finance', '/admin/finance/reports', 'finance')
on conflict (entity_type) do nothing;
