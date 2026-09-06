import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { resolveDefaultBusinessId } from './business.ts';

Deno.test('resolveDefaultBusinessId looks up the business by the mk-agency slug', async () => {
  let capturedColumn: unknown;
  let capturedSlug: unknown;
  const supabase = {
    from: (table: string) => {
      assertEquals(table, 'businesses');
      return {
        select: () => ({
          eq: (column: string, value: string) => {
            capturedColumn = column;
            capturedSlug = value;
            return {
              single: () => Promise.resolve({ data: { id: 'business-1' }, error: null }),
            };
          },
        }),
      };
    },
  } as unknown as SupabaseClient;

  const businessId = await resolveDefaultBusinessId(supabase);

  assertEquals(businessId, 'business-1');
  assertEquals(capturedColumn, 'slug');
  assertEquals(capturedSlug, 'mk-agency');
});

Deno.test('resolveDefaultBusinessId throws when the seeded business is missing', async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: new Error('not found') }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  let threw = false;
  try {
    await resolveDefaultBusinessId(supabase);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
