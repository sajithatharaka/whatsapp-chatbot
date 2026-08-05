import { afterEach, describe, expect, it, vi } from 'vitest';

// server-only unconditionally throws outside Next's own build — stub it so
// the route module (which transitively imports admin-api.ts) can load here.
vi.mock('server-only', () => ({}));

const { listEscalationsMock, requireAuthenticatedUserMock } = vi.hoisted(() => ({
  listEscalationsMock: vi.fn(),
  requireAuthenticatedUserMock: vi.fn(),
}));

vi.mock('@/lib/supabase/admin-api', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/lib/supabase/admin-api')>(
    '../../../../src/lib/supabase/admin-api'
  );
  return {
    ...actual,
    listEscalations: listEscalationsMock,
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

import { GET } from '../../../../src/app/api/escalations/route';
import { UnauthenticatedError } from '../../../../src/lib/supabase/requireUser';

afterEach(() => {
  vi.clearAllMocks();
});

function getRequest(query = '') {
  return new Request(`http://localhost/api/escalations${query}`);
}

describe('GET /api/escalations', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new UnauthenticatedError());

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
    expect(listEscalationsMock).not.toHaveBeenCalled();
  });

  it('forwards valid status values and drops unknown ones', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });
    listEscalationsMock.mockResolvedValue([]);

    await GET(
      getRequest('?status=needs_attention,bogus,in_progress&from=2026-08-01&to=2026-08-05')
    );

    expect(listEscalationsMock).toHaveBeenCalledWith({
      statuses: ['needs_attention', 'in_progress'],
      from: '2026-08-01',
      to: '2026-08-05',
    });
  });

  it('returns the escalations list on success', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });
    listEscalationsMock.mockResolvedValue([{ id: 'escalation_1' }]);

    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ escalations: [{ id: 'escalation_1' }] });
  });
});
