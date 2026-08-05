import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getWidgetConfigMock, updateWidgetConfigMock, requireAuthenticatedUserMock } = vi.hoisted(
  () => ({
    getWidgetConfigMock: vi.fn(),
    updateWidgetConfigMock: vi.fn(),
    requireAuthenticatedUserMock: vi.fn(),
  })
);

vi.mock('@/lib/supabase/admin-api', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/lib/supabase/admin-api')>(
    '../../../../src/lib/supabase/admin-api'
  );
  return {
    ...actual,
    getWidgetConfig: getWidgetConfigMock,
    updateWidgetConfig: updateWidgetConfigMock,
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

import { GET, PATCH } from '../../../../src/app/api/widget-config/route';
import { UnauthenticatedError } from '../../../../src/lib/supabase/requireUser';
import { EdgeFunctionError } from '../../../../src/lib/supabase/admin-api';

afterEach(() => {
  vi.clearAllMocks();
});

function patchRequest(body: unknown) {
  return new Request('http://localhost/api/widget-config', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe('GET /api/widget-config', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new UnauthenticatedError());

    const response = await GET();

    expect(response.status).toBe(401);
    expect(getWidgetConfigMock).not.toHaveBeenCalled();
  });

  it('returns the config on success', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });
    const config = { id: 'config_1', enabled: false, allowed_origins: [] };
    getWidgetConfigMock.mockResolvedValue(config);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ config });
  });

  it('passes through the Edge Function error status', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });
    getWidgetConfigMock.mockRejectedValue(new EdgeFunctionError('Unauthorized', 401));

    const response = await GET();

    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/widget-config', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new UnauthenticatedError());

    const response = await PATCH(patchRequest({ enabled: true }));

    expect(response.status).toBe(401);
    expect(updateWidgetConfigMock).not.toHaveBeenCalled();
  });

  it('updates and returns the config on success', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });
    const config = { id: 'config_1', enabled: true, allowed_origins: ['https://example.com'] };
    updateWidgetConfigMock.mockResolvedValue(config);

    const payload = { enabled: true, allowedOrigins: ['https://example.com'] };
    const response = await PATCH(patchRequest(payload));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ config });
    expect(updateWidgetConfigMock).toHaveBeenCalledWith(payload);
  });
});
