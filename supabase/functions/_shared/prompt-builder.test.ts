import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildMessages } from './prompt-builder.ts';
import type { AiConfiguration, RetrievedChunk } from './types.ts';

function baseConfig(overrides: Partial<AiConfiguration> = {}): AiConfiguration {
  return {
    id: 'config-1',
    chat_model: 'model',
    embedding_model: 'embed-model',
    fallback_model: null,
    similarity_threshold: 0.75,
    temperature: 0.3,
    max_tokens: 512,
    top_k: 5,
    system_prompt: 'You are a helpful assistant.',
    business_rules_prompt: null,
    fallback_message: 'fallback',
    timezone: 'UTC',
    ...overrides,
  };
}

const chunks: RetrievedChunk[] = [
  {
    id: 'c1',
    document_id: 'd1',
    chunk_text: 'We are open 9am-5pm Monday to Friday.',
    similarity: 0.9,
  },
];

Deno.test(
  'buildMessages injects the current day, date, and time in the configured timezone',
  () => {
    const now = new Date('2026-08-05T10:30:00Z'); // a Wednesday
    const messages = buildMessages(baseConfig(), null, [], chunks, 'are you open today?', now);

    const systemMessage = messages[0].content;
    assertStringIncludes(systemMessage, 'Current date and time:');
    assertStringIncludes(systemMessage, 'Wednesday');
    assertStringIncludes(systemMessage, 'August 5, 2026');
    assertStringIncludes(systemMessage, '(UTC)');
  }
);

Deno.test('buildMessages formats the current time in the configured non-UTC timezone', () => {
  // 20:30 UTC on Wednesday Aug 5 is 02:00 on Thursday Aug 6 in Colombo (+05:30) —
  // asserts the day-of-week is computed in the business's timezone, not UTC.
  const now = new Date('2026-08-05T20:30:00Z');
  const config = baseConfig({ timezone: 'Asia/Colombo' });
  const messages = buildMessages(config, null, [], chunks, 'are you open today?', now);

  assertStringIncludes(messages[0].content, 'Thursday');
  assertStringIncludes(messages[0].content, '(Asia/Colombo)');
});

Deno.test(
  'buildMessages instructs the model to answer directly instead of narrating its date reasoning',
  () => {
    const now = new Date('2026-08-05T10:30:00Z');
    const messages = buildMessages(baseConfig(), null, [], chunks, 'are you open today?', now);

    assertStringIncludes(messages[0].content, 'do not narrate how you');
    assertStringIncludes(messages[0].content, 'Use this silently');
  }
);

Deno.test('buildMessages defaults to the real current time when none is supplied', () => {
  const messages = buildMessages(baseConfig(), null, [], chunks, 'hi');
  assertStringIncludes(messages[0].content, 'Current date and time:');
});

Deno.test(
  'buildMessages instructs the model to echo fallback_message verbatim when it cannot answer',
  () => {
    const config = baseConfig({ fallback_message: "Sorry, can't help with that — want a human?" });
    const messages = buildMessages(config, null, [], chunks, 'are you open today?');

    assertStringIncludes(messages[0].content, `"${config.fallback_message}"`);
    assertStringIncludes(messages[0].content, 'Reply with exactly the following text');
  }
);

Deno.test('buildMessages keeps the knowledge, summary, and conversation history sections', () => {
  const now = new Date('2026-08-05T10:30:00Z');
  const messages = buildMessages(
    baseConfig({ business_rules_prompt: 'Be nice.' }),
    'Customer asked about hours before.',
    [
      { role: 'user', message: 'hi' },
      { role: 'assistant', message: 'hello' },
    ],
    chunks,
    'are you open today?',
    now
  );

  const systemMessage = messages[0].content;
  assertStringIncludes(systemMessage, 'Business rules:\nBe nice.');
  assertStringIncludes(
    systemMessage,
    'Conversation summary so far:\nCustomer asked about hours before.'
  );
  assertStringIncludes(systemMessage, 'chunk_c1');
  assertEquals(messages[1], { role: 'user', content: 'hi' });
  assertEquals(messages[2], { role: 'assistant', content: 'hello' });
  assertEquals(messages[3], { role: 'user', content: 'are you open today?' });
});
