import type { PromptMessage } from './types.ts';

// The only file in this codebase that knows Cloudflare's Workers AI v1
// (OpenAI-compatible) API shape. Swapping AI providers later means changing
// only this file. Calls api.cloudflare.com directly — not routed through AI
// Gateway, so there's no request logging/caching/rate-limiting from that
// layer here.
function apiUrl(path: string): string {
  const accountId = Deno.env.get('CF_ACCOUNT_ID');
  if (!accountId) {
    throw new Error('CF_ACCOUNT_ID is not set');
  }
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/${path}`;
}

// Setting CF_AI_GATEWAY_ID routes these same api.cloudflare.com/ai/v1/*
// requests through a Cloudflare AI Gateway via the cf-aig-gateway-id header
// (Cloudflare's REST-API-level Gateway integration) — no URL or request
// shape change, but the account's Workers AI rate limit (429, code 971) is
// then absorbed by the gateway's own caching/rate-limit queuing instead of
// hitting the account limit directly. Left unset, behavior is unchanged.
function authHeaders(): HeadersInit {
  const token = Deno.env.get('CF_API_TOKEN');
  if (!token) throw new Error('CF_API_TOKEN is not set');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const gatewayId = Deno.env.get('CF_AI_GATEWAY_ID');
  if (gatewayId) headers['cf-aig-gateway-id'] = gatewayId;
  return headers;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Cloudflare's account-level Workers AI rate limit (429, error code 971) is
// transient — a couple of short retries clears it without surfacing
// "Internal error" to the WhatsApp user for what's usually a burst of
// concurrent messages.
const RATE_LIMIT_RETRY_DELAYS_MS = [500, 1500];

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let res = await fetch(url, init);
  for (const fallbackDelayMs of RATE_LIMIT_RETRY_DELAYS_MS) {
    if (res.status !== 429) return res;
    const retryAfterHeader = res.headers.get('Retry-After');
    const retryAfterSeconds = retryAfterHeader === null ? NaN : Number(retryAfterHeader);
    const delayMs =
      Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
        ? retryAfterSeconds * 1000
        : fallbackDelayMs;
    await sleep(delayMs);
    res = await fetch(url, init);
  }
  return res;
}

export async function embed(text: string, model: string): Promise<number[]> {
  const [vector] = await embedBatch([text], model);
  return vector;
}

// Workers AI's OpenAI-compatible embeddings endpoint accepts a batch of
// inputs in one request — used by /ingest and /reindex to embed a whole
// document's chunks in a handful of network round trips instead of one per
// chunk.
export async function embedBatch(texts: string[], model: string): Promise<number[][]> {
  const res = await fetchWithRetry(apiUrl('embeddings'), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ model, input: texts }),
  });

  if (!res.ok) {
    throw new Error(`Embedding request failed (${res.status}): ${await res.text()}`);
  }

  const body = await res.json();
  const items = body?.data;
  if (!Array.isArray(items)) {
    throw new Error('Embedding response missing data');
  }
  return items.map((item) => item?.embedding) as number[][];
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
  const res = await fetchWithRetry(apiUrl('chat/completions'), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      model: opts.model,
      messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    }),
  });

  if (!res.ok) {
    throw new Error(`Chat completion request failed (${res.status}): ${await res.text()}`);
  }

  const body = await res.json();
  const reply = body?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string') {
    throw new Error('Chat completion response missing choices[0].message.content');
  }
  return reply;
}
