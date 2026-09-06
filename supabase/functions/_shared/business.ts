import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Phase 0 interim tenant resolver (see
// docs/requirements/mixed-language-multi-tenant-architecture-plan.md, §4.2 and Phase 6): every
// table and query is now business_id-scoped, but no caller yet supplies its own tenant identity —
// ManyChat has no per-business key wired up, there's no direct Meta webhook yet, and the
// dashboard still authenticates via a single global admin secret rather than a per-user session
// tied to a business. Every entrypoint resolves the one seeded "mk-agency" business until Phase 6
// adds real per-request resolution (a per-business ManyChat API key, Meta's phone_number_id, or a
// dashboard session's business_users membership).
const DEFAULT_BUSINESS_SLUG = 'mk-agency';

export async function resolveDefaultBusinessId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase
    .from('businesses')
    .select('id')
    .eq('slug', DEFAULT_BUSINESS_SLUG)
    .single();

  if (error) throw error;
  return (data as { id: string }).id;
}
