create table if not exists partner_waitlist (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default now(),
  first_name text not null,
  last_name text not null,
  email text not null,
  role text not null,
  teen_count text
);

create index if not exists partner_waitlist_created_at_idx on partner_waitlist (created_at desc);
create index if not exists partner_waitlist_role_idx on partner_waitlist (role);
