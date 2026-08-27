import type { PromptMessage } from './types.ts';

// The only file in this codebase that knows OpenRouter's (OpenAI-compatible)
// API shape. Swapping AI providers later means changing only this file.
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

function apiUrl(path: string): string {
  return `${OPENROUTER_BASE_URL}/${path}`;
}

// OpenRouter's optional attribution headers (surfaced on https://openrouter.ai/rankings
// for the app they identify) — static per-deployment values, not environment/request
// dependent, so they're hardcoded rather than sourced from env vars.
const OPENROUTER_HTTP_REFERER = 'https://github.com/sajithatharaka/whatsapp-chatbot-correct';
const OPENROUTER_X_TITLE = 'WhatsApp AI Assistant';

function authHeaders(): HeadersInit {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': OPENROUTER_HTTP_REFERER,
    'X-Title': OPENROUTER_X_TITLE,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// OpenRouter also returns 429 on rate limits — a couple of short retries
// clears a transient burst without surfacing "Internal error" to the
// WhatsApp user for what's usually a spike of concurrent messages.
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

// qwen/qwen3-embedding-8b is an asymmetric, instruction-aware embedding
// model: a short question and the passage that answers it aren't
// paraphrases of each other, so embedding both "as themselves" (no
// input_type) leaves query-vs-matching-chunk barely more similar than
// query-vs-unrelated-chunk — verified empirically while implementing this
// migration (~0.04 similarity margin between a true match and an unrelated
// chunk with no input_type, vs. ~0.14-0.25 with it set correctly below).
// Callers must say which side of a search they're embedding so OpenRouter
// applies the right instruction prefix.
export type EmbeddingInputType = 'search_query' | 'search_document';

export async function embed(
  text: string,
  model: string,
  inputType: EmbeddingInputType
): Promise<number[]> {
  const [vector] = await embedBatch([text], model, inputType);
  return vector;
}

// knowledge_chunks.embedding / match_knowledge_chunks.query_embedding are both
// vector(1024) (see 20260827000000_resize_knowledge_chunks_embedding.sql) —
// every embedding call is truncated to that size via OpenRouter's
// OpenAI-compatible `dimensions` request field (confirmed in OpenRouter's API
// reference: POST /embeddings accepts an optional integer `dimensions`), which
// qwen/qwen3-embedding-8b supports through Matryoshka (MRL) truncation.
// Changing this requires a new migration to resize the column + RPC and a
// full /reindex — see the comment on knowledge_chunks.embedding.
const EMBEDDING_DIMENSIONS = 1024;

// OpenRouter's OpenAI-compatible embeddings endpoint accepts a batch of
// inputs in one request — used by /ingest and /reindex to embed a whole
// document's chunks in a handful of network round trips instead of one per
// chunk.
export async function embedBatch(
  texts: string[],
  model: string,
  inputType: EmbeddingInputType
): Promise<number[][]> {
  const res = await fetchWithRetry(apiUrl('embeddings'), {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      model,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
      input_type: inputType,
    }),
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
