-- Embedding dimension is pinned to 768 to match the default Workers AI
-- embedding model (@cf/baai/bge-base-en-v1.5, see
-- supabase/functions/_shared/ai-provider.ts). Switching embedding models to
-- one with a different output dimension requires a new migration that
-- recreates this column and re-embeds every existing chunk.
create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents (id) on delete cascade,
  chunk_text text not null,
  embedding extensions.vector(768) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index knowledge_chunks_document_id_idx on public.knowledge_chunks (document_id);

create index knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.knowledge_chunks enable row level security;
