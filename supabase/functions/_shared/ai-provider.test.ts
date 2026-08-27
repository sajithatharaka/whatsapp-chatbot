import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { chatComplete, embed, embedBatch } from './ai-provider.ts';

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

Deno.test(
  'chatComplete posts to OpenRouter chat/completions with auth + attribution headers and parses the OpenAI-shaped response',
  async () => {
    await withEnv({ OPENROUTER_API_KEY: 'key-1' }, async () => {
      let capturedUrl = '';
      let capturedBody: unknown;
      let capturedHeaders: Record<string, string> = {};
      const restore = stubFetch(async (input, init) => {
        capturedUrl = String(input);
        capturedBody = JSON.parse(init?.body as string);
        capturedHeaders = init?.headers as Record<string, string>;
        return new Response(JSON.stringify({ choices: [{ message: { content: 'hi there' } }] }), {
          status: 200,
        });
      });
      try {
        const reply = await chatComplete([{ role: 'user', content: 'hello' }], {
          model: 'google/gemini-2.5-flash',
          temperature: 0.3,
          maxTokens: 512,
        });
        assertEquals(reply, 'hi there');
        assertEquals(capturedUrl, 'https://openrouter.ai/api/v1/chat/completions');
        assertEquals(capturedHeaders.Authorization, 'Bearer key-1');
        assertEquals(typeof capturedHeaders['HTTP-Referer'], 'string');
        assertEquals(typeof capturedHeaders['X-Title'], 'string');
        assertEquals(capturedBody, {
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: 'hello' }],
          temperature: 0.3,
          max_tokens: 512,
        });
      } finally {
        restore();
      }
    });
  }
);

Deno.test('chatComplete throws when OPENROUTER_API_KEY is not set', async () => {
  await withEnv({ OPENROUTER_API_KEY: '' }, async () => {
    Deno.env.delete('OPENROUTER_API_KEY');
    await assertRejects(
      () =>
        chatComplete([{ role: 'user', content: 'hi' }], {
          model: 'google/gemini-2.5-flash',
          temperature: 0,
          maxTokens: 10,
        }),
      Error,
      'OPENROUTER_API_KEY'
    );
  });
});

Deno.test(
  'chatComplete throws when the response is missing choices[0].message.content',
  async () => {
    await withEnv({ OPENROUTER_API_KEY: 'key-1' }, async () => {
      const restore = stubFetch(
        async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })
      );
      try {
        await assertRejects(() =>
          chatComplete([{ role: 'user', content: 'hi' }], {
            model: 'google/gemini-2.5-flash',
            temperature: 0,
            maxTokens: 10,
          })
        );
      } finally {
        restore();
      }
    });
  }
);

Deno.test('chatComplete throws with response body text on a non-ok response', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'key-1' }, async () => {
    const restore = stubFetch(async () => new Response('server exploded', { status: 500 }));
    try {
      await assertRejects(
        () =>
          chatComplete([{ role: 'user', content: 'hi' }], {
            model: 'google/gemini-2.5-flash',
            temperature: 0,
            maxTokens: 10,
          }),
        Error,
        '500'
      );
    } finally {
      restore();
    }
  });
});

Deno.test('chatComplete retries on 429 and returns the reply once the retry succeeds', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'key-1' }, async () => {
    let callCount = 0;
    const restore = stubFetch(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
          status: 429,
        });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok now' } }] }), {
        status: 200,
      });
    });
    try {
      const reply = await chatComplete([{ role: 'user', content: 'hi' }], {
        model: 'google/gemini-2.5-flash',
        temperature: 0,
        maxTokens: 10,
      });
      assertEquals(reply, 'ok now');
      assertEquals(callCount, 2);
    } finally {
      restore();
    }
  });
});

Deno.test('chatComplete throws after exhausting retries on repeated 429s', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'key-1' }, async () => {
    let callCount = 0;
    const restore = stubFetch(async () => {
      callCount += 1;
      return new Response('throttled', { status: 429 });
    });
    try {
      await assertRejects(
        () =>
          chatComplete([{ role: 'user', content: 'hi' }], {
            model: 'google/gemini-2.5-flash',
            temperature: 0,
            maxTokens: 10,
          }),
        Error,
        '429'
      );
      assertEquals(callCount, 3);
    } finally {
      restore();
    }
  });
});

