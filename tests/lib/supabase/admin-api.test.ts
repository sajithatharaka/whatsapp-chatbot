import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// server-only unconditionally throws outside Next's own build (it relies on
// Next's bundler to swap in a no-op for genuine Server Component files) —
// stub it so admin-api.ts can be imported under plain Vitest/Node.
vi.mock('server-only', () => ({}));

import {
  EdgeFunctionError,
  deleteKnowledgeDocument,
  getKnowledgeDocument,
  ingestKnowledgeDocument,
  listKnowledgeDocuments,
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
