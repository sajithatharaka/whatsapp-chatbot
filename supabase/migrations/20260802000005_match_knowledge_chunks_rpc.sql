-- Cosine-similarity search over knowledge_chunks. Ordering/filtering by
-- vector distance has to happen in SQL (pgvector operators), so this is
-- exposed as an RPC rather than done via REST-level filtering.
create function public.match_knowledge_chunks(
  query_embedding extensions.vector(768),
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
