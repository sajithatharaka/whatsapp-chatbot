// Regression guard for the Phase 0 multi-tenancy cutover
// (docs/requirements/mixed-language-multi-tenant-architecture-plan.md): every shared query
// function must actually filter by the businessId argument it's given, not a value that happens
// to match a test fixture. Each case below calls the function twice with two different business
// ids and asserts the captured filter tracks the argument each time — a function that silently
// dropped its businessId parameter (e.g. after a refactor) would pass a single-business test but
// fail these two-business ones.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { findOrCreateCustomer } from './db.ts';
import { loadActiveConfig } from './config.ts';
import { findDocumentById } from './knowledge.ts';
import { createEscalationIfNeeded } from './escalations.ts';
import type { AiConfiguration } from './types.ts';

const OTHER_BUSINESS_ID = 'business-other';
const MK_AGENCY_BUSINESS_ID = 'business-mk-agency';

Deno.test('findOrCreateCustomer scopes its lookup by the given businessId', async () => {
  for (const businessId of [MK_AGENCY_BUSINESS_ID, OTHER_BUSINESS_ID]) {
    let capturedBusinessId: unknown;
    const supabase = {
      from: () => ({
        select: () => ({
          eq: (column: string, value: unknown) => {
            if (column === 'business_id') capturedBusinessId = value;
            return {
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            };
          },
        }),
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: { id: 'customer-1', phone: '+1', channel: 'whatsapp' },
                error: null,
              }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    await findOrCreateCustomer(supabase, businessId, '+15551234567');
    assertEquals(capturedBusinessId, businessId);
  }
});

Deno.test('findOrCreateCustomer stamps new rows with the given businessId', async () => {
  for (const businessId of [MK_AGENCY_BUSINESS_ID, OTHER_BUSINESS_ID]) {
    let insertedRow: unknown;
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
          }),
        }),
        insert: (row: unknown) => {
          insertedRow = row;
          return {
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: 'customer-1', phone: '+1', channel: 'whatsapp' },
                  error: null,
                }),
            }),
          };
        },
      }),
    } as unknown as SupabaseClient;

    await findOrCreateCustomer(supabase, businessId, '+15551234567');
    assertEquals((insertedRow as { business_id: string }).business_id, businessId);
  }
});

Deno.test('loadActiveConfig scopes its lookup by the given businessId', async () => {
  for (const businessId of [MK_AGENCY_BUSINESS_ID, OTHER_BUSINESS_ID]) {
    let capturedBusinessId: unknown;
    const supabase = {
      from: () => ({
        select: () => ({
          eq: (column: string, value: unknown) => {
            if (column === 'business_id') capturedBusinessId = value;
            return {
              eq: () => ({
                single: () => Promise.resolve({ data: {} as AiConfiguration, error: null }),
              }),
            };
          },
        }),
      }),
    } as unknown as SupabaseClient;

    await loadActiveConfig(supabase, businessId);
    assertEquals(capturedBusinessId, businessId);
  }
});

Deno.test('findDocumentById scopes its lookup by the given businessId', async () => {
  for (const businessId of [MK_AGENCY_BUSINESS_ID, OTHER_BUSINESS_ID]) {
    let capturedBusinessId: unknown;
    const supabase = {
      from: () => ({
        select: () => ({
          eq: (column: string, value: unknown) => {
            if (column === 'business_id') capturedBusinessId = value;
            return {
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            };
          },
        }),
      }),
    } as unknown as SupabaseClient;

    await findDocumentById(supabase, businessId, 'doc-1');
    assertEquals(capturedBusinessId, businessId);
  }
});

Deno.test('createEscalationIfNeeded stamps new rows with the given businessId', async () => {
  for (const businessId of [MK_AGENCY_BUSINESS_ID, OTHER_BUSINESS_ID]) {
    let insertedRow: unknown;
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              in: () => ({
                limit: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
              }),
            }),
          }),
        }),
        insert: (row: unknown) => {
          insertedRow = row;
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as SupabaseClient;

    await createEscalationIfNeeded(supabase, businessId, 'customer-1', 'message-1', 'question?');
    assertEquals((insertedRow as { business_id: string }).business_id, businessId);
  }
});
