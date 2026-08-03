import { NextResponse } from 'next/server';

import { EdgeFunctionError, ingestKnowledgeDocument } from '@/lib/supabase/admin-api';
import { UnauthenticatedError, requireAuthenticatedUser } from '@/lib/supabase/requireUser';
import type { IngestRequestBody } from '@/lib/knowledge/types';

export async function POST(request: Request) {
  try {
    await requireAuthenticatedUser();

    const payload = (await request.json()) as IngestRequestBody;
    const result = await ingestKnowledgeDocument(payload);

    return NextResponse.json(result);
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
