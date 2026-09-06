-- Closes the cross-tenant retrieval leak that would otherwise exist the moment a second business
-- has knowledge_chunks: without this, /chat, /web-chat, and /search would similarity-search
-- across every business's chunks, not just the caller's. Adding a leading p_business_id
-- parameter changes the function's identity for Postgres overload resolution (it's not just a
-- signature edit via create or replace on the same identity, unlike the vector-dimension change
-- in 20260827000001_update_match_knowledge_chunks_dimension.sql which kept the same base
-- argument types) — so the old 3-arg overload is dropped explicitly and the new 4-arg one is
-- created and granted from scratch.
drop function if exists public.match_knowledge_chunks(extensions.vector, int, float);

create function public.match_knowledge_chunks(
  p_business_id uuid,
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
  where kc.business_id = p_business_id
    and 1 - (kc.embedding <=> query_embedding) >= match_threshold
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_knowledge_chunks(uuid, extensions.vector, int, float)
  to service_role;
