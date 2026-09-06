import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { RetrievedChunk } from './types.ts';

// businessId is forwarded to match_knowledge_chunks' p_business_id parameter so similarity
// search never scores another tenant's chunks (see
// 20260906000003_scope_match_knowledge_chunks_by_business.sql).
export async function searchKnowledge(
  supabase: SupabaseClient,
  businessId: string,
  embedding: number[],
  topK: number,
  similarityThreshold: number
): Promise<RetrievedChunk[]> {
  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    p_business_id: businessId,
    query_embedding: embedding,
    match_count: topK,
    match_threshold: similarityThreshold,
  });

  if (error) throw error;
  return (data ?? []) as RetrievedChunk[];
}
