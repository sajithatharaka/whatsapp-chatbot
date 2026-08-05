import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// server-only unconditionally throws outside Next's own build (it relies on
// Next's bundler to swap in a no-op for genuine Server Component files) —
// stub it so admin-api.ts can be imported under plain Vitest/Node.
vi.mock('server-only', () => ({}));

import {
  EdgeFunctionError,
  deleteKnowledgeDocument,
  getEscalation,
  getKnowledgeDocument,
  getWidgetConfig,
  ingestKnowledgeDocument,
  listEscalations,
  listKnowledgeDocuments,
  searchKnowledgeMatches,
  updateEscalation,
  updateWidgetConfig,
} from '../../../src/lib/supabase/admin-api';

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    NEXT_PUBLIC_SUPABASE_URL: 'https://project-ref.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    INGEST_ADMIN_SECRET: 'admin-secret',
  };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  vi.restoreAllMocks();
});

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('listKnowledgeDocuments', () => {
  it('calls GET /knowledge with admin/apikey headers and returns the documents array', async () => {
    const fetchMock = mockFetchOnce({ documents: [{ id: 'doc_1' }] });

    const documents = await listKnowledgeDocuments();

    expect(documents).toEqual([{ id: 'doc_1' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/functions/v1/knowledge',
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: 'anon-key',
          Authorization: 'Bearer anon-key',
          'x-admin-secret': 'admin-secret',
        }),
      })
    );
  });
});

describe('getKnowledgeDocument', () => {
  it('calls GET /knowledge/{id} and returns document + chunks', async () => {
    mockFetchOnce({ document: { id: 'doc_1' }, chunks: [] });

    const result = await getKnowledgeDocument('doc_1');

    expect(result).toEqual({ document: { id: 'doc_1' }, chunks: [] });
  });

  it('throws EdgeFunctionError with the response status on 404', async () => {
    mockFetchOnce({ error: 'No document with id doc_missing' }, false, 404);

    await expect(getKnowledgeDocument('doc_missing')).rejects.toMatchObject({
      status: 404,
      message: 'No document with id doc_missing',
    });
  });
});

describe('deleteKnowledgeDocument', () => {
  it('calls DELETE /knowledge/{id}', async () => {
    const fetchMock = mockFetchOnce({ status: 'deleted', documentId: 'doc_1' });

    const result = await deleteKnowledgeDocument('doc_1');

    expect(result).toEqual({ status: 'deleted', documentId: 'doc_1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/functions/v1/knowledge/doc_1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

describe('ingestKnowledgeDocument', () => {
  it('calls POST /ingest with the JSON body', async () => {
    const fetchMock = mockFetchOnce({
      documentId: 'doc_1',
      status: 'created',
      version: 1,
      chunksCreated: 3,
    });

    const payload = { sourceType: 'text' as const, content: 'hello' };
    const result = await ingestKnowledgeDocument(payload);

    expect(result.status).toBe('created');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/functions/v1/ingest',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) })
    );
  });

  it('propagates the error message from a non-2xx response', async () => {
    mockFetchOnce({ error: 'Unauthorized' }, false, 401);

    await expect(ingestKnowledgeDocument({ sourceType: 'text', content: 'x' })).rejects.toThrow(
      EdgeFunctionError
    );
  });
});

describe('searchKnowledgeMatches', () => {
  it('calls POST /search with the query and returns results', async () => {
    const fetchMock = mockFetchOnce({ results: [{ id: 'chunk_1', document_id: 'doc_1' }] });

    const results = await searchKnowledgeMatches('Where is my order?');

    expect(results).toEqual([{ id: 'chunk_1', document_id: 'doc_1' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/functions/v1/search',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'Where is my order?' }),
      })
    );
  });
});

describe('listEscalations', () => {
  it('builds the query string from statuses/from/to and returns escalations', async () => {
    const fetchMock = mockFetchOnce({ escalations: [{ id: 'escalation_1' }] });

    const escalations = await listEscalations({
      statuses: ['needs_attention', 'in_progress'],
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-05T23:59:59.999Z',
    });

    expect(escalations).toEqual([{ id: 'escalation_1' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/functions/v1/escalations?status=needs_attention%2Cin_progress&from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-05T23%3A59%3A59.999Z',
      expect.any(Object)
    );
  });

  it('omits the query string entirely when no params are given', async () => {
    const fetchMock = mockFetchOnce({ escalations: [] });

    await listEscalations();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/functions/v1/escalations',
      expect.any(Object)
    );
  });
});

describe('getEscalation', () => {
  it('calls GET /escalations/{id} and returns escalation + messages', async () => {
    mockFetchOnce({ escalation: { id: 'escalation_1' }, messages: [] });

    const result = await getEscalation('escalation_1');

    expect(result).toEqual({ escalation: { id: 'escalation_1' }, messages: [] });
  });
});

describe('updateEscalation', () => {
  it('calls PATCH /escalations/{id} with the payload', async () => {
    const fetchMock = mockFetchOnce({ escalation: { id: 'escalation_1', status: 'responded' } });

    const payload = { status: 'responded' as const, respondedBy: 'admin@example.com' };
    const result = await updateEscalation('escalation_1', payload);

    expect(result.escalation.status).toBe('responded');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/functions/v1/escalations/escalation_1',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify(payload) })
    );
  });
});

describe('getWidgetConfig', () => {
  it('calls GET /widget-config with admin/apikey headers and returns the config', async () => {
    const config = {
      id: 'config_1',
      enabled: false,
      title: 'Chat with us',
      welcome_message: 'Hi!',
      primary_color: '#111827',
      position: 'bottom-right',
      allowed_origins: [],
    };
    const fetchMock = mockFetchOnce({ config });

    const result = await getWidgetConfig();

    expect(result).toEqual(config);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/functions/v1/widget-config',
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: 'anon-key',
          Authorization: 'Bearer anon-key',
          'x-admin-secret': 'admin-secret',
        }),
      })
    );
  });
});

describe('updateWidgetConfig', () => {
  it('calls PATCH /widget-config with the payload and returns the updated config', async () => {
    const config = {
      id: 'config_1',
      enabled: true,
      title: 'Chat with us',
      welcome_message: 'Hi!',
      primary_color: '#111827',
      position: 'bottom-right',
      allowed_origins: ['https://example.com'],
    };
    const fetchMock = mockFetchOnce({ config });

    const payload = { enabled: true, allowedOrigins: ['https://example.com'] };
    const result = await updateWidgetConfig(payload);

    expect(result).toEqual(config);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/functions/v1/widget-config',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify(payload) })
    );
  });
});
