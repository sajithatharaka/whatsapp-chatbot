import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { findOrCreateWebCustomer } from './db.ts';

const BUSINESS_ID = 'business-1';

// Mocks the single chain findOrCreateWebCustomer relies on:
// supabase.from('customers').select(...).eq('business_id', ...).eq('channel', 'web').eq('session_id', ...).maybeSingle()
function fakeClient(existing: unknown, error: Error | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: existing, error }),
            }),
          }),
        }),
      }),
      insert: () => ({
        select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
      }),
    }),
  } as unknown as SupabaseClient;
}

Deno.test(
  'findOrCreateWebCustomer returns the existing customer for a known session id',
  async () => {
    const existing = {
      id: 'customer-1',
      phone: null,
      name: null,
      preferred_language: null,
      channel: 'web',
      session_id: 'session-1',
    };
    let insertCalled = false;
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: existing, error: null }),
              }),
            }),
          }),
        }),
        insert: () => {
          insertCalled = true;
          return { select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) };
        },
      }),
    } as unknown as SupabaseClient;

    const result = await findOrCreateWebCustomer(supabase, BUSINESS_ID, 'session-1');
    assertEquals(result, existing);
    assertEquals(insertCalled, false);
  }
);

Deno.test(
  'findOrCreateWebCustomer creates a web customer with no phone when none exists',
  async () => {
    const created = {
      id: 'customer-2',
      phone: null,
      name: null,
      preferred_language: null,
      channel: 'web',
      session_id: 'session-2',
    };
    let insertedRow: unknown;
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        }),
        insert: (row: unknown) => {
          insertedRow = row;
          return {
            select: () => ({ single: () => Promise.resolve({ data: created, error: null }) }),
          };
        },
      }),
    } as unknown as SupabaseClient;

    const result = await findOrCreateWebCustomer(supabase, BUSINESS_ID, 'session-2');
    assertEquals(result, created);
    assertEquals(insertedRow, {
      business_id: BUSINESS_ID,
      channel: 'web',
      session_id: 'session-2',
    });
  }
);

Deno.test('findOrCreateWebCustomer throws on a lookup error', async () => {
  const supabase = fakeClient(null, new Error('boom'));

  let threw = false;
  try {
    await findOrCreateWebCustomer(supabase, BUSINESS_ID, 'session-3');
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