Deno.test('chatComplete honors a Retry-After header instead of the default backoff', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'key-1' }, async () => {
    let callCount = 0;
    const start = performance.now();
    const restore = stubFetch(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response('throttled', { status: 429, headers: { 'Retry-After': '0' } });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'fast retry' } }] }), {
        status: 200,
      });
    });
    try {
      const reply = await chatComplete([{ role: 'user', content: 'hi' }], {
        model: 'google/gemini-2.5-flash',
        temperature: 0,
        maxTokens: 10,
      });
      assertEquals(reply, 'fast retry');
      assertEquals(callCount, 2);
      // A Retry-After: 0 header should skip the 500ms default backoff entirely.
      assertEquals(performance.now() - start < 400, true);
    } finally {
      restore();
    }
  });
});

Deno.test(
  'embedBatch posts to OpenRouter embeddings with the dimensions + input_type fields and returns each item embedding in order',
  async () => {
    await withEnv({ OPENROUTER_API_KEY: 'key-1' }, async () => {
      let capturedUrl = '';
      let capturedBody: unknown;
      let capturedHeaders: Record<string, string> = {};
      const restore = stubFetch(async (input, init) => {
        capturedUrl = String(input);
        capturedBody = JSON.parse(init?.body as string);
        capturedHeaders = init?.headers as Record<string, string>;
        return new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
          }),
          { status: 200 }
        );
      });
      try {
        const vectors = await embedBatch(['a', 'b'], 'qwen/qwen3-embedding-8b', 'search_document');
        assertEquals(vectors, [
          [0.1, 0.2],
          [0.3, 0.4],
        ]);
        assertEquals(capturedUrl, 'https://openrouter.ai/api/v1/embeddings');
        assertEquals(capturedHeaders.Authorization, 'Bearer key-1');
        assertEquals(capturedBody, {
          model: 'qwen/qwen3-embedding-8b',
          input: ['a', 'b'],
          dimensions: 1024,
          input_type: 'search_document',
        });
      } finally {
        restore();
      }
    });
  }
);

Deno.test('embedBatch sends input_type: search_query for query embeddings', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'key-1' }, async () => {
    let capturedBody: unknown;
    const restore = stubFetch(async (_input, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({ data: [{ embedding: [0.1] }] }), { status: 200 });
    });
    try {
      await embedBatch(['a query'], 'qwen/qwen3-embedding-8b', 'search_query');
      assertEquals((capturedBody as { input_type: string }).input_type, 'search_query');
    } finally {
      restore();
    }
  });
});

Deno.test('embed returns the first (and only) vector from embedBatch', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'key-1' }, async () => {
    const restore = stubFetch(
      async () =>
        new Response(JSON.stringify({ data: [{ embedding: [1, 2, 3] }] }), { status: 200 })
    );
    try {
      const vector = await embed('hello', 'qwen/qwen3-embedding-8b', 'search_query');
      assertEquals(vector, [1, 2, 3]);
    } finally {
      restore();
    }
  });
});

Deno.test('embedBatch throws when the response is missing data', async () => {
  await withEnv({ OPENROUTER_API_KEY: 'key-1' }, async () => {
    const restore = stubFetch(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      await assertRejects(() => embedBatch(['a'], 'qwen/qwen3-embedding-8b', 'search_document'));
    } finally {
      restore();
    }
  });
});

Deno.test('embedBatch throws when OPENROUTER_API_KEY is not set', async () => {
  await withEnv({ OPENROUTER_API_KEY: '' }, async () => {
    Deno.env.delete('OPENROUTER_API_KEY');
    await assertRejects(
      () => embedBatch(['a'], 'qwen/qwen3-embedding-8b', 'search_document'),
      Error,
      'OPENROUTER_API_KEY'
    );
  });
});
