import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getClaimsMock } = vi.hoisted(() => ({ getClaimsMock: vi.fn() }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getClaims: getClaimsMock },
  }),
}));

import { updateSession } from '../../../src/lib/supabase/middleware';

function request(pathname: string) {
  return new NextRequest(new URL(pathname, 'http://localhost'));
}

// `getClaims()` resolves to `{ data: null }` when there is no session and
// `{ data: { claims } }` once the JWT verifies (locally or via fallback).
const NO_SESSION = { data: null };
const SIGNED_IN = { data: { claims: { sub: 'user_1', email: 'admin@example.com' } } };

describe('updateSession', () => {
  it('redirects unauthenticated visitors to /login for protected paths', async () => {
    getClaimsMock.mockResolvedValue(NO_SESSION);

    const response = await updateSession(request('/dashboard/knowledge'));

    expect(response.headers.get('location')).toBe('http://localhost/login');
  });

  it('does not redirect unauthenticated visitors already on /login', async () => {
    getClaimsMock.mockResolvedValue(NO_SESSION);

    const response = await updateSession(request('/login'));

    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects authenticated visitors away from /login to /dashboard', async () => {
    getClaimsMock.mockResolvedValue(SIGNED_IN);

    const response = await updateSession(request('/login'));

    expect(response.headers.get('location')).toBe('http://localhost/dashboard');
  });

  it('passes through authenticated requests to protected paths', async () => {
    getClaimsMock.mockResolvedValue(SIGNED_IN);

    const response = await updateSession(request('/dashboard/knowledge'));

    expect(response.headers.get('location')).toBeNull();
  });
});
