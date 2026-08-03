import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { documentHasChunks } from './knowledge.ts';

// Mocks the single chain ingest's checksum short-circuit relies on:
// supabase.from('knowledge_chunks').select('id', { count: 'exact', head: true }).eq(...)
function fakeClientWithChunkCount(count: number | null, error: Error | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ count, error }),
      }),
    }),
  } as unknown as SupabaseClient;
}

Deno.test('documentHasChunks returns true when chunks exist', async () => {
  const supabase = fakeClientWithChunkCount(3);
  assertEquals(await documentHasChunks(supabase, 'doc-1'), true);
});

Deno.test('documentHasChunks returns false when count is zero', async () => {
  const supabase = fakeClientWithChunkCount(0);
  assertEquals(await documentHasChunks(supabase, 'doc-1'), false);
});

Deno.test('documentHasChunks returns false when count is null', async () => {
  const supabase = fakeClientWithChunkCount(null);
  assertEquals(await documentHasChunks(supabase, 'doc-1'), false);
});

Deno.test('documentHasChunks throws on query error', async () => {
  const supabase = fakeClientWithChunkCount(null, new Error('boom'));
  let threw = false;
  try {
    await documentHasChunks(supabase, 'doc-1');
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
