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
  'chatComplete posts to the Workers AI v1 chat/completions endpoint and parses OpenAI-shaped response',
  async () => {
    await withEnv({ CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1' }, async () => {
      let capturedUrl = '';
      let capturedBody: unknown;
      let capturedAuth = '';
      const restore = stubFetch(async (input, init) => {
        capturedUrl = String(input);
        capturedBody = JSON.parse(init?.body as string);
        capturedAuth = (init?.headers as Record<string, string>).Authorization;
        return new Response(JSON.stringify({ choices: [{ message: { content: 'hi there' } }] }), {
          status: 200,
        });
      });
      try {
        const reply = await chatComplete([{ role: 'user', content: 'hello' }], {
          model: 'openai/gpt-5-nano',
          temperature: 0.3,
          maxTokens: 512,
        });
        assertEquals(reply, 'hi there');
        assertEquals(
          capturedUrl,
          'https://api.cloudflare.com/client/v4/accounts/acct-1/ai/v1/chat/completions'
        );
        assertEquals(capturedAuth, 'Bearer token-1');
        assertEquals(capturedBody, {
          model: 'openai/gpt-5-nano',
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

Deno.test(
  'chatComplete throws when the response is missing choices[0].message.content',
  async () => {
    await withEnv({ CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1' }, async () => {
      const restore = stubFetch(
        async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })
      );
      try {
        await assertRejects(() =>
          chatComplete([{ role: 'user', content: 'hi' }], {
            model: 'openai/gpt-5-nano',
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
  await withEnv({ CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1' }, async () => {
    const restore = stubFetch(async () => new Response('server exploded', { status: 500 }));
    try {
      await assertRejects(
        () =>
          chatComplete([{ role: 'user', content: 'hi' }], {
            model: 'openai/gpt-5-nano',
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
  await withEnv({ CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1' }, async () => {
    let callCount = 0;
    const restore = stubFetch(async () => {
      callCount += 1;
      if (callCount === 1) {
        return new Response(JSON.stringify({ errors: [{ code: 971 }] }), { status: 429 });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok now' } }] }), {
        status: 200,
      });
    });
    try {
      const reply = await chatComplete([{ role: 'user', content: 'hi' }], {
        model: 'openai/gpt-5-nano',
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
  await withEnv({ CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1' }, async () => {
    let callCount = 0;
    const restore = stubFetch(async () => {
      callCount += 1;
      return new Response('throttled', { status: 429 });
    });
    try {
      await assertRejects(
        () =>
          chatComplete([{ role: 'user', content: 'hi' }], {
            model: 'openai/gpt-5-nano',
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
  await withEnv({ CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1' }, async () => {
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
        model: 'openai/gpt-5-nano',
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

Deno.test('chatComplete throws when CF_ACCOUNT_ID is not set', async () => {
  await withEnv({ CF_ACCOUNT_ID: '', CF_API_TOKEN: 'token-1' }, async () => {
    Deno.env.delete('CF_ACCOUNT_ID');
    await assertRejects(
      () =>
        chatComplete([{ role: 'user', content: 'hi' }], {
          model: 'openai/gpt-5-nano',
          temperature: 0,
          maxTokens: 10,
        }),
      Error,
      'CF_ACCOUNT_ID'
    );
  });
});

Deno.test('chatComplete throws when CF_API_TOKEN is not set', async () => {
  await withEnv({ CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: '' }, async () => {
    Deno.env.delete('CF_API_TOKEN');
    await assertRejects(
      () =>
        chatComplete([{ role: 'user', content: 'hi' }], {
          model: 'openai/gpt-5-nano',
          temperature: 0,
          maxTokens: 10,
        }),
      Error,
      'CF_API_TOKEN'
    );
  });
});

Deno.test(
  'chatComplete sends a cf-aig-gateway-id header when CF_AI_GATEWAY_ID is set',
  async () => {
    await withEnv(
      { CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1', CF_AI_GATEWAY_ID: 'gw-1' },
      async () => {
        let capturedHeaders: Record<string, string> = {};
        const restore = stubFetch(async (_input, init) => {
          capturedHeaders = init?.headers as Record<string, string>;
          return new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }), {
            status: 200,
          });
        });
        try {
          await chatComplete([{ role: 'user', content: 'hi' }], {
            model: 'openai/gpt-5-nano',
            temperature: 0,
            maxTokens: 10,
          });
          assertEquals(capturedHeaders['cf-aig-gateway-id'], 'gw-1');
        } finally {
          restore();
        }
      }
    );
  }
);

Deno.test(
  'chatComplete omits the cf-aig-gateway-id header when CF_AI_GATEWAY_ID is not set',
  async () => {
    await withEnv({ CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1' }, async () => {
      let capturedHeaders: Record<string, string> = {};
      const restore = stubFetch(async (_input, init) => {
        capturedHeaders = init?.headers as Record<string, string>;
        return new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }), {
          status: 200,
        });
      });
      try {
        await chatComplete([{ role: 'user', content: 'hi' }], {
          model: 'openai/gpt-5-nano',
          temperature: 0,
          maxTokens: 10,
        });
        assertEquals('cf-aig-gateway-id' in capturedHeaders, false);
      } finally {
        restore();
      }
    });
  }
);

Deno.test('embedBatch sends a cf-aig-gateway-id header when CF_AI_GATEWAY_ID is set', async () => {
  await withEnv(
    { CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1', CF_AI_GATEWAY_ID: 'gw-1' },
    async () => {
      let capturedHeaders: Record<string, string> = {};
      const restore = stubFetch(async (_input, init) => {
        capturedHeaders = init?.headers as Record<string, string>;
        return new Response(JSON.stringify({ data: [{ embedding: [1, 2] }] }), { status: 200 });
      });
      try {
        await embedBatch(['a'], '@cf/baai/bge-base-en-v1.5');
        assertEquals(capturedHeaders['cf-aig-gateway-id'], 'gw-1');
      } finally {
        restore();
      }
    }
  );
});

Deno.test(
  'embedBatch posts to the embeddings endpoint and returns each item embedding in order',
  async () => {
    await withEnv({ CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1' }, async () => {
      let capturedUrl = '';
      let capturedBody: unknown;
      const restore = stubFetch(async (input, init) => {
        capturedUrl = String(input);
        capturedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }],
          }),
          { status: 200 }
        );
      });
      try {
        const vectors = await embedBatch(['a', 'b'], '@cf/baai/bge-base-en-v1.5');
        assertEquals(vectors, [
          [0.1, 0.2],
          [0.3, 0.4],
        ]);
        assertEquals(
          capturedUrl,
          'https://api.cloudflare.com/client/v4/accounts/acct-1/ai/v1/embeddings'
        );
        assertEquals(capturedBody, { model: '@cf/baai/bge-base-en-v1.5', input: ['a', 'b'] });
      } finally {
        restore();
      }
    });
  }
);

Deno.test('embed returns the first (and only) vector from embedBatch', async () => {
  await withEnv({ CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1' }, async () => {
    const restore = stubFetch(
      async () =>
        new Response(JSON.stringify({ data: [{ embedding: [1, 2, 3] }] }), { status: 200 })
    );
    try {
      const vector = await embed('hello', '@cf/baai/bge-base-en-v1.5');
      assertEquals(vector, [1, 2, 3]);
    } finally {
      restore();
    }
  });
});

Deno.test('embedBatch throws when the response is missing data', async () => {
  await withEnv({ CF_ACCOUNT_ID: 'acct-1', CF_API_TOKEN: 'token-1' }, async () => {
    const restore = stubFetch(async () => new Response(JSON.stringify({}), { status: 200 }));
    try {
      await assertRejects(() => embedBatch(['a'], '@cf/baai/bge-base-en-v1.5'));
    } finally {
      restore();
    }
  });
});
