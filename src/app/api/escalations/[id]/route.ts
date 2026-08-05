import { NextResponse } from 'next/server';

import type { UpdateEscalationPayload } from '@/lib/escalations/types';
import { EdgeFunctionError, getEscalation, updateEscalation } from '@/lib/supabase/admin-api';
import { UnauthenticatedError, requireAuthenticatedUser } from '@/lib/supabase/requireUser';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuthenticatedUser();

    const { id } = await params;
    const result = await getEscalation(id);

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthenticatedUser();

    const { id } = await params;
    const payload = (await request.json()) as UpdateEscalationPayload;

    // respondedBy is derived from the authenticated session, not accepted
    // from the client — the edge function has no notion of who's calling it
    // beyond the shared admin secret.
    const result = await updateEscalation(id, {
      ...payload,
      respondedBy: payload.status === 'responded' ? (user.email ?? undefined) : undefined,
    });

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
