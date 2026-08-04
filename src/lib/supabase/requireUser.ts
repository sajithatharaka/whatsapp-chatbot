import 'server-only';

import { createClient } from '@/lib/supabase/server';

export class UnauthenticatedError extends Error {
  constructor() {
    super('Unauthenticated');
    this.name = 'UnauthenticatedError';
  }
}

/**
 * Re-checks auth independently inside Route Handlers/Server Actions.
 * Middleware alone isn't sufficient defense-in-depth per Supabase's own
 * guidance (matcher misconfiguration, caching, etc.).
 */
export async function requireAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new UnauthenticatedError();

  return user;
}
