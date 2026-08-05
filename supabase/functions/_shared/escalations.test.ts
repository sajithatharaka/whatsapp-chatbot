import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  type ChatEscalationRecord,
  createEscalationIfNeeded,
  findEscalationById,
  generateSummary,
  listEscalations,
  updateEscalation,
} from './escalations.ts';
import type { AiConfiguration } from './types.ts';

interface FakeQueryResult {
  data: unknown;
  error: Error | null;
}

interface FakeQueryBuilder {
  select: () => FakeQueryBuilder;
  order: () => FakeQueryBuilder;
  eq: () => FakeQueryBuilder;
  in: () => FakeQueryBuilder;
  gte: () => FakeQueryBuilder;
  lte: () => FakeQueryBuilder;
  limit: () => FakeQueryBuilder;
  update: () => FakeQueryBuilder;
  insert: () => Promise<FakeQueryResult>;
  maybeSingle: () => Promise<FakeQueryResult>;
  single: () => Promise<FakeQueryResult>;
  then: (resolve: (value: FakeQueryResult) => void) => void;
}

// A minimal chainable stand-in for Supabase's PostgrestFilterBuilder: every
// filter method returns itself, and it resolves like a Promise when awaited
// (mirrors the .select().eq().in()... chains this module builds).
function queryBuilder(result: FakeQueryResult): FakeQueryBuilder {
  const builder: FakeQueryBuilder = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    in: () => builder,
    gte: () => builder,
    lte: () => builder,
    limit: () => builder,
    update: () => builder,
    insert: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (resolve) => resolve(result),
  };
  return builder;
}

function stubFetch(handler: () => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function withEnv(vars: Record<string, string>, fn: () => Promise<void>) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) previous[key] = Deno.env.get(key);
  for (const [key, value] of Object.entries(vars)) Deno.env.set(key, value);
  return fn().finally(() => {
    for (const key of Object.keys(vars)) {
      if (previous[key] === undefined) Deno.env.delete(key);
      else Deno.env.set(key, previous[key] as string);
    }
  });
}

Deno.test(
  'createEscalationIfNeeded skips insert when an open escalation already exists',
  async () => {
    let insertCalled = false;
    const supabase = {
      from: () => ({
        ...queryBuilder({ data: { id: 'escalation-1' }, error: null }),
        insert: () => {
          insertCalled = true;
          return Promise.resolve({ error: null });
        },
      }),
    } as unknown as SupabaseClient;

    await createEscalationIfNeeded(supabase, 'customer-1', 'message-1', 'Where is my order?');
    assertEquals(insertCalled, false);
  }
);

Deno.test('createEscalationIfNeeded inserts a new row when no open escalation exists', async () => {
  let insertedRow: unknown;
  const supabase = {
    from: () => ({
      ...queryBuilder({ data: null, error: null }),
      insert: (row: unknown) => {
        insertedRow = row;
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as SupabaseClient;

  await createEscalationIfNeeded(supabase, 'customer-1', 'message-1', 'Where is my order?');
  assertEquals(insertedRow, {
    customer_id: 'customer-1',
    trigger_message_id: 'message-1',
    question: 'Where is my order?',
  });
});

Deno.test('listEscalations merges the matching customer onto each row', async () => {
  const supabase = {
    from: (table: string) => {
      if (table === 'chat_escalations') {
        return queryBuilder({
          data: [
            {
              id: 'escalation-1',
              customer_id: 'customer-1',
              trigger_message_id: 'message-1',
              question: 'Where is my order?',
              status: 'needs_attention',
              ai_summary: null,
              admin_answer: null,
              knowledge_document_id: null,
              responded_at: null,
              responded_by: null,
              created_at: '2026-08-05T00:00:00Z',
              updated_at: '2026-08-05T00:00:00Z',
            },
          ],
          error: null,
        });
      }
      if (table === 'customers') {
        return queryBuilder({
          data: [{ id: 'customer-1', phone: '+15551234567', name: 'Alex', channel: 'whatsapp' }],
          error: null,
        });
      }
      throw new Error(`Unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;

  const result = await listEscalations(supabase, { statuses: ['needs_attention'] });
  assertEquals(result.length, 1);
  assertEquals(result[0].customer, {
    id: 'customer-1',
    phone: '+15551234567',
    name: 'Alex',
    channel: 'whatsapp',
  });
});

Deno.test('findEscalationById returns null when no row matches', async () => {
  const supabase = {
    from: () => queryBuilder({ data: null, error: null }),
  } as unknown as SupabaseClient;

  assertEquals(await findEscalationById(supabase, 'missing'), null);
});

Deno.test(
  'updateEscalation sets responded_at/responded_by when status becomes responded',
  async () => {
    let capturedPatch: Record<string, unknown> = {};
    const supabase = {
      from: () => ({
        ...queryBuilder({ data: { id: 'escalation-1', status: 'responded' }, error: null }),
        update: (patch: Record<string, unknown>) => {
          capturedPatch = patch;
          return queryBuilder({ data: { id: 'escalation-1', status: 'responded' }, error: null });
        },
      }),
    } as unknown as SupabaseClient;

    await updateEscalation(supabase, 'escalation-1', {
      status: 'responded',
      respondedBy: 'admin@example.com',
    });

    assertEquals(capturedPatch.status, 'responded');
    assertEquals(capturedPatch.responded_by, 'admin@example.com');
    assertEquals(typeof capturedPatch.responded_at, 'string');
  }
);

Deno.test('generateSummary returns the cached ai_summary without calling the LLM', async () => {
  let fetchCalled = false;
  const restore = stubFetch(async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'unused' } }] }));
  });

  const supabase = {
    from: () => queryBuilder({ data: null, error: null }),
  } as unknown as SupabaseClient;
  const escalation = {
    id: 'escalation-1',
    ai_summary: 'Already summarized.',
  } as ChatEscalationRecord;

  try {
    const summary = await generateSummary(supabase, {} as AiConfiguration, escalation, []);
    assertEquals(summary, 'Already summarized.');
    assertEquals(fetchCalled, false);
  } finally {
    restore();
  }
});

Deno.test(
  'generateSummary calls the LLM and persists the result when ai_summary is missing',
  async () => {
    await withEnv({ CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1' }, async () => {
      const restore = stubFetch(
        async () =>
          new Response(
            JSON.stringify({ choices: [{ message: { content: 'Customer needs help.' } }] })
          )
      );

      let updatedWith: unknown;
      const supabase = {
        from: () => ({
          ...queryBuilder({ data: null, error: null }),
          update: (patch: unknown) => {
            updatedWith = patch;
            return queryBuilder({ data: null, error: null });
          },
        }),
      } as unknown as SupabaseClient;

      const escalation = {
        id: 'escalation-1',
        ai_summary: null,
        question: 'Where is my order?',
      } as ChatEscalationRecord;

      try {
        const summary = await generateSummary(
          supabase,
          { chat_model: 'openai/gpt-5-nano' } as AiConfiguration,
          escalation,
          [
            {
              id: 'm1',
              role: 'user',
              message: 'Where is my order?',
              confidence: null,
              created_at: '2026-08-05T00:00:00Z',
            },
          ]
        );
        assertEquals(summary, 'Customer needs help.');
        assertEquals(updatedWith, { ai_summary: 'Customer needs help.' });
      } finally {
        restore();
      }
    });
  }
);
