import { NextResponse } from 'next/server';

import { EdgeFunctionError, deleteKnowledgeDocument } from '@/lib/supabase/admin-api';
import { UnauthenticatedError, requireAuthenticatedUser } from '@/lib/supabase/requireUser';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuthenticatedUser();

    const { id } = await params;
    const result = await deleteKnowledgeDocument(id);

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
