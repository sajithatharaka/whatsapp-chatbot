create table public.ai_configuration (
  id uuid primary key default gen_random_uuid(),
  is_active boolean not null default true,
  chat_model text not null,
  embedding_model text not null,
  fallback_model text,
  similarity_threshold numeric(3, 2) not null default 0.75,
  temperature numeric(3, 2) not null default 0.30,
  max_tokens int not null default 512,
  top_k int not null default 5,
  system_prompt text not null,
  business_rules_prompt text,
  fallback_message text not null default
    'I couldn''t find reliable information regarding that. Would you like me to connect you with a member of our team?',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one active configuration row at a time.
create unique index ai_configuration_single_active_idx
  on public.ai_configuration (is_active)
  where is_active;

alter table public.ai_configuration enable row level security;
