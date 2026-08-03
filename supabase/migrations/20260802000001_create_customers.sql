create table public.customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  preferred_language text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_phone_idx on public.customers (phone);

alter table public.customers enable row level security;
-- No policies: only the service-role key (used exclusively by Edge Functions)
-- can read/write this table. This is defense in depth, not the primary
-- access control mechanism.
