import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock },
  }),
}));

import { updateSession } from '../../../src/lib/supabase/middleware';

function request(pathname: string) {
  return new NextRequest(new URL(pathname, 'http://localhost'));
}

describe('updateSession', () => {
  it('redirects unauthenticated visitors to /login for protected paths', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const response = await updateSession(request('/dashboard/knowledge'));

    expect(response.headers.get('location')).toBe('http://localhost/login');
  });

  it('does not redirect unauthenticated visitors already on /login', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });

    const response = await updateSession(request('/login'));

    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects authenticated visitors away from /login to /dashboard', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user_1' } } });

    const response = await updateSession(request('/login'));

    expect(response.headers.get('location')).toBe('http://localhost/dashboard');
  });

  it('passes through authenticated requests to protected paths', async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: 'user_1' } } });

    const response = await updateSession(request('/dashboard/knowledge'));

    expect(response.headers.get('location')).toBeNull();
  });
});
