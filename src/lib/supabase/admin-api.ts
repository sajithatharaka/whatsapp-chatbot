import 'server-only';

import type {
  ChatEscalationRecord,
  ConversationMessageRecord,
  EscalationListItem,
  KnowledgeSearchMatch,
  ListEscalationsParams,
  UpdateEscalationPayload,
} from '@/lib/escalations/types';
import type {
  IngestRequestBody,
  IngestResponse,
  KnowledgeDocumentRecord,
  ViewableChunk,
} from '@/lib/knowledge/types';
import type { UpdateWidgetConfigPayload, WidgetConfig } from '@/lib/widget/types';
import type { AiConfig, UpdateAiConfigPayload } from '@/lib/ai-config/types';

export class EdgeFunctionError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'EdgeFunctionError';
  }
}

/**
 * Cache tags for the read-only Edge Function calls below. The GET helpers use
 * `next: { revalidate, tags }` so repeat dashboard navigations are served from
 * Next's Data Cache instead of re-hitting a (possibly cold) Edge Function on
 * every render. The mutating route handlers call `revalidateTag(...)` with the
 * matching tag so edits are reflected immediately rather than after the TTL.
 */
export const CACHE_TAGS = {
  knowledge: 'knowledge',
  escalations: 'escalations',
  widgetConfig: 'widget-config',
  aiConfig: 'ai-config',
} as const;

// Short TTL: dashboard data changes rarely between navigations, but a stale
// window of seconds is acceptable and mutations invalidate explicitly anyway.
const READ_REVALIDATE_SECONDS = 15;

function functionsUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return `${base}/functions/v1${path}`;
}

function adminHeaders(): HeadersInit {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminSecret = process.env.INGEST_ADMIN_SECRET;
  if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
  if (!adminSecret) throw new Error('INGEST_ADMIN_SECRET is not set');

  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'x-admin-secret': adminSecret,
    'Content-Type': 'application/json',
  };
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Edge Function request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // response body wasn't JSON — keep the generic message
    }
    throw new EdgeFunctionError(message, response.status);
  }
  return (await response.json()) as T;
}

export async function listKnowledgeDocuments(): Promise<KnowledgeDocumentRecord[]> {
  const response = await fetch(functionsUrl('/knowledge'), {
    headers: adminHeaders(),
    next: { revalidate: READ_REVALIDATE_SECONDS, tags: [CACHE_TAGS.knowledge] },
  });
  const { documents } = await parseOrThrow<{ documents: KnowledgeDocumentRecord[] }>(response);
  return documents;
}

export async function getKnowledgeDocument(
  id: string
): Promise<{ document: KnowledgeDocumentRecord; chunks: ViewableChunk[] }> {
  const response = await fetch(functionsUrl(`/knowledge/${encodeURIComponent(id)}`), {
    headers: adminHeaders(),
    next: { revalidate: READ_REVALIDATE_SECONDS, tags: [CACHE_TAGS.knowledge] },
  });
  return parseOrThrow(response);
}

export async function deleteKnowledgeDocument(
  id: string
): Promise<{ status: 'deleted'; documentId: string }> {
  const response = await fetch(functionsUrl(`/knowledge/${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  return parseOrThrow(response);
}

export async function ingestKnowledgeDocument(payload: IngestRequestBody): Promise<IngestResponse> {
  const response = await fetch(functionsUrl('/ingest'), {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  return parseOrThrow(response);
}

export async function searchKnowledgeMatches(query: string): Promise<KnowledgeSearchMatch[]> {
  const response = await fetch(functionsUrl('/search'), {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ query }),
  });
  const { results } = await parseOrThrow<{ results: KnowledgeSearchMatch[] }>(response);
  return results;
}

export async function listEscalations(
  params: ListEscalationsParams = {},
  { fresh = false }: { fresh?: boolean } = {}
): Promise<EscalationListItem[]> {
  const query = new URLSearchParams();
  if (params.statuses && params.statuses.length > 0) {
    query.set('status', params.statuses.join(','));
  }
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);

  const queryString = query.toString();
  const response = await fetch(
    functionsUrl(`/escalations${queryString ? `?${queryString}` : ''}`),
    {
      headers: adminHeaders(),
      // `fresh` is used by the client-driven refresh path (the "Retry" button
      // and the post-response list bump) which must never see stale rows; the
      // server-rendered first paint uses the tagged Data Cache instead.
      ...(fresh
        ? { cache: 'no-store' as const }
        : { next: { revalidate: READ_REVALIDATE_SECONDS, tags: [CACHE_TAGS.escalations] } }),
    }
  );
  const { escalations } = await parseOrThrow<{ escalations: EscalationListItem[] }>(response);
  return escalations;
}

export async function getEscalation(
  id: string
): Promise<{ escalation: EscalationListItem; messages: ConversationMessageRecord[] }> {
  const response = await fetch(functionsUrl(`/escalations/${encodeURIComponent(id)}`), {
    headers: adminHeaders(),
    next: { revalidate: READ_REVALIDATE_SECONDS, tags: [CACHE_TAGS.escalations] },
  });
  return parseOrThrow(response);
}

export async function updateEscalation(
  id: string,
  payload: UpdateEscalationPayload
): Promise<{ escalation: ChatEscalationRecord }> {
  const response = await fetch(functionsUrl(`/escalations/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  return parseOrThrow(response);
}

export async function getWidgetConfig(): Promise<WidgetConfig> {
  const response = await fetch(functionsUrl('/widget-config'), {
    headers: adminHeaders(),
    next: { revalidate: READ_REVALIDATE_SECONDS, tags: [CACHE_TAGS.widgetConfig] },
  });
  const { config } = await parseOrThrow<{ config: WidgetConfig }>(response);
  return config;
}

export async function updateWidgetConfig(
  payload: UpdateWidgetConfigPayload
): Promise<WidgetConfig> {
  const response = await fetch(functionsUrl('/widget-config'), {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  const { config } = await parseOrThrow<{ config: WidgetConfig }>(response);
  return config;
}

export async function getAiConfig(): Promise<AiConfig> {
  const response = await fetch(functionsUrl('/ai-config'), {
    headers: adminHeaders(),
    next: { revalidate: READ_REVALIDATE_SECONDS, tags: [CACHE_TAGS.aiConfig] },
  });
  const { config } = await parseOrThrow<{ config: AiConfig }>(response);
  return config;
}

export async function updateAiConfig(payload: UpdateAiConfigPayload): Promise<AiConfig> {
  const response = await fetch(functionsUrl('/ai-config'), {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  const { config } = await parseOrThrow<{ config: AiConfig }>(response);
  return config;
}
