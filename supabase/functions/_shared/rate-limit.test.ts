import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { isRateLimited } from './rate-limit.ts';

function fakeCountClient(count: number | null, error: Error | null = null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => Promise.resolve({ count, error }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

Deno.test('isRateLimited returns false when under the cap', async () => {
  const supabase = fakeCountClient(5);
  const limited = await isRateLimited(supabase, 'customer-1', {
    maxMessages: 20,
    windowSeconds: 300,
  });
  assertEquals(limited, false);
});

Deno.test('isRateLimited returns true once the count reaches the cap', async () => {
  const supabase = fakeCountClient(20);
  const limited = await isRateLimited(supabase, 'customer-1', {
    maxMessages: 20,
    windowSeconds: 300,
  });
  assertEquals(limited, true);
});

Deno.test('isRateLimited treats a null count as zero messages', async () => {
  const supabase = fakeCountClient(null);
  const limited = await isRateLimited(supabase, 'customer-1', {
    maxMessages: 20,
    windowSeconds: 300,
  });
  assertEquals(limited, false);
});

Deno.test('isRateLimited throws on a query error', async () => {
  const supabase = fakeCountClient(null, new Error('boom'));
  let threw = false;
  try {
    await isRateLimited(supabase, 'customer-1', { maxMessages: 20, windowSeconds: 300 });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
