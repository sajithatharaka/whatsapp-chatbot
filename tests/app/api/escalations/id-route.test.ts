import { afterEach, describe, expect, it, vi } from 'vitest';

// Note: this tests src/app/api/escalations/[id]/route.ts — the file lives
// under tests/.../escalations/ (not a mirrored `[id]` directory) because
// glob test discovery treats `[id]` as a character class, not a literal path
// (same convention as tests/app/api/knowledge/id-route.test.ts).

vi.mock('server-only', () => ({}));

const { getEscalationMock, updateEscalationMock, requireAuthenticatedUserMock } = vi.hoisted(
  () => ({
    getEscalationMock: vi.fn(),
    updateEscalationMock: vi.fn(),
    requireAuthenticatedUserMock: vi.fn(),
  })
);

vi.mock('@/lib/supabase/admin-api', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/lib/supabase/admin-api')>(
    '../../../../src/lib/supabase/admin-api'
  );
  return {
    ...actual,
    getEscalation: getEscalationMock,
    updateEscalation: updateEscalationMock,
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

import { GET, PATCH } from '../../../../src/app/api/escalations/[id]/route';
import { UnauthenticatedError } from '../../../../src/lib/supabase/requireUser';
import { EdgeFunctionError } from '../../../../src/lib/supabase/admin-api';

afterEach(() => {
  vi.clearAllMocks();
});

function patchRequest(body: unknown) {
  return new Request('http://localhost/api/escalations/escalation_1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function getRequest() {
  return new Request('http://localhost/api/escalations/escalation_1');
}

describe('GET /api/escalations/[id]', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new UnauthenticatedError());

    const response = await GET(getRequest(), { params: Promise.resolve({ id: 'escalation_1' }) });

    expect(response.status).toBe(401);
    expect(getEscalationMock).not.toHaveBeenCalled();
  });

  it('returns the escalation and messages on success', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });
    const result = { escalation: { id: 'escalation_1' }, messages: [] };
    getEscalationMock.mockResolvedValue(result);

    const response = await GET(getRequest(), { params: Promise.resolve({ id: 'escalation_1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(result);
  });

  it('passes through the Edge Function error status', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });
    getEscalationMock.mockRejectedValue(
      new EdgeFunctionError('No escalation with id escalation_1', 404)
    );

    const response = await GET(getRequest(), { params: Promise.resolve({ id: 'escalation_1' }) });

    expect(response.status).toBe(404);
  });
});

describe('PATCH /api/escalations/[id]', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new UnauthenticatedError());

    const response = await PATCH(patchRequest({ status: 'in_progress' }), {
      params: Promise.resolve({ id: 'escalation_1' }),
    });

    expect(response.status).toBe(401);
    expect(updateEscalationMock).not.toHaveBeenCalled();
  });

  it('derives respondedBy from the session when marking as responded', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1', email: 'admin@example.com' });
    updateEscalationMock.mockResolvedValue({
      escalation: { id: 'escalation_1', status: 'responded' },
    });

    await PATCH(patchRequest({ status: 'responded' }), {
      params: Promise.resolve({ id: 'escalation_1' }),
    });

    expect(updateEscalationMock).toHaveBeenCalledWith('escalation_1', {
      status: 'responded',
      respondedBy: 'admin@example.com',
    });
  });

  it('does not set respondedBy for non-responded status updates', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1', email: 'admin@example.com' });
    updateEscalationMock.mockResolvedValue({
      escalation: { id: 'escalation_1', status: 'in_progress' },
    });

    await PATCH(patchRequest({ status: 'in_progress' }), {
      params: Promise.resolve({ id: 'escalation_1' }),
    });

    expect(updateEscalationMock).toHaveBeenCalledWith('escalation_1', {
      status: 'in_progress',
      respondedBy: undefined,
    });
  });
});
