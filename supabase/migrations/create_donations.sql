create table if not exists donations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  name text,
  email text,
  amount numeric not null,
  recurring boolean default false,
  stripe_payment_id text not null unique
);

create index if not exists donations_created_at_idx on donations (created_at desc);
create index if not exists donations_email_idx on donations (email);
