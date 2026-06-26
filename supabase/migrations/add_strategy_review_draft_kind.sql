-- Reed for strategy (Phase A): allow Reed to save an OGSM coherence review as a
-- draft, alongside grant narratives / board updates / acknowledgments.
-- Idempotent: drop-and-recreate the kind check.

alter table public.reed_drafts drop constraint if exists reed_drafts_kind_check;
alter table public.reed_drafts add constraint reed_drafts_kind_check
  check (kind in ('grant_narrative', 'board_update', 'acknowledgment', 'strategy_review'));
