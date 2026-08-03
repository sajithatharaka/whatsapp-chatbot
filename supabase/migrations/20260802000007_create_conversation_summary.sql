create table public.conversation_summary (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers (id) on delete cascade,
  summary text,
  updated_at timestamptz not null default now()
);

alter table public.conversation_summary enable row level security;
