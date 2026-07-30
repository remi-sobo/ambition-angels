-- Documents: free-text notes on every document (Shannon's report). One field
-- for whatever the file needs alongside it — insurance provider + policy
-- number, coverage details, context for a receipt. Policy numbers change
-- yearly, so notes are editable after upload without re-uploading the file.
alter table public.documents add column if not exists notes text;
