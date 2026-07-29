-- Documents: issue/approved date, separate from expiry (Shannon's report).
-- The upload form's single date field used to write expires_at, so ordinary
-- documents showed up as "Expired" in the hub. issued_at records when the
-- document was created/approved; expires_at stays for renewal-tracked types
-- (insurance uploads, Reed-extracted award-letter expiries).
alter table public.documents add column if not exists issued_at date;
