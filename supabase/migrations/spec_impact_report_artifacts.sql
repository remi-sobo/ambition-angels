-- BloomOS V2 / Spec Impact, stage I2 — the impact report artifact vocabulary.
-- (specs/bloomos-v2-spec-impact.md — the spec's ONE migration.)
--
-- One additive registration, no new tables: entity_types gains
-- 'impact_report' so the spine knows the artifact kind and document_links
-- can target one. The exported file lives in the ordinary documents table
-- (doc_type 'impact_report'), and export_waivers.artifact_id IS the document
-- id — the draft's report id becomes the documents row id at export, so
-- waivers written while drafting travel with the shipped artifact (the N3
-- fin_report pattern verbatim). The Reed narrative reuses the existing
-- 'report_narrative' kind (spec ruling), so the reed_drafts check is
-- untouched here.

insert into public.entity_types (entity_type, display_name, module, route_pattern, icon)
values ('impact_report', 'Impact report', 'metrics', '/admin/impact/reports', 'kpis')
on conflict (entity_type) do nothing;
