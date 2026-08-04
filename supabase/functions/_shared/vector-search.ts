import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { RetrievedChunk } from './types.ts';

export async function searchKnowledge(
  supabase: SupabaseClient,
  embedding: number[],
  topK: number,
  similarityThreshold: number
): Promise<RetrievedChunk[]> {
  const { data, error } = await supabase.rpc('match_knowledge_chunks', {
    query_embedding: embedding,
    match_count: topK,
    match_threshold: similarityThreshold,
  });

  if (error) throw error;
  return (data ?? []) as RetrievedChunk[];
}
