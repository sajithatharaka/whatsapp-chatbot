import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { searchKnowledge } from './vector-search.ts';
import type { RetrievedChunk } from './types.ts';

const CHUNKS: RetrievedChunk[] = [
  { id: 'c1', document_id: 'd1', chunk_text: 'Open 9-5 daily.', similarity: 0.91 },
];

Deno.test('searchKnowledge forwards businessId as p_business_id to the RPC', async () => {
  let capturedFn: unknown;
  let capturedArgs: unknown;
  const supabase = {
    rpc: (fn: string, args: unknown) => {
      capturedFn = fn;
      capturedArgs = args;
      return Promise.resolve({ data: CHUNKS, error: null });
    },
  } as unknown as SupabaseClient;

  const result = await searchKnowledge(supabase, 'business-1', [0.1, 0.2, 0.3], 5, 0.5);

  assertEquals(result, CHUNKS);
  assertEquals(capturedFn, 'match_knowledge_chunks');
  assertEquals(capturedArgs, {
    p_business_id: 'business-1',
    query_embedding: [0.1, 0.2, 0.3],
    match_count: 5,
    match_threshold: 0.5,
  });
});

Deno.test('searchKnowledge throws on an RPC error', async () => {
  const supabase = {
    rpc: () => Promise.resolve({ data: null, error: new Error('boom') }),
  } as unknown as SupabaseClient;

  let threw = false;
  try {
    await searchKnowledge(supabase, 'business-1', [0.1], 5, 0.5);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
