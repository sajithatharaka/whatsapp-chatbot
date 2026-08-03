import { afterEach, describe, expect, it, vi } from 'vitest';

const { signInWithPasswordMock, signOutMock, redirectMock } = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
  signOutMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: signInWithPasswordMock,
      signOut: signOutMock,
    },
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import { signIn, signOut } from '../../../src/app/login/actions';

afterEach(() => {
  vi.clearAllMocks();
});

function formDataWith(email: unknown, password: unknown) {
  const formData = new FormData();
  if (typeof email === 'string') formData.set('email', email);
  if (typeof password === 'string') formData.set('password', password);
  return formData;
}

describe('signIn', () => {
  it('returns an error when email or password is missing', async () => {
    const result = await signIn({ error: null }, formDataWith('', ''));

    expect(result.error).toBe('Enter your email and password.');
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('returns an error when Supabase rejects the credentials', async () => {
    signInWithPasswordMock.mockResolvedValue({ error: { message: 'Invalid login credentials' } });

    const result = await signIn({ error: null }, formDataWith('a@example.com', 'wrong'));

    expect(result.error).toBe('Invalid email or password.');
  });

  it('redirects to /dashboard on success', async () => {
    signInWithPasswordMock.mockResolvedValue({ error: null });

    await expect(signIn({ error: null }, formDataWith('a@example.com', 'correct'))).rejects.toThrow(
      'NEXT_REDIRECT:/dashboard'
    );
  });
});

describe('signOut', () => {
  it('signs out and redirects to /login', async () => {
    signOutMock.mockResolvedValue({ error: null });

    await expect(signOut()).rejects.toThrow('NEXT_REDIRECT:/login');
    expect(signOutMock).toHaveBeenCalled();
  });
});
