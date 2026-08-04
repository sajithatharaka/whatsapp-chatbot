create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text,
  source text,
  source_type text,
  checksum text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.knowledge_documents enable row level security;
