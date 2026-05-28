-- Donor / supporter sign-ups captured by the public Demo Day signup form
-- (public/demoday/signup/index.html, served at /demoday/signup). One row per
-- submission. Shown in the admin at /admin/demoday (Signups tab).
create table if not exists demoday_signups (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone not null default now(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  company text,
  title text,                 -- role / title ("jobtitle" on the form)
  engagement text[] not null default '{}',  -- "How would you like to engage?" selections
  note text,
  source text not null default 'Demo Day Signup'
);

create index if not exists demoday_signups_created_at_idx on demoday_signups (created_at desc);
create index if not exists demoday_signups_email_idx on demoday_signups (email);

-- Lock the table down. All reads/writes go through the service-role key
-- (lib/supabase/admin.ts), which bypasses RLS. Enabling RLS with no policies
-- means the anon/authenticated keys can't read these supporter contacts.
alter table demoday_signups enable row level security;
