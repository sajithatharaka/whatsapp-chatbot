create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  message text not null,
  confidence numeric(3, 2),
  model text,
  tokens int,
  tool_used text,
  source_chunks text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

create index conversation_messages_customer_created_idx
  on public.conversation_messages (customer_id, created_at);

alter table public.conversation_messages enable row level security;
