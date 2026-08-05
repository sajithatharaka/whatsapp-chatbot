import { NextResponse } from 'next/server';

import { EdgeFunctionError, searchKnowledgeMatches } from '@/lib/supabase/admin-api';
import { UnauthenticatedError, requireAuthenticatedUser } from '@/lib/supabase/requireUser';

export async function POST(request: Request) {
  try {
    await requireAuthenticatedUser();

    const { query } = (await request.json()) as { query?: string };
    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const results = await searchKnowledgeMatches(query);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }
    if (error instanceof EdgeFunctionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
