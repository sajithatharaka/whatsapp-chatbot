import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { searchKnowledgeMatchesMock, requireAuthenticatedUserMock } = vi.hoisted(() => ({
  searchKnowledgeMatchesMock: vi.fn(),
  requireAuthenticatedUserMock: vi.fn(),
}));

vi.mock('@/lib/supabase/admin-api', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/lib/supabase/admin-api')>(
    '../../../../src/lib/supabase/admin-api'
  );
  return {
    ...actual,
    searchKnowledgeMatches: searchKnowledgeMatchesMock,
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

import { POST } from '../../../../src/app/api/knowledge/search/route';
import { UnauthenticatedError } from '../../../../src/lib/supabase/requireUser';

afterEach(() => {
  vi.clearAllMocks();
});

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/knowledge/search', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/knowledge/search', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new UnauthenticatedError());

    const response = await POST(jsonRequest({ query: 'Where is my order?' }));

    expect(response.status).toBe(401);
    expect(searchKnowledgeMatchesMock).not.toHaveBeenCalled();
  });

  it('returns 400 when query is missing or blank', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });

    const response = await POST(jsonRequest({ query: '  ' }));

    expect(response.status).toBe(400);
    expect(searchKnowledgeMatchesMock).not.toHaveBeenCalled();
  });

  it('returns the search results on success', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });
    searchKnowledgeMatchesMock.mockResolvedValue([{ id: 'chunk_1', document_id: 'doc_1' }]);

    const response = await POST(jsonRequest({ query: 'Where is my order?' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ results: [{ id: 'chunk_1', document_id: 'doc_1' }] });
    expect(searchKnowledgeMatchesMock).toHaveBeenCalledWith('Where is my order?');
  });
});
