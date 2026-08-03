import { afterEach, describe, expect, it, vi } from 'vitest';

// server-only unconditionally throws outside Next's own build — stub it so
// the route module (which transitively imports admin-api.ts) can load here.
vi.mock('server-only', () => ({}));

const { ingestKnowledgeDocumentMock, requireAuthenticatedUserMock } = vi.hoisted(() => ({
  ingestKnowledgeDocumentMock: vi.fn(),
  requireAuthenticatedUserMock: vi.fn(),
}));

vi.mock('@/lib/supabase/admin-api', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/lib/supabase/admin-api')>(
    '../../../../src/lib/supabase/admin-api'
  );
  return {
    ...actual,
    ingestKnowledgeDocument: ingestKnowledgeDocumentMock,
  };
});

vi.mock('@/lib/supabase/requireUser', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/lib/supabase/requireUser')>(
    '../../../../src/lib/supabase/requireUser'
  );
  return {
    ...actual,
    requireAuthenticatedUser: requireAuthenticatedUserMock,
  };
});

import { POST } from '../../../../src/app/api/knowledge/route';
import { UnauthenticatedError } from '../../../../src/lib/supabase/requireUser';
import { EdgeFunctionError } from '../../../../src/lib/supabase/admin-api';

afterEach(() => {
  vi.clearAllMocks();
});

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/knowledge', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/knowledge', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new UnauthenticatedError());

    const response = await POST(jsonRequest({ sourceType: 'text', content: 'hi' }));

    expect(response.status).toBe(401);
    expect(ingestKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it('ingests and returns the result on success', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });
    ingestKnowledgeDocumentMock.mockResolvedValue({
      documentId: 'doc_1',
      status: 'created',
      version: 1,
      chunksCreated: 2,
    });

    const response = await POST(jsonRequest({ sourceType: 'text', content: 'hi' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('created');
  });

  it('passes through the Edge Function error status', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });
    ingestKnowledgeDocumentMock.mockRejectedValue(new EdgeFunctionError('Unauthorized', 401));

    const response = await POST(jsonRequest({ sourceType: 'text', content: 'hi' }));

    expect(response.status).toBe(401);
  });
});
