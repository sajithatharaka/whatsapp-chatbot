import 'server-only';

import { createClient } from '@/lib/supabase/server';

export class UnauthenticatedError extends Error {
  constructor() {
    super('Unauthenticated');
    this.name = 'UnauthenticatedError';
  }
}

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

/**
 * Re-checks auth independently inside Route Handlers/Server Actions.
 * Middleware alone isn't sufficient defense-in-depth per Supabase's own
 * guidance (matcher misconfiguration, caching, etc.).
 *
 * Uses `getClaims()` so the check is a local JWT signature verification rather
 * than an Auth-server round trip when the project uses asymmetric signing keys
 * (it falls back to a network `getUser()` call for legacy HS256 secrets).
 */
export async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  if (!claims) throw new UnauthenticatedError();

  return {
    id: typeof claims.sub === 'string' ? claims.sub : '',
    email: typeof claims.email === 'string' ? claims.email : null,
  };
}
