-- Companion to 20260827000000_resize_knowledge_chunks_embedding.sql: the RPC's
-- query_embedding parameter must agree with knowledge_chunks.embedding's new
-- vector(1024) dimension, or every /search and /chat call fails with a
-- pgvector "different vector dimensions" error as soon as a caller passes a
-- 1024-dim query embedding against this still-768 signature.
--
-- create or replace is sufficient here (not drop + create): a function's
-- identity for overload-resolution purposes is its argument base types
-- (`vector`), not the typmod/dimension in parentheses — the existing
-- `grant execute on function public.match_knowledge_chunks(extensions.vector, int, float)`
-- from 20260803000000_grant_service_role_table_privileges.sql already reflects
-- that (no dimension in the grant's signature) and is unaffected by this change.
create or replace function public.match_knowledge_chunks(
  query_embedding extensions.vector(1024),
  match_count int,
  match_threshold float
)
returns table (
  id uuid,
  document_id uuid,
  chunk_text text,
  metadata jsonb,
  similarity float
)
language sql
stable
set search_path = public, extensions
as $$
  select
    kc.id,
    kc.document_id,
    kc.chunk_text,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where 1 - (kc.embedding <=> query_embedding) >= match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

-- Defensive re-grant in case create or replace ever does get treated as a new
-- object by the role that runs migrations — cheap and idempotent either way.
grant execute on function public.match_knowledge_chunks(extensions.vector, int, float)
  to service_role;
