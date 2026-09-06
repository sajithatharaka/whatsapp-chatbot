import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { documentHasChunks, updateChunkEmbedding } from './knowledge.ts';

const BUSINESS_ID = 'business-1';

// Mocks the chain documentHasChunks relies on:
// supabase.from('knowledge_chunks').select('id', { count: 'exact', head: true }).eq('document_id', ...).eq('business_id', ...)
function fakeClientWithChunkCount(count: number | null, error: Error | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ count, error }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

Deno.test('documentHasChunks returns true when chunks exist', async () => {
  const supabase = fakeClientWithChunkCount(3);
  assertEquals(await documentHasChunks(supabase, BUSINESS_ID, 'doc-1'), true);
});

Deno.test('documentHasChunks returns false when count is zero', async () => {
  const supabase = fakeClientWithChunkCount(0);
  assertEquals(await documentHasChunks(supabase, BUSINESS_ID, 'doc-1'), false);
});

Deno.test('documentHasChunks returns false when count is null', async () => {
  const supabase = fakeClientWithChunkCount(null);
  assertEquals(await documentHasChunks(supabase, BUSINESS_ID, 'doc-1'), false);
});

Deno.test('documentHasChunks throws on query error', async () => {
  const supabase = fakeClientWithChunkCount(null, new Error('boom'));
  let threw = false;
  try {
    await documentHasChunks(supabase, BUSINESS_ID, 'doc-1');
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

// Regression coverage for the OpenRouter migration (qwen/qwen3-embedding-8b,
// MRL-truncated to 1024 dims, vs. the old 768-dim bge-base-en-v1.5 vectors):
// updateChunkEmbedding does no client-side length validation/truncation of
// its own, so a 1024-dim vector from /reindex must pass through to the
// update payload completely unchanged — dimension enforcement is entirely
// the knowledge_chunks.embedding column's job (vector(1024), see
// 20260827000000_resize_knowledge_chunks_embedding.sql).
Deno.test('updateChunkEmbedding passes a 1024-dim vector through unmodified', async () => {
  const newDimensionEmbedding = Array.from({ length: 1024 }, (_, i) => i / 1024);
  let capturedPatch: unknown;
  let capturedId: unknown;
  let capturedBusinessId: unknown;
  const supabase = {
    from: () => ({
      update: (patch: unknown) => ({
        eq: (_column: string, id: unknown) => {
          capturedPatch = patch;
          capturedId = id;
          return {
            eq: (_col2: string, businessId: unknown) => {
              capturedBusinessId = businessId;
              return Promise.resolve({ error: null });
            },
          };
        },
      }),
    }),
  } as unknown as SupabaseClient;

  await updateChunkEmbedding(supabase, BUSINESS_ID, 'chunk-1', newDimensionEmbedding);

  assertEquals(capturedId, 'chunk-1');
  assertEquals(capturedBusinessId, BUSINESS_ID);
  assertEquals((capturedPatch as { embedding: number[] }).embedding, newDimensionEmbedding);
  assertEquals((capturedPatch as { embedding: number[] }).embedding.length, 1024);
});
