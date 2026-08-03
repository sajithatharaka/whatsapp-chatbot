import type { PromptMessage } from './types.ts';

// The only file in this codebase that knows Cloudflare AI Gateway's URL
// shape. Swapping AI providers later means changing only this file.
function gatewayUrl(model: string): string {
  const accountId = Deno.env.get('CF_ACCOUNT_ID');
  const gatewayId = Deno.env.get('CF_AI_GATEWAY_ID');
  if (!accountId || !gatewayId) {
    throw new Error('CF_ACCOUNT_ID / CF_AI_GATEWAY_ID are not set');
  }
  return `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/workers-ai/${model}`;
}

function authHeaders(): HeadersInit {
  const token = Deno.env.get('CF_AI_GATEWAY_TOKEN');
  if (!token) throw new Error('CF_AI_GATEWAY_TOKEN is not set');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function embed(text: string, model: string): Promise<number[]> {
  const [vector] = await embedBatch([text], model);
  return vector;
}

// Workers AI embedding models accept multiple texts in one request — used by
// /ingest and /reindex to embed a whole document's chunks in a handful of
// network round trips instead of one per chunk.
export async function embedBatch(texts: string[], model: string): Promise<number[][]> {
  const res = await fetch(gatewayUrl(model), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ text: texts }),
  });

  if (!res.ok) {
    throw new Error(`Embedding request failed (${res.status}): ${await res.text()}`);
  }

  const body = await res.json();
  const vectors = body?.result?.data;
  if (!Array.isArray(vectors)) {
    throw new Error('Embedding response missing result.data');
  }
  return vectors as number[][];
}

export interface ChatCompleteOptions {
  model: string;
  temperature: number;
  maxTokens: number;
}

export async function chatComplete(
  messages: PromptMessage[],
  opts: ChatCompleteOptions
): Promise<string> {
  const res = await fetch(gatewayUrl(opts.model), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    }),
  });

  if (!res.ok) {
    throw new Error(`Chat completion request failed (${res.status}): ${await res.text()}`);
  }

  const body = await res.json();
  const reply = body?.result?.response;
  if (typeof reply !== 'string') {
    throw new Error('Chat completion response missing result.response');
  }
  return reply;
}
