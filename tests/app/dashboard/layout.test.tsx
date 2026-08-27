/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getClaimsMock, redirectMock } = vi.hoisted(() => ({
  getClaimsMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getClaims: getClaimsMock } }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  usePathname: () => '/dashboard/knowledge',
}));

// SignOutButton pulls in a server action; stub it so the layout renders here.
vi.mock('@/app/login/actions', () => ({ signOut: vi.fn() }));

import DashboardLayout from '../../../src/app/dashboard/layout';

afterEach(() => {
  vi.clearAllMocks();
});

describe('DashboardLayout', () => {
  it('redirects to /login when the JWT has no claims', async () => {
    getClaimsMock.mockResolvedValue({ data: null });

    await expect(DashboardLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('renders the shell with the email from the verified claims', async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: 'user_1', email: 'admin@example.com' } },
    });

    render(await DashboardLayout({ children: <div data-testid="child-content" /> }));

    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('does not fall over when the claims carry no email', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user_1' } } });

    render(await DashboardLayout({ children: <div data-testid="child-content" /> }));

    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });
});
