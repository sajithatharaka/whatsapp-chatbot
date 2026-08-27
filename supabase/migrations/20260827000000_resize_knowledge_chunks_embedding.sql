-- Part of the Cloudflare Workers AI -> OpenRouter migration (see
-- docs/requirements/openrouter-migration.md). The new embedding model,
-- qwen/qwen3-embedding-8b, replaces @cf/baai/bge-base-en-v1.5 (English-only,
-- root cause of imprecise Sinhala retrieval) and is truncated via Matryoshka
-- (MRL) to 1024 dimensions (see EMBEDDING_DIMENSIONS in
-- supabase/functions/_shared/ai-provider.ts) to keep the existing HNSW
-- index size/query latency reasonable.
--
-- Existing 768-dim vectors are dropped, not cast: they came from a
-- different model's embedding space entirely, so even a hypothetical
-- 768->1024 cast would be meaningless, not just wrong-sized. The column is
-- left nullable (was `not null`) because every existing row now has no
-- valid embedding until the `/reindex` function (see
-- supabase/functions/reindex/index.ts) re-embeds it with the new model —
-- required immediately after this migration lands, before search will
-- return any results.
alter table public.knowledge_chunks
  alter column embedding drop not null;

alter table public.knowledge_chunks
  alter column embedding type extensions.vector(1024)
  using null;

drop index if exists public.knowledge_chunks_embedding_idx;

create index knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

comment on column public.knowledge_chunks.embedding is
  'Embedding vector from qwen/qwen3-embedding-8b via OpenRouter, MRL-truncated to 1024 dimensions '
  '(see supabase/functions/_shared/ai-provider.ts). Nullable: a null embedding means the chunk is '
  'awaiting /reindex. Changing embedding models again requires a new migration to resize this '
  'column (and match_knowledge_chunks.query_embedding) plus a full /reindex.';
