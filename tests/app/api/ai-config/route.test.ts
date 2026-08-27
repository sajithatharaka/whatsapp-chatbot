import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { getAiConfigMock, updateAiConfigMock, requireAuthenticatedUserMock, revalidateTagMock } =
  vi.hoisted(() => ({
    getAiConfigMock: vi.fn(),
    updateAiConfigMock: vi.fn(),
    requireAuthenticatedUserMock: vi.fn(),
    revalidateTagMock: vi.fn(),
  }));

vi.mock('next/cache', () => ({ revalidateTag: revalidateTagMock }));

vi.mock('@/lib/supabase/admin-api', async () => {
  const actual = await vi.importActual<typeof import('../../../../src/lib/supabase/admin-api')>(
    '../../../../src/lib/supabase/admin-api'
  );
  return {
    ...actual,
    getAiConfig: getAiConfigMock,
    updateAiConfig: updateAiConfigMock,
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

import { GET, PATCH } from '../../../../src/app/api/ai-config/route';
import { UnauthenticatedError } from '../../../../src/lib/supabase/requireUser';
import { EdgeFunctionError } from '../../../../src/lib/supabase/admin-api';

afterEach(() => {
  vi.clearAllMocks();
});

function patchRequest(body: unknown) {
  return new Request('http://localhost/api/ai-config', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe('GET /api/ai-config', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new UnauthenticatedError());

    const response = await GET();

    expect(response.status).toBe(401);
    expect(getAiConfigMock).not.toHaveBeenCalled();
  });

  it('returns the config on success', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });
    const config = { id: 'config_1', chat_model: 'google/gemini-2.5-flash', temperature: 0.3 };
    getAiConfigMock.mockResolvedValue(config);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ config });
  });

  it('passes through the Edge Function error status', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });
    getAiConfigMock.mockRejectedValue(new EdgeFunctionError('Unauthorized', 401));

    const response = await GET();

    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/ai-config', () => {
  it('returns 401 when the caller is unauthenticated', async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new UnauthenticatedError());

    const response = await PATCH(patchRequest({ temperature: 0.4 }));

    expect(response.status).toBe(401);
    expect(updateAiConfigMock).not.toHaveBeenCalled();
  });

  it('updates and returns the config on success', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });
    const config = { id: 'config_1', temperature: 0.4 };
    updateAiConfigMock.mockResolvedValue(config);

    const payload = { temperature: 0.4 };
    const response = await PATCH(patchRequest(payload));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ config });
    expect(updateAiConfigMock).toHaveBeenCalledWith(payload);
    expect(revalidateTagMock).toHaveBeenCalledWith('ai-config');
  });

  it('passes through the Edge Function error status', async () => {
    requireAuthenticatedUserMock.mockResolvedValue({ id: 'user_1' });
    updateAiConfigMock.mockRejectedValue(new EdgeFunctionError('Invalid update payload', 400));

    const response = await PATCH(patchRequest({ similarityThreshold: 2 }));

    expect(response.status).toBe(400);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
