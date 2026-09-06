import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { loadActiveConfig, updateActiveConfig } from './config.ts';
import type { AiConfiguration } from './types.ts';

const BUSINESS_ID = 'business-1';

const BASE_CONFIG: AiConfiguration = {
  id: 'config-1',
  chat_model: 'google/gemini-2.5-flash',
  embedding_model: 'qwen/qwen3-embedding-8b',
  fallback_model: 'openai/gpt-4o-mini',
  similarity_threshold: 0.5,
  temperature: 0.3,
  max_tokens: 512,
  top_k: 5,
  system_prompt: 'You are helpful.',
  business_rules_prompt: 'Answer in the customer language.',
  fallback_message: 'I could not find that.',
  timezone: 'UTC',
};

Deno.test('loadActiveConfig returns the active row for the given business', async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: BASE_CONFIG, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  const config = await loadActiveConfig(supabase, BUSINESS_ID);
  assertEquals(config, BASE_CONFIG);
});

Deno.test('loadActiveConfig throws on a query error', async () => {
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: new Error('boom') }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  let threw = false;
  try {
    await loadActiveConfig(supabase, BUSINESS_ID);
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test('updateActiveConfig only patches the fields provided and stamps updated_at', async () => {
  let capturedPatch: Record<string, unknown> = {};
  const supabase = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        capturedPatch = patch;
        return {
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: () =>
                  Promise.resolve({ data: { ...BASE_CONFIG, temperature: 0.4 }, error: null }),
              }),
            }),
          }),
        };
      },
    }),
  } as unknown as SupabaseClient;

  const result = await updateActiveConfig(supabase, BUSINESS_ID, { temperature: 0.4 });

  assertEquals(result.temperature, 0.4);
  assertEquals(capturedPatch.temperature, 0.4);
  assertEquals(capturedPatch.chat_model, undefined);
  assertEquals(typeof capturedPatch.updated_at, 'string');
});

Deno.test(
  'updateActiveConfig maps camelCase input to snake_case columns, incl. nulls',
  async () => {
    let capturedPatch: Record<string, unknown> = {};
    const supabase = {
      from: () => ({
        update: (patch: Record<string, unknown>) => {
          capturedPatch = patch;
          return {
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: () => Promise.resolve({ data: BASE_CONFIG, error: null }),
                }),
              }),
            }),
          };
        },
      }),
    } as unknown as SupabaseClient;

    await updateActiveConfig(supabase, BUSINESS_ID, {
      chatModel: 'openai/gpt-4o',
      fallbackModel: null,
      businessRulesPrompt: null,
      similarityThreshold: 0.6,
      maxTokens: 800,
      topK: 8,
    });

    assertEquals(capturedPatch.chat_model, 'openai/gpt-4o');
    assertEquals(capturedPatch.fallback_model, null);
    assertEquals(capturedPatch.business_rules_prompt, null);
    assertEquals(capturedPatch.similarity_threshold, 0.6);
    assertEquals(capturedPatch.max_tokens, 800);
    assertEquals(capturedPatch.top_k, 8);
  }
);

Deno.test('updateActiveConfig throws on a query error', async () => {
  const supabase = {
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: null, error: new Error('boom') }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;

  let threw = false;
  try {
    await updateActiveConfig(supabase, BUSINESS_ID, { temperature: 0.4 });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
