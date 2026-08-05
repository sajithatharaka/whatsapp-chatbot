import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { runRagPipeline } from './rag-pipeline.ts';
import type { AiConfiguration, Customer, RetrievedChunk } from './types.ts';

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

function stubFetch(handler: (input: string, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function embeddingResponse(): Response {
  return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 });
}

function fakeSupabase(options: {
  chunks: RetrievedChunk[];
  recentTurns?: unknown[];
  summary?: string | null;
  existingEscalation?: { id: string } | null;
  onEscalationInsert?: (row: unknown) => void;
}): SupabaseClient {
  const recentTurns = options.recentTurns ?? [];

  return {
    rpc: () => Promise.resolve({ data: options.chunks, error: null }),
    from: (table: string) => {
      if (table === 'conversation_messages') {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'message-1' }, error: null }),
            }),
          }),
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: recentTurns, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'conversation_summary') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: options.summary ? { summary: options.summary } : null,
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'chat_escalations') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                limit: () => ({
                  maybeSingle: () =>
                    Promise.resolve({ data: options.existingEscalation ?? null, error: null }),
                }),
              }),
            }),
          }),
          insert: (row: unknown) => {
            options.onEscalationInsert?.(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

const BASE_CONFIG: AiConfiguration = {
  id: 'config-1',
  chat_model: 'openai/gpt-5-nano',
  embedding_model: '@cf/baai/bge-base-en-v1.5',
  fallback_model: null,
  similarity_threshold: 0.75,
  temperature: 0.3,
  max_tokens: 512,
  top_k: 5,
  system_prompt: 'You are a helpful assistant.',
  business_rules_prompt: null,
  fallback_message: "I couldn't find that. Want me to connect you with a team member?",
  timezone: 'UTC',
};

const CUSTOMER: Customer = {
  id: 'customer-1',
  phone: null,
  name: null,
  preferred_language: null,
  channel: 'web',
  session_id: 'session-1',
};

Deno.test(
  'runRagPipeline returns the fallback message and escalates when no chunks are retrieved',
  async () => {
    await withEnv({ CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1' }, async () => {
      let chatCompleteCalled = false;
      const restore = stubFetch(async (input) => {
        if (String(input).includes('embeddings')) return embeddingResponse();
        chatCompleteCalled = true;
        throw new Error('chat/completions should not be called when there are no chunks');
      });

      let insertedEscalation: unknown;
      const supabase = fakeSupabase({
        chunks: [],
        onEscalationInsert: (row) => {
          insertedEscalation = row;
        },
      });

      try {
        const result = await runRagPipeline(supabase, BASE_CONFIG, CUSTOMER, 'Are you open today?');
        assertEquals(result.intent, 'fallback');
        assertEquals(result.confidence, 0);
        assertEquals(result.reply, BASE_CONFIG.fallback_message);
        assertEquals(result.sources, []);
        assertEquals(chatCompleteCalled, false);
        assertEquals((insertedEscalation as { question: string }).question, 'Are you open today?');
      } finally {
        restore();
      }
    });
  }
);

Deno.test('runRagPipeline returns a grounded reply when chunks are retrieved', async () => {
  await withEnv({ CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1' }, async () => {
    const restore = stubFetch(async (input) => {
      if (String(input).includes('embeddings')) return embeddingResponse();
      return new Response(JSON.stringify({ choices: [{ message: { content: 'We are open!' } }] }), {
        status: 200,
      });
    });

    const chunks: RetrievedChunk[] = [
      { id: 'c1', document_id: 'd1', chunk_text: 'Open 9-5 daily.', similarity: 0.91 },
    ];
    const supabase = fakeSupabase({ chunks });

    try {
      const result = await runRagPipeline(supabase, BASE_CONFIG, CUSTOMER, 'Are you open today?');
      assertEquals(result.intent, 'knowledge');
      assertEquals(result.reply, 'We are open!');
      assertEquals(result.confidence, 0.91);
      assertEquals(result.sources, ['chunk_c1']);
    } finally {
      restore();
    }
  });
});

Deno.test(
  'runRagPipeline falls back to fallback_model when the primary model call fails',
  async () => {
    await withEnv({ CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1' }, async () => {
      const capturedModels: string[] = [];
      const restore = stubFetch(async (input, init) => {
        if (String(input).includes('embeddings')) return embeddingResponse();
        const body = JSON.parse(init?.body as string);
        capturedModels.push(body.model);
        if (body.model === 'primary-model') {
          return new Response('server error', { status: 500 });
        }
        return new Response(
          JSON.stringify({ choices: [{ message: { content: 'Fallback reply' } }] }),
          {
            status: 200,
          }
        );
      });

      const chunks: RetrievedChunk[] = [
        { id: 'c1', document_id: 'd1', chunk_text: 'Open 9-5 daily.', similarity: 0.91 },
      ];
      const supabase = fakeSupabase({ chunks });
      const config: AiConfiguration = {
        ...BASE_CONFIG,
        chat_model: 'primary-model',
        fallback_model: 'fallback-model',
      };

      try {
        const result = await runRagPipeline(supabase, config, CUSTOMER, 'Are you open today?');
        assertEquals(result.reply, 'Fallback reply');
        assertEquals(capturedModels, ['primary-model', 'fallback-model']);
      } finally {
        restore();
      }
    });
  }
);
