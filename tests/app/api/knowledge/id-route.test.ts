import { afterEach, describe, expect, it, vi } from 'vitest';

// Note: this tests src/app/api/knowledge/[id]/route.ts — the file lives
// under tests/.../knowledge/ (not a mirrored `[id]` directory) because glob
// test discovery treats `[id]` as a character class, not a literal path.

// server-only unconditionally throws outside Next's own build — stub it so
// the route module (which transitively imports admin-api.ts) can load here.
vi.mock('server-only', () => ({}));

const { deleteKnowledgeDocumentMock, requireAuthenticatedUserMock } = vi.hoisted(() => ({
  deleteKnowledgeDocumentMock: vi.fn(),
  requireAuthenticatedUserMock: vi.fn(),
}));

vi.mock('@/lib/supabase/admin-api', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/lib/supabase/admin-api')>(
    '../../../../src/lib/supabase/admin-api'
  );
  return {
    ...actual,
    deleteKnowledgeDocument: deleteKnowledgeDocumentMock,
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

import { DELETE } from '../../../../src/app/api/knowledge/[id]/route';
import { UnauthenticatedError } from '../../../../src/lib/supabase/requireUser';
import { EdgeFunctionError } from '../../../../src/lib/supabase/admin-api';

afterEach(() => {
  vi.clearAllMocks();
});

function deleteRequest() {
  return new Request('http://localhost/api/knowledge/doc_1', { method: 'DELETE' });
}

describe('DELETE /api/knowledge/[id]', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new UnauthenticatedError());

    const response = await DELETE(deleteRequest(), { params: Promise.resolve({ id: 'doc_1' }) });

    expect(response.status).toBe(401);
    expect(deleteKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it('deletes and returns the result on success', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });
    deleteKnowledgeDocumentMock.mockResolvedValue({ status: 'deleted', documentId: 'doc_1' });

    const response = await DELETE(deleteRequest(), { params: Promise.resolve({ id: 'doc_1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: 'deleted', documentId: 'doc_1' });
    expect(deleteKnowledgeDocumentMock).toHaveBeenCalledWith('doc_1');
  });

  it('passes through the Edge Function error status', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });
    deleteKnowledgeDocumentMock.mockRejectedValue(
      new EdgeFunctionError('No document with id doc_1', 404)
    );

    const response = await DELETE(deleteRequest(), { params: Promise.resolve({ id: 'doc_1' }) });

    expect(response.status).toBe(404);
  });
});
