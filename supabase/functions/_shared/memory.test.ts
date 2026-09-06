import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { appendMessage } from './memory.ts';

const BUSINESS_ID = 'business-1';

// Mocks the single chain appendMessage relies on:
// supabase.from('conversation_messages').insert({...}).select('id').single()
function fakeClientReturningId(id: string | null, error: Error | null = null) {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: id ? { id } : null, error }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

Deno.test('appendMessage returns the inserted row id', async () => {
  const supabase = fakeClientReturningId('message-1');
  const result = await appendMessage(supabase, BUSINESS_ID, 'customer-1', {
    role: 'user',
    message: 'hi',
  });
  assertEquals(result, { id: 'message-1' });
});

Deno.test('appendMessage includes business_id on the inserted row', async () => {
  let insertedRow: unknown;
  const supabase = {
    from: () => ({
      insert: (row: unknown) => {
        insertedRow = row;
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'message-1' }, error: null }),
          }),
        };
      },
    }),
  } as unknown as SupabaseClient;

  await appendMessage(supabase, BUSINESS_ID, 'customer-1', { role: 'user', message: 'hi' });
  assertEquals((insertedRow as { business_id: string }).business_id, BUSINESS_ID);
});

Deno.test('appendMessage throws on insert error', async () => {
  const supabase = fakeClientReturningId(null, new Error('boom'));
  let threw = false;
  try {
    await appendMessage(supabase, BUSINESS_ID, 'customer-1', { role: 'user', message: 'hi' });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
