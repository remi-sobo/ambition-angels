-- Reed document extractions (spec #6, Phase 4 / open decision C — approved).
--
-- Two additive changes so propose_document_extraction rides the EXISTING
-- suggestion rail (inbox UI, dismissal flow, audit trail) instead of growing
-- a third proposal table:
--
--   1. payload jsonb (nullable) — the typed extraction the accept route knows
--      how to apply. Two kinds in v1 ('document_fields' | 'obligation_task'),
--      validated app-side by lib/agents/reed/extraction.ts on BOTH the write
--      (tool) and the apply (accept route); unknown kinds render as text with
--      no apply. Rows without a payload behave exactly as before: accepting
--      records the decision and applies nothing.
--   2. domain check gains 'documents', so accepting a document-field
--      extraction requires documents.write (the accept route derives the
--      permission as `${domain}.write`).
--
-- No RLS change: the membership-scoped policy on reed_suggestions already
-- covers the new column. Idempotent. Apply via the dashboard.

alter table public.reed_suggestions add column if not exists payload jsonb;

alter table public.reed_suggestions drop constraint if exists reed_suggestions_domain_check;
alter table public.reed_suggestions add constraint reed_suggestions_domain_check
  check (domain in ('program', 'fundraising', 'finance', 'ops', 'board', 'compliance', 'documents'));
